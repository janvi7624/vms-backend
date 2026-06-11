const bcrypt = require('bcryptjs');
const { sequelize, Organization, User } = require('../models');
const { sendOrgRegistrationToAdmin, sendOrgRegistrationConfirmation, sendOrgApprovalEmail } = require('../services/emailService');

// Stripe is optional — only available when STRIPE_SECRET_KEY is set
let stripe = null;
try {
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
} catch { /* stripe package not installed — payment UI will be disabled */ }

const PLAN_PRICES_STRIPE = {
  // Stripe price IDs — set in .env or fall back to raw amounts (in paise/cents)
  standard:     { amount: 4900,  currency: 'usd', label: 'Standard Plan — $49/month' },
  professional: { amount: 14900, currency: 'usd', label: 'Professional Plan — $149/month' },
  enterprise:   { amount: 49900, currency: 'usd', label: 'Enterprise Plan — $499/month' },
};

/**
 * POST /api/public/organizations/register
 * No auth — any visitor can self-register an organization.
 * Creates org (status=pending_verification) + org admin user.
 * Notifies all super admins by email.
 */
const registerOrganization = async (req, res, next) => {
  try {
    const {
      // Org details
      orgName, orgEmail, orgPhone, orgAddress, orgWebsite, industry,
      // Admin details
      adminName, adminEmail, adminPhone, adminPassword,
    } = req.body;

    if (!orgName || !orgEmail || !adminEmail || !adminPassword || !adminName) {
      return res.status(400).json({
        error: 'orgName, orgEmail, adminName, adminEmail, adminPassword are required',
      });
    }

    if (adminPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check duplicate org email
    const existingOrg = await Organization.findOne({ where: { email: orgEmail.toLowerCase() } });
    if (existingOrg) {
      return res.status(409).json({ error: 'An organization with this email already exists' });
    }

    // Check duplicate admin email
    const existingUser = await User.findOne({ where: { email: adminEmail.toLowerCase() } });
    if (existingUser) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    // Build unique slug from org name
    const baseSlug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let slug = baseSlug;
    let suffix = 1;
    while (await Organization.findOne({ where: { slug } })) {
      slug = `${baseSlug}-${suffix++}`;
    }

    const result = await sequelize.transaction(async (t) => {
      const org = await Organization.create({
        name: orgName,
        slug,
        email: orgEmail.toLowerCase(),
        phone: orgPhone || null,
        address: orgAddress || null,
        website: orgWebsite || null,
        industry: industry || null,
        status: 'pending_verification',
        is_active: false,
        plan: 'standard',
        billing_email: orgEmail.toLowerCase(),
      }, { transaction: t });

      const hash = await bcrypt.hash(adminPassword, 12);
      const admin = await User.create({
        name: adminName,
        email: adminEmail.toLowerCase(),
        phone: adminPhone || null,
        password_hash: hash,
        role: 'admin',
        organization_id: org.id,
        is_active: false, // inactive until org is approved
      }, { transaction: t });

      return { org, admin };
    });

    // Email confirmation to the registering admin
    sendOrgRegistrationConfirmation({
      adminName,
      adminEmail: adminEmail.toLowerCase(),
      orgName,
    }).catch((e) => console.error('[PublicReg] Confirmation email error:', e.message));

    // Notify all super admins
    const superAdmins = await User.findAll({
      where: { role: 'super_admin', is_active: true },
      attributes: ['email', 'name'],
    });
    for (const sa of superAdmins) {
      sendOrgRegistrationToAdmin({
        superAdminEmail: sa.email,
        superAdminName: sa.name,
        orgName,
        orgEmail: orgEmail.toLowerCase(),
        adminName,
        adminEmail: adminEmail.toLowerCase(),
        orgId: result.org.id,
      }).catch((e) => console.error('[PublicReg] Admin notification error:', e.message));
    }

    res.status(201).json({
      message: 'Organization registration submitted. Pending verification by our team.',
      orgId: result.org.id,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/public/organizations
 * Returns minimal list of active/approved orgs for the "Book a Visit" org selector.
 */
const listPublicOrganizations = async (req, res, next) => {
  try {
    const { search } = req.query;
    const { Op } = require('sequelize');
    const where = { status: 'active', is_active: true };
    if (search) {
      where.name = { [Op.iLike]: `%${search}%` };
    }
    const orgs = await Organization.findAll({
      where,
      attributes: ['id', 'name', 'slug', 'logo_url', 'industry'],
      order: [['name', 'ASC']],
      limit: 50,
    });
    res.json(orgs);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/public/organizations/:orgId/create-checkout
 * Creates a Stripe Checkout session for an org that just registered.
 * Returns { checkoutUrl } to redirect the user to Stripe hosted page.
 */
const createStripeCheckout = async (req, res, next) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Payment not configured on this server' });
    }

    const { orgId } = req.params;
    const { plan = 'standard' } = req.body;

    const org = await Organization.findByPk(orgId, {
      attributes: ['id', 'name', 'email', 'status'],
    });
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (org.status === 'active') return res.status(400).json({ error: 'Organization is already active' });

    const priceInfo = PLAN_PRICES_STRIPE[plan] || PLAN_PRICES_STRIPE.standard;
    const webUrl    = process.env.WEB_URL || 'http://localhost:5173';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{
        price_data: {
          currency:     priceInfo.currency,
          unit_amount:  priceInfo.amount,
          recurring:    { interval: 'month' },
          product_data: { name: priceInfo.label },
        },
        quantity: 1,
      }],
      customer_email: org.email || undefined,
      metadata: {
        orgId: org.id,
        plan,
      },
      success_url: `${webUrl}/payment-success?orgId=${org.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${webUrl}/payment-cancelled?orgId=${org.id}`,
    });

    // Store stripe customer/session reference so webhook can look it up
    await org.update({ billing_email: session.customer_email || org.email });

    res.json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/public/stripe/webhook
 * Stripe sends events here. We listen for checkout.session.completed
 * to activate the org after successful payment.
 * Requires raw body — must be registered BEFORE express.json() middleware.
 */
const stripeWebhook = async (req, res) => {
  if (!stripe) return res.sendStatus(400);

  const sig     = req.headers['stripe-signature'];
  const secret  = process.env.STRIPE_WEBHOOK_SECRET;
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.error('[Stripe] Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session  = event.data.object;
    const { orgId, plan } = session.metadata || {};
    if (orgId) {
      try {
        await Organization.update(
          {
            plan:               plan || 'standard',
            status:             'pending_verification',
            subscription_start: new Date(),
          },
          { where: { id: orgId } },
        );
        console.log(`[Stripe] Org ${orgId} payment complete → pending_verification`);
      } catch (err) {
        console.error('[Stripe] Failed to update org after payment:', err.message);
      }
    }
  }

  res.sendStatus(200);
};

module.exports = { registerOrganization, listPublicOrganizations, createStripeCheckout, stripeWebhook };
