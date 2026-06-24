'use strict';

const router = require('express').Router();
const {
  getEmployees, createEmployee, updateEmployee, deleteEmployee,
  getAllVisits, getAnalytics, getAuditLogs, getTemiRobots,
  getRobotStatus, getLocationHeatmap, getStaffActivity, getVisitFunnel,
  getFloorQueue, assignRobot, sendRobotCommand,
  linkTemiRobot, unlinkTemiRobot, approveTemiLink,
} = require('../controllers/adminController');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roleCheck');

router.use(authenticate, requireAdmin);

router.get('/employees',        getEmployees);
router.post('/employees',       createEmployee);
router.put('/employees/:id',    updateEmployee);
router.delete('/employees/:id', deleteEmployee);

router.get('/visits',           getAllVisits);
router.get('/analytics',        getAnalytics);
router.get('/audit-logs',       getAuditLogs);
router.get('/temi-robots',      getTemiRobots);

// Analytics extensions
router.get('/robot-status',     getRobotStatus);
router.get('/location-heatmap', getLocationHeatmap);
router.get('/staff-activity',   getStaffActivity);
router.get('/visit-funnel',     getVisitFunnel);

// Temi robot linking
router.post('/temi-robots/link',                       linkTemiRobot);
router.delete('/temi-robots/:serial/unlink',           unlinkTemiRobot);
router.post('/temi-robots/:serial/approve-link',       approveTemiLink);

// Sub Admin / Floor Manager
router.get('/floor-queue',                getFloorQueue);
router.patch('/visits/:id/assign-robot',  assignRobot);
router.post('/robots/:serial/command',    sendRobotCommand);

module.exports = router;
