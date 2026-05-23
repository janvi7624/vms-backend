const router = require('express').Router();
const { getVisits, getPendingApprovals, approveVisit, getNotifications, markNotificationsRead } = require('../controllers/employeeController');
const { authenticate } = require('../middleware/auth');
const { requireEmployee } = require('../middleware/roleCheck');

router.use(authenticate, requireEmployee);

router.get('/visits', getVisits);
router.get('/visits/pending', getPendingApprovals);
router.post('/approve', approveVisit);
router.get('/notifications', getNotifications);
router.post('/notifications/read', markNotificationsRead);

module.exports = router;
