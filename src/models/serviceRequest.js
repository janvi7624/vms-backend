module.exports = (sequelize, DataTypes) =>
  sequelize.define('ServiceRequest', {
    id: {
      type:         DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey:   true,
    },
    serial:          { type: DataTypes.STRING(100), allowNull: false },
    organization_id: { type: DataTypes.UUID,        allowNull: true  },
    // Optional link to the visit that triggered this request
    visit_id:        { type: DataTypes.UUID,         allowNull: true  },
    // Visitor context (for display on receptionist dashboard)
    visitor_name:    { type: DataTypes.STRING(200), allowNull: true  },
    location:        { type: DataTypes.STRING(200), allowNull: true  },
    // Primary item requested (water / tea / coffee / etc.)
    item:            { type: DataTypes.STRING(100), allowNull: false },
    // Any additional items from the "anything else?" follow-ups
    follow_up_items: {
      type:         DataTypes.JSONB,
      defaultValue: [],
      allowNull:    false,
    },
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
