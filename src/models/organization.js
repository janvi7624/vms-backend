module.exports = (sequelize, DataTypes) =>
  sequelize.define('Organization', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    slug: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    domain: DataTypes.STRING(200),
    logo_url: DataTypes.TEXT,
    address: DataTypes.TEXT,
    phone: DataTypes.STRING(50),
    email: DataTypes.STRING(200),
    plan: { type: DataTypes.STRING(50), defaultValue: 'standard' },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    max_employees: { type: DataTypes.INTEGER, defaultValue: 100 },
  }, {
    tableName: 'organizations',
    timestamps: true,
  });
