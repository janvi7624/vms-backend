'use strict';

// Photo storage on AWS S3 (private bucket + presigned URLs). Mirrors the
// pattern used by sesClient.js: lazily-created client, region from env,
// credentials from the default AWS SDK chain (the same
// AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY already used for
// SES/Rekognition/Textract need s3:PutObject/GetObject/DeleteObject on the
// bucket).
//
// photo_url / business_card_photo_url columns store the S3 KEY (e.g.
// "visitor-photos/uuid.jpg"), not a URL — objects are not public. A fresh,
// time-limited URL is generated on read via signUrl()/signUrlIfKey(), which
// responseSigning.js calls automatically for every outgoing API response.

const ENABLED = !!(process.env.AWS_S3_BUCKET && process.env.AWS_REGION);

// How long a presigned URL stays valid. Generated fresh on every API
// response, so this only needs to outlive one page view, not the photo's
// lifetime — 1 hour comfortably covers a slow client holding a page open.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

let client;
function getClient() {
  if (!client) {
    const { S3Client } = require('@aws-sdk/client-s3');
    client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: process.env.AWS_ACCESS_KEY_ID
        ? {
            accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined, // falls back to the default provider chain (IAM role, etc.)
    });
  }
  return client;
}

/**
 * Upload a buffer to S3 under `key` and return the KEY (not a URL) — store
 * this in the DB. `key` should include any folder prefix, e.g.
 * "visitor-photos/uuid.jpg".
 */
async function uploadBuffer(key, buffer, contentType) {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  await getClient().send(new PutObjectCommand({
    Bucket:      process.env.AWS_S3_BUCKET,
    Key:         key,
    Body:        buffer,
    ContentType: contentType,
  }));
  return key;
}

/**
 * Generate a temporary signed GET URL for an S3 key.
 */
async function signUrl(key, ttlSeconds = SIGNED_URL_TTL_SECONDS) {
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  const cmd = new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key });
  return getSignedUrl(getClient(), cmd, { expiresIn: ttlSeconds });
}

// True for a value that looks like an S3 key we store (not an absolute URL
// and not a legacy local "/uploads/..." path from before the S3 migration).
function isS3Key(value) {
  return typeof value === 'string' && value.length > 0 && !/^https?:\/\//i.test(value) && !value.startsWith('/uploads/');
}

/**
 * If `value` is one of OUR signed GET URLs (e.g. a cardPhotoUrl/photoUrl a
 * client round-trips back from one API response into a later request body —
 * see WalkInScreen's business-card scan-then-submit flow), recover the bare
 * S3 key from it so what gets stored in the DB is durable, not a URL whose
 * signature expires in an hour. Anything else (already a key, a legacy
 * "/uploads/..." path, null) is returned unchanged.
 */
function keyFromUrlIfOurs(value) {
  if (typeof value !== 'string' || !value) return value;
  if (!/^https?:\/\//i.test(value)) return value; // not a URL — already a key or legacy path

  try {
    const parsed = new URL(value);
    const bucket = process.env.AWS_S3_BUCKET;
    const isOurHost =
      parsed.hostname === `${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com` ||
      (process.env.AWS_S3_PUBLIC_BASE_URL && value.startsWith(process.env.AWS_S3_PUBLIC_BASE_URL));
    if (!isOurHost) return value; // some other absolute URL — leave as-is

    return decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  } catch (_) {
    return value;
  }
}

/**
 * Sign `value` if it looks like an S3 key we own; otherwise return it
 * unchanged (legacy local path, absolute URL, null, etc.) — lets callers
 * pass whatever is in the DB column without checking first.
 */
async function signUrlIfKey(value) {
  if (!ENABLED || !isS3Key(value)) return value;
  try {
    return await signUrl(value);
  } catch (e) {
    console.error('[s3Service] Failed to sign URL for key', value, e.message);
    return value;
  }
}

async function deleteObject(key) {
  const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
  try {
    await getClient().send(new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key:    key,
    }));
  } catch (_) {}
}

module.exports = { ENABLED, uploadBuffer, deleteObject, signUrl, signUrlIfKey, isS3Key, keyFromUrlIfOurs };
