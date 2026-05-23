module.exports = (sequelize, DataTypes) =>
  sequelize.define('TemiRobot', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    serial_number: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(255), allowNull: false, defaultValue: 'Temi' },
    location_id: DataTypes.UUID,
    status: { type: DataTypes.STRING(50), defaultValue: 'offline' },
    current_task: DataTypes.STRING(255),
    last_seen: DataTypes.DATE,
    saved_locations: { type: DataTypes.JSONB, defaultValue: [] },
    organization_id: DataTypes.UUID,
  }, {
    tableName: 'temi_robots',
    timestamps: true,
    updatedAt: false,
  });
