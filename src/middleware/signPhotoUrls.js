'use strict';

const s3 = require('../services/s3Service');

// Field names anywhere in a JSON response that hold an S3 key needing a
// signed URL. Keeps this in one place so a new controller/column doesn't
// need its own signing logic — just use one of these names.
const PHOTO_FIELDS = new Set([
  'photo_url',
  'photoUrl',
  'visitor_photo',       // visits.visitor_photo — the per-visit snapshot photo
  'visitor_photo_url',
  'business_card_photo_url',
  'businessCardPhotoUrl',
  'cardPhotoUrl',
]);

// Recursively walk a JSON-serializable value, replacing S3 keys found under
// any of PHOTO_FIELDS with a freshly signed URL. Runs on every response body,
// so it stays defensive: skips cycles/non-plain values rather than throwing.
async function signInPlace(value, seen = new WeakSet()) {
  if (Array.isArray(value)) {
    await Promise.all(value.map((item) => signInPlace(item, seen)));
    return;
  }
  if (value && typeof value === 'object') {
    if (seen.has(value)) return;
    seen.add(value);

    const jobs = [];
    for (const key of Object.keys(value)) {
      const val = value[key];
      if (PHOTO_FIELDS.has(key) && s3.isS3Key(val)) {
        jobs.push(s3.signUrlIfKey(val).then((signed) => { value[key] = signed; }));
      } else if (val && typeof val === 'object') {
        jobs.push(signInPlace(val, seen));
      }
    }
    await Promise.all(jobs);
  }
}

/**
 * Express middleware: wraps res.json so that any photo-key field in the
 * outgoing body is swapped for a live presigned URL before it's sent.
 * No-op (passes the body through untouched) when S3 isn't configured.
 */
function signPhotoUrls(req, res, next) {
  if (!s3.ENABLED) return next();

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    signInPlace(body)
      .then(() => originalJson(body))
      .catch((err) => {
        console.error('[signPhotoUrls] failed to sign response, sending unsigned:', err.message);
        originalJson(body);
      });
    return res;
  };
  next();
}

module.exports = signPhotoUrls;
