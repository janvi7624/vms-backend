const { col } = require('sequelize');
const { Visit, Visitor, User, AuditLog, TemiRobot } = require('../models');
const { sendVisitorInvite, sendOTPCode } = require('../services/emailService');
const { notifyVisitRequest } = require('../services/notificationService');
const { generateSecureToken } = require('../utils/helpers');
const { VISIT_TYPES, VISIT_STATUS } = require('../config/constants');
const { createOTPSession } = require('../services/otpService');

// Find or create a visitor by email; updates name/company/phone on every submission
// so changes propagate across all visits (all queries join from the visitors table).
const upsertVisitor = async ({ visitorName, visitorEmail, visitorPhone, visitorCompany, organizationId }) => {
  if (visitorEmail) {
    const existing = await Visitor.findOne({ where: { email: visitorEmail.toLowerCase() } });
    if (existing) {
      const updates = {};
      if (visitorName    && visitorName    !== existing.name)    updates.name    = visitorName;
      if (visitorCompany !== undefined && visitorCompany !== existing.company) updates.company = visitorCompany;
      if (visitorPhone   !== undefined && visitorPhone   !== existing.phone)   updates.phone   = visitorPhone;
      if (Object.keys(updates).length) await existing.update(updates);
      return existing.id;
    }
    const created = await Visitor.create({
      name: visitorName,
      email: visitorEmail.toLowerCase(),
      phone: visitorPhone,
      company: visitorCompany,
      organization_id: organizationId,
    });
    return created.id;
  }
  const created = await Visitor.create({
    name: visitorName,
    phone: visitorPhone,
    company: visitorCompany,
    organization_id: organizationId,
  });
  return created.id;
};

// POST /visitor/preplanned — Employee creates pre-planned visit
const createPrePlanned = async (req, res, next) => {
  try {
    const {
      visitorName, visitorEmail, visitorPhone, visitorCompany,
      purpose, scheduledAt, meetingRoom, notes,
    } = req.body;

    if (!visitorName || !visitorEmail || !purpose || !scheduledAt) {
      return res.status(400).json({ error: 'Name, email, purpose, and scheduled date are required' });
    }

    const visitorId = await upsertVisitor({ visitorName, visitorEmail, visitorPhone, visitorCompany });

    // Create visit record with secure token for visitor form link
    const secureToken = generateSecureToken();
    const visit = await Visit.create({
      visitor_id: visitorId,
      host_employee_id: req.user.id,
      visit_type: VISIT_TYPES.PRE_PLANNED,
      purpose,
      status: VISIT_STATUS.APPROVED,
      scheduled_at: scheduledAt,
      meeting_room: meetingRoom,
      secure_token: secureToken,
      notes,
      location_id: req.user.location_id,
    });

    const secureLink = `${process.env.FRONTEND_URL}/visitor/register/${secureToken}`;

    // Send invite email
    if (visitorEmail) {
      await sendVisitorInvite({
        visitorEmail,
        visitorName,
        employeeName: req.user.name,
        visitDate: scheduledAt,
        secureLink,
      }).catch((e) => console.error('Email error:', e.message));
    }

    await AuditLog.create({
      action: 'create_preplanned_visit',
      entity_type: 'visit',
      entity_id: visit.id,
      performed_by: req.user.id,
      metadata: { visitorName, visitorEmail },
    });

    res.status(201).json({ visit: visit.toJSON(), secureLink });
  } catch (err) {
    next(err);
  }
};

// POST /visitor/impromptu — Security/kiosk creates impromptu visit
const createImpromptu = async (req, res, next) => {
  try {
    const { visitorName, visitorEmail, visitorPhone, visitorCompany, purpose, employeeId } = req.body;

    if (!visitorName || !purpose || !employeeId) {
      return res.status(400).json({ error: 'Name, purpose, and employee are required' });
    }

    // Check employee exists
    const employee = await User.findOne({
      where: { id: employeeId, role: ['super_admin', 'admin', 'sub_admin', 'employee'], is_active: true },
      attributes: ['id', 'name', 'email', 'location_id', 'organization_id'],
      raw: true,
    });
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const visitorId = await upsertVisitor({ visitorName, visitorEmail, visitorPhone, visitorCompany });

    const visit = await Visit.create({
      visitor_id: visitorId,
      host_employee_id: employeeId,
      visit_type: VISIT_TYPES.IMPROMPTU,
      purpose,
      status: VISIT_STATUS.PENDING,
      location_id: employee.location_id,
    });

    // Notify employee — wrapped so a notification failure never crashes the request
    try {
      await notifyVisitRequest({
        employeeId,
        organizationId: employee.organization_id,
        employeeName:   employee.name,
        visitId:        visit.id,
        visitorName,
        visitorCompany,
      });
    } catch (e) {
      console.error('Notification error (non-fatal):', e.message);
    }

    // Send email notification to employee
    const { sendApprovalNotification } = require('../services/emailService');
    if (employee.email) {
      await sendApprovalNotification({
        employeeEmail: employee.email,
        employeeName: employee.name,
        visitorName,
        visitorCompany,
        visitPurpose: purpose,
      }).catch((e) => console.error('Email error:', e.message));
    }

    res.status(201).json({ visit: visit.toJSON(), message: 'Visit request sent. Awaiting employee approval.' });
  } catch (err) {
    next(err);
  }
};

