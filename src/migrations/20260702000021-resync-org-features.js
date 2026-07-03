'use strict';

const PLAN_FEATURES = {
  standard: {
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
  },
  professional: {
    visitor_checkin:  true,
    otp_verification: true,
    walk_in_kiosk:    true,
    rooms:            true,
    analytics:        true,
    robot_control:    true,
    heatmaps:         false,
    sub_admin:        true,
    multi_branch:     true,
    service_requests: true,
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
  },
};

module.exports = {
  async up(queryInterface) {
    // Force-overwrite every org's features to match their current plan.
    // The previous migration skipped orgs that already had any features value,
    // which left some orgs with stale/incomplete feature maps.
    for (const [plan, features] of Object.entries(PLAN_FEATURES)) {
      await queryInterface.sequelize.query(
        `UPDATE organizations SET features = :features WHERE plan = :plan`,
        { replacements: { features: JSON.stringify(features), plan } },
      );
    }
    // Any org with an unrecognised plan gets standard features
    await queryInterface.sequelize.query(
      `UPDATE organizations SET features = :features WHERE plan NOT IN ('standard', 'professional', 'enterprise')`,
      { replacements: { features: JSON.stringify(PLAN_FEATURES.standard) } },
    );
  },

  async down() {
    // Non-reversible — features were already inconsistent before this ran
  },
};
