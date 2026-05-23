module.exports = (sequelize, DataTypes) =>
  sequelize.define('Location', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    address: DataTypes.TEXT,
    temi_serial: DataTypes.STRING(100),
  }, {
    tableName: 'locations',
    timestamps: true,
    updatedAt: false,
  });
