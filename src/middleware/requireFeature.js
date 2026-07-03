'use strict';

const { Organization } = require('../models');

/**
 * Gate a route behind a plan feature.
 * Usage: router.get('/admin/rooms', requireFeature('rooms'), handler)
 */
const requireFeature = (featureKey) => async (req, res, next) => {
  try {
    const orgId = req.user?.organization_id;
    if (!orgId) return res.status(403).json({ error: 'No organization associated with this account.' });

    const org = await Organization.findByPk(orgId, { attributes: ['features', 'plan'] });
    if (!org) return res.status(403).json({ error: 'Organization not found.' });

    if (!org.features?.[featureKey]) {
      return res.status(403).json({
        error: `Your current plan (${org.plan}) does not include access to this feature. Please upgrade your plan.`,
        feature: featureKey,
        currentPlan: org.plan,
      });
    }

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = requireFeature;
