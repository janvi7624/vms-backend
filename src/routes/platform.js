const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePlatformAdmin } = require('../middleware/roleCheck');
const {
  listOrganizations, getOrganization, createOrganization, updateOrganization, deleteOrganization,
  getPlatformAnalytics, getPlatformBilling, listAllRobots,
} = require('../controllers/platformController');

router.use(authenticate, requirePlatformAdmin);

router.get('/analytics',            getPlatformAnalytics);
router.get('/billing',              getPlatformBilling);
router.get('/organizations',        listOrganizations);
router.post('/organizations',       createOrganization);
router.get('/organizations/:id',    getOrganization);
router.put('/organizations/:id',    updateOrganization);
router.delete('/organizations/:id', deleteOrganization);
router.get('/robots',               listAllRobots);

module.exports = router;
