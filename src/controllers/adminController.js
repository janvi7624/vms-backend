const bcrypt = require('bcryptjs');
const { Op, col, fn, literal } = require('sequelize');
const { User, Visit, Visitor, AuditLog, TemiRobot, Location } = require('../models');

const COUNT = [literal('COUNT(*)'), 'count'];

// GET /admin/employees
const getEmployees = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, role } = req.query;
    const offset = (page - 1) * limit;

    const and = [{ role: { [Op.ne]: 'security' } }];
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
    if (!['admin', 'employee', 'security'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
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

    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'Employee not found' });

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
    await User.update({ is_active: false }, { where: { id: req.params.id } });
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

module.exports = { getEmployees, createEmployee, updateEmployee, deleteEmployee, getAllVisits, getAnalytics, getAuditLogs, getTemiRobots };
