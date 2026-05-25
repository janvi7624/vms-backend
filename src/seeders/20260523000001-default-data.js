'use strict';

const bcrypt = require('bcryptjs');

// ── Fixed IDs ─────────────────────────────────────────────────────────────────
const LOC_1 = '00000000-0000-0000-0000-000000000001';
const LOC_2 = '00000000-0000-0000-0000-000000000002';

const ORG_1 = '00000000-0000-0000-0001-000000000001';

const BRANCH_1 = '00000000-0000-0000-0002-000000000001';
const BRANCH_2 = '00000000-0000-0000-0002-000000000002';

// Roles: super_admin → org_super_admin | admin → admin | sub_admin → org_admin | employee → employee
const USER_SUPER  = '00000000-0000-0000-0003-000000000001'; // super admin
const USER_ADMIN  = '00000000-0000-0000-0003-000000000002'; // admin
const USER_SUB    = '00000000-0000-0000-0003-000000000003'; // sub admin
const USER_EMP1   = '00000000-0000-0000-0003-000000000004'; // employee
const USER_EMP2   = '00000000-0000-0000-0003-000000000005'; // employee
const USER_CLIENT = '00000000-0000-0000-0003-000000000006'; // client

const VIS_1 = '00000000-0000-0000-0004-000000000001';
const VIS_2 = '00000000-0000-0000-0004-000000000002';
const VIS_3 = '00000000-0000-0000-0004-000000000003';
const VIS_4 = '00000000-0000-0000-0004-000000000004';

const VISIT_1 = '00000000-0000-0000-0005-000000000001'; // approved
const VISIT_2 = '00000000-0000-0000-0005-000000000002'; // checked_in
const VISIT_3 = '00000000-0000-0000-0005-000000000003'; // completed
const VISIT_4 = '00000000-0000-0000-0005-000000000004'; // pending
const VISIT_5 = '00000000-0000-0000-0005-000000000005'; // declined

const QR_1 = '00000000-0000-0000-0006-000000000001';
const QR_2 = '00000000-0000-0000-0006-000000000002';

const TEMI_1 = '00000000-0000-0000-0007-000000000001';

