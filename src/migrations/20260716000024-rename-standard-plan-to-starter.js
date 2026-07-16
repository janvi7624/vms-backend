'use strict';

const { PLAN_FEATURES, PLAN_LIMITS } = require('../config/plans');

module.exports = {
  async up(queryInterface) {
    // The legacy 'standard' tier was renamed to 'starter' to match the public
    // pricing page (Starter/Business/Professional/Enterprise, ₹ INR).
    await queryInterface.sequelize.query(
      `UPDATE organizations SET plan = 'starter' WHERE plan = 'standard'`,
    );

    // Resync features + limits for every recognised plan so existing orgs
    // pick up the new feature flags (receptionist, white_label) and limits.
    for (const [plan, features] of Object.entries(PLAN_FEATURES)) {
      const limits = PLAN_LIMITS[plan];
      await queryInterface.sequelize.query(
        `UPDATE organizations
         SET features = :features, max_employees = :emp, max_robots = :robots
         WHERE plan = :plan`,
        {
          replacements: {
            features: JSON.stringify(features),
            emp: limits.emp,
            robots: limits.robots,
            plan,
          },
        },
      );
    }

    // Any org with an unrecognised plan falls back to starter.
    await queryInterface.sequelize.query(
      `UPDATE organizations
       SET plan = 'starter', features = :features, max_employees = :emp, max_robots = :robots
       WHERE plan NOT IN ('starter', 'business', 'professional', 'enterprise')`,
      {
        replacements: {
          features: JSON.stringify(PLAN_FEATURES.starter),
          emp: PLAN_LIMITS.starter.emp,
          robots: PLAN_LIMITS.starter.robots,
        },
      },
    );
  },

  async down() {
    // Non-reversible — old 'standard' rows can no longer be distinguished
    // from orgs that signed up as 'starter' after this migration ran.
  },
};
