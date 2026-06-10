const { Op, col, literal } = require('sequelize');
const { Visit, Visitor, User, QrCode, AuditLog } = require('../models');
const { sendOTPCode, sendVisitDeclined } = require('../services/emailService');
const { notifyVisitApproved, notifyVisitDeclined, emitToVisit } = require('../services/notificationService');
const { createOTPSession } = require('../services/otpService');
const sms = require('../services/smsService');
const { VISIT_STATUS, OTP } = require('../config/constants');

// GET /employee/visits — upcoming + recent visits
const getVisits = async (req, res, next) => {
  try {
    const { status, type, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const where = { host_employee_id: req.user.id };
    if (status) where.status = status;
    if (type) where.visit_type = type;

    const total = await Visit.count({ where });

    const visits = await Visit.findAll({
      where,
      attributes: {
        include: [
          [col('visitor.name'),      'visitor_name'],
          [col('visitor.email'),     'visitor_email'],
          [col('visitor.phone'),     'visitor_phone'],
          [col('visitor.company'),   'company'],
          [col('visitor.photo_url'), 'photo_url'],
          [col('visitor.photo_url'), 'visitor_photo'],
          [col('qrCode.expires_at'), 'qr_expires_at'],
          [col('qrCode.is_used'), 'qr_used'],
        ],
      },
      include: [
        { model: Visitor, as: 'visitor', attributes: [], required: true },
        { model: QrCode, as: 'qrCode', attributes: [], required: false },
      ],
      order: [[literal('COALESCE("Visit"."scheduled_at", "Visit"."created_at")'), 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      raw: true,
      nest: false,
      subQuery: false,
    });

    res.json({
      visits,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    next(err);
  }
};

// GET /employee/visits/pending — visits awaiting approval
// Admins see ALL pending impromptu visits; employees see only their own
const getPendingApprovals = async (req, res, next) => {
  try {
    const isAdmin = ['super_admin', 'admin', 'sub_admin'].includes(req.user.role);

    const where = { status: 'pending', visit_type: 'impromptu' };
    if (!isAdmin) where.host_employee_id = req.user.id;

    const attributesInclude = [
      [col('visitor.name'),      'visitor_name'],
      [col('visitor.email'),     'visitor_email'],
      [col('visitor.phone'),     'visitor_phone'],
      [col('visitor.company'),   'company'],
      [col('visitor.photo_url'), 'visitor_photo'],
      [col('visitor.photo_url'), 'photo_url'],
    ];
    const include = [{ model: Visitor, as: 'visitor', attributes: [], required: true }];

    if (isAdmin) {
      attributesInclude.push(
        [col('host.name'), 'host_name'],
        [col('host.department'), 'host_department'],
        [col('host.desk_location'), 'host_location'],
      );
      include.push({ model: User, as: 'host', attributes: [], required: true });
    }

    const rows = await Visit.findAll({
      where,
      attributes: { include: attributesInclude },
      include,
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

// POST /employee/approve — approve or decline impromptu visit
const approveVisit = async (req, res, next) => {
  try {
    const { visitId, action, declineReason, meetingRoom, meetingType } = req.body;

    if (!visitId || !['approve', 'decline'].includes(action)) {
      return res.status(400).json({ error: 'visitId and action (approve/decline) required' });
    }

    // Admins can approve any visit; employees only their own
    const where = { id: visitId };
    if (!['super_admin', 'admin', 'sub_admin'].includes(req.user.role)) where.host_employee_id = req.user.id;

    const visit = await Visit.findOne({
      where,
      include: [{ model: Visitor, as: 'visitor', attributes: ['email', 'name', 'phone'] }],
    });

    if (!visit) {
      return res.status(404).json({ error: 'Visit not found or unauthorized' });
    }

    if (visit.status !== VISIT_STATUS.PENDING) {
      return res.status(409).json({ error: `Visit is already ${visit.status}` });
    }

    const visitorEmail = visit.visitor?.email;
    const visitorName  = visit.visitor?.name;
    const visitorPhone = visit.visitor?.phone;

    if (action === 'approve') {
      const isVirtual = meetingType === 'virtual';

      visit.status      = VISIT_STATUS.APPROVED;
      visit.approved_by = req.user.id;
      visit.approved_at = new Date();
      visit.meeting_type = isVirtual ? 'virtual' : 'in_person';

      let virtualMeetingUrl = null;
      if (isVirtual) {
        // Generate a stable Jitsi room URL for this visit
        const roomCode = visitId.replace(/-/g, '').slice(0, 12).toUpperCase();
        virtualMeetingUrl = `https://meet.jit.si/NantaTechVMS-${roomCode}`;
        visit.virtual_meeting_url = virtualMeetingUrl;
      } else {
        if (meetingRoom) visit.meeting_room = meetingRoom;
      }
      await visit.save();

      // Generate OTP and send via email + SMS
      let otpSent = false;
      if (visitorEmail) {
        const { otp } = await createOTPSession({
          visitId: visit.id,
          email: visitorEmail,
          organizationId: visit.organization_id || req.user.organization_id,
        });
        await sendOTPCode({
          visitorEmail,
          visitorName,
          otp,
          hostName: req.user.name,
        }).catch((e) => console.error('OTP email error:', e.message));
        await sms.sendOtpSms({ visitorPhone, visitorName, otp, expiresMinutes: OTP.EXPIRY_MINUTES })
          .catch((e) => console.error('[Approve] SMS error (non-fatal):', e.message));
        otpSent = true;
      }

      await notifyVisitApproved({
        employeeId: req.user.id,
        visitId,
        visitorEmail,
        visitorName,
        organizationId: visit.organization_id || req.user.organization_id,
        meetingRoom: visit.meeting_room || null,
      });

      // Fetch host's Temi user ID so the robot can initiate a built-in VC call
      const hostUser = await User.findByPk(req.user.id, { attributes: ['temi_user_id'], raw: true });
      const hostTemiUserId = hostUser?.temi_user_id || null;

      // Notify kiosk — include virtual meeting details so Temi can initiate built-in VC
      emitToVisit(visitId, 'visit:approved', {
        visitId,
        otpSent,
        meetingRoom:        visit.meeting_room || null,
        meetingType:        visit.meeting_type,
        virtualMeetingUrl,
        hostTemiUserId,
      });

      await AuditLog.create({
        action: 'approve_visit',
        entity_type: 'visit',
        entity_id: visit.id,
        performed_by: req.user.id,
        metadata: { visitorName, meetingType: visit.meeting_type },
      });

      res.json({
        message: isVirtual
          ? 'Visit approved as virtual meeting. OTP sent to visitor.'
          : 'Visit approved. OTP sent to visitor email.',
        otpSent,
        meetingType: visit.meeting_type,
        virtualMeetingUrl,
      });
    } else {
      visit.status = VISIT_STATUS.DECLINED;
      visit.declined_reason = declineReason;
      await visit.save();

      if (visitorEmail) {
        await sendVisitDeclined({
          visitorEmail,
          visitorName,
          reason: declineReason,
        }).catch((e) => console.error('Decline email error:', e.message));
      }

      // Real-time: broadcast decline to all relevant parties
      await notifyVisitDeclined({
        employeeId: req.user.id,
        visitId,
        visitorName,
        organizationId: visit.organization_id || req.user.organization_id,
        reason: declineReason,
      });

      await AuditLog.create({
        action: 'decline_visit',
        entity_type: 'visit',
        entity_id: visit.id,
        performed_by: req.user.id,
        metadata: { reason: declineReason },
      });

      res.json({ message: 'Visit declined.' });
    }
  } catch (err) {
    next(err);
  }
};

// GET /employee/notifications
const getNotifications = async (req, res, next) => {
  try {
    const { getUnreadNotifications } = require('../services/notificationService');
    const notifications = await getUnreadNotifications(req.user.id);
    res.json(notifications);
  } catch (err) {
    next(err);
  }
};

// POST /employee/notifications/read
const markNotificationsRead = async (req, res, next) => {
  try {
    const { markNotificationsRead: markRead } = require('../services/notificationService');
    await markRead(req.user.id, req.body.ids);
    res.json({ message: 'Notifications marked as read' });
  } catch (err) {
    next(err);
  }
};

// GET /visitor/employees/search — PUBLIC, returns minimal fields for kiosk walk-in form
const searchEmployeesPublic = async (req, res, next) => {
  try {
    const { q = '' } = req.query;
    const rows = await User.findAll({
      where: {
        role: ['super_admin', 'admin', 'sub_admin', 'employee'],
        is_active: true,
        [Op.or]: [
          { name: { [Op.iLike]: `%${q}%` } },
          { department: { [Op.iLike]: `%${q}%` } },
        ],
      },
      attributes: ['id', 'name', 'department', 'desk_location'],
      order: [['name', 'ASC']],
      limit: 100,
      raw: true,
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

// GET /employee/profile — returns current user's profile including temi_user_id
const getProfile = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'name', 'email', 'phone', 'department', 'desk_location', 'temi_user_id'],
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    next(err);
  }
};

// PUT /employee/profile — update temi_user_id (and other safe fields)
const updateProfile = async (req, res, next) => {
  try {
    const { temi_user_id, phone, desk_location } = req.body;
    const allowed = {};
    if (temi_user_id  !== undefined) allowed.temi_user_id  = temi_user_id  || null;
    if (phone         !== undefined) allowed.phone         = phone;
    if (desk_location !== undefined) allowed.desk_location = desk_location;
    await User.update(allowed, { where: { id: req.user.id } });
    res.json({ message: 'Profile updated' });
  } catch (err) {
    next(err);
  }
};

module.exports = { getVisits, getPendingApprovals, approveVisit, getNotifications, markNotificationsRead, searchEmployeesPublic, getProfile, updateProfile };
