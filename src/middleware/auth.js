const jwt = require('jsonwebtoken');
const { User } = require('../models');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findByPk(decoded.userId, {
      attributes: ['id', 'email', 'name', 'role', 'department', 'location_id',
        'is_active', 'organization_id', 'branch_id'],
      raw: true,
    });

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const authenticateTemi = (req, res, next) => {
  const apiKey = req.headers['x-temi-api-key'];
  if (!apiKey || apiKey !== process.env.TEMI_API_KEY) {
    return res.status(401).json({ error: 'Invalid Temi API key' });
  }
  next();
};

module.exports = { authenticate, authenticateTemi };
