/**
 * Public booking flow (Option 2 on landing page — no login required).
 *
 * Step 1  POST /api/public/visits/book
 *         Visitor submits name/email/phone/time + org selection.
 *         Visit created with status=pending_sub_admin.
 *         All sub-admins of that org notified.
 *         Returns { visitId }.
 *
 * Step 2  GET  /api/public/visits/:visitId/status   (poll every 3 s)
 *         Returns status + employee list when status=pending_employee_selection.
 *
 * Step 3  POST /api/public/visits/:visitId/select-employee
 *         Visitor picks employee + reason.
 *         Status → pending_employee.
 *         Employee + admins notified.
 *
 * Approval (done by sub-admin / employee in their respective dashboards):
 *         handled in employeeController.approveVisit (updated separately)
 */

const { Op } = require('sequelize');
const { sequelize, Organization, User, Visit, Visitor, AuditLog } = require('../models');
const { VISIT_STATUS, OTP } = require('../config/constants');
const { sendOTPCode } = require('../services/emailService');
const { notifyVisitApproved, emitToVisit } = require('../services/notificationService');
const { createOTPSession } = require('../services/otpService');
const sms = require('../services/smsService');

// Roles that can be a visit host — used by the personal-link booking flow below.
const HOST_ROLES = ['employee', 'sub_admin', 'admin'];

let _io;
const setBookingIo = (io) => { _io = io; };

// ── Step 1: create booking request ────────────────────────────────────────────

