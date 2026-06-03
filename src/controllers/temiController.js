const { col } = require('sequelize');
const { TemiRobot, Visit, AuditLog, Location, ServiceRequest, User } = require('../models');
const { notifyServiceRequest, notifyVisitCompleted, emitAnalyticsUpdate } = require('../services/notificationService');
const { SOCKET_EVENTS } = require('../config/constants');

let io;
const setIo = (socketIo) => { io = socketIo; };

// POST /temi/heartbeat — Temi robot pings to update status
const heartbeat = async (req, res, next) => {
  try {
    const { serial, status = 'online', currentTask, batteryLevel } = req.body;
    if (!serial) return res.status(400).json({ error: 'Serial number required' });

    const updates = { serial_number: serial, status, current_task: currentTask, last_seen: new Date() };
    if (batteryLevel != null) updates.battery_level = batteryLevel;

    await TemiRobot.upsert(updates);

    // Broadcast live robot status to admin dashboards
    if (io) {
      const statusPayload = { serial, status, currentTask, batteryLevel, lastSeen: new Date().toISOString() };
      io.to('admin').emit(SOCKET_EVENTS.TEMI_STATUS, statusPayload);
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

// GET /temi/config/:serial — Temi fetches its configuration
const getConfig = async (req, res, next) => {
  try {
    const robot = await TemiRobot.findOne({
      where: { serial_number: req.params.serial },
      attributes: {
        include: [
          [col('location.name'), 'location_name'],
          [col('location.address'), 'location_address'],
        ],
      },
      include: [{ model: Location, as: 'location', attributes: [], required: false }],
      raw: true,
      nest: false,
    });

    if (!robot) {
      return res.status(404).json({ error: 'Robot not registered' });
    }

    res.json(robot);
  } catch (err) {
    next(err);
  }
};

// POST /temi/locations/sync — Temi pushes its saved locations to backend
const syncLocations = async (req, res, next) => {
  try {
    const { serial, locations } = req.body;
    if (!serial || !Array.isArray(locations)) {
      return res.status(400).json({ error: 'serial and locations[] required' });
    }

    await TemiRobot.upsert(
      { serial_number: serial, saved_locations: locations, last_seen: new Date() }
    );

    // Broadcast synced locations to admin dashboards and approval screens
    if (io) {
      io.to('admin').emit(SOCKET_EVENTS.TEMI_LOCATIONS_SYNCED, { serial, locations });
    }

    res.json({ ok: true, synced: locations.length, locations });
  } catch (err) {
    next(err);
  }
};

// GET /temi/locations/:serial — Get saved navigation locations for this Temi
const getLocations = async (req, res, next) => {
  try {
    const robot = await TemiRobot.findOne({
      where: { serial_number: req.params.serial },
      attributes: ['saved_locations'],
      raw: true,
    });

    const savedRooms = robot?.saved_locations?.length
      ? robot.saved_locations
      : ['reception', 'meeting_room_a', 'meeting_room_b', 'conference_hall', 'lobby', 'waiting_area'];

    res.json({ savedRooms });
  } catch (err) {
    next(err);
  }
};

// POST /temi/checkout — Temi marks visit as completed
const checkoutVisit = async (req, res, next) => {
  try {
    const { visitId } = req.body;
    if (!visitId) return res.status(400).json({ error: 'visitId required' });

    const visit = await Visit.findByPk(visitId, {
      attributes: ['id', 'host_employee_id', 'organization_id', 'visitor_id'],
      include: [{ association: 'visitor', attributes: ['name'], required: false }],
    });

    await Visit.update(
      { status: 'completed', checked_out_at: new Date() },
      { where: { id: visitId } }
    );

    await AuditLog.create({
      action: 'visitor_checkout',
      entity_type: 'visit',
      entity_id: visitId,
      metadata: { source: 'temi' },
    });

    const visitorName = visit?.visitor?.name ?? 'Visitor';
    await notifyVisitCompleted({
      employeeId: visit?.host_employee_id,
      organizationId: visit?.organization_id,
      visitId,
      visitorName,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

// POST /temi/error — Temi reports an error event
const reportError = async (req, res, next) => {
  try {
    const { serial, errorType, visitId, message } = req.body;

    await AuditLog.create({
      action: 'temi_error',
      entity_type: 'temi_robot',
      entity_id: null,
      metadata: { serial, errorType, visitId, message },
    });

    if (io) {
      io.to('admin').emit(SOCKET_EVENTS.TEMI_ERROR, { serial, errorType, visitId, message });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

// POST /temi/service-request — Temi voice command triggers a service request
const createServiceRequest = async (req, res, next) => {
  try {
    const { serial, item = 'refreshment' } = req.body;
    if (!serial) return res.status(400).json({ error: 'serial required' });

    const robot = await TemiRobot.findOne({
      where: { serial_number: serial },
      attributes: ['organization_id'],
      raw: true,
    });

    const request = await ServiceRequest.create({
      serial,
      organization_id: robot?.organization_id ?? null,
      item,
      status: 'pending',
    });

    await AuditLog.create({
      action:      'service_requested',
      entity_type: 'temi_service_request',
      entity_id:   null,
      metadata:    { serial, item, requestId: request.id },
    });

    await notifyServiceRequest({
      serial,
      item,
      organizationId: robot?.organization_id ?? null,
      requestId:      request.id,
    });

    res.status(201).json({ ok: true, requestId: request.id });
  } catch (err) {
    next(err);
  }
};

// GET /temi/service-requests — admin/sub_admin fetches pending requests for their org
const getServiceRequests = async (req, res, next) => {
  try {
    const { organizationId, status } = req.query;
    const where = {};
    if (organizationId) where.organization_id = organizationId;
    if (status)         where.status           = status;

    const requests = await ServiceRequest.findAll({
      where,
      order:   [['created_at', 'DESC']],
      limit:   100,
      include: [{
        model:      User,
        as:         'fulfilledBy',
        attributes: ['id', 'name'],
        required:   false,
      }],
    });

    res.json(requests);
  } catch (err) {
    next(err);
  }
};

// PATCH /temi/service-requests/:id — mark fulfilled or dismissed
const updateServiceRequest = async (req, res, next) => {
  try {
    const { id }       = req.params;
    const { status }   = req.body;
    const userId       = req.user?.id ?? null;

    if (!['fulfilled', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'status must be fulfilled or dismissed' });
    }

    const updates = { status };
    if (status === 'fulfilled') {
      updates.fulfilled_by = userId;
      updates.fulfilled_at = new Date();
    }

    const [count] = await ServiceRequest.update(updates, { where: { id } });
    if (!count) return res.status(404).json({ error: 'Request not found' });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  heartbeat, getConfig, getLocations, syncLocations, checkoutVisit, reportError,
  createServiceRequest, getServiceRequests, updateServiceRequest,
  setIo,
};
