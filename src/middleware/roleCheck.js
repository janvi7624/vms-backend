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

// Hierarchical — each level inherits access of levels below it
const requirePlatformAdmin = requireRole(ROLES.PLATFORM_SUPER_ADMIN);
const requireOrgSuperAdmin = requireRole(ROLES.PLATFORM_SUPER_ADMIN, ROLES.ORG_SUPER_ADMIN);
const requireOrgAdmin      = requireRole(ROLES.PLATFORM_SUPER_ADMIN, ROLES.ORG_SUPER_ADMIN, ROLES.ORG_ADMIN, ROLES.ADMIN);
const requireAdmin         = requireRole(ROLES.PLATFORM_SUPER_ADMIN, ROLES.ORG_SUPER_ADMIN, ROLES.ORG_ADMIN, ROLES.ADMIN);
const requireEmployee      = requireRole(ROLES.PLATFORM_SUPER_ADMIN, ROLES.ORG_SUPER_ADMIN, ROLES.ORG_ADMIN, ROLES.ADMIN, ROLES.EMPLOYEE);
const requireSecurity      = requireRole(ROLES.PLATFORM_SUPER_ADMIN, ROLES.ORG_SUPER_ADMIN, ROLES.ORG_ADMIN, ROLES.ADMIN, ROLES.EMPLOYEE, ROLES.SECURITY);

module.exports = { requireRole, requirePlatformAdmin, requireOrgSuperAdmin, requireOrgAdmin, requireAdmin, requireEmployee, requireSecurity };
