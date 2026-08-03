const router = require('express').Router();
const { getVisits, getPendingApprovals, approveVisit, getNotifications, markNotificationsRead, getProfile, updateProfile } = require('../controllers/employeeController');
const { getOrgLocations } = require('../controllers/adminController');
const { authenticate } = require('../middleware/auth');
const { requireEmployee } = require('../middleware/roleCheck');

router.use(authenticate, requireEmployee);

router.get('/visits', getVisits);
router.get('/visits/pending', getPendingApprovals);
router.post('/approve', approveVisit);
router.get('/notifications', getNotifications);
router.post('/notifications/read', markNotificationsRead);
router.get('/profile', getProfile);
router.put('/profile', updateProfile);
// Org-scoped navigation destinations for the visit-approval room picker —
// same handler as /admin/locations, exposed here too since employees (not
// just admin/sub_admin) approve visits and need the room list, e.g. for
// personal-share-link requests that skip the sub-admin approval step.
router.get('/locations', getOrgLocations);

module.exports = router;
