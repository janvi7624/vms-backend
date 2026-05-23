'use strict';

/**
 * Baseline schema for the Temi VMS (all-UUID keys).
 * Mirrors the merged intent of the legacy migrations/001_init.sql +
 * migrate-enterprise.js, but consistent and Sequelize-managed.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { UUID, STRING, TEXT, BOOLEAN, INTEGER, DATE, JSONB, INET } = Sequelize;
    const uuidPk = {
      type: UUID,
      primaryKey: true,
      defaultValue: Sequelize.literal('gen_random_uuid()'),
    };
    const createdAt = { type: DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') };
    const updatedAt = { type: DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') };

    // pgcrypto provides gen_random_uuid() (present on Supabase).
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    // ── locations ──────────────────────────────────────────────────────────
    await queryInterface.createTable('locations', {
      id: uuidPk,
      name: { type: STRING(255), allowNull: false },
      address: TEXT,
      temi_serial: STRING(100),
      created_at: createdAt,
    });

    // ── organizations ──────────────────────────────────────────────────────
    await queryInterface.createTable('organizations', {
      id: uuidPk,
      name: { type: STRING(200), allowNull: false },
      slug: { type: STRING(100), allowNull: false, unique: true },
      domain: STRING(200),
      logo_url: TEXT,
      address: TEXT,
      phone: STRING(50),
      email: STRING(200),
      plan: { type: STRING(50), defaultValue: 'standard' },
      is_active: { type: BOOLEAN, defaultValue: true },
      max_employees: { type: INTEGER, defaultValue: 100 },
      created_at: createdAt,
      updated_at: updatedAt,
    });

    // ── branches ───────────────────────────────────────────────────────────
    await queryInterface.createTable('branches', {
      id: uuidPk,
      organization_id: {
        type: UUID, allowNull: false,
        references: { model: 'organizations', key: 'id' }, onDelete: 'CASCADE',
      },
      name: { type: STRING(200), allowNull: false },
      address: TEXT,
      city: STRING(100),
      country: { type: STRING(100), defaultValue: 'India' },
      is_active: { type: BOOLEAN, defaultValue: true },
      created_at: createdAt,
    });

    // ── users ──────────────────────────────────────────────────────────────
    await queryInterface.createTable('users', {
      id: uuidPk,
      email: { type: STRING(255), allowNull: false, unique: true },
      password_hash: { type: STRING(255), allowNull: false },
      name: { type: STRING(255), allowNull: false },
      role: { type: STRING(50), allowNull: false },
      department: STRING(255),
      phone: STRING(50),
      desk_location: STRING(255),
      location_id: { type: UUID, references: { model: 'locations', key: 'id' }, onDelete: 'SET NULL' },
      is_active: { type: BOOLEAN, defaultValue: true },
      organization_id: { type: UUID, references: { model: 'organizations', key: 'id' }, onDelete: 'SET NULL' },
      branch_id: { type: UUID, references: { model: 'branches', key: 'id' }, onDelete: 'SET NULL' },
      created_at: createdAt,
      updated_at: updatedAt,
    });

    // ── visitors ───────────────────────────────────────────────────────────
    await queryInterface.createTable('visitors', {
      id: uuidPk,
      name: { type: STRING(255), allowNull: false },
      email: STRING(255),
      phone: STRING(50),
      company: STRING(255),
      photo_url: STRING(500),
      organization_id: { type: UUID, references: { model: 'organizations', key: 'id' }, onDelete: 'SET NULL' },
      created_at: createdAt,
    });

    // ── visits ─────────────────────────────────────────────────────────────
    await queryInterface.createTable('visits', {
      id: uuidPk,
      visitor_id: { type: UUID, references: { model: 'visitors', key: 'id' }, onDelete: 'CASCADE' },
      host_employee_id: { type: UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
      visit_type: { type: STRING(50), allowNull: false },
      purpose: { type: TEXT, allowNull: false },
      status: { type: STRING(50), allowNull: false, defaultValue: 'pending' },
      scheduled_at: DATE,
      checked_in_at: DATE,
      checked_out_at: DATE,
      meeting_room: STRING(255),
      secure_token: { type: STRING(500), unique: true },
      notes: TEXT,
      location_id: { type: UUID, references: { model: 'locations', key: 'id' }, onDelete: 'SET NULL' },
      approved_by: { type: UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
      approved_at: DATE,
      declined_reason: TEXT,
      organization_id: { type: UUID, references: { model: 'organizations', key: 'id' }, onDelete: 'SET NULL' },
      created_at: createdAt,
      updated_at: updatedAt,
    });

    // ── qr_codes ───────────────────────────────────────────────────────────
    await queryInterface.createTable('qr_codes', {
      id: uuidPk,
      visit_id: { type: UUID, references: { model: 'visits', key: 'id' }, onDelete: 'CASCADE' },
      token: { type: TEXT, allowNull: false, unique: true },
      qr_image_base64: TEXT,
      expires_at: { type: DATE, allowNull: false },
      is_used: { type: BOOLEAN, defaultValue: false },
      used_at: DATE,
      created_at: createdAt,
    });

    // ── audit_logs ─────────────────────────────────────────────────────────
    await queryInterface.createTable('audit_logs', {
      id: uuidPk,
      action: { type: STRING(255), allowNull: false },
      entity_type: STRING(100),
      entity_id: UUID,
      performed_by: { type: UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
      metadata: { type: JSONB, defaultValue: {} },
      ip_address: INET,
      created_at: createdAt,
    });

    // ── notifications ──────────────────────────────────────────────────────
    await queryInterface.createTable('notifications', {
      id: uuidPk,
      user_id: { type: UUID, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
      visit_id: { type: UUID, references: { model: 'visits', key: 'id' }, onDelete: 'CASCADE' },
      type: { type: STRING(100), allowNull: false },
      title: { type: STRING(255), allowNull: false },
      message: { type: TEXT, allowNull: false },
      is_read: { type: BOOLEAN, defaultValue: false },
      created_at: createdAt,
    });

    // ── temi_robots ────────────────────────────────────────────────────────
    await queryInterface.createTable('temi_robots', {
      id: uuidPk,
      serial_number: { type: STRING(100), allowNull: false, unique: true },
      name: { type: STRING(255), allowNull: false, defaultValue: 'Temi' },
      location_id: { type: UUID, references: { model: 'locations', key: 'id' }, onDelete: 'SET NULL' },
      status: { type: STRING(50), defaultValue: 'offline' },
      current_task: STRING(255),
      last_seen: DATE,
      saved_locations: { type: JSONB, defaultValue: [] },
      organization_id: { type: UUID, references: { model: 'organizations', key: 'id' }, onDelete: 'SET NULL' },
      created_at: createdAt,
    });

    // ── otp_sessions ───────────────────────────────────────────────────────
    await queryInterface.createTable('otp_sessions', {
      id: uuidPk,
      visit_id: { type: UUID, references: { model: 'visits', key: 'id' }, onDelete: 'CASCADE' },
      email: { type: STRING(200), allowNull: false },
      otp_hash: { type: TEXT, allowNull: false },
      attempts: { type: INTEGER, defaultValue: 0 },
      max_attempts: { type: INTEGER, defaultValue: 3 },
      expires_at: { type: DATE, allowNull: false },
      used: { type: BOOLEAN, defaultValue: false },
      organization_id: { type: UUID, references: { model: 'organizations', key: 'id' }, onDelete: 'SET NULL' },
      created_at: createdAt,
    });

    // ── CHECK constraints ──────────────────────────────────────────────────
    await queryInterface.addConstraint('users', {
      type: 'check', fields: ['role'], name: 'users_role_check',
      where: { role: ['platform_super_admin', 'org_super_admin', 'org_admin', 'admin', 'employee', 'security'] },
    });
    await queryInterface.addConstraint('visits', {
      type: 'check', fields: ['visit_type'], name: 'visits_visit_type_check',
      where: { visit_type: ['pre_planned', 'impromptu'] },
    });
    await queryInterface.addConstraint('visits', {
      type: 'check', fields: ['status'], name: 'visits_status_check',
      where: { status: ['pending', 'approved', 'declined', 'checked_in', 'completed', 'expired'] },
    });
    await queryInterface.addConstraint('temi_robots', {
      type: 'check', fields: ['status'], name: 'temi_robots_status_check',
      where: { status: ['online', 'offline', 'busy', 'error'] },
    });

    // ── Indexes ────────────────────────────────────────────────────────────
    await queryInterface.addIndex('visits', ['host_employee_id'], { name: 'idx_visits_host' });
    await queryInterface.addIndex('visits', ['status'], { name: 'idx_visits_status' });
    await queryInterface.addIndex('visits', ['scheduled_at'], { name: 'idx_visits_scheduled' });
    await queryInterface.addIndex('visits', ['visit_type'], { name: 'idx_visits_type' });
    await queryInterface.addIndex('visits', ['organization_id'], { name: 'idx_visits_org' });
    await queryInterface.addIndex('qr_codes', ['token'], { name: 'idx_qr_token' });
    await queryInterface.addIndex('qr_codes', ['visit_id'], { name: 'idx_qr_visit' });
    await queryInterface.addIndex('notifications', ['user_id', 'is_read'], { name: 'idx_notifications_user' });
    await queryInterface.addIndex('audit_logs', ['entity_type', 'entity_id'], { name: 'idx_audit_entity' });
    await queryInterface.addIndex('otp_sessions', ['email', 'used', 'expires_at'], { name: 'idx_otp_email_active' });
  },

  async down(queryInterface) {
    // Drop in reverse dependency order.
    for (const t of [
      'otp_sessions', 'temi_robots', 'notifications', 'audit_logs',
      'qr_codes', 'visits', 'visitors', 'users', 'branches',
      'organizations', 'locations',
    ]) {
      await queryInterface.dropTable(t);
    }
  },
};
