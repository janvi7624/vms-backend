module.exports = (sequelize, DataTypes) =>
  sequelize.define('EmailSuppression', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    email: { type: DataTypes.STRING(200), allowNull: false, unique: true },
    reason: { type: DataTypes.ENUM('bounce', 'complaint'), allowNull: false },
    detail: { type: DataTypes.TEXT, allowNull: true },
  }, {
    tableName: 'email_suppressions',
    timestamps: true,
    updatedAt: false,
  });
