module.exports = (sequelize, DataTypes) =>
  sequelize.define('User', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    name: { type: DataTypes.STRING(255), allowNull: false },
    role: { type: DataTypes.STRING(50), allowNull: false },
    department: DataTypes.STRING(255),
    phone: DataTypes.STRING(50),
    desk_location: DataTypes.STRING(255),
    location_id: DataTypes.UUID,
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    organization_id: DataTypes.UUID,
    branch_id: DataTypes.UUID,
  }, {
    tableName: 'users',
    timestamps: true,
  });
