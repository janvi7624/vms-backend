const router = require('express').Router();
const { createPrePlanned, createImpromptu, getVisitorForm, submitVisitorForm, getVisitor, lookupVisitorHistory } = require('../controllers/visitorController');
const { searchEmployeesPublic } = require('../controllers/employeeController');
const { authenticate } = require('../middleware/auth');
const { requireEmployee } = require('../middleware/roleCheck');
const upload = require('../middleware/upload');

// Public routes (visitor-facing)
router.get('/employees/search', searchEmployeesPublic); // no auth — returns id/name/dept only
router.get('/register/:token', getVisitorForm);
router.post('/register/:token', upload.single('photo'), submitVisitorForm);
router.post('/history', lookupVisitorHistory); // no auth — lookup by email

// Protected routes (employee/admin)
router.post('/preplanned', authenticate, requireEmployee, createPrePlanned);
router.post('/impromptu', createImpromptu); // Security kiosk — no auth required
router.get('/:id', authenticate, getVisitor);

module.exports = router;
