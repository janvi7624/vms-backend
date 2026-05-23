module.exports = (sequelize, DataTypes) =>
  sequelize.define('OtpSession', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    visit_id: DataTypes.UUID,
    email: { type: DataTypes.STRING(200), allowNull: false },
    otp_hash: { type: DataTypes.TEXT, allowNull: false },
    attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    max_attempts: { type: DataTypes.INTEGER, defaultValue: 3 },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    used: { type: DataTypes.BOOLEAN, defaultValue: false },
    organization_id: DataTypes.UUID,
  }, {
    tableName: 'otp_sessions',
    timestamps: true,
    updatedAt: false,
  });
