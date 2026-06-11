const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePlatformAdmin } = require('../middleware/roleCheck');
const {
  listOrganizations, getOrganization, createOrganization, updateOrganization, deleteOrganization,
  approveOrganization, rejectOrganization,
  getPlatformAnalytics, getPlatformBilling, listAllRobots, listAllLocations,
  listAllUsers, createPlatformUser, updatePlatformUser, deletePlatformUser,
  listAllVisits, updatePlatformVisit, deletePlatformVisit,
  listAuditLogs,
  updateRobot, deleteRobot,
} = require('../controllers/platformController');

router.use(authenticate, requirePlatformAdmin);

// Analytics & billing
router.get('/analytics',            getPlatformAnalytics);
router.get('/billing',              getPlatformBilling);

// Organizations
router.get('/organizations',                   listOrganizations);
router.post('/organizations',                  createOrganization);
router.get('/organizations/:id',               getOrganization);
router.put('/organizations/:id',               updateOrganization);
router.delete('/organizations/:id',            deleteOrganization);
router.put('/organizations/:id/approve',       approveOrganization);
router.put('/organizations/:id/reject',        rejectOrganization);

// Users (all orgs)
router.get('/users',        listAllUsers);
router.post('/users',       createPlatformUser);
router.put('/users/:id',    updatePlatformUser);
router.delete('/users/:id', deletePlatformUser);

// Visits (all orgs)
router.get('/visits',        listAllVisits);
router.put('/visits/:id',    updatePlatformVisit);
router.delete('/visits/:id', deletePlatformVisit);

// Robots (all orgs)
router.get('/robots',        listAllRobots);
router.put('/robots/:id',    updateRobot);
router.delete('/robots/:id', deleteRobot);

// Locations (for robot assignment)
router.get('/locations',     listAllLocations);

// Audit logs
router.get('/audit-logs', listAuditLogs);

module.exports = router;
