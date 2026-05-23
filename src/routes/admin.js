const router = require('express').Router();
const { getEmployees, createEmployee, updateEmployee, deleteEmployee, getAllVisits, getAnalytics, getAuditLogs, getTemiRobots } = require('../controllers/adminController');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roleCheck');

router.use(authenticate, requireAdmin);

router.get('/employees', getEmployees);
router.post('/employees', createEmployee);
router.put('/employees/:id', updateEmployee);
router.delete('/employees/:id', deleteEmployee);

router.get('/visits', getAllVisits);
router.get('/analytics', getAnalytics);
router.get('/audit-logs', getAuditLogs);
router.get('/temi-robots', getTemiRobots);

module.exports = router;
