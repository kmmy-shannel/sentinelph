// services/api/server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');

const { connectDB } = require('./config/db');
const { globalLimiter } = require('./middleware/rateLimiter');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const healthRoutes       = require('./routes/health');
const reportRoutes       = require('./routes/reports');
const blacklistRoutes    = require('./routes/blacklist');
const auditorRoutes      = require('./routes/auditor');
const adminRoutes        = require('./routes/admin');
const authRoutes         = require('./routes/auth');
const superadminRoutes   = require('./routes/superadmin');
const statsRoutes        = require('./routes/stats');
const officerRoutes      = require('./routes/officer');

const statusRoutes = require('./routes/status');
const alertsRoutes = require('./routes/alerts');

const app = express();
const PORT = process.env.PORT || 4000;

// ------------------------------------------------------------------
// Security & parsing middleware
// ------------------------------------------------------------------
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(mongoSanitize());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ------------------------------------------------------------------
// CORS Configuration
// ------------------------------------------------------------------
const allowedOrigins = [
  process.env.CLIENT_ORIGIN_WEB,
  process.env.CLIENT_ORIGIN_MOBILE,
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

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
// 404 + centralized error handler (must be registered last)
// ------------------------------------------------------------------
app.use(notFoundHandler);
app.use(errorHandler);

// ------------------------------------------------------------------
// Boot sequence
// ------------------------------------------------------------------
async function start() {
  try {
    await connectDB();

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