module.exports = (sequelize, DataTypes) =>
  sequelize.define('Visitor', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    email: DataTypes.STRING(255),
    phone: DataTypes.STRING(50),
    company: DataTypes.STRING(255),
    photo_url: DataTypes.STRING(500),
    organization_id: DataTypes.UUID,
  }, {
    tableName: 'visitors',
    timestamps: true,
    updatedAt: false,
  });
