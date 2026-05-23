const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePlatformAdmin } = require('../middleware/roleCheck');
const {
  listOrganizations, getOrganization, createOrganization, updateOrganization, deleteOrganization,
  getPlatformAnalytics, listAllRobots,
} = require('../controllers/platformController');

// All platform routes require authentication + platform_super_admin role
router.use(authenticate, requirePlatformAdmin);

router.get('/analytics',           getPlatformAnalytics);
router.get('/organizations',       listOrganizations);
router.post('/organizations',      createOrganization);
router.get('/organizations/:id',   getOrganization);
router.put('/organizations/:id',   updateOrganization);
router.delete('/organizations/:id', deleteOrganization);
router.get('/robots',              listAllRobots);

module.exports = router;
