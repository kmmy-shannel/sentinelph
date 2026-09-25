// services/api/server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');

const { connectDB } = require('./config/db');
const { initFirebase } = require('./config/firebase');
const { globalLimiter } = require('./middleware/rateLimiter');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const healthRoutes        = require('./routes/health');
const reportRoutes        = require('./routes/reports');
const blacklistRoutes     = require('./routes/blacklist');
const auditorRoutes       = require('./routes/auditor');
const adminRoutes         = require('./routes/admin');
const authRoutes          = require('./routes/auth');
const superadminRoutes    = require('./routes/superadmin');
const statsRoutes         = require('./routes/stats');
const officerRoutes       = require('./routes/officer');
const notificationsRoutes = require('./routes/notifications');
const accountRoutes       = require('./routes/account');

const statusRoutes = require('./routes/status');
const alertsRoutes = require('./routes/alerts');

const app = express();
const PORT = process.env.PORT || 4000;

// ------------------------------------------------------------------
// CORS Configuration
// ------------------------------------------------------------------
const allowedOrigins = [
  'https://sentinelph-web-gamma.vercel.app',
  ...(process.env.CLIENT_ORIGIN_WEB || '').split(','),
  ...(process.env.CLIENT_ORIGIN_MOBILE || '').split(','),
]
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

const vercelPattern = /^https:\/\/sentinelph-[a-z0-9-]+\.vercel\.app$/;
const localPattern = /^http:\/\/localhost:\d+$/;

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    if (
      allowedOrigins.includes(origin) ||
      vercelPattern.test(origin) ||
      localPattern.test(origin)
    ) {
      return callback(null, true);
    }

    console.warn(`[CORS] Blocked origin: ${origin}`);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// ------------------------------------------------------------------
// Security & parsing middleware
// ------------------------------------------------------------------
app.set('trust proxy', 1);
app.use(cors(corsOptions));
app.use(helmet());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(mongoSanitize());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ------------------------------------------------------------------
// Global rate limiting
// ------------------------------------------------------------------
app.use(globalLimiter);

// ------------------------------------------------------------------
// Routes
// ------------------------------------------------------------------
app.use('/health', healthRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/blacklist', blacklistRoutes);
app.use('/api/v1/auditor', auditorRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/officer', officerRoutes);
app.use('/api/v1/auth', require('./routes/activation'));
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/superadmin', superadminRoutes);
app.use('/api/v1/stats', statsRoutes);
app.use('/api/v1/notifications', notificationsRoutes);
app.use('/api/v1/account', accountRoutes);

app.use('/api/v1/status', statusRoutes);
app.use('/api/v1/alerts', alertsRoutes);

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'SentinelPH API Gateway is running.',
    docs: '/health',
  });
});

// ------------------------------------------------------------------
// 404 + centralized error handler
// ------------------------------------------------------------------
app.use(notFoundHandler);
app.use(errorHandler);

// ------------------------------------------------------------------
// Boot sequence
// ------------------------------------------------------------------
async function start() {
  try {
    await connectDB();

    try {
      initFirebase();
      console.log('[Firebase] Admin SDK initialized.');
    } catch (fbErr) {
      console.error('[Firebase] Admin SDK failed to initialize:', fbErr.message);
      if (process.env.FIREBASE_STRICT === 'true') {
        throw fbErr;
      }
      console.error('[Firebase] Continuing without it. Authenticated routes will return 500 until fixed.');
    }

    app.listen(PORT, () => {
      console.log(`[SentinelPH API] Listening on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
      console.log(`[SentinelPH API] Health check: http://localhost:${PORT}/health`);
    });
  } catch (err) {
    console.error('[SentinelPH API] Fatal error during startup:', err);
    process.exit(1);
  }
}

start();

module.exports = app;