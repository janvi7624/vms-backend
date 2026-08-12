module.exports = (sequelize, DataTypes) =>
  sequelize.define('OtpSession', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    visit_id: DataTypes.UUID,
    email: { type: DataTypes.STRING(200), allowNull: false },
    otp_hash: { type: DataTypes.TEXT, allowNull: false },
    // Plaintext OTP, kept alongside the hash so a host can manually read it out /
    // share it with a visitor when email/SMS delivery fails. Intentionally
    // readable — do not treat as a secret store, only expose to authenticated hosts.
    otp_code: { type: DataTypes.STRING(6), allowNull: true },
    attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    max_attempts: { type: DataTypes.INTEGER, defaultValue: 3 },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    used: { type: DataTypes.BOOLEAN, defaultValue: false },
    organization_id: DataTypes.UUID,
    // 'pending' | 'sent' | 'failed' — tracks the OTP email specifically (SMS is
    // separate and unreliable to track the same way), so staff dashboards can
    // show a fallback message + resend button when the visitor's email never
    // actually arrived.
    email_status: { type: DataTypes.STRING(20), defaultValue: 'pending' },
  }, {
    tableName: 'otp_sessions',
    timestamps: true,
    updatedAt: false,
  });
