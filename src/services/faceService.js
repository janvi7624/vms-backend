'use strict';

const fs   = require('fs');
const path = require('path');

// ── Photo storage ──────────────────────────────────────────────────────────────

const PHOTOS_DIR = path.join(__dirname, '../../uploads/visitor-photos');
const MODELS_DIR = path.join(__dirname, '../../models/face-api');

function ensurePhotosDir() {
  if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });
}

function saveVisitorPhoto(base64DataUri, filename) {
  ensurePhotosDir();
  const data = base64DataUri.replace(/^data:image\/\w+;base64,/, '');
  const buf  = Buffer.from(data, 'base64');
  const file = path.join(PHOTOS_DIR, filename);
  fs.writeFileSync(file, buf);
  return `/uploads/visitor-photos/${filename}`;
}

function photoUrlToBuffer(base64DataUri) {
  const data = base64DataUri.replace(/^data:image\/\w+;base64,/, '');
  return Buffer.from(data, 'base64');
}

// ── Local face recognition (face-api.js + TensorFlow WASM, no AWS needed) ─────

let faceapi = null;
let modelsReady = false;
let modelLoadPromise = null;

function modelsExist() {
  return fs.existsSync(path.join(MODELS_DIR, 'ssd_mobilenetv1_model-weights_manifest.json'))
      && fs.existsSync(path.join(MODELS_DIR, 'face_recognition_model-weights_manifest.json'));
}

async function loadModels() {
  if (modelsReady) return true;
  if (!modelsExist()) {
    console.warn('[FaceService] Models not found at', MODELS_DIR, '— run: node scripts/download-face-models.js');
    return false;
  }
  if (modelLoadPromise) return modelLoadPromise;

  modelLoadPromise = (async () => {
    try {
      faceapi = require('@vladmandic/face-api/dist/face-api.node-wasm.js');
      const tf = require('@tensorflow/tfjs');
      await tf.ready(); // must await WASM backend initialisation before inference
      await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_DIR);
      await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_DIR);
      await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_DIR);
      modelsReady = true;
      console.log('[FaceService] Local face recognition models loaded');
      return true;
    } catch (e) {
      console.error('[FaceService] Model load failed:', e.message);
      modelLoadPromise = null;
      return false;
    }
  })();
  return modelLoadPromise;
}

// Convert JPEG Buffer → TensorFlow tensor (RGB, uint8)
async function bufferToTensor(jpegBuffer) {
  const { Jimp } = require('jimp');
  const img = await Jimp.fromBuffer(jpegBuffer);
  const { width, height, data } = img.bitmap; // RGBA Uint8Array
  // RGBA → RGB
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    rgb[i * 3]     = data[i * 4];
    rgb[i * 3 + 1] = data[i * 4 + 1];
    rgb[i * 3 + 2] = data[i * 4 + 2];
  }
  const tf = require('@tensorflow/tfjs');
  return tf.tensor3d(rgb, [height, width, 3], 'int32');
}

// Minimum variance-of-Laplacian on a normalized grayscale image below which a photo
// is considered too blurry to trust for matching/registration. Tuned empirically:
// crisp face photos land well above 150, motion/focus blur typically falls under 60.
const MIN_SHARPNESS = 60;

/**
 * Variance of the Laplacian of the grayscale image — a standard, cheap blur metric.
 * Sharp/in-focus images have high-frequency edges, which produce high variance in
 * their Laplacian response; blurry images smooth those edges out, so the variance
 * collapses toward zero. Resized to a fixed width first so the metric is comparable
 * across different capture resolutions.
 */
