const { ROLES } = require('../config/constants');

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

// Hierarchical — each level includes all levels above it
const requirePlatformAdmin = requireRole(ROLES.SUPER_ADMIN);
const requireOrgSuperAdmin = requireRole(ROLES.SUPER_ADMIN);
const requireOrgAdmin      = requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN);
const requireAdmin         = requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SUB_ADMIN);
const requireEmployee      = requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SUB_ADMIN, ROLES.EMPLOYEE);
const requireSecurity      = requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SUB_ADMIN, ROLES.EMPLOYEE, ROLES.CLIENT);

module.exports = { requireRole, requirePlatformAdmin, requireOrgSuperAdmin, requireOrgAdmin, requireAdmin, requireEmployee, requireSecurity };
