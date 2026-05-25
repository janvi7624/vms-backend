'use strict';

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requireSecurity } = require('../middleware/roleCheck');
const {
  getMyVisits,
  getVisitHistory,
  getVisitDetail,
  cancelVisit,
  bookVisit,
  searchEmployees,
} = require('../controllers/clientController');

// NOTE: /visits/history must be registered before /visits/:id to avoid ":id" swallowing "history"
router.get('/visits',          authenticate, requireSecurity, getMyVisits);
router.get('/visits/history',  authenticate, requireSecurity, getVisitHistory);
router.get('/visits/:id',      authenticate, requireSecurity, getVisitDetail);
router.post('/visits/:id/cancel', authenticate, requireSecurity, cancelVisit);
router.post('/book',           authenticate, requireSecurity, bookVisit);
router.get('/employees/search', authenticate, searchEmployees);

module.exports = router;
