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

/**
 * Compute a 128-float face descriptor from a JPEG buffer.
 * Returns Float32Array or null if no face detected.
 */
async function computeDescriptor(jpegBuffer) {
  const ok = await loadModels();
  if (!ok) return null;

  const tensor = await bufferToTensor(jpegBuffer);
  try {
    const opts = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 });
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

/**
 * Search org visitors for the best face match.
 * Returns { visitorId, confidence } or null.
 */
async function searchLocalFace(jpegBuffer, organizationId) {
  const ok = await loadModels();
  if (!ok) return null;

  const descriptor = await computeDescriptor(jpegBuffer);
  if (!descriptor) return null; // no face detected in photo

  const { Visitor } = require('../models');
  const where = organizationId ? { organization_id: organizationId } : {};
  const candidates = await Visitor.findAll({
    where,
    attributes: ['id', 'face_descriptor'],
    raw: true,
  });

  let bestId   = null;
  let bestDist = Infinity;
  for (const v of candidates) {
    if (!v.face_descriptor) continue;
    let stored;
    try { stored = JSON.parse(v.face_descriptor); } catch { continue; }
    const dist = descriptorDistance(descriptor, stored);
    if (dist < bestDist) { bestDist = dist; bestId = v.id; }
  }

  if (bestId && bestDist < MATCH_THRESHOLD) {
    // Map distance [0 → 0] to confidence 100, [MATCH_THRESHOLD → ~85]
    const confidence = Math.round(100 - (bestDist / MATCH_THRESHOLD) * 15);
    return { visitorId: bestId, confidence };
  }
  return null;
}

/**
 * Persist a face descriptor for a visitor (JSON-encoded Float32Array).
 */
async function saveDescriptor(visitorId, descriptor) {
  const { Visitor } = require('../models');
  await Visitor.update(
    { face_descriptor: JSON.stringify(Array.from(descriptor)) },
    { where: { id: visitorId } },
  );
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
