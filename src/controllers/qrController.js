const { Visit, Visitor, User, QrCode, AuditLog, TemiRobot } = require('../models');
const { validateQRToken, markQRUsed } = require('../services/qrService');
const { notifyVisitorCheckedIn } = require('../services/notificationService');
const { VISIT_STATUS } = require('../config/constants');

let io;
const setIo = (socketIo) => { io = socketIo; };

// POST /qr/validate — Called by Temi robot to validate QR
const validateQR = async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token required', code: 'MISSING_TOKEN' });
    }

    let visitId;
    try {
      const validated = await validateQRToken(token);
      visitId = validated.visitId;
    } catch (err) {
      return res.status(400).json({ error: err.message, code: err.code || 'QR_INVALID' });
    }

    // Fetch full visitor + visit info for Temi display
    const visit = await Visit.findOne({
      where: { id: visitId },
      include: [
        { model: Visitor, as: 'visitor', attributes: ['name', 'company', 'photo_url'], required: true },
        { model: User, as: 'host', attributes: ['name', 'desk_location', 'department'], required: true },
      ],
    });

    if (!visit) {
      return res.status(404).json({ error: 'Visit record not found', code: 'NOT_FOUND' });
    }

    const visitorName = visit.visitor?.name;
    const visitorCompany = visit.visitor?.company;
    const photoUrl = visit.visitor?.photo_url;
    const employeeName = visit.host?.name;
    const deskLocation = visit.host?.desk_location;
    const department = visit.host?.department;

    // Mark QR as used and update visit status to checked_in
    await markQRUsed(token);
    visit.status = VISIT_STATUS.CHECKED_IN;
    visit.checked_in_at = new Date();
    await visit.save();

    // Notify employee of check-in
    await notifyVisitorCheckedIn({
      employeeId: visit.host_employee_id,
      visitId,
      visitorName,
      meetingRoom: visit.meeting_room,
    }).catch((e) => console.error('Notification error:', e.message));

    await AuditLog.create({
      action: 'qr_validated',
      entity_type: 'visit',
      entity_id: visitId,
      metadata: { visitorName },
    });

    // Notify Temi robot to escort visitor
    if (io) {
      const temiSerial = process.env.TEMI_SERIAL || '00126040079';

      // Fetch Temi's actual saved locations to pick a valid fallback
      const robot = await TemiRobot.findOne({
        where: { serial_number: temiSerial },
        attributes: ['saved_locations'],
        raw: true,
      }).catch(() => null);
      const savedLocations = robot?.saved_locations || [];

      // Use meeting_room if set, otherwise first saved location, otherwise null
      const dest = visit.meeting_room ||
        (savedLocations.length ? savedLocations[0] : null);

      const destLabel = dest ? dest.replace(/_/g, ' ') : '';

      io.to(`temi:${temiSerial}`).emit('temi:escort', {
        visitId,
        visitorName,
        visitorCompany: visitorCompany || '',
        hostName: employeeName || 'your host',
        hostDepartment: department || '',
        destination: dest || '',
        meetingRoom: visit.meeting_room || '',
        instruction: dest
          ? `Please follow me to ${destLabel}`
          : `Please follow me to ${employeeName}'s area`,
      });
    }

    const dest = visit.meeting_room || null;
    res.json({
      valid: true,
      visitor: {
        name: visitorName,
        company: visitorCompany,
        photoUrl,
      },
      visit: {
        id: visit.id,
        purpose: visit.purpose,
        meetingRoom: visit.meeting_room,
        type: visit.visit_type,
      },
      host: {
        name: employeeName,
        department,
        deskLocation,
      },
      navigation: {
        destination: dest,
        instruction: dest
          ? `Please follow me to ${dest.replace(/_/g, ' ')}`
          : `Please follow me`,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /qr/:visitId/image — Get QR code image for a visit
const getQRImage = async (req, res, next) => {
  try {
    const qr = await QrCode.findOne({
      where: { visit_id: req.params.visitId },
      include: [{ model: Visit, as: 'visit', attributes: ['host_employee_id'] }],
    });

    if (!qr) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    // Authorization: only host employee or admin
    const hostId = qr.visit?.host_employee_id;
    if (req.user.role !== 'admin' && req.user.id !== hostId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json({ qrImage: qr.qr_image_base64, expiresAt: qr.expires_at });
  } catch (err) {
    next(err);
  }
};

module.exports = { validateQR, getQRImage, setIo };
