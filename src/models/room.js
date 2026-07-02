module.exports = (sequelize, DataTypes) =>
  sequelize.define('Room', {
    id:              { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organization_id: { type: DataTypes.UUID, allowNull: false },
    name:            { type: DataTypes.STRING(255), allowNull: false },
    floor:           { type: DataTypes.STRING(100) },
    building:        { type: DataTypes.STRING(100) },
    capacity:        { type: DataTypes.INTEGER },
    is_active:       { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    tableName: 'rooms',
    timestamps: true,
  });
