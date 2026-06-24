const router = require('express').Router();
const {
  heartbeat, getConfig, getLocations, syncLocations, checkoutVisit, reportError,
  createServiceRequest, addFollowUp, getServiceRequests, updateServiceRequest,
  staffControl, getLinkCandidates, requestLinkApproval,
} = require('../controllers/temiController');
const { authenticateTemi, authenticate } = require('../middleware/auth');

// Public — Temi device checks which orgs have added its serial (for UnlinkedScreen)
router.get('/link-candidates/:serial', getLinkCandidates);
// Public — Temi device requests the pending org's admin to approve the link
router.post('/request-approval', requestLinkApproval);

// Public — frontend reads locations to populate dropdowns
router.get('/locations/:serial', getLocations);

// Public — Temi device creates a service request (no user auth, called from kiosk)
router.post('/service-request',                createServiceRequest);
// Public — Temi device appends a follow-up item to an existing request
router.post('/service-request/:id/followup',   addFollowUp);

// Authenticated — admin/sub_admin/receptionist manages service requests
router.get('/service-requests',       authenticate, getServiceRequests);
router.patch('/service-requests/:id', authenticate, updateServiceRequest);

// Authenticated staff controls Temi live during a virtual meeting call
router.post('/staff-control',         authenticate, staffControl);

// Temi-authenticated routes
router.use(authenticateTemi);
router.post('/heartbeat',      heartbeat);
router.get('/config/:serial',  getConfig);
router.post('/locations/sync', syncLocations);
router.post('/checkout',       checkoutVisit);
router.post('/error',          reportError);

module.exports = router;