async function computeSharpness(jpegBuffer) {
  const { Jimp } = require('jimp');
  const img = await Jimp.fromBuffer(jpegBuffer);
  if (img.bitmap.width > 400) img.resize({ w: 400 });

  const { width, height, data } = img.bitmap;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const lap = gray[idx - width] + gray[idx + width] + gray[idx - 1] + gray[idx + 1] - 4 * gray[idx];
      sum   += lap;
      sumSq += lap * lap;
      count++;
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

/**
 * Compute a 128-float face descriptor from a JPEG buffer.
 * Returns Float32Array or null if no face detected, or if the photo is too blurry to trust.
 */
async function computeDescriptor(jpegBuffer) {
  const ok = await loadModels();
  if (!ok) return null;

  const sharpness = await computeSharpness(jpegBuffer);
  if (sharpness < MIN_SHARPNESS) {
    console.warn(`[FaceService] Photo rejected as too blurry (sharpness=${sharpness.toFixed(1)}, min=${MIN_SHARPNESS})`);
    return null;
  }

  const tensor = await bufferToTensor(jpegBuffer);
  try {
    const opts = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });
    const detection = await faceapi
      .detectSingleFace(tensor, opts)
      .withFaceLandmarks()
      .withFaceDescriptor();
    return detection ? detection.descriptor : null;
  } finally {
    tensor.dispose();
  }
}

// Euclidean distance between two 128-d descriptors
function descriptorDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < 128; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

const MATCH_THRESHOLD = 0.55; // lower = stricter; 0.55 gives ~85%+ confidence on match

// Minimum gap required between the best and second-best candidate distances. A noisy
// probe descriptor (e.g. from a marginal-quality photo) can land almost equidistant
// between two different people's stored descriptors; without this margin, whichever
// happens to be nearest wins even though the match is really a toss-up.
const MATCH_MARGIN = 0.08;

/**
 * Search org visitors for the best face match.
 * Returns { visitorId, confidence } or null.
 */
async function searchLocalFace(jpegBuffer, organizationId) {
  const ok = await loadModels();
  if (!ok) return null;

  const descriptor = await computeDescriptor(jpegBuffer);
  if (!descriptor) return null; // no face detected, or photo too blurry to trust

  const { Visitor } = require('../models');
  const where = organizationId ? { organization_id: organizationId } : {};
  const candidates = await Visitor.findAll({
    where,
    attributes: ['id', 'face_descriptor'],
    raw: true,
  });

  let bestId     = null;
  let bestDist   = Infinity;
  let secondDist = Infinity;
  for (const v of candidates) {
    if (!v.face_descriptor) continue;
    let stored;
    try { stored = JSON.parse(v.face_descriptor); } catch { continue; }
    const dist = descriptorDistance(descriptor, stored);
    if (dist < bestDist) {
      secondDist = bestDist;
      bestDist   = dist;
      bestId     = v.id;
    } else if (dist < secondDist) {
      secondDist = dist;
    }
  }

  if (bestId && bestDist < MATCH_THRESHOLD && (secondDist - bestDist) >= MATCH_MARGIN) {
    // Map distance [0 → 0] to confidence 100, [MATCH_THRESHOLD → ~85]
    const confidence = Math.round(100 - (bestDist / MATCH_THRESHOLD) * 15);
    return { visitorId: bestId, confidence };
  }
  if (bestId && bestDist < MATCH_THRESHOLD) {
    console.warn(`[FaceService] Ambiguous match dropped: best=${bestDist.toFixed(3)} second=${secondDist.toFixed(3)} (margin ${MATCH_MARGIN})`);
  }
  return null;
}

// If a visitor already has a stored descriptor, a fresh capture is only allowed to
// replace it when the two are at least this close. This is deliberately looser than
// MATCH_THRESHOLD (lighting/angle/aging drift is expected across visits) — it exists
// only to stop a wrongly-resolved visitor record (e.g. matched-by-email off a bad
// face search) from silently clobbering someone else's descriptor with an unrelated
// face, which would degrade that person's matches on every future visit.
const DESCRIPTOR_OVERWRITE_SANITY_LIMIT = 0.75;

/**
 * Persist a face descriptor for a visitor (JSON-encoded Float32Array).
 * Refuses to overwrite an existing descriptor with one that looks like a different
 * person entirely (see DESCRIPTOR_OVERWRITE_SANITY_LIMIT).
 */
