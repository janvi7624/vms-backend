const express = require('express');
const router  = express.Router();
const { registerOrganization, listPublicOrganizations, createStripeCheckout, stripeWebhook } = require('../controllers/publicController');
const {
  createBookRequest, getBookingStatus, selectEmployee, listOrgEmployees,
} = require('../controllers/bookingController');

// ── Stripe webhook — MUST use raw body, registered before express.json ────────
router.post('/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

// ── Organization self-registration ────────────────────────────────────────────
router.post('/organizations/register',                  registerOrganization);
router.get('/organizations',                            listPublicOrganizations);
router.post('/organizations/:orgId/create-checkout',    createStripeCheckout);

// ── Self-service visit booking ────────────────────────────────────────────────
router.post('/visits/book',                                createBookRequest);
router.get('/visits/:visitId/status',                      getBookingStatus);
router.post('/visits/:visitId/select-employee',            selectEmployee);
router.get('/organizations/:orgId/employees',              listOrgEmployees);

module.exports = router;
