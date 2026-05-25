'use strict';

const { Op } = require('sequelize');
const { Visit, Visitor, User, TemiRobot } = require('../models');

const ROBOT_ATTRS = ['id', 'name', 'serial_number', 'status', 'current_task'];

// GET /client/visits — recent visits for the dashboard (latest 10 by default)
const getMyVisits = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const visitor = await Visitor.findOne({ where: { email: req.user.email } });
    if (!visitor) return res.json({ visits: [], total: 0 });

    const where = { visitor_id: visitor.id };
    if (status) where.status = status;

    const { count, rows } = await Visit.findAndCountAll({
      where,
      include: [
        { model: User,      as: 'host',  attributes: ['name', 'department', 'desk_location'] },
        { model: TemiRobot, as: 'robot', attributes: ROBOT_ATTRS, required: false },
      ],
      order: [['created_at', 'DESC']],
      limit:  parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    res.json({ visits: rows, total: count });
  } catch (err) {
    next(err);
  }
};

// GET /client/visits/history — full paginated history with status filter
const getVisitHistory = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const visitor = await Visitor.findOne({ where: { email: req.user.email } });
    if (!visitor) return res.json({ visits: [], total: 0, stats: {} });

    const where = { visitor_id: visitor.id };
    if (status && status !== 'all') where.status = status;

    const { count, rows } = await Visit.findAndCountAll({
      where,
      include: [
        { model: User,      as: 'host',  attributes: ['name', 'department', 'desk_location'] },
        { model: TemiRobot, as: 'robot', attributes: ROBOT_ATTRS, required: false },
      ],
      order: [['created_at', 'DESC']],
      limit:  parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    // Server-side stat counts (across ALL visits, not just this page)
    const allWhere = { visitor_id: visitor.id };
    const [total, pending, approved, checkedIn, completed, cancelled] = await Promise.all([
      Visit.count({ where: allWhere }),
      Visit.count({ where: { ...allWhere, status: 'pending' } }),
      Visit.count({ where: { ...allWhere, status: 'approved' } }),
      Visit.count({ where: { ...allWhere, status: 'checked_in' } }),
      Visit.count({ where: { ...allWhere, status: 'completed' } }),
      Visit.count({ where: { ...allWhere, status: 'cancelled' } }),
    ]);

    res.json({
      visits: rows,
      total: count,
      stats: { total, pending, approved, checkedIn, completed, cancelled },
    });
  } catch (err) {
    next(err);
  }
};

// GET /client/visits/:id — single visit detail with robot info
const getVisitDetail = async (req, res, next) => {
  try {
    const { id } = req.params;

    const visitor = await Visitor.findOne({ where: { email: req.user.email } });
    if (!visitor) return res.status(404).json({ error: 'Visitor record not found' });

    const visit = await Visit.findOne({
      where: { id, visitor_id: visitor.id },
      include: [
        { model: User,      as: 'host',     attributes: ['name', 'email', 'department', 'desk_location', 'phone'] },
        { model: User,      as: 'approver', attributes: ['name', 'department'] },
        { model: TemiRobot, as: 'robot',    attributes: ROBOT_ATTRS, required: false },
      ],
    });

    if (!visit) return res.status(404).json({ error: 'Visit not found' });

    res.json(visit);
  } catch (err) {
    next(err);
  }
};

// POST /client/visits/:id/cancel — cancel a pending visit
const cancelVisit = async (req, res, next) => {
  try {
    const { id } = req.params;

    const visitor = await Visitor.findOne({ where: { email: req.user.email } });
    if (!visitor) return res.status(404).json({ error: 'Visitor record not found' });

    const visit = await Visit.findOne({ where: { id, visitor_id: visitor.id } });
    if (!visit) return res.status(404).json({ error: 'Visit not found' });

    if (visit.status !== 'pending') {
      return res.status(400).json({ error: `Cannot cancel a visit with status "${visit.status}"` });
    }

    await visit.update({ status: 'cancelled' });
    res.json({ message: 'Visit cancelled successfully' });
  } catch (err) {
    next(err);
  }
};

// POST /client/book — client requests a visit to an employee
const bookVisit = async (req, res, next) => {
  try {
    const { employeeId, purpose, scheduledAt, visitorPhone, visitorCompany } = req.body;
    if (!employeeId || !purpose) {
      return res.status(400).json({ error: 'Employee and purpose are required' });
    }

    const employee = await User.findOne({
      where: { id: employeeId, role: ['super_admin', 'admin', 'sub_admin', 'employee'], is_active: true },
      attributes: ['id', 'name', 'email', 'location_id', 'organization_id'],
      raw: true,
    });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    let visitor = await Visitor.findOne({ where: { email: req.user.email } });
    if (visitor) {
      await visitor.update({
        name: req.user.name,
        ...(visitorPhone  && { phone:   visitorPhone }),
        ...(visitorCompany && { company: visitorCompany }),
      });
    } else {
      visitor = await Visitor.create({
        name:            req.user.name,
        email:           req.user.email,
        phone:           visitorPhone  || null,
        company:         visitorCompany || null,
        organization_id: employee.organization_id,
      });
    }

    const visit = await Visit.create({
      visitor_id:       visitor.id,
      host_employee_id: employeeId,
      visit_type:       'impromptu',
      purpose,
      status:           'pending',
      scheduled_at:     scheduledAt || null,
      location_id:      employee.location_id,
      organization_id:  employee.organization_id,
    });

    res.status(201).json({
      visitId: visit.id,
      message: 'Visit request sent. Awaiting employee approval.',
    });
  } catch (err) {
    next(err);
  }
};

// GET /client/employees/search — search employees for the booking form
const searchEmployees = async (req, res, next) => {
  try {
    const { q = '' } = req.query;
    const where = { role: ['super_admin', 'admin', 'sub_admin', 'employee'], is_active: true };
    if (q) where.name = { [Op.iLike]: `%${q}%` };

    const employees = await User.findAll({
      where,
      attributes: ['id', 'name', 'department', 'desk_location'],
      limit: 20,
      order: [['name', 'ASC']],
    });
    res.json(employees);
  } catch (err) {
    next(err);
  }
};

module.exports = { getMyVisits, getVisitHistory, getVisitDetail, cancelVisit, bookVisit, searchEmployees };