// GET /visitor/register/:token — Visitor accesses secure form link
const getVisitorForm = async (req, res, next) => {
  try {
    const { token } = req.params;
    const visit = await Visit.findOne({
      where: { secure_token: token },
      include: [
        { model: Visitor, as: 'visitor', attributes: ['name', 'email', 'company'] },
        { model: User, as: 'host', attributes: ['name', 'department'] },
      ],
    });

    if (!visit) {
      return res.status(404).json({ error: 'Invalid or expired invitation link' });
    }

    if (visit.status === 'declined' || visit.status === 'expired') {
      return res.status(410).json({ error: 'This invitation is no longer valid' });
    }

    res.json({
      visitId: visit.id,
      visitorName: visit.visitor?.name,
      visitorEmail: visit.visitor?.email,
      company: visit.visitor?.company,
      employeeName: visit.host?.name,
      department: visit.host?.department,
      scheduledAt: visit.scheduled_at,
      meetingRoom: visit.meeting_room,
    });
  } catch (err) {
    next(err);
  }
};

// POST /visitor/register/:token — Visitor submits form + gets OTP
const submitVisitorForm = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { fullName, company, phone } = req.body;

    const visit = await Visit.findOne({
      where: { secure_token: token },
      include: [{ model: Visitor, as: 'visitor', attributes: ['id', 'email'] }],
    });

    if (!visit) {
      return res.status(404).json({ error: 'Invalid invitation link' });
    }

    // Update visitor details (only overwrite fields that were provided)
    const photoUrl = req.file ? `/uploads/${req.file.filename}` : undefined;
    const visitor = await Visitor.findByPk(visit.visitor_id);
    if (fullName != null) visitor.name = fullName;
    if (company != null) visitor.company = company;
    if (phone != null) visitor.phone = phone;
    if (photoUrl) visitor.photo_url = photoUrl;
    await visitor.save();

    // Generate OTP and email it to visitor
    const visitorEmail = visit.visitor?.email;
    if (visitorEmail) {
      const { otp } = await createOTPSession({
        visitId: visit.id,
        email: visitorEmail,
        organizationId: visit.organization_id,
      });
      await sendOTPCode({
        visitorEmail,
        visitorName: fullName,
        otp,
        visitDate: visit.scheduled_at,
      }).catch((e) => console.error('OTP email error:', e.message));
    }

    res.json({
      message: 'Registration complete. Your OTP has been sent to your email.',
    });
  } catch (err) {
    next(err);
  }
};

// GET /visitor/:id
const getVisitor = async (req, res, next) => {
  try {
    const visit = await Visit.findOne({
      where: { id: req.params.id },
      attributes: {
        include: [
          [col('visitor.name'), 'visitor_name'],
          [col('visitor.email'), 'email'],
          [col('visitor.phone'), 'phone'],
          [col('visitor.company'), 'company'],
          [col('visitor.photo_url'), 'photo_url'],
          [col('host.name'), 'employee_name'],
          [col('host.department'), 'department'],
          [col('host.desk_location'), 'desk_location'],
        ],
      },
      include: [
        { model: Visitor, as: 'visitor', attributes: [] },
        { model: User, as: 'host', attributes: [] },
      ],
      raw: true,
      nest: false,
    });

    if (!visit) {
      return res.status(404).json({ error: 'Visit not found' });
    }

    res.json(visit);
  } catch (err) {
    next(err);
  }
};

// POST /visitor/history — public, lookup visit history by email
const lookupVisitorHistory = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    const visitor = await Visitor.findOne({
      where: { email: email.toLowerCase().trim() },
      attributes: ['id', 'name', 'company'],
      raw: true,
    });

    if (!visitor) {
      return res.json({ visitor: null, visits: [] });
    }

    const visits = await Visit.findAll({
      where: { visitor_id: visitor.id },
      include: [
        { model: User, as: 'host', attributes: ['name', 'department'], required: false },
        { model: TemiRobot, as: 'robot', attributes: ['name', 'status'], required: false },
      ],
      order: [['created_at', 'DESC']],
      limit: 15,
      attributes: ['id', 'status', 'purpose', 'visit_type', 'scheduled_at', 'created_at', 'checked_in_at', 'completed_at', 'meeting_room'],
    });

    res.json({
      visitor: { name: visitor.name, company: visitor.company },
      visits: visits.map((v) => ({
        id: v.id,
        status: v.status,
        purpose: v.purpose,
        visitType: v.visit_type,
        date: v.scheduled_at || v.created_at,
        checkedInAt: v.checked_in_at,
        completedAt: v.completed_at,
        meetingRoom: v.meeting_room,
        host: v.host ? { name: v.host.name, department: v.host.department } : null,
        robot: v.robot ? { name: v.robot.name, status: v.robot.status } : null,
      })),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { createPrePlanned, createImpromptu, getVisitorForm, submitVisitorForm, getVisitor, lookupVisitorHistory };
