const router = require('express').Router();
const { createPrePlanned, createImpromptu, getVisitorForm, submitVisitorForm, getVisitor, lookupVisitorHistory } = require('../controllers/visitorController');
const { searchEmployeesPublic } = require('../controllers/employeeController');
const { searchFace, registerFace } = require('../controllers/visitorFaceController');
const { directNavigate } = require('../controllers/temiController');
const { authenticate } = require('../middleware/auth');
const { requireEmployee } = require('../middleware/roleCheck');
const upload = require('../middleware/upload');

// Public routes (visitor-facing)
router.get('/employees/search', searchEmployeesPublic); // no auth — returns id/name/dept/role
router.post('/direct-navigate', directNavigate);        // no auth — kiosk direct visit navigation
router.get('/register/:token', getVisitorForm);
router.post('/register/:token', upload.single('photo'), submitVisitorForm);
router.post('/history', lookupVisitorHistory); // no auth — lookup by email

// Face recognition — public (called by Temi kiosk, no login)
router.post('/face/search',   searchFace);
router.post('/face/register', registerFace);

// Protected routes (employee/admin)
router.post('/preplanned', authenticate, requireEmployee, createPrePlanned);
router.post('/impromptu', createImpromptu); // Security kiosk — no auth required
router.get('/:id', authenticate, getVisitor);

module.exports = router;
