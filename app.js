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
║ ⚠️  CRITICAL: TWILIO VOICE REMINDERS REQUIRE TWO CONFIGURATIONS           ║
╠════════════════════════════════════════════════════════════════════════════╣
║                                                                             ║
║ **REQUIREMENT 1: Phone Number Voice Webhook**                              ║
║                                                                             ║
║ Set the Voice Webhook in Twilio Console to: /twilio/voice/reminder         ║
║                                                                             ║
║ **REQUIREMENT 2: Use Purchased Twilio Number as Caller ID**                ║
║                                                                             ║
║ Voice calls MUST originate from the purchased Twilio phone number.         ║
║ No verified personal numbers. No dev fallback. The exact phone number.     ║
║                                                                             ║
║ **WHY BOTH ARE MANDATORY:**                                                ║
║                                                                             ║
║ Twilio's phone number Voice Webhook config has PRIORITY over the url       ║
║ parameter in calls.create(). This is intentional: the phone number is      ║
║ a resource, and only the purchased Twilio number has Voice Webhook        ║
║ settings. Using any other number as `from` causes Twilio to:              ║
║                                                                             ║
║   • Ignore the phone number's Voice Webhook config                         ║
║   • Ignore the url parameter in calls.create()                            ║
║   • Play the trial disclaimer                                             ║
║   • Hang up (custom TwiML never fetched)                                   ║
║                                                                             ║
║ **SYMPTOM OF MISSING CONFIG:**                                            ║
║   Calls connect, disclaimer plays, custom reminder NEVER plays             ║
║   Server logs: [TWILIO][CRITICAL] webhook NEVER hit                       ║
║                                                                             ║
║ **SETUP STEPS:**                                                           ║
║                                                                             ║
║ 1. Open Twilio Console: https://console.twilio.com/                        ║
║ 2. Go to: Phone Numbers → Manage → Active Numbers                          ║
║ 3. Click your Twilio phone number                                          ║
║ 4. Under "Voice & Fax" → "Voice Webhook"                                   ║
║ 5. Set to: ${process.env.PUBLIC_BASE_URL || 'https://your-domain.com'}/twilio/voice/reminder ║
║ 6. Method: POST or GET                                                     ║
║ 7. Remove any Studio Flow or demo webhook                                  ║
║ 8. Save                                                                     ║
║                                                                             ║
║ **VERIFICATION:**                                                          ║
║ Successful configuration produces logs:                                    ║
║   [TWIML] ✓ WEBHOOK CALLED BY TWILIO - EXECUTION PATH CONFIRMED            ║
║   [TWIML] ✓ EXECUTING REMINDER                                             ║
║   [TWIML] Meeting: "Your Meeting Title"                                    ║
║                                                                             ║
║ If NOT seen: webhook config still missing or from number is wrong          ║
║                                                                             ║
║ **CODE ENFORCEMENT:**                                                      ║
║ - alertDeliveryWorker: Removes dev fallback (hard fail if no user phone)   ║
║ - autoCallService: Enforces from = TWILIO_PHONE_NUMBER (fatal validation)  ║
║ - 5-sec self-diagnostic: Detects non-execution and explains root cause     ║
║                                                                             ║
║ Contact: Twilio Console → Phone Numbers → Active Numbers → Voice Settings  ║
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
