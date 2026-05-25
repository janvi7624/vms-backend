const router = require('express').Router();
const { login, getMe, changePassword, register } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/login', login);
router.post('/register', register);
router.get('/me', authenticate, getMe);
router.post('/change-password', authenticate, changePassword);

module.exports = router;
