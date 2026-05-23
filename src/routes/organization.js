const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requireOrgAdmin, requireEmployee } = require('../middleware/roleCheck');
const {
  listBranches, createBranch, updateBranch,
  listOrgEmployees, createOrgEmployee,
  listOrgVisits, getOrgAnalytics,
  getOrgPendingApprovals, approveOrgVisit, declineOrgVisit,
} = require('../controllers/organizationController');

router.use(authenticate);

// Branches — org admin+
router.get('/branches',          requireOrgAdmin, listBranches);
router.post('/branches',         requireOrgAdmin, createBranch);
router.put('/branches/:id',      requireOrgAdmin, updateBranch);

// Employees — org admin+
router.get('/employees',         requireOrgAdmin, listOrgEmployees);
router.post('/employees',        requireOrgAdmin, createOrgEmployee);

// Visits — any authenticated employee can list; approval requires org admin+
router.get('/visits',            requireEmployee, listOrgVisits);
router.get('/visits/pending',    requireEmployee, getOrgPendingApprovals);
router.post('/visits/:id/approve', requireEmployee, approveOrgVisit);
router.post('/visits/:id/decline', requireEmployee, declineOrgVisit);

// Analytics — org admin+
router.get('/analytics',         requireOrgAdmin, getOrgAnalytics);

module.exports = router;
