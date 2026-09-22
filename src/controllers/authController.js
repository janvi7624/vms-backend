const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { User, TemiRobot, Room } = require('../models');

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await User.findOne({
      where: { email: email.toLowerCase().trim() },
      attributes: ['id', 'email', 'password_hash', 'name', 'role', 'department', 'designation',
        'phone', 'desk_location', 'location_id', 'is_active', 'organization_id'],
      raw: true,
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, userId: user.id, role: user.role, organizationId: user.organization_id ?? null },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const { password_hash, ...userWithoutPassword } = user;

    res.json({ token, user: userWithoutPassword });
  } catch (err) {
    next(err);
  }
};

const getMe = async (req, res) => {
  res.json({ user: req.user });
};

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const user = await User.findByPk(req.user.id);
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    user.password_hash = await bcrypt.hash(newPassword, 12);
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
};

const register = async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await User.findOne({ where: { email: email.toLowerCase().trim() } });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password_hash,
      phone: phone || null,
      role: 'client',
      is_active: true,
    });

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const { password_hash: _, ...userData } = user.toJSON();
    res.status(201).json({ token, user: userData });
  } catch (err) {
    next(err);
  }
};

// GET /auth/profile — any authenticated user
const getAuthProfile = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'name', 'email', 'phone', 'department', 'designation', 'desk_location', 'role'],
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    next(err);
  }
};

// PUT /auth/profile — any authenticated user; email and password are never allowed
const updateAuthProfile = async (req, res, next) => {
  try {
    const { name, phone, department, designation, desk_location } = req.body;
    const allowed = {};
    if (name          !== undefined && name.trim()) allowed.name          = name.trim();
    if (phone         !== undefined)                allowed.phone         = phone?.trim() || null;
    if (department    !== undefined)                allowed.department    = department?.trim() || null;
    if (designation   !== undefined)                allowed.designation   = designation?.trim() || null;
    if (desk_location !== undefined)                allowed.desk_location = desk_location?.trim() || null;

    if (Object.keys(allowed).length === 0) {
      return res.status(400).json({ error: 'No updatable fields provided' });
    }
    await User.update(allowed, { where: { id: req.user.id } });
    res.json({ message: 'Profile updated' });
  } catch (err) {
    next(err);
  }
};

// GET /auth/locations — any authenticated user; returns org-scoped rooms/destinations
const getAuthLocations = async (req, res, next) => {
  try {
    const orgId = req.user.organization_id;
    if (!orgId) return res.json({ source: 'none', locations: [] });

    const robot = await TemiRobot.findOne({
      where: { organization_id: orgId, link_status: 'linked' },
      attributes: ['saved_locations'],
      raw: true,
    });

    if (robot?.saved_locations?.length) {
      return res.json({ source: 'temi', locations: robot.saved_locations });
    }

    const rooms = await Room.findAll({
      where: { organization_id: orgId },
      attributes: ['name'],
      order: [['name', 'ASC']],
      raw: true,
    });

    return res.json({ source: 'rooms', locations: rooms.map(r => r.name) });
  } catch (err) {
    next(err);
  }
};

const registerDevice = async (req, res, next) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) return res.status(400).json({ error: 'fcmToken required' });
    await User.update({ fcm_token: fcmToken }, { where: { id: req.user.id } });
    res.json({ message: 'Device registered' });
  } catch (err) {
    next(err);
  }
};

// DELETE /auth/account — self-service permanent account deletion (any authenticated role).
// Requires the current password as re-authentication, mirroring changePassword above.
// Hard-deletes the row (same as permanentDeleteEmployee) rather than a soft deactivate,
// since Apple 5.1.1(v) requires the deletion to actually remove the account, not disable it.
const deleteMyAccount = async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Current password is required to delete your account' });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'Account not found' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    // Guard: don't let the last active admin/super_admin of an org (or platform) delete
    // themselves and orphan the organization — mirrors the safety intent of canManage()
    // used by admin employee deletion. Everyone else (employee/receptionist/client) can
    // always self-delete since they don't own org-level administration.
    if (user.role === 'super_admin') {
      const otherSuperAdmins = await User.count({
        where: { role: 'super_admin', is_active: true, id: { [Op.ne]: user.id } },
      });
      if (otherSuperAdmins === 0) {
        return res.status(409).json({
          error: 'You are the only platform super admin. Assign another super admin before deleting this account.',
        });
      }
    } else if (user.role === 'admin' && user.organization_id) {
      const otherOrgAdmins = await User.count({
        where: {
          organization_id: user.organization_id,
          role: { [Op.in]: ['admin', 'sub_admin'] },
          is_active: true,
          id: { [Op.ne]: user.id },
        },
      });
      if (otherOrgAdmins === 0) {
        return res.status(409).json({
          error: 'You are the only admin for your organization. Add another admin before deleting this account.',
        });
      }
    }

    await user.destroy();
    res.json({ message: 'Your account has been permanently deleted' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  login, getMe, changePassword, register, registerDevice, getAuthProfile, updateAuthProfile,
  getAuthLocations, deleteMyAccount,
};
