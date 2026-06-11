module.exports = (sequelize, DataTypes) =>
  sequelize.define('Visit', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    visitor_id: DataTypes.UUID,
    host_employee_id: DataTypes.UUID,
    visit_type: { type: DataTypes.STRING(50), allowNull: false },
    purpose: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'pending' },
    scheduled_at: DataTypes.DATE,
    checked_in_at: DataTypes.DATE,
    checked_out_at: DataTypes.DATE,
    meeting_room: DataTypes.STRING(255),
    secure_token: { type: DataTypes.STRING(500), unique: true },
    notes: DataTypes.TEXT,
    location_id: DataTypes.UUID,
    approved_by: DataTypes.UUID,
    approved_at: DataTypes.DATE,
    declined_reason: DataTypes.TEXT,
    robot_id: DataTypes.UUID,
    completed_at: DataTypes.DATE,
    organization_id: DataTypes.UUID,
    visitor_photo: DataTypes.STRING(500),
    meeting_type: { type: DataTypes.STRING(20), defaultValue: 'in_person' },
    virtual_meeting_url: DataTypes.STRING(500),
    // Self-service booking fields
    sub_admin_approved_by: DataTypes.UUID,
    sub_admin_approved_at: DataTypes.DATE,
    booking_source: { type: DataTypes.STRING(30), defaultValue: 'internal' }, // 'internal' | 'self_service'
  }, {
    tableName: 'visits',
    timestamps: true,
  });
