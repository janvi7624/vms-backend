'use strict';

// Canonical subscription plan catalogue — single source of truth for pricing,
// limits and feature gating. Mirrors the public /pricing page on the web app.
// Prices are in INR (₹), Stripe amounts are in paise.

const PLAN_ORDER = ['starter', 'business', 'professional', 'enterprise'];

const PLAN_META = {
  starter: {
    name: 'Starter',
    subtitle: 'Kiosk Only',
    description: 'Small offices & co-working spaces',
  },
  business: {
    name: 'Business',
    subtitle: '1 Robot',
    description: 'Corporate offices, hotels, tech companies',
  },
  professional: {
    name: 'Professional',
    subtitle: 'Up to 3 Robots',
    description: 'Multi-floor campus, hospitals, large corporate',
  },
  enterprise: {
    name: 'Enterprise',
    subtitle: 'Unlimited',
    description: 'Large enterprise & multi-location deployments',
  },
};

// Monthly price in ₹ — shown to customers.
const PLAN_PRICES = {
  starter:      2999,
  business:     6999,
  professional: 14999,
  enterprise:   29999,
};

// emp / robots = null means unlimited (no limit enforced).
const PLAN_LIMITS = {
  starter:      { emp: 25,  robots: 0,  kiosks: 1 },
  business:     { emp: 100, robots: 1,  kiosks: 2 },
  professional: { emp: 250, robots: 3,  kiosks: 5 },
  enterprise:   { emp: null, robots: null, kiosks: null },
};

const PLAN_FEATURES = {
  starter: {
    visitor_checkin:  true,
    otp_verification: true,
    walk_in_kiosk:    true,
    rooms:            false,
    analytics:        false,
    robot_control:    false,
    heatmaps:         false,
    sub_admin:        false,
    multi_branch:     false,
    service_requests: false,
    receptionist:     false,
    white_label:      false,
  },
  business: {
    visitor_checkin:  true,
    otp_verification: true,
    walk_in_kiosk:    true,
    rooms:            true,
    analytics:        true,
    robot_control:    true,
    heatmaps:         false,
    sub_admin:        true,
    multi_branch:     false,
    service_requests: true,
    receptionist:     true,
    white_label:      false,
  },
  professional: {
    visitor_checkin:  true,
    otp_verification: true,
    walk_in_kiosk:    true,
    rooms:            true,
    analytics:        true,
    robot_control:    true,
    heatmaps:         true,
    sub_admin:        true,
    multi_branch:     true,
    service_requests: true,
    receptionist:     true,
    white_label:      true,
  },
  enterprise: {
    visitor_checkin:  true,
    otp_verification: true,
    walk_in_kiosk:    true,
    rooms:            true,
    analytics:        true,
    robot_control:    true,
    heatmaps:         true,
    sub_admin:        true,
    multi_branch:     true,
    service_requests: true,
    receptionist:     true,
    white_label:      true,
  },
};

// Stripe checkout price info — INR amounts in paise.
const PLAN_PRICES_STRIPE = {
  starter:      { amount: PLAN_PRICES.starter      * 100, currency: 'inr', label: `Starter Plan — ₹${PLAN_PRICES.starter}/month` },
  business:     { amount: PLAN_PRICES.business     * 100, currency: 'inr', label: `Business Plan — ₹${PLAN_PRICES.business}/month` },
  professional: { amount: PLAN_PRICES.professional * 100, currency: 'inr', label: `Professional Plan — ₹${PLAN_PRICES.professional}/month` },
  enterprise:   { amount: PLAN_PRICES.enterprise   * 100, currency: 'inr', label: `Enterprise Plan — ₹${PLAN_PRICES.enterprise}/month` },
};

const DEFAULT_PLAN = 'starter';

module.exports = {
  PLAN_ORDER,
  PLAN_META,
  PLAN_PRICES,
  PLAN_LIMITS,
  PLAN_FEATURES,
  PLAN_PRICES_STRIPE,
  DEFAULT_PLAN,
};
