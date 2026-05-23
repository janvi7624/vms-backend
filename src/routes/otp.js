const router = require('express').Router();
const { sendOTP, verifyOTP, requestWalkIn } = require('../controllers/otpController');

// All public — no auth needed (kiosk + Temi use these without a user account)
router.post('/send',        sendOTP);
router.post('/verify',      verifyOTP);
router.post('/walk-in',     requestWalkIn);

module.exports = router;
