const router = require('express').Router();
const { validateQR, getQRImage } = require('../controllers/qrController');
const { authenticate } = require('../middleware/auth');
const { authenticateTemi } = require('../middleware/auth');

// Temi robot calls this (with API key)
router.post('/validate', authenticateTemi, validateQR);

// Employee/admin can view QR image
router.get('/:visitId/image', authenticate, getQRImage);

module.exports = router;
