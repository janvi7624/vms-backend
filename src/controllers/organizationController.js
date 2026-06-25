const bcrypt = require('bcryptjs');
const { Op, col, fn, literal } = require('sequelize');
const { Branch, User, Visit, Visitor } = require('../models');
const { createOTPSession } = require('../services/otpService');
const { sendOTPCode } = require('../services/emailService');
const { emitToAdmin } = require('../services/notificationService');
const sms = require('../services/smsService');
const { OTP } = require('../config/constants');

const COUNT = [literal('COUNT(*)'), 'count'];

// Middleware: ensure the acting user can only operate within their own org
// (platform_super_admin can see any org via ?orgId query param)
const resolveOrgId = (req) => {
  if (req.user.role === 'super_admin' && req.query.orgId) {
    return req.query.orgId;
  }
  return req.user.organization_id;
};

// ── Branches ──────────────────────────────────────────────────────────────

const listBranches = async (req, res, next) => {
  try {
    const orgId = resolveOrgId(req);
    const rows = await Branch.findAll({
      attributes: { include: [[fn('COUNT', col('users.id')), 'employee_count']] },
      include: [{ model: User, as: 'users', attributes: [], required: false, where: { is_active: true } }],
      where: { organization_id: orgId },
      group: ['Branch.id'],
      order: [[literal('"Branch"."name"'), 'ASC']],
      subQuery: false,
      raw: true,
      nest: false,
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

const createBranch = async (req, res, next) => {
  try {
    const orgId = resolveOrgId(req);
    const { name, address, city, country } = req.body;
    if (!name) return res.status(400).json({ error: 'Branch name required' });
    const branch = await Branch.create({
      organization_id: orgId, name, address, city, country: country || 'India',
    });
    res.status(201).json(branch.toJSON());
  } catch (err) {
    next(err);
  }
};

const updateBranch = async (req, res, next) => {
  try {
    const orgId = resolveOrgId(req);
    const { name, address, city, country, isActive } = req.body;

    const branch = await Branch.findOne({ where: { id: req.params.id, organization_id: orgId } });
    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    if (name != null) branch.name = name;
    if (address != null) branch.address = address;
    if (city != null) branch.city = city;
    if (country != null) branch.country = country;
    if (isActive != null) branch.is_active = isActive;
    await branch.save();

    res.json(branch.toJSON());
  } catch (err) {
    next(err);
  }
};

// ── Employees within org ───────────────────────────────────────────────────

const listOrgEmployees = async (req, res, next) => {
  try {
    const orgId = resolveOrgId(req);
    const { search, role, branchId, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const and = [{ organization_id: orgId }, { role: { [Op.ne]: 'super_admin' } }];
    if (search) {
      and.push({ [Op.or]: [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ] });
    }
    if (role) and.push({ role });
    if (branchId) and.push({ branch_id: branchId });
    const where = { [Op.and]: and };

    const total = await User.count({ where });
    const employees = await User.findAll({
      where,
      attributes: [
        'id', 'email', 'name', 'role', 'department', 'phone', 'desk_location',
        'is_active', 'branch_id', 'created_at',
        [col('branch.name'), 'branch_name'],
      ],
      include: [{ model: Branch, as: 'branch', attributes: [], required: false }],
      order: [[literal('"User"."name"'), 'ASC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      raw: true,
      nest: false,
      subQuery: false,
    });

    res.json({ employees, total, page: parseInt(page) });
  } catch (err) {
    next(err);
  }
};

const createOrgEmployee = async (req, res, next) => {
  try {
    const orgId = resolveOrgId(req);
    const { email, name, role = 'employee', department, phone, deskLocation, branchId, password } = req.body;

    if (!email || !name || !password) {
      return res.status(400).json({ error: 'Email, name, and password required' });
    }
    const validRoles = ['admin', 'sub_admin', 'employee', 'client'];
    if (!validRoles.includes(role)) {
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
      branch_id: branchId || null,
      organization_id: orgId,
    });

    res.status(201).json({
      id: user.id, email: user.email, name: user.name, role: user.role, department: user.department,
    });
  } catch (err) {
    next(err);
  }
};

// ── Org Visits (scoped) ────────────────────────────────────────────────────

const listOrgVisits = async (req, res, next) => {
  try {
    const orgId = resolveOrgId(req);
    const { status, type, from, to, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const where = { organization_id: orgId };
    if (status) where.status = status;
    if (type) where.visit_type = type;
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
        { model: User, as: 'host', attributes: [], required: false },
      ],
      order: [[literal('"Visit"."created_at"'), 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      raw: true,
      nest: false,
      subQuery: false,
    });

    res.json({ visits, total });
  } catch (err) {
    next(err);
  }
};

// ── Org Analytics ─────────────────────────────────────────────────────────

const getOrgAnalytics = async (req, res, next) => {
  try {
    const orgId = resolveOrgId(req);
    const { from, to } = req.query;
    const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const toDate   = to   || new Date().toISOString();
    const base = { organization_id: orgId, created_at: { [Op.between]: [fromDate, toDate] } };

    const [totalVisits, byStatus, byType, topEmployees, dailyTrend] = await Promise.all([
      Visit.count({ where: base }),
      Visit.findAll({ attributes: ['status', COUNT], where: base, group: ['status'], raw: true }),
      Visit.findAll({ attributes: ['visit_type', COUNT], where: base, group: ['visit_type'], raw: true }),
      Visit.findAll({
        attributes: [[col('host.name'), 'name'], [fn('COUNT', col('Visit.id')), 'visit_count']],
        include: [{ model: User, as: 'host', attributes: [], required: true }],
        where: base,
        group: [col('host.name')],
        order: [[fn('COUNT', col('Visit.id')), 'DESC']],
        limit: 10,
        subQuery: false,
        raw: true,
      }),
      Visit.findAll({
        attributes: [[fn('DATE', col('created_at')), 'date'], [literal('COUNT(*)'), 'count']],
        where: base,
        group: [fn('DATE', col('created_at'))],
        order: [[fn('DATE', col('created_at')), 'ASC']],
        raw: true,
      }),
    ]);

    res.json({ totalVisits, byStatus, byType, topEmployees, dailyTrend });
  } catch (err) {
    next(err);
  }
};

// ── Pending approvals (org-scoped) ────────────────────────────────────────

const getOrgPendingApprovals = async (req, res, next) => {
  try {
    const orgId = resolveOrgId(req);
    const isAdmin = ['super_admin', 'admin', 'sub_admin'].includes(req.user.role);

    const where = { organization_id: orgId, status: 'pending' };
    if (!isAdmin) where.host_employee_id = req.user.id;

    const rows = await Visit.findAll({
      where,
      attributes: {
        include: [
          [col('visitor.name'), 'visitor_name'],
          [col('visitor.email'), 'visitor_email'],
          [col('visitor.phone'), 'visitor_phone'],
          [col('visitor.company'), 'company'],
          [col('visitor.photo_url'), 'visitor_photo_url'],
          [col('host.name'), 'employee_name'],
          [col('host.department'), 'department'],
          [col('host.email'), 'employee_email'],
        ],
      },
      include: [
        { model: Visitor, as: 'visitor', attributes: [], required: true },
        { model: User, as: 'host', attributes: [], required: true },
      ],
      order: [[literal('"Visit"."created_at"'), 'DESC']],
      raw: true,
      nest: false,
      subQuery: false,
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/org/visits/:id/approve
 * Approves visit, creates OTP session, emails it to visitor.
 */
const approveOrgVisit = async (req, res, next) => {
  try {
    const orgId = resolveOrgId(req);
    const { meetingRoom, meetingType } = req.body;
    const isVirtual = meetingType === 'virtual';

    const visit = await Visit.findOne({
      where: { id: req.params.id, organization_id: orgId },
      include: [
        { model: Visitor, as: 'visitor', attributes: ['name', 'email', 'phone'] },
        { model: User, as: 'host', attributes: ['name'] },
      ],
    });

    if (!visit) {
      return res.status(404).json({ error: 'Visit not found' });
    }

    visit.status      = 'approved';
    visit.approved_at = new Date();
    visit.meeting_type = isVirtual ? 'virtual' : 'in_person';

    let virtualMeetingUrl = null;
    if (isVirtual) {
      const roomCode = req.params.id.replace(/-/g, '').slice(0, 12).toUpperCase();
      virtualMeetingUrl = `https://meet.jit.si/NantaTechVMS-${roomCode}`;
      visit.virtual_meeting_url = virtualMeetingUrl;
    } else {
      if (meetingRoom != null) visit.meeting_room = meetingRoom;
    }
    await visit.save();

    // Generate OTP and send via email + SMS
    let otpSent = false;
    const visitorEmail = visit.visitor?.email;
    const visitorName  = visit.visitor?.name;
    const visitorPhone = visit.visitor?.phone;
    if (visitorEmail) {
      const { otp } = await createOTPSession({
        visitId: visit.id,
        email: visitorEmail,
        organizationId: orgId,
      });
      await sendOTPCode({
        visitorEmail,
        visitorName,
        otp,
        hostName: visit.host?.name,
        visitDate: visit.scheduled_at || visit.created_at,
      }).catch((e) => console.error('[Approve] OTP email error:', e.message));
      await sms.sendOtpSms({ visitorPhone, visitorName, otp, expiresMinutes: OTP.EXPIRY_MINUTES })
        .catch((e) => console.error('[Approve] SMS error (non-fatal):', e.message));
      otpSent = true;
    }

    emitToAdmin('visit:approved', { visitId: visit.id, meetingType: visit.meeting_type, virtualMeetingUrl });

    res.json({ message: 'Visit approved', otpSent, meetingType: visit.meeting_type, virtualMeetingUrl });
  } catch (err) {
    next(err);
  }
};

const declineOrgVisit = async (req, res, next) => {
  try {
    const orgId = resolveOrgId(req);
    const { reason } = req.body;
    const update = { status: 'declined' };
    if (reason != null) update.notes = reason;
    await Visit.update(update, { where: { id: req.params.id, organization_id: orgId } });
    emitToAdmin('visit:updated', { id: req.params.id, status: 'declined' });
    res.json({ message: 'Visit declined' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listBranches, createBranch, updateBranch,
  listOrgEmployees, createOrgEmployee,
  listOrgVisits, getOrgAnalytics,
  getOrgPendingApprovals, approveOrgVisit, declineOrgVisit,
};
