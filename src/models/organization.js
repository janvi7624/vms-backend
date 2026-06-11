module.exports = (sequelize, DataTypes) =>
  sequelize.define('Organization', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    slug: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    domain: DataTypes.STRING(200),
    website: DataTypes.STRING(300),
    industry: DataTypes.STRING(100),
    logo_url: DataTypes.TEXT,
    address: DataTypes.TEXT,
    phone: DataTypes.STRING(50),
    email: DataTypes.STRING(200),
    plan: { type: DataTypes.STRING(50), defaultValue: 'standard' },
    // 'active' (default for existing), 'pending_verification' (self-registered), 'rejected', 'suspended'
    status: { type: DataTypes.STRING(50), defaultValue: 'active' },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    rejection_reason: DataTypes.TEXT,
    verified_by: DataTypes.UUID,
    verified_at: DataTypes.DATE,
    max_employees: { type: DataTypes.INTEGER, defaultValue: 100 },
    subscription_start: DataTypes.DATEONLY,
    subscription_end: DataTypes.DATEONLY,
    billing_email: DataTypes.STRING(200),
    max_robots: { type: DataTypes.INTEGER, defaultValue: 2 },
  }, {
    tableName: 'organizations',
    timestamps: true,
  });
