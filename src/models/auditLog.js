module.exports = (sequelize, DataTypes) =>
  sequelize.define('AuditLog', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    action: { type: DataTypes.STRING(255), allowNull: false },
    entity_type: DataTypes.STRING(100),
    entity_id: DataTypes.UUID,
    performed_by: DataTypes.UUID,
    metadata: { type: DataTypes.JSONB, defaultValue: {} },
    ip_address: DataTypes.INET,
  }, {
    tableName: 'audit_logs',
    timestamps: true,
    updatedAt: false,
  });
