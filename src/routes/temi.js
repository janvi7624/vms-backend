const router = require('express').Router();
const {
  heartbeat, getConfig, getLocations, syncLocations, checkoutVisit, reportError,
  createServiceRequest, getServiceRequests, updateServiceRequest,
} = require('../controllers/temiController');
const { authenticateTemi, authenticate } = require('../middleware/auth');

// Public — frontend reads locations to populate dropdowns
router.get('/locations/:serial', getLocations);

// Public — Temi voice command creates a service request (called from device, no user auth)
router.post('/service-request', createServiceRequest);

// Authenticated — admin/sub_admin manages service requests
router.get('/service-requests',     authenticate, getServiceRequests);
router.patch('/service-requests/:id', authenticate, updateServiceRequest);

// Temi-authenticated routes
router.use(authenticateTemi);
router.post('/heartbeat', heartbeat);
router.get('/config/:serial', getConfig);
router.post('/locations/sync', syncLocations);
router.post('/checkout', checkoutVisit);
router.post('/error', reportError);

module.exports = router;
