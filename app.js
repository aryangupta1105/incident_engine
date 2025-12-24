const express = require('express');
const healthRoutes = require('./routes/health.routes');
const incidentRoutes = require('./routes/incident.routes');
const messageRoutes = require('./routes/message.routes');
const authRoutes = require('./routes/authRoutes');
const calendarRoutes = require('./routes/calendarRoutes');
const meetingRoutes = require('./routes/meetingRoutes');

const app = express();

// Middleware
app.use(express.json());

// Request logging middleware (production-safe)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Routes
app.use('/health', healthRoutes);
app.use('/incidents', incidentRoutes);
app.use('/message', messageRoutes);
app.use('/auth', authRoutes);
app.use('/calendar', calendarRoutes);
app.use('/meetings', meetingRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    method: req.method
  });
});

// Global error handler (catch-all)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    details: process.env.NODE_ENV === 'production' ? undefined : err.stack
  });
});

module.exports = app;
