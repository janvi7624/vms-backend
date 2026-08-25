'use strict';

const ocr = require('../services/ocrService');

/**
 * POST /api/visitor/business-card/scan
 * Body: { imageBase64: "data:image/jpeg;base64,..." }
 * Public — called from kiosk/Temi walk-in and the authenticated host-scheduling
 * form. Only extracts and returns fields for the client to review/confirm; it
 * does not create or update any visitor/visit record.
 */
const scanBusinessCard = async (req, res, next) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 is required' });
    }
    if (!ocr.ENABLED) {
      return res.status(503).json({ error: 'Business card scanning is not configured on this server' });
    }

    const result = await ocr.scanBusinessCard(imageBase64, req.user?.id);
    res.json(result);
  } catch (err) {
    if (err instanceof ocr.OcrNotConfiguredError) {
      return res.status(503).json({ error: err.message });
    }
    // The AWS credentials are valid but lack Textract permission — a one-time
    // IAM setup step, not a bug. Surface it clearly instead of a bare 500 so
    // the client can show something actionable rather than "server error".
    if (err.name === 'AccessDeniedException') {
      console.error('[OCR] Textract IAM permission missing:', err.message);
      return res.status(503).json({
        error: 'Business card scanning is not enabled yet — the server\'s AWS credentials need the textract:DetectDocumentText permission added.',
      });
    }
    if (err.name === 'TimeoutError' || err.message?.includes('timeout')) {
      console.error('[OCR] Textract request timed out:', err.message);
      return res.status(504).json({ error: 'Card scan timed out — please try again' });
    }
    console.error('[OCR] Business card scan error:', err.name, err.message);
    next(err);
  }
};

module.exports = { scanBusinessCard };
