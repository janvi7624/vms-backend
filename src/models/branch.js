module.exports = (sequelize, DataTypes) =>
  sequelize.define('Branch', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organization_id: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(200), allowNull: false },
    address: DataTypes.TEXT,
    city: DataTypes.STRING(100),
    country: { type: DataTypes.STRING(100), defaultValue: 'India' },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    tableName: 'branches',
    timestamps: true,
    updatedAt: false,
  });
