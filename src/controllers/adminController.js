const bcrypt = require('bcryptjs');
const { Op, col, fn, literal } = require('sequelize');
const { User, Visit, Visitor, AuditLog, TemiRobot, Location, Organization, sequelize } = require('../models');
const { canManage } = require('../middleware/roleCheck');

let adminIo;
const setAdminIo = (io) => { adminIo = io; };

const COUNT = [literal('COUNT(*)'), 'count'];

// GET /admin/employees
const getEmployees = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, role } = req.query;
    const offset = (page - 1) * limit;

    const and = [
      { role: { [Op.ne]: 'super_admin' } },
      ...(req.user.organization_id ? [{ organization_id: req.user.organization_id }] : []),
    ];
    if (search) {
      and.push({ [Op.or]: [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ] });
    }
    if (role) and.push({ role });
    const where = { [Op.and]: and };

    const total = await User.count({ where });
    const employees = await User.findAll({
      where,
      attributes: ['id', 'email', 'name', 'role', 'department', 'phone', 'desk_location', 'is_active', 'created_at'],
      order: [['name', 'ASC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      raw: true,
    });

    res.json({ employees, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
};

// POST /admin/employees
const createEmployee = async (req, res, next) => {
  try {
    const { email, name, role = 'employee', department, phone, deskLocation, password, locationId } = req.body;

    if (!email || !name || !password) {
      return res.status(400).json({ error: 'Email, name and password required' });
    }
    if (!['admin', 'sub_admin', 'employee', 'client'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Role hierarchy — cannot create a user at or above your own level
    if (!canManage(req.user.role, role)) {
      return res.status(403).json({ error: `You cannot create a user with role '${role}'` });
    }

    // Enforce plan employee limit for staff roles
    if (['admin', 'sub_admin', 'employee'].includes(role)) {
      const org = await Organization.findByPk(req.user.organization_id, { attributes: ['max_employees'] });
      if (org?.max_employees) {
        const currentCount = await User.count({
          where: {
            organization_id: req.user.organization_id,
            role: { [Op.in]: ['admin', 'sub_admin', 'employee'] },
            is_active: true,
          },
        });
        if (currentCount >= org.max_employees) {
          return res.status(403).json({
            error: `Employee limit reached (${currentCount}/${org.max_employees}). Please upgrade your plan.`,
          });
        }
      }
    }

    const hash = await bcrypt.hash(password, 12);
    const user = await User.create({
      email: email.toLowerCase(),
      password_hash: hash,
      name,
      role,
      department,
      phone,
      desk_location: deskLocation,
      location_id: locationId,
      organization_id: req.user.organization_id,
    });

    await AuditLog.create({
      action: 'create_user',
      entity_type: 'user',
      entity_id: user.id,
      performed_by: req.user.id,
      metadata: { email, role },
    });

    res.status(201).json({
      id: user.id, email: user.email, name: user.name, role: user.role, department: user.department,
    });
  } catch (err) {
    next(err);
  }
};

// PUT /admin/employees/:id
const updateEmployee = async (req, res, next) => {
  try {
    const { name, department, phone, deskLocation, isActive, role } = req.body;

    const where = { id: req.params.id };
    if (req.user.organization_id) where.organization_id = req.user.organization_id;

    const user = await User.findOne({ where });
    if (!user) return res.status(404).json({ error: 'Employee not found' });

    // Cannot modify a user at or above your own level
    if (!canManage(req.user.role, user.role)) {
      return res.status(403).json({ error: 'You do not have permission to modify this user' });
    }

    // Cannot promote to a role at or above your own level
    if (role != null && !canManage(req.user.role, role)) {
      return res.status(403).json({ error: `You cannot assign role '${role}'` });
    }

    if (name != null) user.name = name;
    if (department != null) user.department = department;
    if (phone != null) user.phone = phone;
    if (deskLocation != null) user.desk_location = deskLocation;
    if (isActive != null) user.is_active = isActive;
    if (role != null) user.role = role;
    await user.save();

    res.json({
      id: user.id, email: user.email, name: user.name,
      role: user.role, department: user.department, is_active: user.is_active,
    });
  } catch (err) {
    next(err);
  }
};

// DELETE /admin/employees/:id — soft delete
const deleteEmployee = async (req, res, next) => {
  try {
    const where = { id: req.params.id };
    if (req.user.organization_id) where.organization_id = req.user.organization_id;

    const user = await User.findOne({ where });
    if (!user) return res.status(404).json({ error: 'Employee not found' });

    if (!canManage(req.user.role, user.role)) {
      return res.status(403).json({ error: 'You do not have permission to deactivate this user' });
    }

    user.is_active = false;
    await user.save();
    res.json({ message: 'Employee deactivated' });
  } catch (err) {
    next(err);
  }
};

// GET /admin/visits — all visits with filters
const getAllVisits = async (req, res, next) => {
  try {
    const { status, type, employeeId, from, to, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    if (status) where.status = status;
    if (type) where.visit_type = type;
    if (employeeId) where.host_employee_id = employeeId;
    if (from || to) {
      where.created_at = {};
      if (from) where.created_at[Op.gte] = from;
      if (to) where.created_at[Op.lte] = to;
    }

    const total = await Visit.count({ where });
    const visits = await Visit.findAll({
      where,
      attributes: {
        include: [
          [col('visitor.name'), 'visitor_name'],
          [col('visitor.email'), 'visitor_email'],
          [col('visitor.company'), 'company'],
          [col('host.name'), 'employee_name'],
          [col('host.department'), 'department'],
        ],
      },
      include: [
        { model: Visitor, as: 'visitor', attributes: [], required: true },
        { model: User, as: 'host', attributes: [], required: true },
      ],
      order: [[literal('"Visit"."created_at"'), 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      raw: true,
      nest: false,
      subQuery: false,
    });

    res.json({ visits, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
};

// GET /admin/analytics
const getAnalytics = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const toDate = to || new Date().toISOString();
    const between = { created_at: { [Op.between]: [fromDate, toDate] } };

    const [totalVisits, byStatus, byType, peakHours, topEmployees, dailyTrend] = await Promise.all([
      Visit.count({ where: between }),
      Visit.findAll({ attributes: ['status', COUNT], where: between, group: ['status'], raw: true }),
      Visit.findAll({ attributes: ['visit_type', COUNT], where: between, group: ['visit_type'], raw: true }),
      Visit.findAll({
        attributes: [[literal('EXTRACT(HOUR FROM "checked_in_at")'), 'hour'], [literal('COUNT(*)'), 'count']],
        where: { checked_in_at: { [Op.ne]: null, [Op.between]: [fromDate, toDate] } },
        group: [literal('EXTRACT(HOUR FROM "checked_in_at")')],
        order: [literal('EXTRACT(HOUR FROM "checked_in_at")')],
        raw: true,
      }),
      Visit.findAll({
        attributes: [[col('host.name'), 'name'], [fn('COUNT', col('Visit.id')), 'visit_count']],
        include: [{ model: User, as: 'host', attributes: [], required: true }],
        where: between,
        group: [col('host.name')],
        order: [[fn('COUNT', col('Visit.id')), 'DESC']],
        limit: 10,
        subQuery: false,
        raw: true,
      }),
      Visit.findAll({
        attributes: [[fn('DATE', col('created_at')), 'date'], [literal('COUNT(*)'), 'count']],
        where: between,
        group: [fn('DATE', col('created_at'))],
        order: [[fn('DATE', col('created_at')), 'ASC']],
        raw: true,
      }),
    ]);

    res.json({
      totalVisits,
      byStatus,
      byType,
      peakHours,
      topEmployees,
      dailyTrend,
    });
  } catch (err) {
    next(err);
  }
};

// GET /admin/audit-logs
const getAuditLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const logs = await AuditLog.findAll({
      attributes: { include: [[col('performer.name'), 'performed_by_name']] },
      include: [{ model: User, as: 'performer', attributes: [], required: false }],
      order: [[literal('"AuditLog"."created_at"'), 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      raw: true,
      nest: false,
      subQuery: false,
    });
    const total = await AuditLog.count();

    res.json({ logs, total });
  } catch (err) {
    next(err);
  }
};

// GET /admin/temi-robots
const getTemiRobots = async (req, res, next) => {
  try {
    const robots = await TemiRobot.findAll({
      attributes: { include: [[col('location.name'), 'location_name']] },
      include: [{ model: Location, as: 'location', attributes: [], required: false }],
      order: [[literal('"TemiRobot"."name"'), 'ASC']],
      raw: true,
      nest: false,
    });
    res.json(robots);
  } catch (err) {
    next(err);
  }
};

// GET /admin/robot-status — all robots with live stats + visits served today
const getRobotStatus = async (req, res, next) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const robots = await TemiRobot.findAll({
      attributes: {
        include: [
          [col('location.name'), 'location_name'],
          [
            literal(`(SELECT COUNT(*) FROM visits v WHERE v.robot_id = "TemiRobot"."id" AND v.created_at >= '${todayStart.toISOString()}')`),
            'visits_today',
          ],
        ],
      },
      include: [{ model: Location, as: 'location', attributes: [], required: false }],
      order: [[literal('"TemiRobot"."name"'), 'ASC']],
      raw: true,
      nest: false,
    });

    res.json(robots);
  } catch (err) {
    next(err);
  }
};

// GET /admin/location-heatmap — top visited rooms/locations with duration + peak hour
const getLocationHeatmap = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const toDate = to || new Date().toISOString();

    // Group by meeting_room (most visits have a room set), fall back to location name
    const rows = await sequelize.query(`
      SELECT
        COALESCE(NULLIF(v.meeting_room, ''), l.name, 'General / No Room') AS location_name,
        COUNT(v.id)::int AS visit_count,
        ROUND(AVG(
          CASE WHEN v.checked_out_at IS NOT NULL AND v.checked_in_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (v.checked_out_at - v.checked_in_at)) / 60
          END
        )::numeric, 1) AS avg_duration_min,
        MODE() WITHIN GROUP (
          ORDER BY EXTRACT(HOUR FROM v.checked_in_at)
        )::int AS peak_hour
      FROM visits v
      LEFT JOIN locations l ON v.location_id = l.id
      WHERE v.created_at BETWEEN :from AND :to
      GROUP BY COALESCE(NULLIF(v.meeting_room, ''), l.name, 'General / No Room')
      ORDER BY visit_count DESC
      LIMIT 12
    `, {
      replacements: { from: fromDate, to: toDate },
      type: sequelize.QueryTypes.SELECT,
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
};

// GET /admin/staff-activity — approval rates, response times per employee
const getStaffActivity = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const toDate = to || new Date().toISOString();

    const rows = await sequelize.query(`
      SELECT
        u.id,
        u.name,
        u.department,
        COUNT(CASE WHEN v.status IN ('approved','checked_in','completed') THEN 1 END)::int AS approved,
        COUNT(CASE WHEN v.status = 'declined' THEN 1 END)::int AS declined,
        COUNT(v.id)::int AS total_handled,
        ROUND(
          COUNT(CASE WHEN v.status IN ('approved','checked_in','completed') THEN 1 END)::numeric
          / NULLIF(COUNT(v.id), 0) * 100, 1
        ) AS approval_rate,
        ROUND(AVG(
          CASE WHEN v.approved_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (v.approved_at - v.created_at)) / 60
          END
        )::numeric, 1) AS avg_response_min
      FROM visits v
      JOIN users u ON v.approved_by = u.id
      WHERE v.created_at BETWEEN :from AND :to
        AND v.approved_by IS NOT NULL
      GROUP BY u.id, u.name, u.department
      ORDER BY approved DESC
      LIMIT 10
    `, {
      replacements: { from: fromDate, to: toDate },
      type: sequelize.QueryTypes.SELECT,
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
};

// GET /admin/visit-funnel — conversion funnel + duration + approval response time
const getVisitFunnel = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const toDate = to || new Date().toISOString();

    const [statusCounts, durationStats, approvalTime] = await Promise.all([
      sequelize.query(`
        SELECT status, COUNT(*)::int AS count
        FROM visits
        WHERE created_at BETWEEN :from AND :to
        GROUP BY status
      `, { replacements: { from: fromDate, to: toDate }, type: sequelize.QueryTypes.SELECT }),

      sequelize.query(`
        SELECT
          ROUND(AVG(EXTRACT(EPOCH FROM (checked_out_at - checked_in_at))/60)::numeric, 1) AS avg_min,
          ROUND(MIN(EXTRACT(EPOCH FROM (checked_out_at - checked_in_at))/60)::numeric, 1) AS min_min,
          ROUND(MAX(EXTRACT(EPOCH FROM (checked_out_at - checked_in_at))/60)::numeric, 1) AS max_min,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (checked_out_at - checked_in_at))/60
          )::numeric, 1) AS median_min
        FROM visits
        WHERE checked_in_at IS NOT NULL
          AND checked_out_at IS NOT NULL
          AND created_at BETWEEN :from AND :to
      `, { replacements: { from: fromDate, to: toDate }, type: sequelize.QueryTypes.SELECT }),

      sequelize.query(`
        SELECT
          ROUND(AVG(EXTRACT(EPOCH FROM (approved_at - created_at))/60)::numeric, 1) AS avg_approval_min,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (approved_at - created_at))/60
          )::numeric, 1) AS median_approval_min
        FROM visits
        WHERE approved_at IS NOT NULL
          AND created_at BETWEEN :from AND :to
      `, { replacements: { from: fromDate, to: toDate }, type: sequelize.QueryTypes.SELECT }),
    ]);

    // Build ordered funnel
    const statusMap = Object.fromEntries(statusCounts.map((r) => [r.status, r.count]));
    const total = Object.values(statusMap).reduce((a, b) => a + b, 0);

    const funnel = [
      { stage: 'Requested',   key: 'pending',    count: statusMap.pending    || 0 },
      { stage: 'Approved',    key: 'approved',   count: (statusMap.approved || 0) + (statusMap.checked_in || 0) + (statusMap.completed || 0) },
      { stage: 'Checked In',  key: 'checked_in', count: (statusMap.checked_in || 0) + (statusMap.completed || 0) },
      { stage: 'Completed',   key: 'completed',  count: statusMap.completed  || 0 },
    ].map((s) => ({ ...s, pct: total > 0 ? Math.round((s.count / total) * 100) : 0 }));

    res.json({
      total,
      funnel,
      allStatuses: statusMap,
      duration:    durationStats[0] || {},
      approvalTime: approvalTime[0] || {},
    });
  } catch (err) {
    next(err);
  }
};

// GET /admin/floor-queue — today's active visits + all org robots for sub admin view
const getFloorQueue = async (req, res, next) => {
  try {
    const orgId = req.user.organization_id;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

    const [visits, robots] = await Promise.all([
      Visit.findAll({
        where: {
          organization_id: orgId,
          status: { [Op.in]: ['pending', 'approved', 'checked_in'] },
          [Op.or]: [
            { created_at:   { [Op.between]: [today, tomorrow] } },
            { scheduled_at: { [Op.between]: [today, tomorrow] } },
          ],
        },
        include: [
          { model: Visitor,   as: 'visitor', attributes: ['name', 'company', 'phone', 'email'] },
          { model: User,      as: 'host',    attributes: ['name', 'department', 'email'] },
          { model: TemiRobot, as: 'robot',   attributes: ['id', 'name', 'serial_number', 'status'] },
        ],
        order: [
          [literal(`COALESCE("Visit"."scheduled_at", "Visit"."created_at")`), 'ASC'],
        ],
      }),
      TemiRobot.findAll({
        where: { organization_id: orgId },
        attributes: ['id', 'name', 'serial_number', 'status', 'battery_level', 'current_task', 'saved_locations'],
      }),
    ]);

    res.json({ visits, robots });
  } catch (err) {
    next(err);
  }
};

// PATCH /admin/visits/:id/assign-robot
const assignRobot = async (req, res, next) => {
  try {
    const { robotId } = req.body;
    const visit = await Visit.findOne({
      where: { id: req.params.id, organization_id: req.user.organization_id },
    });
    if (!visit) return res.status(404).json({ error: 'Visit not found' });

    visit.robot_id = robotId || null;
    await visit.save();

    // Navigate the newly-assigned robot toward reception/lobby
    if (robotId && adminIo) {
      const robot = await TemiRobot.findByPk(robotId, { attributes: ['serial_number', 'saved_locations'] });
      if (robot) {
        const locs = Array.isArray(robot.saved_locations) ? robot.saved_locations : [];
        const dest = locs.find((l) => /reception|lobby|entrance|front|kiosk/i.test(l)) || locs[0];
        if (dest) {
          adminIo.to(`temi:${robot.serial_number}`).emit('temi:command', {
            type: 'navigate', location: dest, visitId: visit.id,
          });
          await TemiRobot.update({ current_task: dest }, { where: { serial_number: robot.serial_number } });
        }
      }
    }

    await AuditLog.create({
      action: robotId ? 'assign_robot' : 'unassign_robot',
      entity_type: 'visit',
      entity_id: visit.id,
      performed_by: req.user.id,
      metadata: { robotId },
    });

    res.json({ ok: true, robot_id: visit.robot_id });
  } catch (err) {
    next(err);
  }
};

// POST /admin/robots/:serial/command
const sendRobotCommand = async (req, res, next) => {
  try {
    const { serial } = req.params;
    const { type, location } = req.body;

    if (!['navigate', 'stop', 'returnHome'].includes(type)) {
      return res.status(400).json({ error: 'Invalid command type. Use navigate | stop | returnHome' });
    }

    const robot = await TemiRobot.findOne({
      where: { serial_number: serial, organization_id: req.user.organization_id },
    });
    if (!robot) return res.status(404).json({ error: 'Robot not found' });

    const taskMap = { navigate: location || 'navigating', stop: 'idle', returnHome: 'returning_home' };
    await TemiRobot.update({ current_task: taskMap[type] }, { where: { serial_number: serial } });

    if (adminIo) {
      adminIo.to(`temi:${serial}`).emit('temi:command', { type, location });
    }

    await AuditLog.create({
      action: 'robot_command',
      entity_type: 'temi_robot',
      entity_id: robot.id,
      performed_by: req.user.id,
      metadata: { type, location, serial },
    });

    res.json({ ok: true, command: { type, location } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  setAdminIo,
  getEmployees, createEmployee, updateEmployee, deleteEmployee,
  getAllVisits, getAnalytics, getAuditLogs, getTemiRobots,
  getRobotStatus, getLocationHeatmap, getStaffActivity, getVisitFunnel,
  getFloorQueue, assignRobot, sendRobotCommand,
};
