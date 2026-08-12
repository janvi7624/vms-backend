const express = require('express');
const router  = express.Router();
const { registerOrganization, listPublicOrganizations, createStripeCheckout, stripeWebhook } = require('../controllers/publicController');
const {
  createBookRequest, getBookingStatus, selectEmployee, listOrgEmployees,
  getHostBookingInfo, createDirectBooking,
} = require('../controllers/bookingController');
const { handleSesEvent } = require('../controllers/sesEventController');

// ── Stripe webhook — MUST use raw body, registered before express.json ────────
router.post('/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

// ── SES bounce/complaint webhook (via SNS) — SNS posts text/plain, not JSON ───
router.post('/ses/events', express.text({ type: '*/*' }), handleSesEvent);

// ── Organization self-registration ────────────────────────────────────────────
router.post('/organizations/register',                  registerOrganization);
router.get('/organizations',                            listPublicOrganizations);
router.post('/organizations/:orgId/create-checkout',    createStripeCheckout);

// ── Self-service visit booking ────────────────────────────────────────────────
router.post('/visits/book',                                createBookRequest);
router.get('/visits/:visitId/status',                      getBookingStatus);
router.post('/visits/:visitId/select-employee',            selectEmployee);
router.get('/organizations/:orgId/employees',              listOrgEmployees);

// ── Personal-link booking (staff-shared link — auto org select + auto approve) ─
router.get('/host/:hostId/booking-info',                   getHostBookingInfo);
router.post('/visits/direct-book',                         createDirectBooking);

module.exports = router;