async function saveDescriptor(visitorId, descriptor) {
  const { Visitor } = require('../models');
  const visitor = await Visitor.findByPk(visitorId, { attributes: ['id', 'face_descriptor'] });
  if (!visitor) return;

  if (visitor.face_descriptor) {
    let existing;
    try { existing = JSON.parse(visitor.face_descriptor); } catch { existing = null; }
    if (existing) {
      const dist = descriptorDistance(descriptor, existing);
      if (dist > DESCRIPTOR_OVERWRITE_SANITY_LIMIT) {
        console.warn(`[FaceService] Refusing to overwrite descriptor for visitor ${visitorId}: new capture looks like a different person (dist=${dist.toFixed(3)})`);
        return;
      }
    }
  }

  await visitor.update({ face_descriptor: JSON.stringify(Array.from(descriptor)) });
}

// ── AWS Rekognition (optional) ─────────────────────────────────────────────────

const ENABLED =
  !!(process.env.AWS_ACCESS_KEY_ID &&
     process.env.AWS_SECRET_ACCESS_KEY &&
     process.env.AWS_REGION);

let rekognitionClient = null;

function getClient() {
  if (!rekognitionClient) {
    const { RekognitionClient } = require('@aws-sdk/client-rekognition');
    rekognitionClient = new RekognitionClient({
      region:      process.env.AWS_REGION,
      credentials: {
        accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return rekognitionClient;
}

function collectionId(organizationId) {
  return `vms-visitors-${organizationId}`;
}

async function ensureCollection(organizationId) {
  const { CreateCollectionCommand, DescribeCollectionCommand } = require('@aws-sdk/client-rekognition');
  const id = collectionId(organizationId);
  try {
    await getClient().send(new DescribeCollectionCommand({ CollectionId: id }));
  } catch (e) {
    if (e.name === 'ResourceNotFoundException') {
      await getClient().send(new CreateCollectionCommand({ CollectionId: id }));
    }
  }
}

async function indexFace(organizationId, visitorId, imageBuffer) {
  const { IndexFacesCommand } = require('@aws-sdk/client-rekognition');
  await ensureCollection(organizationId);
  const res = await getClient().send(new IndexFacesCommand({
    CollectionId:    collectionId(organizationId),
    Image:           { Bytes: imageBuffer },
    ExternalImageId: String(visitorId),
    MaxFaces:        1,
    QualityFilter:   'AUTO',
    DetectionAttributes: [],
  }));
  return res.FaceRecords?.[0]?.Face?.FaceId ?? null;
}

async function searchFace(organizationId, imageBuffer) {
  const { SearchFacesByImageCommand } = require('@aws-sdk/client-rekognition');
  await ensureCollection(organizationId);
  try {
    const res = await getClient().send(new SearchFacesByImageCommand({
      CollectionId:       collectionId(organizationId),
      Image:              { Bytes: imageBuffer },
      MaxFaces:           1,
      FaceMatchThreshold: 80,
      QualityFilter:      'AUTO', // reject low-quality/blurry probe images before matching
    }));
    const match = res.FaceMatches?.[0];
    if (!match) return null;
    return {
      visitorId:  match.Face.ExternalImageId,
      confidence: Math.round(match.Similarity),
    };
  } catch (e) {
    if (e.name === 'InvalidParameterException') return null;
    throw e;
  }
}

async function deleteFace(organizationId, faceId) {
  const { DeleteFacesCommand } = require('@aws-sdk/client-rekognition');
  try {
    await getClient().send(new DeleteFacesCommand({
      CollectionId: collectionId(organizationId),
      FaceIds:      [faceId],
    }));
  } catch (_) {}
}

module.exports = {
  ENABLED,
  saveVisitorPhoto,
  photoUrlToBuffer,
  computeDescriptor,
  searchLocalFace,
  saveDescriptor,
  indexFace,
  searchFace,
  deleteFace,
};
