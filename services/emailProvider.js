/**
 * Email Provider
 * 
 * Abstraction layer for sending emails via SMTP/Nodemailer.
 * Channel-agnostic provider that focuses on alert delivery only.
 * No database writes, no business logic, no retry loops.
 * Throws on failure for caller to handle.
 */

const nodemailer = require('nodemailer');

// Configuration from environment
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT || '1025'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
};

const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@incidentmanagement.com';

// Lazy-initialize transporter
let transporter = null;

/**
 * Get or initialize the email transporter
 * 
 * For testing/development, creates a test account if SMTP connection fails.
 * For production, requires valid SMTP credentials.
 * 
 * @returns {object} Nodemailer transporter instance
 */
function getTransporter() {
  if (!transporter) {
    // In test mode, use nullTransport (doesn't actually send, useful for CI/testing)
    if (process.env.NODE_ENV === 'test' || process.env.SMTP_TEST_MODE === 'true') {
      transporter = nodemailer.createTransport({
        jsonTransport: true
      });
    } else {
      // Production: use configured SMTP
      transporter = nodemailer.createTransport(SMTP_CONFIG);
    }
  }
  return transporter;
}

/**
 * Send an alert email
 * 
 * This is the main public method for alert delivery.
 * Throws on failure - caller is responsible for error handling and retry logic.
 * 
 * @param {object} options
 * @param {object} options.user - User object with { id, email }
 * @param {object} options.alert - Alert object with { id, alert_type, category, scheduled_at }
 * @param {object} options.event - Event object (optional) with { id, title, description, occurred_at }
 * @param {string} options.subject - Email subject
 * @param {string} options.body - Email body (plain text or minimal HTML)
 * @returns {Promise<object>} Nodemailer response
 * @throws {Error} On SMTP failure, DNS failure, validation error
 */
async function sendAlertEmail(options) {
  const {
    user,
    alert,
    event = null,
    subject,
    body
  } = options;

  // Validation
  if (!user || !user.email) {
    throw new Error('User with valid email is required');
  }

  if (!alert) {
    throw new Error('Alert object is required');
  }

  if (!subject || typeof subject !== 'string') {
    throw new Error('Email subject is required');
  }

  if (!body || typeof body !== 'string') {
    throw new Error('Email body is required');
  }

  try {
    const transporter = getTransporter();

    // Log sending attempt (for debugging)
    const userShort = user.id.substring(0, 8);
    const alertRef = alert.id.substring(0, 8);
    console.log(
      `[EMAIL_PROVIDER] Sending alert ${alertRef} to ${user.email} ` +
      `(type=${alert.alert_type}, category=${alert.category})`
    );

    // Send email
    const response = await transporter.sendMail({
      from: EMAIL_FROM,
      to: user.email,
      subject: subject,
      text: body,
      // Include alert metadata as headers for tracking
      headers: {
        'X-Alert-ID': alert.id,
        'X-Alert-Type': alert.alert_type,
        'X-Alert-Category': alert.category,
        'X-User-ID': user.id,
        'X-Event-ID': event ? event.id : 'none'
      }
    });

    console.log(
      `[EMAIL_PROVIDER] Sent successfully: ${user.email} (MessageID=${response.messageId || 'test'})`
    );

    return response;
  } catch (err) {
    console.error(
      `[EMAIL_PROVIDER] Failed to send to ${user.email}:`,
      err.message
    );
    throw err;
  }
}

/**
 * Verify SMTP connection (useful for testing)
 * 
 * @returns {Promise<boolean>} true if connection successful
 */
async function verifyConnection() {
  try {
    const transporter = getTransporter();
    await transporter.verify();
    console.log('[EMAIL_PROVIDER] SMTP connection verified');
    return true;
  } catch (err) {
    console.error('[EMAIL_PROVIDER] SMTP verification failed:', err.message);
    throw err;
  }
}

/**
 * Close SMTP connection (for graceful shutdown)
 * 
 * @returns {Promise<void>}
 */
async function closeConnection() {
  if (transporter) {
    try {
      await transporter.close();
      console.log('[EMAIL_PROVIDER] SMTP connection closed');
      transporter = null;
    } catch (err) {
      console.error('[EMAIL_PROVIDER] Error closing connection:', err.message);
    }
  }
}

module.exports = {
  // Main method
  sendAlertEmail,

  // Connection management
  verifyConnection,
  closeConnection,

  // Configuration
  getConfig: () => ({
    host: SMTP_CONFIG.host,
    port: SMTP_CONFIG.port,
    user: SMTP_CONFIG.auth.user,
    from: EMAIL_FROM
  })
};
