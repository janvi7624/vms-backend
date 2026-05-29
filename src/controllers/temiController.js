const { col } = require('sequelize');
const { TemiRobot, Visit, AuditLog, Location } = require('../models');

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

    // Notify admin dashboard of location update
    if (io) io.to('admin').emit('temi:locations_synced', { serial, locations });

    console.log(`[Temi ${serial}] Synced ${locations.length} locations:`, locations);
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

    if (io) {
      io.to('admin').emit('visit:completed', { visitId });
    }

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
      io.to('admin').emit('temi:error', { serial, errorType, visitId, message });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

module.exports = { heartbeat, getConfig, getLocations, syncLocations, checkoutVisit, reportError, setIo };
