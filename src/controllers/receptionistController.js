const { Op, col, literal } = require('sequelize');
const { ServiceRequest, User, Visit, Visitor, OtpSession } = require('../models');
const { SOCKET_EVENTS } = require('../config/constants');
const { emitToOrg } = require('../services/notificationService');

// GET /receptionist/visits — recent visits for the front desk, with each
// visit's active OTP + email-delivery status attached so receptionists can
// read out the code manually when email delivery fails. Mirrors
// employeeController.getVisits / adminController.getAllVisits.
const getVisits = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const where = { organization_id: req.user.organization_id };
    if (status) where.status = status;

    const total = await Visit.count({ where });
    const visits = await Visit.findAll({
      where,
      attributes: {
        include: [
          [col('visitor.name'),      'visitor_name'],
          [col('visitor.email'),     'visitor_email'],
          [col('visitor.phone'),     'visitor_phone'],
          [col('visitor.company'),   'company'],
          [col('visitor.photo_url'), 'visitor_photo_url'],
          [col('host.name'),         'employee_name'],
          [col('host.department'),   'department'],
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

    const visitIds = visits.map((v) => v.id);
    if (visitIds.length) {
      const activeOtps = await OtpSession.findAll({
        where: {
          visit_id: { [Op.in]: visitIds },
          used: false,
          expires_at: { [Op.gt]: new Date() },
        },
        order: [['created_at', 'DESC']],
        attributes: ['visit_id', 'otp_code', 'expires_at', 'email_status'],
        raw: true,
      });
      const otpByVisit = {};
      for (const s of activeOtps) {
        if (!otpByVisit[s.visit_id]) otpByVisit[s.visit_id] = s;
      }
      for (const v of visits) {
        const active = otpByVisit[v.id];
        v.otp_code = active?.otp_code || null;
        v.otp_expires_at = active?.expires_at || null;
        v.otp_email_status = active?.email_status || null;
      }
    }

    res.json({ visits, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
};

// GET /receptionist/service-requests
// Returns active (pending) service requests for this org, newest first
const getServiceRequests = async (req, res, next) => {
  try {
    const orgId  = req.user.organization_id;
    const status = req.query.status || 'pending';

    const where = {};
    if (orgId)  where.organization_id = orgId;
    if (status !== 'all') where.status = status;

    const requests = await ServiceRequest.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: 100,
      include: [
        { model: User, as: 'fulfilledBy', attributes: ['id', 'name'], required: false },
        {
          model:      Visit, as: 'visit', attributes: [], required: false,
          include: [{ model: Visitor, as: 'visitor', attributes: ['photo_url'], required: false }],
        },
      ],
    });

    res.json(requests);
  } catch (err) {
    next(err);
  }
};

// PATCH /receptionist/service-requests/:id
// Mark a request as fulfilled or dismissed
const updateServiceRequest = async (req, res, next) => {
  try {
    const { id }     = req.params;
    const { status } = req.body;

    if (!['fulfilled', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'status must be fulfilled or dismissed' });
    }

    const request = await ServiceRequest.findByPk(id);
    if (!request) return res.status(404).json({ error: 'Request not found' });

    // Ensure same org
    if (req.user.organization_id && String(request.organization_id) !== String(req.user.organization_id)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    request.status       = status;
    request.fulfilled_by = req.user.id;
    request.fulfilled_at = new Date();
    await request.save();

    // Notify all connected receptionists + admins that this request changed
    const payload = {
      requestId:  request.id,
      status,
      fulfilledBy: req.user.name,
      organizationId: request.organization_id,
    };
    emitToOrg(request.organization_id, SOCKET_EVENTS.SERVICE_FULFILLED, payload);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

// PATCH /receptionist/service-requests/:id/followup
// Append a follow-up item from Temi (called when visitor says "anything else")
const addFollowUp = async (req, res, next) => {
  try {
    const { id }   = req.params;
    const { item } = req.body;
    if (!item) return res.status(400).json({ error: 'item required' });

    const request = await ServiceRequest.findByPk(id);
    if (!request) return res.status(404).json({ error: 'Request not found' });

    const followUps = Array.isArray(request.follow_up_items)
      ? request.follow_up_items
      : [];
    followUps.push({ item, ts: new Date().toISOString() });
    request.follow_up_items = followUps;
    await request.save();

    res.json({ ok: true, follow_up_items: followUps });
  } catch (err) {
    next(err);
  }
};

// GET /receptionist/dashboard
// Quick stats for the receptionist header
const getDashboard = async (req, res, next) => {
  try {
    const orgId = req.user.organization_id;
    const where = orgId ? { organization_id: orgId } : {};

    const [pending, fulfilledToday, total] = await Promise.all([
      ServiceRequest.count({ where: { ...where, status: 'pending' } }),
      ServiceRequest.count({
        where: {
          ...where,
          status:      'fulfilled',
          fulfilled_at: { [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      ServiceRequest.count({ where }),
    ]);

    res.json({ pending, fulfilledToday, total });
  } catch (err) {
    next(err);
  }
};

module.exports = { getServiceRequests, updateServiceRequest, addFollowUp, getDashboard, getVisits };