const createBookRequest = async (req, res, next) => {
  try {
    const {
      visitorName, visitorEmail, visitorPhone,
      organizationId, scheduledAt,
    } = req.body;

    if (!visitorName || !visitorEmail || !organizationId) {
      return res.status(400).json({ error: 'visitorName, visitorEmail, organizationId are required' });
    }
    if (!/\S+@\S+\.\S+/.test(visitorEmail)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const org = await Organization.findOne({
      where: { id: organizationId, status: 'active', is_active: true },
      attributes: ['id', 'name', 'organization_id'],
    });
    if (!org) return res.status(404).json({ error: 'Organization not found or not active' });

    // Find or create visitor
    let visitor = await Visitor.findOne({ where: { email: visitorEmail.toLowerCase() } });
    if (visitor) {
      const updates = {};
      if (visitorName && visitorName !== visitor.name) updates.name = visitorName;
      if (visitorPhone && visitorPhone !== visitor.phone) updates.phone = visitorPhone;
      if (Object.keys(updates).length) await visitor.update(updates);
    } else {
      visitor = await Visitor.create({
        name:            visitorName,
        email:           visitorEmail.toLowerCase(),
        phone:           visitorPhone || null,
        organization_id: organizationId,
      });
    }

    const visit = await Visit.create({
      visitor_id:      visitor.id,
      host_employee_id: null, // set in step 3 when employee selected
      visit_type:      'impromptu',
      purpose:         'Pending employee selection',
      status:          VISIT_STATUS.PENDING_SUB_ADMIN,
      organization_id: organizationId,
      booking_source:  'self_service',
      scheduled_at:    scheduledAt ? new Date(scheduledAt) : null,
    });

    // Notify all sub-admins of this org
    const subAdmins = await User.findAll({
      where: {
        organization_id: organizationId,
        role: { [Op.in]: ['sub_admin', 'admin'] },
        is_active: true,
      },
      attributes: ['id', 'email', 'name'],
    });

    if (_io) {
      for (const sa of subAdmins) {
        _io.to(`user:${sa.id}`).emit('visit:booking_request', {
          visitId:     visit.id,
          visitorName,
          visitorEmail: visitorEmail.toLowerCase(),
          visitorPhone: visitorPhone || null,
          orgName:     org.name,
          scheduledAt: scheduledAt || null,
        });
      }
    }

    res.status(201).json({
      visitId:  visit.id,
      message:  'Booking request submitted. Awaiting sub-admin approval.',
    });
  } catch (err) {
    next(err);
  }
};

// ── Step 2: polling status ─────────────────────────────────────────────────────

const getBookingStatus = async (req, res, next) => {
  try {
    const { visitId } = req.params;

    const visit = await Visit.findByPk(visitId, {
      attributes: [
        'id', 'status', 'organization_id', 'host_employee_id',
        'purpose', 'declined_reason', 'scheduled_at',
        'sub_admin_approved_by', 'sub_admin_approved_at',
      ],
      include: [
        {
          model: User,
          as: 'host',
          attributes: ['id', 'name', 'department', 'desk_location'],
          required: false,
        },
      ],
    });
    if (!visit) return res.status(404).json({ error: 'Visit not found' });

    const response = {
      visitId:      visit.id,
      status:       visit.status,
      scheduledAt:  visit.scheduled_at,
      declinedReason: visit.declined_reason || null,
    };

    // When sub-admin has approved → include employee list so the visitor can pick
    if (visit.status === VISIT_STATUS.PENDING_EMPLOYEE_SELECTION) {
      const employees = await User.findAll({
        where: {
          organization_id: visit.organization_id,
          role:            { [Op.in]: ['employee', 'sub_admin', 'admin'] },
          is_active:       true,
        },
        attributes: ['id', 'name', 'department', 'desk_location', 'email'],
        order: [['name', 'ASC']],
      });
      response.employees = employees;
    }

    if (visit.status === VISIT_STATUS.APPROVED && visit.host) {
      response.host = {
        name:       visit.host.name,
        department: visit.host.department,
        location:   visit.host.desk_location,
      };
    }

    res.json(response);
  } catch (err) {
    next(err);
  }
};

// ── Step 3: visitor selects employee ──────────────────────────────────────────

const selectEmployee = async (req, res, next) => {
  try {
    const { visitId }    = req.params;
    const { employeeId, purpose } = req.body;

    if (!employeeId || !purpose) {
      return res.status(400).json({ error: 'employeeId and purpose are required' });
    }

    const visit = await Visit.findByPk(visitId, {
      include: [{ model: require('../models').Visitor, as: 'visitor', attributes: ['name', 'email'] }],
    });
    if (!visit) return res.status(404).json({ error: 'Visit not found' });
    if (visit.status !== VISIT_STATUS.PENDING_EMPLOYEE_SELECTION) {
      return res.status(400).json({ error: `Visit is in status '${visit.status}', expected 'pending_employee_selection'` });
    }

    const employee = await User.findOne({
      where: { id: employeeId, organization_id: visit.organization_id, is_active: true },
      attributes: ['id', 'name', 'email', 'department'],
    });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    await visit.update({
      host_employee_id: employeeId,
      purpose,
      status: VISIT_STATUS.PENDING_EMPLOYEE,
    });

    // Notify employee + all admins/sub-admins
    const admins = await User.findAll({
      where: {
        organization_id: visit.organization_id,
        role: { [Op.in]: ['admin', 'sub_admin'] },
        is_active: true,
      },
      attributes: ['id'],
    });

    if (_io) {
      _io.to(`user:${employeeId}`).emit('visit:request', {
        visitId:     visit.id,
        visitorName: visit.visitor?.name,
        purpose,
        source:      'self_service',
      });
      for (const a of admins) {
        _io.to(`user:${a.id}`).emit('visit:request', {
          visitId:      visit.id,
          visitorName:  visit.visitor?.name,
          employeeName: employee.name,
          purpose,
          source:       'self_service',
        });
      }
    }

    res.json({ message: 'Employee selected. Awaiting approval.', visitId: visit.id });
  } catch (err) {
    next(err);
  }
};

// ── Public employee list for a given org ──────────────────────────────────────

const listOrgEmployees = async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const { search } = req.query;

    const where = {
      organization_id: orgId,
      role:            { [Op.in]: ['employee', 'sub_admin', 'admin'] },
      is_active:       true,
    };
    if (search) {
      where[Op.or] = [
        { name:       { [Op.iLike]: `%${search}%` } },
        { department: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const employees = await User.findAll({
      where,
      attributes: ['id', 'name', 'department', 'desk_location'],
      order: [['name', 'ASC']],
      limit: 100,
    });

    res.json(employees);
  } catch (err) {
    next(err);
  }
};

// ── Personal-link booking ──────────────────────────────────────────────────────
// A staff member (employee/sub_admin/admin) can share /book-visit?hostId=<their id>.
// Opening that link resolves their org so the visitor skips org search entirely,
// and submitting the form auto-approves the visit — no admin/sub-admin queue —
// since the host implicitly vouched for the visitor by sharing their own link.

// GET /public/host/:hostId/booking-info — resolves host + org for auto-select
const getHostBookingInfo = async (req, res, next) => {
  try {
    const host = await User.findOne({
      where: { id: req.params.hostId, role: { [Op.in]: HOST_ROLES }, is_active: true },
      attributes: ['id', 'name', 'department', 'organization_id'],
    });
    if (!host) return res.status(404).json({ error: 'This booking link is invalid or no longer active' });

    const org = await Organization.findOne({
      where: { id: host.organization_id, status: 'active', is_active: true },
      attributes: ['id', 'name', 'logo_url', 'industry'],
    });
    if (!org) return res.status(404).json({ error: 'This booking link is invalid or no longer active' });

    res.json({
      hostId:          host.id,
      hostName:        host.name,
      hostDepartment:  host.department,
      organizationId:  org.id,
      organizationName: org.name,
      organizationLogo: org.logo_url,
      organizationIndustry: org.industry,
    });
  } catch (err) {
    next(err);
  }
};

// POST /public/visits/direct-book — creates the visit already approved
const createDirectBooking = async (req, res, next) => {
  try {
    const { hostId, visitorName, visitorEmail, visitorPhone, purpose, scheduledAt } = req.body;

    if (!hostId || !visitorName || !visitorEmail || !purpose) {
      return res.status(400).json({ error: 'hostId, visitorName, visitorEmail and purpose are required' });
    }
    if (!/\S+@\S+\.\S+/.test(visitorEmail)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const host = await User.findOne({
      where: { id: hostId, role: { [Op.in]: HOST_ROLES }, is_active: true },
      attributes: ['id', 'name', 'organization_id', 'temi_user_id'],
    });
    if (!host) return res.status(404).json({ error: 'This booking link is invalid or no longer active' });

    const org = await Organization.findOne({
      where: { id: host.organization_id, status: 'active', is_active: true },
      attributes: ['id', 'name'],
    });
    if (!org) return res.status(404).json({ error: 'This booking link is invalid or no longer active' });

    // Find or create visitor — same pattern as the general booking flow above
    let visitor = await Visitor.findOne({ where: { email: visitorEmail.toLowerCase() } });
    if (visitor) {
      const updates = {};
      if (visitorName && visitorName !== visitor.name) updates.name = visitorName;
      if (visitorPhone && visitorPhone !== visitor.phone) updates.phone = visitorPhone;
      if (Object.keys(updates).length) await visitor.update(updates);
    } else {
      visitor = await Visitor.create({
        name:            visitorName,
        email:           visitorEmail.toLowerCase(),
        phone:           visitorPhone || null,
        organization_id: org.id,
      });
    }

    const visit = await Visit.create({
      visitor_id:        visitor.id,
      host_employee_id:  host.id,
      visit_type:        'impromptu',
      purpose,
      status:             VISIT_STATUS.APPROVED,
      organization_id:    org.id,
      booking_source:     'self_service',
      scheduled_at:        scheduledAt ? new Date(scheduledAt) : null,
      approved_by:         host.id,
      approved_at:         new Date(),
      meeting_type:        'in_person',
    });

    // Generate OTP and send via email + SMS — same as the manual-approval path
    let otpSent = false;
    if (visitor.email) {
      const { otp } = await createOTPSession({
        visitId: visit.id,
        email: visitor.email,
        organizationId: org.id,
      });
      await sendOTPCode({
        visitorEmail: visitor.email,
        visitorName:  visitor.name,
        otp,
        hostName: host.name,
      }).catch((e) => console.error('[DirectBooking] OTP email error:', e.message));
      await sms.sendOtpSms({ visitorPhone: visitor.phone, visitorName: visitor.name, otp, expiresMinutes: OTP.EXPIRY_MINUTES })
        .catch((e) => console.error('[DirectBooking] SMS error (non-fatal):', e.message));
      otpSent = true;
    }

    await notifyVisitApproved({
      employeeId: host.id,
      visitId: visit.id,
      visitorName: visitor.name,
      organizationId: org.id,
      meetingRoom: null,
    });

    emitToVisit(visit.id, 'visit:approved', {
      visitId: visit.id,
      otpSent,
      meetingRoom: null,
      meetingType: 'in_person',
      virtualMeetingUrl: null,
      hostTemiUserId: host.temi_user_id || null,
    });

    await AuditLog.create({
      action: 'approve_visit',
      entity_type: 'visit',
      entity_id: visit.id,
      performed_by: host.id,
      metadata: { visitorName: visitor.name, meetingType: 'in_person', autoApproved: true, source: 'direct_link' },
    });

    res.status(201).json({
      visitId: visit.id,
      status: visit.status,
      hostName: host.name,
      organizationName: org.name,
      otpSent,
      message: 'Visit approved instantly. OTP sent to visitor email.',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createBookRequest, getBookingStatus, selectEmployee, listOrgEmployees, setBookingIo,
  getHostBookingInfo, createDirectBooking,
};
