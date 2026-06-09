'use strict';

const fs   = require('fs');
const path = require('path');

// ── Photo storage ──────────────────────────────────────────────────────────────

const PHOTOS_DIR = path.join(__dirname, '../../uploads/visitor-photos');

function ensurePhotosDir() {
  if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });
}

/**
 * Save a base64 data-URI photo to disk.
 * Returns the relative URL path (e.g. /uploads/visitor-photos/abc.jpg).
 */
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

// ── AWS Rekognition (optional) ─────────────────────────────────────────────────

const ENABLED =
  !!(process.env.AWS_ACCESS_KEY_ID &&
     process.env.AWS_SECRET_ACCESS_KEY &&
     process.env.AWS_REGION);

let rekognitionClient = null;

function getClient() {
  if (!rekognitionClient) {
    // Lazy-require so startup doesn't fail if the SDK isn't installed
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

/**
 * Ensure the Rekognition collection for this org exists.
 */
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

/**
 * Index a face in Rekognition. Returns the FaceId string.
 */
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

/**
 * Search for a matching face. Returns { visitorId, confidence } or null.
 */
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
    if (e.name === 'InvalidParameterException') return null; // no faces in image
    throw e;
  }
}

/**
 * Delete a face from Rekognition (called when visitor record is deleted).
 */
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
  indexFace,
  searchFace,
  deleteFace,
};
