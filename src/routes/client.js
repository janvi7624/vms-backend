'use strict';

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requireSecurity } = require('../middleware/roleCheck');
const { getMyVisits, bookVisit, searchEmployees } = require('../controllers/clientController');

router.get('/visits', authenticate, requireSecurity, getMyVisits);
router.post('/book', authenticate, requireSecurity, bookVisit);
router.get('/employees/search', authenticate, searchEmployees);

module.exports = router;
