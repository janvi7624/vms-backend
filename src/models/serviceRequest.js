module.exports = (sequelize, DataTypes) =>
  sequelize.define('ServiceRequest', {
    id: {
      type:         DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey:   true,
    },
    serial:          { type: DataTypes.STRING(100), allowNull: false },
    organization_id: { type: DataTypes.UUID, allowNull: true },
    item:            { type: DataTypes.STRING(100), allowNull: false },
    status: {
      type:         DataTypes.STRING(50),
      defaultValue: 'pending',
      allowNull:    false,
      validate:     { isIn: [['pending', 'fulfilled', 'dismissed']] },
    },
    fulfilled_by: { type: DataTypes.UUID, allowNull: true },
    fulfilled_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName:  'temi_service_requests',
    timestamps: true,
    updatedAt:  false,
    createdAt:  'created_at',
  });
