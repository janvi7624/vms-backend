const router = require('express').Router();
const { login, getMe, changePassword, register, registerDevice, getAuthProfile, updateAuthProfile, getAuthLocations } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/login', login);
router.post('/register', register);
router.get('/me', authenticate, getMe);
router.post('/change-password', authenticate, changePassword);
router.post('/register-device', authenticate, registerDevice);
router.get('/profile',   authenticate, getAuthProfile);
router.put('/profile',   authenticate, updateAuthProfile);
router.get('/locations', authenticate, getAuthLocations);

module.exports = router;
