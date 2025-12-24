/**
 * Email Templates
 * 
 * Simple, text-based templates for alert emails.
 * No HTML/styling complexity - plain text is always readable.
 * Extensible for different alert types and categories.
 */

/**
 * Generate email subject line
 * 
 * Different subjects based on alert type and category.
 * TASK 3: Emphasize time urgency and consequence in subject.
 * 
 * @param {string} alertType - Alert type identifier (e.g., MEETING_UPCOMING)
 * @param {string} category - Alert category (e.g., MEETING, FINANCE)
 * @param {object} event - Event object (optional, for context)
 * @returns {string} Email subject line
 */
function generateSubject(alertType, category, event = null) {
  // TASK 3: Calculate time remaining for emotional framing
  let timePhrase = '';
  if (event && event.occurred_at) {
    const now = new Date();
    const meetingTime = new Date(event.occurred_at);
    const minutesRemaining = Math.ceil((meetingTime - now) / 60000);
    
    if (minutesRemaining > 0 && minutesRemaining <= 15) {
      timePhrase = ` in ${minutesRemaining} minutes`;
    }
  }

  const templates = {
    // Meeting-related alerts
    'MEETING_UPCOMING_EMAIL': {
      subject: `Your meeting starts${timePhrase} — don't let it slip`
    },
    'MEETING_URGENT_MESSAGE': {
      subject: `Urgent: Your meeting starts${timePhrase} — missing it could cost you`
    },
    'MEETING_STARTING_SOON': {
      subject: 'Meeting Starting Soon - Join Now'
    },
    'MEETING_DELAYED': {
      subject: 'Meeting Delayed - New Time Updated'
    },
    'MEETING_CANCELLED': {
      subject: 'Meeting Cancelled'
    },

    // Finance-related alerts
    'PAYMENT_DUE': {
      subject: 'Payment Due Reminder'
    },
    'INVOICE_OVERDUE': {
      subject: 'Invoice Overdue Notice'
    },
    'BUDGET_THRESHOLD': {
      subject: 'Budget Threshold Exceeded'
    },

    // System alerts
    'SYSTEM_MAINTENANCE': {
      subject: 'Scheduled System Maintenance'
    },
    'SERVICE_DEGRADED': {
      subject: 'Service Degradation Alert'
    },

    // Generic fallback
    'GENERIC': {
      subject: `Alert: ${category}`
    }
  };

  const template = templates[alertType] || templates['GENERIC'];
  return template.subject;
}

/**
 * Generate email body
 * 
 * Creates simple, clear text bodies for alerts.
 * TASK 3: Include meeting title, time, and time remaining with emotional framing.
 * 
 * @param {object} options
 * @param {string} options.alertType - Alert type identifier
 * @param {string} options.category - Alert category
 * @param {object} options.event - Event object (optional)
 * @param {object} options.alert - Alert object with scheduled_at
 * @returns {string} Email body (plain text)
 */
function generateBody(options) {
  const {
    alertType,
    category,
    event = null,
    alert
  } = options;

  // Get template for this alert type
  let body = getBodyTemplate(alertType, category, event);

  // Add alert metadata
  body += '\n\n---\n';
  body += `Alert Type: ${alertType}\n`;
  body += `Category: ${category}\n`;
  body += `Sent: ${new Date().toISOString()}\n`;

  if (event) {
    body += `Event: ${event.title || event.id}\n`;
    if (event.description) {
      body += `Description: ${event.description.substring(0, 200)}\n`;
    }
  }

  body += '\n(This is an automated alert from Incident Management System)';

  return body;
}

/**
 * Get body template for specific alert type
 * 
 * TASK 3: Include meeting title, time, time remaining, and emotional framing.
 * 
 * @param {string} alertType - Alert type
 * @param {string} category - Alert category
 * @param {object} event - Event object (optional)
 * @returns {string} Email body
 */
function getBodyTemplate(alertType, category, event) {
  // TASK 4: Extract meeting title from event.payload (not event.title)
  const eventTitle = (event && event.payload && event.payload.title) || 'An important event';
  const eventTime = event && event.occurred_at 
    ? new Date(event.occurred_at).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        meridiem: 'short'
      })
    : 'scheduled time';

  // TASK 3: Calculate minutes remaining for emotional framing
  let minutesRemaining = '';
  if (event && event.occurred_at) {
    const now = new Date();
    const meetingTime = new Date(event.occurred_at);
    const minutes = Math.ceil((meetingTime - now) / 60000);
    if (minutes > 0) {
      minutesRemaining = ` in ${minutes} minute${minutes > 1 ? 's' : ''}`;
    }
  }

  const templates = {
    // TASK 3: Enhanced meeting templates with title, time, and emotional framing
    'MEETING_UPCOMING_EMAIL': () => `You have a meeting '${eventTitle}' starting at ${eventTime}${minutesRemaining}.

We're reminding you early so you don't have to rush or regret missing it later.

Please review the meeting details and ensure you're prepared to attend.`,
    
    'MEETING_URGENT_MESSAGE': () => `URGENT: Your meeting '${eventTitle}' starts at ${eventTime}${minutesRemaining}.

This is important—missing this meeting could cost you time, money, or relationships. 

Please join now if you haven't already.`,
    
    'MEETING_STARTING_SOON': () => `Your meeting '${eventTitle}' is starting now!

Time: ${eventTime}

Please join immediately.`,
    
    'MEETING_DELAYED': () => `Your meeting '${eventTitle}' has been delayed.

Please check your calendar for the updated time.`,
    
    'MEETING_CANCELLED': () => `Your meeting '${eventTitle}' has been cancelled.

No further action is required.`,

    // Finance templates
    'PAYMENT_DUE': () => `Payment is due.

Please process the payment by the due date.`,
    
    'INVOICE_OVERDUE': () => `An invoice is overdue.

Please settle the outstanding amount immediately.`,
    
    'BUDGET_THRESHOLD': () => `Your budget has exceeded the configured threshold.

Please review spending and take appropriate action.`,

    // System templates
    'SYSTEM_MAINTENANCE': () => `Scheduled system maintenance is upcoming.

During this time, the system may be unavailable.

Please plan accordingly.`,
    
    'SERVICE_DEGRADED': () => `We're experiencing service degradation.

Our team is investigating the issue.

We'll update you shortly.`,

    // Generic fallback
    'GENERIC': () => `You have a new alert in the category: ${category}

Please log in to review details.`
  };

  const templateFn = templates[alertType] || templates['GENERIC'];
  return templateFn();
}

/**
 * Create a complete email for an alert
 * 
 * Combines subject and body generation.
 * Useful for the delivery worker.
 * 
 * @param {object} options
 * @param {object} options.alert - Alert object
 * @param {object} options.event - Event object (optional)
 * @returns {object} { subject, body }
 */
function createEmailContent(options) {
  const {
    alert,
    event = null
  } = options;

  // TASK 3: Pass event to subject generation for time-based framing
  const subject = generateSubject(alert.alert_type, alert.category, event);
  const body = generateBody({
    alertType: alert.alert_type,
    category: alert.category,
    event,
    alert
  });

  return {
    subject,
    body
  };
}

module.exports = {
  generateSubject,
  generateBody,
  createEmailContent
};
