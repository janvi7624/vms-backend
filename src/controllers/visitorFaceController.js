'use strict';

const { v4: uuidv4 } = require('uuid');
const { Visitor }    = require('../models');
const face           = require('../services/faceService');

/**
 * POST /api/visitor/face/search
 * Body: { photo: "data:image/jpeg;base64,...", organizationId }
 * Public endpoint — called by Temi before the walk-in form is shown.
 * Returns matching visitor data if a face is recognised (confidence >= 80%).
 */
const searchFace = async (req, res, next) => {
  try {
    const { photo, organizationId } = req.body;
    if (!photo) return res.json({ match: null });

    // Without Rekognition configured, we can't search — return no match
    if (!face.ENABLED) {
      return res.json({ match: null, reason: 'face_recognition_not_configured' });
    }

    const buf    = face.photoUrlToBuffer(photo);
    const result = await face.searchFace(organizationId, buf);
    if (!result) return res.json({ match: null });

    const visitor = await Visitor.findByPk(result.visitorId, {
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
        confidence: result.confidence,
      },
    });
  } catch (err) {
    console.error('[Face] Search error:', err.message);
    // Non-fatal — return no match so walk-in still works
    res.json({ match: null });
  }
};

/**
 * POST /api/visitor/face/register
 * Body: { visitorId, photo, organizationId }
 * Called after a walk-in is submitted successfully.
 * Saves the photo to disk and indexes the face in Rekognition.
 */
const registerFace = async (req, res, next) => {
  try {
    const { visitorId, photo, organizationId } = req.body;
    if (!visitorId || !photo) {
      return res.status(400).json({ error: 'visitorId and photo are required' });
    }

    const visitor = await Visitor.findByPk(visitorId);
    if (!visitor) return res.status(404).json({ error: 'Visitor not found' });

    // Save photo to disk
    const filename = `${visitorId}-${uuidv4().slice(0, 8)}.jpg`;
    const photoUrl = face.saveVisitorPhoto(photo, filename);
    await visitor.update({ photo_url: photoUrl });

    // Index face in Rekognition (optional)
    if (face.ENABLED) {
      try {
        const buf    = face.photoUrlToBuffer(photo);
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
