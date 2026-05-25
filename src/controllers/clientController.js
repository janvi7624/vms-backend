'use strict';

const { Op } = require('sequelize');
const { Visit, Visitor, User } = require('../models');

// GET /client/visits — visits where this client is the visitor (matched by email)
const getMyVisits = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const visitor = await Visitor.findOne({ where: { email: req.user.email } });
    if (!visitor) {
      return res.json({ visits: [], total: 0 });
    }

    const where = { visitor_id: visitor.id };
    if (status) where.status = status;

    const { count, rows } = await Visit.findAndCountAll({
      where,
      include: [
        { model: User, as: 'host', attributes: ['name', 'department', 'desk_location'] },
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    res.json({ visits: rows, total: count });
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
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Upsert visitor record linked to this client's email
    let visitor = await Visitor.findOne({ where: { email: req.user.email } });
    if (visitor) {
      await visitor.update({
        name: req.user.name,
        ...(visitorPhone && { phone: visitorPhone }),
        ...(visitorCompany && { company: visitorCompany }),
      });
    } else {
      visitor = await Visitor.create({
        name: req.user.name,
        email: req.user.email,
        phone: visitorPhone || null,
        company: visitorCompany || null,
        organization_id: employee.organization_id,
      });
    }

    const visit = await Visit.create({
      visitor_id: visitor.id,
      host_employee_id: employeeId,
      visit_type: 'impromptu',
      purpose,
      status: 'pending',
      scheduled_at: scheduledAt || null,
      location_id: employee.location_id,
      organization_id: employee.organization_id,
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
    const where = {
      role: ['super_admin', 'admin', 'sub_admin', 'employee'],
      is_active: true,
    };
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

module.exports = { getMyVisits, bookVisit, searchEmployees };
