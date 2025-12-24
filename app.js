const express = require('express');
const healthRoutes = require('./routes/health.routes');
const incidentRoutes = require('./routes/incident.routes');
const messageRoutes = require('./routes/message.routes');
const authRoutes = require('./routes/authRoutes');
const calendarRoutes = require('./routes/calendarRoutes');
const meetingRoutes = require('./routes/meetingRoutes');
const { router: twilioRoutes, setTwiMLGenerator } = require('./routes/twilioRoutes');
const { generateMeetingReminderTwiML } = require('./services/autoCallService');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Required for Twilio webhooks

// Request logging middleware (production-safe)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Initialize Twilio routes with TwiML generator
setTwiMLGenerator(generateMeetingReminderTwiML);

// Routes
app.use('/health', healthRoutes);
app.use('/incidents', incidentRoutes);
app.use('/message', messageRoutes);
app.use('/auth', authRoutes);
app.use('/calendar', calendarRoutes);
app.use('/meetings', meetingRoutes);
app.use('/twilio', twilioRoutes); // Twilio webhook routes for voice/reminder and call/status

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
