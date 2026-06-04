const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requireReceptionist } = require('../middleware/roleCheck');
const {
  getServiceRequests, updateServiceRequest, addFollowUp, getDashboard,
} = require('../controllers/receptionistController');

// All routes require authentication + receptionist-or-above
router.use(authenticate, requireReceptionist);

router.get('/dashboard',               getDashboard);
router.get('/service-requests',        getServiceRequests);
router.patch('/service-requests/:id',  updateServiceRequest);
router.patch('/service-requests/:id/followup', addFollowUp);

module.exports = router;
