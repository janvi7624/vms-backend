const { sequelize, Sequelize } = require('../config/database');
const { DataTypes } = Sequelize;

// ── Load models ──────────────────────────────────────────────────────────────
const Location     = require('./location')(sequelize, DataTypes);
const Organization = require('./organization')(sequelize, DataTypes);
const Branch       = require('./branch')(sequelize, DataTypes);
const User         = require('./user')(sequelize, DataTypes);
const Visitor      = require('./visitor')(sequelize, DataTypes);
const Visit        = require('./visit')(sequelize, DataTypes);
const QrCode       = require('./qrCode')(sequelize, DataTypes);
const AuditLog     = require('./auditLog')(sequelize, DataTypes);
const Notification = require('./notification')(sequelize, DataTypes);
const TemiRobot      = require('./temiRobot')(sequelize, DataTypes);
const OtpSession     = require('./otpSession')(sequelize, DataTypes);
const ServiceRequest = require('./serviceRequest')(sequelize, DataTypes);

// ── Associations ─────────────────────────────────────────────────────────────
// Organization
Organization.hasMany(Branch,    { as: 'branches', foreignKey: 'organization_id', onDelete: 'CASCADE' });
Organization.hasMany(User,      { as: 'users',    foreignKey: 'organization_id', onDelete: 'SET NULL' });
Organization.hasMany(Visitor,   { as: 'visitors', foreignKey: 'organization_id', onDelete: 'SET NULL' });
Organization.hasMany(Visit,     { as: 'visits',   foreignKey: 'organization_id', onDelete: 'SET NULL' });
Organization.hasMany(TemiRobot, { as: 'robots',   foreignKey: 'organization_id', onDelete: 'SET NULL' });

// Branch
Branch.belongsTo(Organization, { as: 'organization', foreignKey: 'organization_id' });
Branch.hasMany(User,           { as: 'users', foreignKey: 'branch_id', onDelete: 'SET NULL' });

// Location
Location.hasMany(User,      { as: 'users', foreignKey: 'location_id', onDelete: 'SET NULL' });
Location.hasMany(Visit,     { as: 'visits', foreignKey: 'location_id', onDelete: 'SET NULL' });
Location.hasMany(TemiRobot, { as: 'robots', foreignKey: 'location_id', onDelete: 'SET NULL' });

// User
User.belongsTo(Organization, { as: 'organization', foreignKey: 'organization_id' });
User.belongsTo(Branch,       { as: 'branch', foreignKey: 'branch_id' });
User.belongsTo(Location,     { as: 'location', foreignKey: 'location_id' });
User.hasMany(Visit,          { as: 'hostedVisits', foreignKey: 'host_employee_id', onDelete: 'SET NULL' });
User.hasMany(Notification,   { as: 'notifications', foreignKey: 'user_id', onDelete: 'CASCADE' });

// Visitor
Visitor.belongsTo(Organization, { as: 'organization', foreignKey: 'organization_id' });
Visitor.hasMany(Visit,          { as: 'visits', foreignKey: 'visitor_id', onDelete: 'CASCADE' });

// Visit
Visit.belongsTo(Visitor,      { as: 'visitor', foreignKey: 'visitor_id' });
Visit.belongsTo(User,         { as: 'host', foreignKey: 'host_employee_id' });
Visit.belongsTo(User,         { as: 'approver', foreignKey: 'approved_by' });
Visit.belongsTo(Location,     { as: 'location', foreignKey: 'location_id' });
Visit.belongsTo(Organization, { as: 'organization', foreignKey: 'organization_id' });
Visit.belongsTo(TemiRobot,    { as: 'robot', foreignKey: 'robot_id' });
Visit.hasOne(QrCode,          { as: 'qrCode', foreignKey: 'visit_id', onDelete: 'CASCADE' });
Visit.hasMany(OtpSession,     { as: 'otpSessions', foreignKey: 'visit_id', onDelete: 'CASCADE' });
Visit.hasMany(Notification,   { as: 'notifications', foreignKey: 'visit_id', onDelete: 'CASCADE' });

// QrCode
QrCode.belongsTo(Visit, { as: 'visit', foreignKey: 'visit_id' });

// AuditLog
AuditLog.belongsTo(User, { as: 'performer', foreignKey: 'performed_by' });

// Notification
Notification.belongsTo(User,  { as: 'user', foreignKey: 'user_id' });
Notification.belongsTo(Visit, { as: 'visit', foreignKey: 'visit_id' });

// TemiRobot
TemiRobot.belongsTo(Location,     { as: 'location', foreignKey: 'location_id' });
TemiRobot.belongsTo(Organization, { as: 'organization', foreignKey: 'organization_id' });
TemiRobot.hasMany(Visit,          { as: 'visits', foreignKey: 'robot_id', onDelete: 'SET NULL' });

// OtpSession
OtpSession.belongsTo(Visit,        { as: 'visit', foreignKey: 'visit_id' });
OtpSession.belongsTo(Organization, { as: 'organization', foreignKey: 'organization_id' });

// ServiceRequest
ServiceRequest.belongsTo(Organization, { as: 'organization', foreignKey: 'organization_id' });
ServiceRequest.belongsTo(User,         { as: 'fulfilledBy', foreignKey: 'fulfilled_by' });

module.exports = {
  sequelize,
  Sequelize,
  Location,
  Organization,
  Branch,
  User,
  Visitor,
  Visit,
  QrCode,
  AuditLog,
  Notification,
  TemiRobot,
  OtpSession,
  ServiceRequest,
};
