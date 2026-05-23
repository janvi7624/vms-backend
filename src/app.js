require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const visitorRoutes = require('./routes/visitor');
const employeeRoutes = require('./routes/employee');
const adminRoutes = require('./routes/admin');
const qrRoutes = require('./routes/qr');
const temiRoutes = require('./routes/temi');
const otpRoutes = require('./routes/otp');
const platformRoutes = require('./routes/platform');
const organizationRoutes = require('./routes/organization');
const errorHandler = require('./middleware/errorHandler');
const { initializeSocket } = require('./services/notificationService');
const { setIo } = require('./controllers/temiController');
const { setIo: setQrIo } = require('./controllers/qrController');
const { setIo: setOtpIo } = require('./controllers/otpController');

const app = express();
const httpServer = createServer(app);

// Trust Codespaces / reverse proxy headers (fixes rate-limit X-Forwarded-For error)
app.set('trust proxy', 1);

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  const allowed = [
    process.env.FRONTEND_URL,
    'http://localhost:5173',
    'http://localhost:3000',
  ].filter(Boolean);
  return (
    allowed.includes(origin) ||
    /^https?:\/\/192\.168\.\d+\.\d+:\d+$/.test(origin) ||
    /^https?:\/\/10\.\d+\.\d+\.\d+:\d+$/.test(origin) ||
    // Allow all GitHub Codespaces domains
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
});

initializeSocket(io);
setIo(io);
setQrIo(io);
setOtpIo(io);

app.use(helmet({ crossOriginEmbedderPolicy: false }));
app.use(cors({
  origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
  credentials: true,
}));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use('/api/', apiLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/visitor', visitorRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/temi', temiRoutes);
app.use('/api/otp', otpRoutes);
app.use('/api/platform', platformRoutes);
app.use('/api/org', organizationRoutes);

app.get('/health', (req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'Temi VMS API' })
);

app.use(errorHandler);

module.exports = { app, httpServer, io };
