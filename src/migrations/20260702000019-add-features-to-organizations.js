'use strict';

const DEFAULT_FEATURES = {
  standard: {
    visitor_checkin: true,
    otp_verification: true,
    walk_in_kiosk: true,
    rooms: false,
    analytics: false,
    robot_control: false,
    heatmaps: false,
    sub_admin: false,
    multi_branch: false,
    service_requests: false,
  },
  professional: {
    visitor_checkin: true,
    otp_verification: true,
    walk_in_kiosk: true,
    rooms: true,
    analytics: true,
    robot_control: true,
    heatmaps: false,
    sub_admin: true,
    multi_branch: true,
    service_requests: true,
  },
  enterprise: {
    visitor_checkin: true,
    otp_verification: true,
    walk_in_kiosk: true,
    rooms: true,
    analytics: true,
    robot_control: true,
    heatmaps: true,
    sub_admin: true,
    multi_branch: true,
    service_requests: true,
  },
};

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('organizations', 'features', {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: {},
    });

    // Back-fill features for all existing orgs based on their current plan
    for (const [plan, features] of Object.entries(DEFAULT_FEATURES)) {
      await queryInterface.sequelize.query(
        `UPDATE organizations SET features = :features WHERE plan = :plan AND (features IS NULL OR features = '{}')`,
        { replacements: { features: JSON.stringify(features), plan } },
      );
    }
    // Fallback: any org with an unrecognised plan gets standard features
    await queryInterface.sequelize.query(
      `UPDATE organizations SET features = :features WHERE features IS NULL OR features = '{}'`,
      { replacements: { features: JSON.stringify(DEFAULT_FEATURES.standard) } },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('organizations', 'features');
  },
};
