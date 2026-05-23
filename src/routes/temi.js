const router = require('express').Router();
const { heartbeat, getConfig, getLocations, syncLocations, checkoutVisit, reportError } = require('../controllers/temiController');
const { authenticateTemi } = require('../middleware/auth');

// Public — frontend reads locations to populate dropdowns
router.get('/locations/:serial', getLocations);

// Temi-authenticated routes
router.use(authenticateTemi);
router.post('/heartbeat', heartbeat);
router.get('/config/:serial', getConfig);
router.post('/locations/sync', syncLocations);
router.post('/checkout', checkoutVisit);
router.post('/error', reportError);

module.exports = router;
