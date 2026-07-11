'use strict';

const router = require('express').Router();
const {
  getEmployees, createEmployee, updateEmployee, deleteEmployee,
  getAllVisits, getAnalytics, getAuditLogs, getTemiRobots,
  getRobotStatus, getLocationHeatmap, getStaffActivity, getVisitFunnel,
  getFloorQueue, assignRobot, sendRobotCommand,
  linkTemiRobot, unlinkTemiRobot, approveTemiLink, getSerialHistory, renameTemiRobot,
  getSubscription, requestPlanUpgrade,
  getOrgLocations,
} = require('../controllers/adminController');
const { getRooms, createRoom, updateRoom, deleteRoom } = require('../controllers/roomController');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roleCheck');
const requireFeature = require('../middleware/requireFeature');

router.use(authenticate, requireAdmin);

router.get('/employees',        getEmployees);
router.post('/employees',       createEmployee);
router.put('/employees/:id',    updateEmployee);
router.delete('/employees/:id', deleteEmployee);

router.get('/visits',           getAllVisits);
router.get('/analytics',        requireFeature('analytics'), getAnalytics);
router.get('/audit-logs',       getAuditLogs);
router.get('/temi-robots',                getTemiRobots);
router.get('/temi-robots/serial-history', getSerialHistory);

// Analytics extensions (professional+)
router.get('/robot-status',     requireFeature('analytics'),     getRobotStatus);
router.get('/location-heatmap', requireFeature('heatmaps'),      getLocationHeatmap);
router.get('/staff-activity',   requireFeature('analytics'),     getStaffActivity);
router.get('/visit-funnel',     requireFeature('analytics'),     getVisitFunnel);

// Temi robot linking & control (professional+)
router.post('/temi-robots/link',                       requireFeature('robot_control'), linkTemiRobot);
router.delete('/temi-robots/:serial/unlink',           requireFeature('robot_control'), unlinkTemiRobot);
router.post('/temi-robots/:serial/approve-link',       requireFeature('robot_control'), approveTemiLink);
router.patch('/temi-robots/:serial/name',              requireFeature('robot_control'), renameTemiRobot);

// Sub Admin / Floor Manager (professional+)
router.get('/floor-queue',                requireFeature('robot_control'), getFloorQueue);
router.patch('/visits/:id/assign-robot',  requireFeature('robot_control'), assignRobot);
router.post('/robots/:serial/command',    requireFeature('robot_control'), sendRobotCommand);

// Subscription info + plan upgrade request
router.get('/subscription',          getSubscription);
router.post('/plan-upgrade-request', requestPlanUpgrade);

// Org-scoped navigation locations (Temi saved locations or Room names)
router.get('/locations', getOrgLocations);

// Rooms (professional+)
router.get('/rooms',         requireFeature('rooms'), getRooms);
router.post('/rooms',        requireFeature('rooms'), createRoom);
router.put('/rooms/:id',     requireFeature('rooms'), updateRoom);
router.delete('/rooms/:id',  requireFeature('rooms'), deleteRoom);

module.exports = router;
