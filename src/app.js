require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs   = require('fs');
const { createServer } = require('http');
const { Server } = require('socket.io');

const jwt = require('jsonwebtoken');
const authRoutes = require('./routes/auth');
const visitorRoutes = require('./routes/visitor');
const employeeRoutes = require('./routes/employee');
const adminRoutes = require('./routes/admin');
const qrRoutes = require('./routes/qr');
const temiRoutes = require('./routes/temi');
const otpRoutes = require('./routes/otp');
const platformRoutes = require('./routes/platform');
const organizationRoutes = require('./routes/organization');
const clientRoutes = require('./routes/client');
const receptionistRoutes = require('./routes/receptionist');
const errorHandler = require('./middleware/errorHandler');
const { initializeSocket } = require('./services/notificationService');
const { setIo } = require('./controllers/temiController');
const { setIo: setQrIo } = require('./controllers/qrController');
const { setIo: setOtpIo } = require('./controllers/otpController');
const { setAdminIo } = require('./controllers/adminController');

const app = express();
const httpServer = createServer(app);

// Trust Codespaces / reverse proxy headers (fixes rate-limit X-Forwarded-For error)
app.set('trust proxy', 1);

const isAllowedOrigin = (origin) => {
  // Allow no-origin requests (mobile apps, Postman, server-to-server)
  // and React Native's literal "null" origin string
  if (!origin || origin === 'null') return true;
  const allowed = [
    process.env.FRONTEND_URL,
    'http://localhost:5173',
    'http://localhost:3000',
  ].filter(Boolean);
  return (
    allowed.includes(origin) ||
    /^https?:\/\/192\.168\.\d+\.\d+:\d+$/.test(origin) ||
    /^https?:\/\/10\.\d+\.\d+\.\d+:\d+$/.test(origin) ||
    /\.app\.github\.dev$/.test(origin) ||
    /\.github\.dev$/.test(origin)
  );
};

const io = new Server(httpServer, {
  cors: {
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Increase ping timeouts for mobile clients in background
  pingTimeout: 60000,
  pingInterval: 25000,
  // Allow connection recovery after brief disconnects
  connectionStateRecovery: { maxDisconnectionDuration: 120000 },
});

// Socket auth middleware — accepts JWT token sent as auth.token or query.token.
// Kiosk/visitor connections without a token are allowed (role = 'visitor').
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) {
    socket.data.role = 'visitor';
    return next();
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.data.userId = decoded.id ?? decoded.userId;
    socket.data.role   = decoded.role;
    socket.data.organizationId = decoded.organizationId ?? null;
    next();
  } catch {
    // Allow connection but without authenticated identity
    socket.data.role = 'visitor';
    next();
  }
});

initializeSocket(io);
setIo(io);
setQrIo(io);
setOtpIo(io);
setAdminIo(io);

const corsOptions = {
  origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma'],
};

// Ensure uploads directory exists at startup (avoids first-request creation race)
const UPLOADS_DIR = path.join(__dirname, '../uploads/visitor-photos');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use(helmet({ crossOriginEmbedderPolicy: false }));
app.options('*', cors(corsOptions));   // handle preflight for all routes
app.use(cors(corsOptions));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use('/api/', apiLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, '../uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/visitor', visitorRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/temi', temiRoutes);
app.use('/api/otp', otpRoutes);
app.use('/api/platform', platformRoutes);
app.use('/api/org', organizationRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/receptionist', receptionistRoutes);

app.get('/health', (req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'Temi VMS API' })
);

app.use(errorHandler);

module.exports = { app, httpServer, io };
