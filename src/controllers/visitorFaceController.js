'use strict';

const { v4: uuidv4 } = require('uuid');
const { Visitor }    = require('../models');
const face           = require('../services/faceService');

/**
 * POST /api/visitor/face/search
 * Body: { photo: "data:image/jpeg;base64,...", organizationId }
 * Public — called by Temi before the walk-in form is shown.
 *
 * Priority:
 *   1. AWS Rekognition (if configured)
 *   2. Local face-api.js recognition (fallback, always available)
 */
const searchFace = async (req, res, next) => {
  try {
    const { photo, organizationId } = req.body;
    if (!photo) return res.json({ match: null });

    const buf = face.photoUrlToBuffer(photo);

    // ── 1. Try Rekognition first ───────────────────────────────────────────────
    if (face.ENABLED) {
      try {
        const result = await face.searchFace(organizationId, buf);
        if (result) {
          const visitor = await Visitor.findByPk(result.visitorId, {
            attributes: ['id', 'name', 'email', 'phone', 'company', 'photo_url'],
          });
          if (visitor) {
            return res.json({
              match: {
                visitorId:  visitor.id,
                name:       visitor.name,
                email:      visitor.email,
                phone:      visitor.phone,
                company:    visitor.company,
                photoUrl:   visitor.photo_url,
                confidence: result.confidence,
              },
            });
          }
        }
      } catch (e) {
        console.error('[Face] Rekognition search error (continuing with local):', e.message);
      }
    }

    // ── 2. Local face-api.js fallback ──────────────────────────────────────────
    const localResult = await face.searchLocalFace(buf, organizationId);
    if (!localResult) return res.json({ match: null });

    const visitor = await Visitor.findByPk(localResult.visitorId, {
      attributes: ['id', 'name', 'email', 'phone', 'company', 'photo_url'],
    });
    if (!visitor) return res.json({ match: null });

    return res.json({
      match: {
        visitorId:  visitor.id,
        name:       visitor.name,
        email:      visitor.email,
        phone:      visitor.phone,
        company:    visitor.company,
        photoUrl:   visitor.photo_url,
        confidence: localResult.confidence,
      },
    });

  } catch (err) {
    console.error('[Face] Search error:', err.message);
    res.json({ match: null });
  }
};

/**
 * POST /api/visitor/face/register
 * Body: { visitorId, photo, organizationId }
 */
const registerFace = async (req, res, next) => {
  try {
    const { visitorId, photo, organizationId } = req.body;
    if (!visitorId || !photo) {
      return res.status(400).json({ error: 'visitorId and photo are required' });
    }

    const visitor = await Visitor.findByPk(visitorId);
    if (!visitor) return res.status(404).json({ error: 'Visitor not found' });

    const filename = `${visitorId}-${uuidv4().slice(0, 8)}.jpg`;
    const photoUrl = face.saveVisitorPhoto(photo, filename);
    await visitor.update({ photo_url: photoUrl });

    const buf = face.photoUrlToBuffer(photo);

    // Save local face descriptor
    try {
      const descriptor = await face.computeDescriptor(buf);
      if (descriptor) await face.saveDescriptor(visitorId, descriptor);
    } catch (e) {
      console.error('[Face] Local descriptor save error (non-fatal):', e.message);
    }

    // Also index in Rekognition if enabled
    if (face.ENABLED) {
      try {
        const faceId = await face.indexFace(organizationId, visitorId, buf);
        if (faceId) await visitor.update({ face_id: faceId });
      } catch (e) {
        console.error('[Face] Rekognition index error (non-fatal):', e.message);
      }
    }

    return res.json({ success: true, photoUrl });
  } catch (err) {
    next(err);
  }
};

module.exports = { searchFace, registerFace };
