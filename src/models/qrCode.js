module.exports = (sequelize, DataTypes) =>
  sequelize.define('QrCode', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    visit_id: DataTypes.UUID,
    token: { type: DataTypes.TEXT, allowNull: false, unique: true },
    qr_image_base64: DataTypes.TEXT,
    expires_at: { type: DataTypes.DATE, allowNull: false },
    is_used: { type: DataTypes.BOOLEAN, defaultValue: false },
    used_at: DataTypes.DATE,
  }, {
    tableName: 'qr_codes',
    timestamps: true,
    updatedAt: false,
  });
