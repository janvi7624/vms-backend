'use strict';

const { Room } = require('../models');

// GET /admin/rooms
const getRooms = async (req, res, next) => {
  try {
    const rooms = await Room.findAll({
      where: { organization_id: req.user.organization_id },
      order: [['building', 'ASC'], ['floor', 'ASC'], ['name', 'ASC']],
      raw: true,
    });
    res.json(rooms);
  } catch (err) {
    next(err);
  }
};

// POST /admin/rooms
const createRoom = async (req, res, next) => {
  try {
    const { name, floor, building, capacity } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const room = await Room.create({
      organization_id: req.user.organization_id,
      name,
      floor:    floor    || null,
      building: building || null,
      capacity: capacity ? parseInt(capacity) : null,
      is_active: true,
    });
    res.status(201).json(room);
  } catch (err) {
    next(err);
  }
};

// PUT /admin/rooms/:id
const updateRoom = async (req, res, next) => {
  try {
    const room = await Room.findOne({
      where: { id: req.params.id, organization_id: req.user.organization_id },
    });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const { name, floor, building, capacity, is_active } = req.body;
    await room.update({
      name:      name      !== undefined ? name      : room.name,
      floor:     floor     !== undefined ? floor     : room.floor,
      building:  building  !== undefined ? building  : room.building,
      capacity:  capacity  !== undefined ? (capacity ? parseInt(capacity) : null) : room.capacity,
      is_active: is_active !== undefined ? Boolean(is_active) : room.is_active,
    });
    res.json(room);
  } catch (err) {
    next(err);
  }
};

// DELETE /admin/rooms/:id
const deleteRoom = async (req, res, next) => {
  try {
    const deleted = await Room.destroy({
      where: { id: req.params.id, organization_id: req.user.organization_id },
    });
    if (!deleted) return res.status(404).json({ error: 'Room not found' });
    res.json({ message: 'Room deleted' });
  } catch (err) {
    next(err);
  }
};

module.exports = { getRooms, createRoom, updateRoom, deleteRoom };
