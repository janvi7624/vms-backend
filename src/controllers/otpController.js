const { Visit, Visitor, User } = require('../models');
const { createOTPSession, validateOTP } = require('../services/otpService');
const { sendOTPCode } = require('../services/emailService');
const { VISIT_STATUS, SOCKET_EVENTS } = require('../config/constants');

let _io;
const setIo = (io) => { _io = io; };

/**
 * POST /api/otp/send
 * Body: { visitId, email }
 * Called by the kiosk or Temi app when the visitor wants to check in.
 * The visit must already be in APPROVED state.
 */
const sendOTP = async (req, res, next) => {
  try {
    const { visitId, email } = req.body;
    if (!visitId || !email) {
      return res.status(400).json({ error: 'visitId and email are required' });
    }

    // Verify visit exists and is approved
    const visit = await Visit.findOne({
      where: { id: visitId },
      include: [
        { model: Visitor, as: 'visitor', attributes: ['name', 'email'] },
        { model: User, as: 'host', attributes: ['name'] },
      ],
    });

    if (!visit) {
      return res.status(404).json({ error: 'Visit not found' });
    }

    // For impromptu visits, allow pending status (approval via OTP flow)
    const allowedStatuses = [VISIT_STATUS.APPROVED, VISIT_STATUS.PENDING];
    if (!allowedStatuses.includes(visit.status)) {
      return res.status(400).json({ error: `Visit status is '${visit.status}'. OTP cannot be sent.` });
    }

    const targetEmail = email.toLowerCase().trim();

    const { otp, expiresAt } = await createOTPSession({
      visitId: visit.id,
      email: targetEmail,
      organizationId: visit.organization_id,
    });

    await sendOTPCode({
      visitorEmail: targetEmail,
      visitorName: visit.visitor?.name || 'Visitor',
      otp,
      hostName: visit.host?.name,
      visitDate: visit.scheduled_at || visit.created_at,
    }).catch((e) => console.error('[OTP] Email error (non-fatal):', e.message));

    res.json({
      message: 'OTP sent to email',
      expiresAt,
      emailMasked: maskEmail(targetEmail),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/otp/verify
 * Body: { email, otp }
 * Public endpoint — called from kiosk or Temi app.
 * On success: marks visit as checked_in, emits socket event.
 */
const verifyOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!otp) {
      return res.status(400).json({ error: 'otp is required' });
    }

    if (String(otp).length !== 6) {
      return res.status(400).json({ error: 'OTP must be 6 digits' });
    }

    const result = await validateOTP({ email: email || '', otp: String(otp) });

    if (!result.valid) {
      return res.status(401).json({
        error: result.error,
        message: result.message,
        attemptsLeft: result.attemptsLeft,
      });
    }

    // Fetch visit details to build response
    const visit = await Visit.findOne({
      where: { id: result.visitId },
      include: [
        { model: Visitor, as: 'visitor', attributes: ['name', 'email', 'phone', 'company'] },
        { model: User, as: 'host', attributes: ['name', 'department', 'desk_location'] },
      ],
    });

    if (!visit) {
      return res.status(404).json({ error: 'Visit not found' });
    }

    // Mark visit as checked in
    visit.status = VISIT_STATUS.CHECKED_IN;
    visit.checked_in_at = new Date();
    await visit.save();

    const visitorName = visit.visitor?.name;
    const hostName = visit.host?.name;
    const hostDepartment = visit.host?.department;
    const destination = visit.host?.desk_location || visit.meeting_room;

    // Emit socket event so employee dashboard updates in real time
    if (_io) {
      _io.to(`user:${visit.host_employee_id}`).emit(SOCKET_EVENTS.VISITOR_CHECKED_IN, {
        visitId: visit.id,
        visitorName,
        hostName,
      });
      // Also emit to Temi rooms
      _io.to(`temi:${visit.organization_id}`).emit(SOCKET_EVENTS.OTP_APPROVED, {
        visitId: visit.id,
        visitorName,
        destination,
        hostName,
        hostDepartment,
      });
    }

    res.json({
      valid: true,
      visit: {
        id: visit.id,
        visitorName,
        visitorCompany: visit.visitor?.company,
        hostName,
        hostDepartment,
        destination,
        meetingRoom: visit.meeting_room,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/otp/request-walkin  (impromptu)
 * Body: { visitorName, visitorEmail, visitorPhone, visitorCompany, employeeId, purpose }
 * Called from kiosk walk-in. Creates visit, notifies employee, waits for approval.
 */
const requestWalkIn = async (req, res, next) => {
  try {
    const { visitorName, visitorEmail, visitorPhone, visitorCompany, employeeId, purpose = 'Walk-in visit' } = req.body;

    if (!visitorName || !visitorEmail || !employeeId) {
      return res.status(400).json({ error: 'Name, email, and employee are required' });
    }

    const employee = await User.findOne({
      where: { id: employeeId, role: ['employee', 'admin', 'org_admin', 'org_super_admin'], is_active: true },
      attributes: ['id', 'name', 'email', 'location_id', 'organization_id'],
      raw: true,
    });
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Upsert visitor
    let visitorId;
    const existing = await Visitor.findOne({ where: { email: visitorEmail.toLowerCase() } });
    if (existing) {
      visitorId = existing.id;
      await existing.update({ name: visitorName, phone: visitorPhone, company: visitorCompany });
    } else {
      const created = await Visitor.create({
        name: visitorName,
        email: visitorEmail.toLowerCase(),
        phone: visitorPhone,
        company: visitorCompany,
        organization_id: employee.organization_id,
      });
      visitorId = created.id;
    }

    const visit = await Visit.create({
      visitor_id: visitorId,
      host_employee_id: employeeId,
      visit_type: 'impromptu',
      purpose,
      status: 'pending',
      location_id: employee.location_id,
      organization_id: employee.organization_id,
    });

    // Notify employee via socket
    if (_io) {
      _io.to(`user:${employeeId}`).emit('visit:request', {
        visitId: visit.id,
        visitorName,
        visitorCompany,
        purpose,
      });
    }

    // Send approval request email to employee
    const { sendApprovalNotification } = require('../services/emailService');
    if (employee.email) {
      sendApprovalNotification({
        employeeEmail: employee.email,
        employeeName: employee.name,
        visitorName,
        visitorCompany,
        visitPurpose: purpose,
      }).catch((e) => console.error('[OTP WalkIn] Email error:', e.message));
    }

    res.status(201).json({
      visitId: visit.id,
      message: 'Visit request sent. Awaiting employee approval.',
    });
  } catch (err) {
    next(err);
  }
};

const maskEmail = (email) => {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.length > 2 ? local.slice(0, 2) : local[0] || '*';
  return `${visible}${'*'.repeat(Math.max(0, local.length - 2))}@${domain}`;
};

module.exports = { sendOTP, verifyOTP, requestWalkIn, setIo };