module.exports = {
  async up(queryInterface) {
    // Clear all tables in reverse dependency order so re-runs are safe
    for (const table of ['otp_sessions', 'temi_robots', 'notifications', 'audit_logs', 'qr_codes', 'visits', 'visitors', 'users', 'branches', 'organizations', 'locations']) {
      await queryInterface.bulkDelete(table, null, {});
    }

    const now   = new Date();
    const past1 = new Date(now - 2 * 24 * 60 * 60 * 1000);
    const past2 = new Date(now - 1 * 24 * 60 * 60 * 1000);
    const soon  = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const defaultPw     = await bcrypt.hash('Password@123', 12);
    const superAdminPw  = await bcrypt.hash('SuperAdmin@123', 12);
    const otpHash       = await bcrypt.hash('123456', 10);

    // ── locations ─────────────────────────────────────────────────────────────
    await queryInterface.bulkInsert('locations', [
      {
        id: LOC_1,
        name: 'Head Office',
        address: 'Ground Floor, Tower A, Victoria Island, Lagos',
        temi_serial: '00126040001',
        created_at: now,
      },
      {
        id: LOC_2,
        name: 'Abuja Branch',
        address: '12 Constitution Ave, Central Business District, Abuja',
        temi_serial: '00126040002',
        created_at: now,
      },
    ], {});

    // ── organizations ─────────────────────────────────────────────────────────
    await queryInterface.bulkInsert('organizations', [
      {
        id: ORG_1,
        name: 'Nanta Tech Limited',
        slug: 'nanta-tech',
        domain: 'nantatech.com',
        address: 'Tower A, Victoria Island, Lagos',
        phone: '+234-1-4600001',
        email: 'info@nantatech.com',
        plan: 'enterprise',
        is_active: true,
        max_employees: 200,
        created_at: now,
        updated_at: now,
      },
    ], {});

    // ── branches ──────────────────────────────────────────────────────────────
    await queryInterface.bulkInsert('branches', [
      {
        id: BRANCH_1,
        organization_id: ORG_1,
        name: 'Lagos HQ',
        address: 'Ground Floor, Tower A, Victoria Island',
        city: 'Lagos',
        country: 'Nigeria',
        is_active: true,
        created_at: now,
      },
      {
        id: BRANCH_2,
        organization_id: ORG_1,
        name: 'Abuja Branch',
        address: '12 Constitution Ave, CBD',
        city: 'Abuja',
        country: 'Nigeria',
        is_active: true,
        created_at: now,
      },
    ], {});

    // ── users ─────────────────────────────────────────────────────────────────
    await queryInterface.bulkInsert('users', [
      {
        id: USER_SUPER,
        email: 'superadmin@nantatech.com',
        password_hash: superAdminPw,
        name: 'Chidi Okonkwo',
        role: 'super_admin',
        department: 'Executive',
        phone: '+234-801-1000001',
        desk_location: 'Suite 001',
        location_id: LOC_1,
        organization_id: ORG_1,
        branch_id: BRANCH_1,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: USER_ADMIN,
        email: 'admin@nantatech.com',
        password_hash: defaultPw,
        name: 'Amaka Eze',
        role: 'admin', 
        department: 'Administration',
        phone: '+234-801-1000002',
        desk_location: 'Room 101',
        location_id: LOC_1,
        organization_id: ORG_1,
        branch_id: BRANCH_1,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: USER_SUB,
        email: 'subadmin@nantatech.com',
        password_hash: defaultPw,
        name: 'Emeka Nwosu',
        role: 'sub_admin',
        department: 'Operations',
        phone: '+234-801-1000003',
        desk_location: 'Room 205',
        location_id: LOC_1,
        organization_id: ORG_1,
        branch_id: BRANCH_1,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: USER_EMP1,
        email: 'john.doe@nantatech.com',
        password_hash: defaultPw,
        name: 'John Doe',
        role: 'employee',
        department: 'Engineering',
        phone: '+234-801-1000004',
        desk_location: 'Desk E-12',
        location_id: LOC_1,
        organization_id: ORG_1,
        branch_id: BRANCH_1,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: USER_EMP2,
        email: 'jane.smith@nantatech.com',
        password_hash: defaultPw,
        name: 'Jane Smith',
        role: 'employee',
        department: 'HR',
        phone: '+234-801-1000005',
        desk_location: 'Desk H-08',
        location_id: LOC_2,
        organization_id: ORG_1,
        branch_id: BRANCH_2,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: USER_CLIENT,
        email: 'client@nantatech.com',
        password_hash: defaultPw,
        name: 'David Osei',
        role: 'client',
        department: 'External',
        phone: '+234-801-1000006',
        location_id: LOC_1,
        organization_id: ORG_1,
        branch_id: BRANCH_1,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    ], {});

    // ── visitors ──────────────────────────────────────────────────────────────
    await queryInterface.bulkInsert('visitors', [
      { id: VIS_1, name: 'Tunde Adeyemi',  email: 'tunde.adeyemi@gmail.com',   phone: '+234-802-2000001', company: 'Zenith Bank',        organization_id: ORG_1, created_at: past1 },
      { id: VIS_2, name: 'Fatima Bello',   email: 'fatima.bello@outlook.com',  phone: '+234-802-2000002', company: 'MTN Nigeria',         organization_id: ORG_1, created_at: past2 },
      { id: VIS_3, name: 'Kelechi Ibe',    email: 'kelechi.ibe@yahoo.com',     phone: '+234-802-2000003', company: 'Access Bank',         organization_id: ORG_1, created_at: past2 },
      { id: VIS_4, name: 'Ngozi Okeke',    email: 'ngozi.okeke@company.com',   phone: '+234-802-2000004', company: 'Dangote Industries',  organization_id: ORG_1, created_at: now  },
    ], {});

    // ── visits ────────────────────────────────────────────────────────────────
    await queryInterface.bulkInsert('visits', [
      {
        id: VISIT_1,
        visitor_id: VIS_1,
        host_employee_id: USER_EMP1,
        visit_type: 'pre_planned',
        purpose: 'Q3 product demo and partnership discussion',
        status: 'approved',
        scheduled_at: soon,
        meeting_room: 'Conference Room A',
        secure_token: 'tok_v1_approved_abc123xyz',
        notes: 'Visitor requires parking pass',
        location_id: LOC_1,
        approved_by: USER_SUB,
        approved_at: now,
        organization_id: ORG_1,
        created_at: past1,
        updated_at: now,
      },
      {
        id: VISIT_2,
        visitor_id: VIS_2,
        host_employee_id: USER_EMP2,
        visit_type: 'impromptu',
        purpose: 'Recruitment interview for senior analyst role',
        status: 'checked_in',
        checked_in_at: now,
        meeting_room: 'Interview Room 1',
        secure_token: 'tok_v2_checkedin_def456uvw',
        location_id: LOC_1,
        approved_by: USER_SUB,
        approved_at: past2,
        organization_id: ORG_1,
        created_at: past2,
        updated_at: now,
      },
      {
        id: VISIT_3,
        visitor_id: VIS_3,
        host_employee_id: USER_ADMIN,
        visit_type: 'pre_planned',
        purpose: 'Annual vendor contract renewal and SLA review',
        status: 'completed',
        scheduled_at: past2,
        checked_in_at: past2,
        checked_out_at: past1,
        meeting_room: 'Board Room',
        secure_token: 'tok_v3_completed_ghi789rst',
        location_id: LOC_1,
        approved_by: USER_SUB,
        approved_at: past2,
        organization_id: ORG_1,
        created_at: past2,
        updated_at: past1,
      },
      {
        id: VISIT_4,
        visitor_id: VIS_4,
        host_employee_id: USER_EMP1,
        visit_type: 'impromptu',
        purpose: 'Software demo walkthrough for procurement team',
        status: 'pending',
        meeting_room: 'Meeting Room B',
        secure_token: 'tok_v4_pending_jkl012mno',
        location_id: LOC_1,
        organization_id: ORG_1,
        created_at: now,
        updated_at: now,
      },
      {
        id: VISIT_5,
        visitor_id: VIS_1,
        host_employee_id: USER_EMP2,
        visit_type: 'pre_planned',
        purpose: 'Legal review of data processing agreement',
        status: 'declined',
        scheduled_at: past1,
        declined_reason: 'Host is unavailable due to an urgent internal meeting. Please reschedule.',
        secure_token: 'tok_v5_declined_pqr345stu',
        location_id: LOC_2,
        approved_by: USER_ADMIN,
        approved_at: past1,
        organization_id: ORG_1,
        created_at: past1,
        updated_at: past1,
      },
    ], {});

    // ── qr_codes ──────────────────────────────────────────────────────────────
    await queryInterface.bulkInsert('qr_codes', [
      {
        id: QR_1,
        visit_id: VISIT_1,
        token: 'eyJhbGciOiJIUzI1NiJ9.eyJ2aXNpdCI6IlZJU0lUXzEifQ.approvedQRToken',
        expires_at: soon,
        is_used: false,
        created_at: now,
      },
      {
        id: QR_2,
        visit_id: VISIT_3,
        token: 'eyJhbGciOiJIUzI1NiJ9.eyJ2aXNpdCI6IlZJU0lUXzMifQ.completedQRToken',
        expires_at: past1,
        is_used: true,
        used_at: past1,
        created_at: past2,
      },
    ], {});

    // ── audit_logs ────────────────────────────────────────────────────────────
    await queryInterface.bulkInsert('audit_logs', [
      { action: 'user.login',       entity_type: 'user',  entity_id: USER_SUPER, performed_by: USER_SUPER, metadata: JSON.stringify({ browser: 'Chrome', os: 'Windows' }),                     ip_address: '10.0.0.1', created_at: past1 },
      { action: 'visit.created',    entity_type: 'visit', entity_id: VISIT_1,    performed_by: USER_EMP1,  metadata: JSON.stringify({ visitor: 'Tunde Adeyemi', type: 'pre_planned' }),          ip_address: '10.0.0.2', created_at: past1 },
      { action: 'visit.approved',   entity_type: 'visit', entity_id: VISIT_1,    performed_by: USER_SUB,   metadata: JSON.stringify({ approved_by: 'Emeka Nwosu' }),                             ip_address: '10.0.0.3', created_at: now   },
      { action: 'visit.checked_in', entity_type: 'visit', entity_id: VISIT_2,    performed_by: USER_ADMIN, metadata: JSON.stringify({ checked_in_by: 'Amaka Eze', gate: 'Main Entrance' }),      ip_address: '10.0.0.4', created_at: now   },
      { action: 'visit.declined',   entity_type: 'visit', entity_id: VISIT_5,    performed_by: USER_ADMIN, metadata: JSON.stringify({ reason: 'Host unavailable', declined_by: 'Amaka Eze' }),   ip_address: '10.0.0.4', created_at: past1 },
    ], { ignoreDuplicates: false });

    // ── notifications ──────────────────────────────────────────────────────────
    await queryInterface.bulkInsert('notifications', [
      { user_id: USER_EMP1, visit_id: VISIT_1, type: 'visit_request',    title: 'New Visit Request',    message: 'Tunde Adeyemi has requested to visit you on ' + soon.toDateString() + '.', is_read: false, created_at: past1 },
      { user_id: USER_EMP1, visit_id: VISIT_1, type: 'visit_approved',   title: 'Visit Approved',       message: 'Your visit request for Tunde Adeyemi has been approved.',                   is_read: true,  created_at: now   },
      { user_id: USER_EMP2, visit_id: VISIT_2, type: 'visit_checked_in', title: 'Visitor Checked In',   message: 'Fatima Bello has checked in and is heading to your desk.',                   is_read: false, created_at: now   },
      { user_id: USER_ADMIN,visit_id: VISIT_3, type: 'visit_completed',  title: 'Visit Completed',      message: 'Kelechi Ibe\'s visit has been marked as completed.',                         is_read: true,  created_at: past1 },
      { user_id: USER_SUB,  visit_id: VISIT_4, type: 'visit_request',    title: 'Approval Required',    message: 'Ngozi Okeke\'s impromptu visit is awaiting your approval.',                  is_read: false, created_at: now   },
    ], { ignoreDuplicates: false });

    // ── temi_robots ───────────────────────────────────────────────────────────
    await queryInterface.bulkInsert('temi_robots', [
      {
        id: TEMI_1,
        serial_number: '00126040001',
        name: 'Temi Receptionist',
        location_id: LOC_1,
        status: 'online',
        current_task: 'Welcoming visitor at entrance',
        last_seen: now,
        saved_locations: JSON.stringify([
          { name: 'Reception',      x: 0.0,  y: 0.0  },
          { name: 'Conference A',   x: 10.5, y: 6.2  },
          { name: 'HR Department',  x: 5.0,  y: 12.0 },
          { name: 'Board Room',     x: 18.0, y: 3.5  },
        ]),
        organization_id: ORG_1,
        created_at: now,
      },
    ], {});

    // ── otp_sessions ──────────────────────────────────────────────────────────
    await queryInterface.bulkInsert('otp_sessions', [
      {
        visit_id: VISIT_2,
        email: 'fatima.bello@outlook.com',
        otp_hash: otpHash,
        attempts: 1,
        max_attempts: 3,
        expires_at: past1,
        used: true,
        organization_id: ORG_1,
        created_at: past2,
      },
      {
        visit_id: VISIT_4,
        email: 'ngozi.okeke@company.com',
        otp_hash: otpHash,
        attempts: 0,
        max_attempts: 3,
        expires_at: soon,
        used: false,
        organization_id: ORG_1,
        created_at: now,
      },
    ], { ignoreDuplicates: false });
  },

  async down(queryInterface, Sequelize) {
    const { Op } = Sequelize;

    await queryInterface.bulkDelete('otp_sessions',   { visit_id:   { [Op.in]: [VISIT_2, VISIT_4] } });
    await queryInterface.bulkDelete('temi_robots',    { id: TEMI_1 });
    await queryInterface.bulkDelete('notifications',  { visit_id:   { [Op.in]: [VISIT_1, VISIT_2, VISIT_3, VISIT_4] } });
    await queryInterface.bulkDelete('audit_logs',     { entity_id:  { [Op.in]: [USER_SUPER, VISIT_1, VISIT_2, VISIT_5] } });
    await queryInterface.bulkDelete('qr_codes',       { id:         { [Op.in]: [QR_1, QR_2] } });
    await queryInterface.bulkDelete('visits',         { id:         { [Op.in]: [VISIT_1, VISIT_2, VISIT_3, VISIT_4, VISIT_5] } });
    await queryInterface.bulkDelete('visitors',       { id:         { [Op.in]: [VIS_1, VIS_2, VIS_3, VIS_4] } });
    await queryInterface.bulkDelete('users',          { id:         { [Op.in]: [USER_SUPER, USER_ADMIN, USER_SUB, USER_EMP1, USER_EMP2, USER_CLIENT] } });
    await queryInterface.bulkDelete('branches',       { id:         { [Op.in]: [BRANCH_1, BRANCH_2] } });
    await queryInterface.bulkDelete('organizations',  { id: ORG_1 });
    await queryInterface.bulkDelete('locations',      { id:         { [Op.in]: [LOC_1, LOC_2] } });
  },
};
