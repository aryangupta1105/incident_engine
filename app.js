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
// Add URL-encoded parser for Twilio webhook payloads
app.use(express.urlencoded({ extended: true }));

// Initialize Twilio routes with TwiML generator
const authToken = process.env.TWILIO_AUTH_TOKEN;
if (authToken) {
  setTwiMLGenerator(generateMeetingReminderTwiML, authToken);
}

// ⚠️ CRITICAL STARTUP WARNING: Twilio Configuration Required ⚠️
// This warning is logged here to ensure it's visible at server startup
console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║ ⚠️  CRITICAL: TWILIO CONFIGURATION REQUIRED                               ║
╠════════════════════════════════════════════════════════════════════════════╣
║ For voice reminders to work, you MUST configure the phone number's Voice ║
║ Webhook in the Twilio Console. This is REQUIRED even when using the       ║
║ calls.create({ url }) API parameter.                                       ║
║                                                                             ║
║ **Why?** Twilio's phone number Voice Webhook config has PRIORITY over     ║
║ the url parameter. If the phone number is misconfigured (pointing to       ║
║ demo.twilio.com, a Studio Flow, or disabled), Twilio will NOT fetch       ║
║ our TwiML, and custom reminders will never execute.                       ║
║                                                                             ║
║ **Required Steps:**                                                        ║
║ 1. Open Twilio Console: https://console.twilio.com/                        ║
║ 2. Go to: Phone Numbers → Manage → Active Numbers                          ║
║ 3. Click the phone number that makes reminder calls                        ║
║ 4. Under "Voice & Fax" section, find "Voice Webhook"                       ║
║ 5. Set it to: ${process.env.PUBLIC_BASE_URL || 'https://your-domain.com'}/twilio/reminder ║
║ 6. Method: POST or GET (both supported)                                    ║
║ 7. Remove any Studio Flow assignment or demo webhook                       ║
║ 8. Save                                                                     ║
║                                                                             ║
║ **Verification:**                                                          ║
║ After configuration, check server logs for:                               ║
║   [TWIML] ✓ WEBHOOK CALLED BY TWILIO - EXECUTION PATH CONFIRMED            ║
║                                                                             ║
║ If this message never appears in logs when a call is placed, the          ║
║ phone number's Voice Webhook is still misconfigured.                      ║
║                                                                             ║
║ Contact: Twilio Support → Phone Number → Voice Settings → Webhooks        ║
╚════════════════════════════════════════════════════════════════════════════╝
`);


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
app.use('/twilio', twilioRoutes);  // Twilio webhook routes

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
