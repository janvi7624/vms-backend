'use strict';

const fs = require('fs');
const path = require('path');
const { parseBusinessCard } = require('./businessCardParser');

const CARDS_DIR = path.join(__dirname, '../../uploads/business-cards');

function ensureCardsDir() {
  if (!fs.existsSync(CARDS_DIR)) fs.mkdirSync(CARDS_DIR, { recursive: true });
}

function dataUriToBuffer(base64DataUri) {
  const data = base64DataUri.replace(/^data:image\/\w+;base64,/, '');
  return Buffer.from(data, 'base64');
}

function saveBusinessCardPhoto(base64DataUri, filename) {
  ensureCardsDir();
  const buf = dataUriToBuffer(base64DataUri);
  fs.writeFileSync(path.join(CARDS_DIR, filename), buf);
  return `/uploads/business-cards/${filename}`;
}

const ENABLED =
  !!(process.env.AWS_ACCESS_KEY_ID &&
     process.env.AWS_SECRET_ACCESS_KEY &&
     process.env.AWS_REGION);

let textractClient = null;

function getClient() {
  if (!textractClient) {
    const { TextractClient } = require('@aws-sdk/client-textract');
    const { NodeHttpHandler } = require('@smithy/node-http-handler');
    textractClient = new TextractClient({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
      // The SDK sets no default timeout — a stalled connection (bad region,
      // blocked egress) would otherwise hang the request indefinitely.
      requestHandler: new NodeHttpHandler({
        connectionTimeout: 5000,
        requestTimeout: 10000,
      }),
      maxAttempts: 2,
    });
  }
  return textractClient;
}

class OcrNotConfiguredError extends Error {
  constructor() {
    super('OCR is not configured (missing AWS credentials)');
    this.name = 'OcrNotConfiguredError';
  }
}

/**
 * Scans a business card image and returns extracted contact fields.
 * @param {string} imageBase64 - base64 data-URI (e.g. from canvas.toDataURL or FileReader)
 * @returns {Promise<{ fields: object, confidence: object, cardPhotoUrl: string, rawText: string }>}
 */
async function scanBusinessCard(imageBase64, ownerId) {
  if (!ENABLED) throw new OcrNotConfiguredError();

  const { DetectDocumentTextCommand } = require('@aws-sdk/client-textract');
  const { v4: uuidv4 } = require('uuid');

  const buf = dataUriToBuffer(imageBase64);
  const res = await getClient().send(new DetectDocumentTextCommand({
    Document: { Bytes: buf },
  }));

  const lineBlocks = (res.Blocks || []).filter((b) => b.BlockType === 'LINE' && b.Text);
  const lines = lineBlocks.map((b) => ({
    text: b.Text,
    confidence: b.Confidence,
    top: b.Geometry?.BoundingBox?.Top ?? 0,
    height: b.Geometry?.BoundingBox?.Height ?? 0,
  }));

  const { fields, confidence } = parseBusinessCard(lines);

  const filename = `${ownerId || uuidv4()}-${uuidv4().slice(0, 8)}.jpg`;
  const cardPhotoUrl = saveBusinessCardPhoto(imageBase64, filename);

  return {
    fields,
    confidence,
    cardPhotoUrl,
    rawText: lines.map((l) => l.text).join('\n'),
  };
}

module.exports = {
  ENABLED,
  OcrNotConfiguredError,
  scanBusinessCard,
  saveBusinessCardPhoto,
};
