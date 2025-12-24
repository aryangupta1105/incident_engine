/**
 * Rule Configuration
 * 
 * Declarative, category-specific rules that define:
 * - When to schedule alerts
 * - When to create incidents
 * 
 * Rules are condition-action pairs that are evaluated deterministically.
 * This is NOT business logic - it's configuration that drives the rule engine.
 * 
 * Principle: Rules decide. Services act.
 * This config only defines decisions, not side effects.
 */

/**
 * ALERT RULES
 * 
 * Alert rules create awareness-only notifications.
 * They:
 * - Schedule alerts for future delivery
 * - Never create incidents
 * - Never escalate
 * - Use time offsets and event payload conditions
 */

const ALERT_RULES = {
  /**
   * MEETING alerts (PHASE B: PROGRESSIVE ENFORCEMENT)
   * 
   * Three-stage escalation system:
   * STAGE 1: Email when meeting is 10-15 min away
   * STAGE 2: SMS when meeting is 5 min away
   * STAGE 3: Call when meeting is 2 min away
   * 
   * Each stage fires only once, in order.
   * Later stages do NOT re-trigger earlier stages.
   */
  MEETING: [
    {
      name: 'meeting_email_alert',
      description: 'Email alert 10-15 minutes before meeting',
      enabled: true,
      stage: 1,
      conditions: [
        {
          field: 'payload.status',
          operator: 'equals',
          value: 'SCHEDULED'
        },
        {
          field: 'occurred_at',
          operator: 'exists'
        }
      ],
      alert: {
        alertType: 'MEETING_UPCOMING_EMAIL',
        offsetMinutes: -12, // Trigger 12 min before (within 10-15 min window)
        description: 'Meeting starting soon — email alert',
        channel: 'EMAIL',
        subject: 'Your meeting starts soon — just a heads up',
        message: 'You have a meeting coming up shortly. A small nudge now can save you stress, time, or awkward recovery later.'
      }
    },
    {
      name: 'meeting_sms_alert',
      description: 'SMS/WhatsApp alert 5 minutes before meeting',
      enabled: true,
      stage: 2,
      conditions: [
        {
          field: 'payload.status',
          operator: 'equals',
          value: 'SCHEDULED'
        },
        {
          field: 'occurred_at',
          operator: 'exists'
        }
      ],
      alert: {
        alertType: 'MEETING_URGENT_MESSAGE',
        offsetMinutes: -5, // Trigger 5 min before
        description: 'Meeting starting in 5 minutes — SMS alert',
        channel: 'SMS',
        message: 'Your meeting starts in 5 minutes. Just checking so you don\'t miss something important.'
      }
    },
    {
      name: 'meeting_call_alert',
      description: 'Auto-call 2 minutes before meeting',
      enabled: true,
      stage: 3,
      conditions: [
        {
          field: 'payload.status',
          operator: 'equals',
          value: 'SCHEDULED'
        },
        {
          field: 'occurred_at',
          operator: 'exists'
        }
      ],
      alert: {
        alertType: 'MEETING_CRITICAL_CALL',
        offsetMinutes: -2, // Trigger 2 min before (CRITICAL WINDOW)
        description: 'Meeting starting in 2 minutes — auto-call',
        channel: 'CALL',
        message: 'Hi, this is SaveHub. Your meeting is about to start. We\'re calling because missing this could cost you time, money, or reputation. Please join if you haven\'t already.',
        maxRetries: 1, // Max 1 retry on failure
        timeout: 45000 // 45 second timeout
      }
    },
    {
      name: 'meeting_missed',
      description: 'Alert if meeting was missed (grace period 5 min)',
      enabled: true,
      stage: 4,
      conditions: [
        {
          field: 'payload.status',
          operator: 'equals',
          value: 'MISSED'
        }
      ],
      alert: {
        alertType: 'MEETING_MISSED',
        offsetMinutes: 0, // Schedule immediately after detection
        description: 'Meeting was missed — incident created',
        channel: 'EMAIL'
      }
    }
  ],

  /**
   * FINANCE alerts
   * 
   * When a FINANCE event occurs, alert user about payment/balance changes
   */
  FINANCE: [
    {
      name: 'payment_due_soon',
      description: 'Alert 3 days before payment is due',
      enabled: true,
      conditions: [
        {
          field: 'payload.type',
          operator: 'equals',
          value: 'PAYMENT_DUE'
        }
      ],
      alert: {
        alertType: 'PAYMENT_DUE_SOON',
        offsetMinutes: -(3 * 24 * 60), // 3 days before
        description: 'Payment due in 3 days'
      }
    },
    {
      name: 'payment_overdue',
      description: 'Alert immediately if payment is overdue',
      enabled: true,
      conditions: [
        {
          field: 'payload.status',
          operator: 'equals',
          value: 'OVERDUE'
        }
      ],
      alert: {
        alertType: 'PAYMENT_OVERDUE',
        offsetMinutes: 0,
        description: 'Payment is overdue'
      }
    }
  ],

  /**
   * HEALTH alerts
   * 
   * When a HEALTH event occurs, alert user about medication, appointments, etc.
   */
  HEALTH: [
    {
      name: 'medication_time',
      description: 'Alert when it\'s time to take medication',
      enabled: true,
      conditions: [
        {
          field: 'payload.type',
          operator: 'equals',
          value: 'MEDICATION_REMINDER'
        }
      ],
      alert: {
        alertType: 'MEDICATION_TIME',
        offsetMinutes: 0,
        description: 'Time to take your medication'
      }
    },
    {
      name: 'appointment_approaching',
      description: 'Alert 1 hour before appointment',
      enabled: true,
      conditions: [
        {
          field: 'payload.type',
          operator: 'equals',
          value: 'APPOINTMENT'
        }
      ],
      alert: {
        alertType: 'APPOINTMENT_APPROACHING',
        offsetMinutes: -60,
        description: 'Your appointment is in 1 hour'
      }
    }
  ],

  /**
   * DELIVERY alerts
   * 
   * When a DELIVERY event occurs, alert user about package/order status
   */
  DELIVERY: [
    {
      name: 'delivery_arriving',
      description: 'Alert when delivery is arriving soon',
      enabled: true,
      conditions: [
        {
          field: 'payload.status',
          operator: 'equals',
          value: 'ARRIVING_SOON'
        }
      ],
      alert: {
        alertType: 'DELIVERY_ARRIVING',
        offsetMinutes: 0,
        description: 'Your delivery is arriving soon'
      }
    },
    {
      name: 'delivery_delayed',
      description: 'Alert if delivery is delayed',
      enabled: true,
      conditions: [
        {
          field: 'payload.status',
          operator: 'equals',
          value: 'DELAYED'
        }
      ],
      alert: {
        alertType: 'DELIVERY_DELAYED',
        offsetMinutes: 0,
        description: 'Your delivery is delayed'
      }
    }
  ],

  /**
   * SECURITY alerts
   * 
   * When a SECURITY event occurs, alert user immediately
   */
  SECURITY: [
    {
      name: 'security_warning',
      description: 'Alert on any security event',
      enabled: true,
      conditions: [
        {
          field: 'payload.event_type',
          operator: 'exists'
        }
      ],
      alert: {
        alertType: 'SECURITY_WARNING',
        offsetMinutes: 0,
        description: 'Security alert'
      }
    }
  ],

  /**
   * OTHER alerts
   * 
   * Generic alerts for uncategorized events
   */
  OTHER: [
    {
      name: 'generic_alert',
      description: 'Generic alert for OTHER category events',
      enabled: true,
      conditions: [
        {
          field: 'type',
          operator: 'exists'
        }
      ],
      alert: {
        alertType: 'GENERIC_ALERT',
        offsetMinutes: 0,
        description: 'New event'
      }
    }
  ]
};

/**
 * INCIDENT RULES
 * 
 * Incident rules create incident records for high-impact situations.
 * They are STRICT - incidents should be rare and reserved for serious conditions.
 * 
 * Rules:
 * - Be binary (match or don't match)
 * - Be conservative (only create incidents for serious conditions)
 * - Never escalate
 * - Never resolve
 * - Only set initial severity/consequence
 */

const INCIDENT_RULES = {
  /**
   * MEETING incidents
   * 
   * Create incidents only for serious meeting problems:
   * - Chronic missed meetings (after multiple alerts)
   * - Critical business meeting (flagged by user)
   */
  MEETING: {
    enabled: false, // Disabled by default - meeting issues are handled by alerts
    trigger: {
      name: 'meeting_critical',
      description: 'Create incident for critical meetings that are missed',
      conditions: [
        {
          field: 'payload.status',
          operator: 'equals',
          value: 'MISSED'
        },
        {
          field: 'payload.is_critical',
          operator: 'equals',
          value: true
        }
      ]
    },
    incident: {
      severity: 'HIGH',
      consequence: 'BUSINESS_IMPACT',
      type: 'MEETING_MISSED_CRITICAL'
    }
  },

  /**
   * FINANCE incidents
   * 
   * Create incidents for significant financial problems:
   * - Payment overdue beyond grace period
   * - Large payment amounts failed
   */
  FINANCE: {
    enabled: true,
    trigger: {
      name: 'payment_failed_critical',
      description: 'Create incident for critical payment failures',
      conditions: [
        {
          field: 'payload.status',
          operator: 'equals',
          value: 'FAILED'
        },
        {
          field: 'payload.amount_usd',
          operator: 'greater_than',
          value: 5000
        }
      ]
    },
    incident: {
      severity: 'HIGH',
      consequence: 'FINANCIAL_IMPACT',
      type: 'PAYMENT_FAILED_LARGE'
    }
  },

  /**
   * HEALTH incidents
   * 
   * Create incidents for health emergencies:
   * - Medication interactions
   * - Urgent appointment cancellations
   * - Emergency flags from provider
   */
  HEALTH: {
    enabled: true,
    trigger: {
      name: 'health_emergency',
      description: 'Create incident for health emergencies',
      conditions: [
        {
          field: 'payload.urgency',
          operator: 'equals',
          value: 'EMERGENCY'
        },
        {
          field: 'payload.type',
          operator: 'not_equals',
          value: 'ROUTINE_REMINDER'
        }
      ]
    },
    incident: {
      severity: 'CRITICAL',
      consequence: 'HEALTH_RISK',
      type: 'HEALTH_EMERGENCY'
    }
  },

  /**
   * DELIVERY incidents
   * 
   * Create incidents for delivery problems:
   * - Lost packages
   * - Delivery attempts exceeded
   */
  DELIVERY: {
    enabled: true,
    trigger: {
      name: 'delivery_lost',
      description: 'Create incident for lost deliveries',
      conditions: [
        {
          field: 'payload.status',
          operator: 'equals',
          value: 'LOST'
        }
      ]
    },
    incident: {
      severity: 'MEDIUM',
      consequence: 'ORDER_FULFILLMENT',
      type: 'DELIVERY_LOST'
    }
  },

  /**
   * SECURITY incidents
   * 
   * Create incidents for security threats:
   * - Suspicious login attempts
   * - Unauthorized access detected
   */
  SECURITY: {
    enabled: true,
    trigger: {
      name: 'unauthorized_access',
      description: 'Create incident for unauthorized access attempts',
      conditions: [
        {
          field: 'payload.event_type',
          operator: 'equals',
          value: 'UNAUTHORIZED_ACCESS'
        }
      ]
    },
    incident: {
      severity: 'CRITICAL',
      consequence: 'SECURITY_BREACH',
      type: 'UNAUTHORIZED_ACCESS'
    }
  },

  /**
   * OTHER incidents
   * 
   * No automatic incidents for OTHER category
   * Must be configured per use case
   */
  OTHER: {
    enabled: false,
    trigger: null
  }
};

/**
 * POST-INCIDENT HOOKS (STUB)
 * 
 * These are placeholder functions for future STEP 7.
 * They define what happens AFTER an incident is created.
 * 
 * Currently stubbed - no implementation.
 * Will support: escalation, notifications, automations, etc.
 */

const POST_INCIDENT_HOOKS = {
  /**
   * After incident is created, optionally:
   * - Schedule escalation (STEP 7)
   * - Notify stakeholders (future)
   * - Trigger automation (future)
   */
  stub: 'Reserved for STEP 7'
};

/**
 * CONDITION OPERATORS
 * 
 * Defines all supported condition evaluation operators
 */

const CONDITION_OPERATORS = {
  // Existence checks
  'exists': (value) => value !== undefined && value !== null,
  'not_exists': (value) => value === undefined || value === null,

  // Equality
  'equals': (value, expected) => value === expected,
  'not_equals': (value, expected) => value !== expected,

  // Comparison
  'greater_than': (value, expected) => value > expected,
  'less_than': (value, expected) => value < expected,
  'greater_than_or_equals': (value, expected) => value >= expected,
  'less_than_or_equals': (value, expected) => value <= expected,

  // String operations
  'contains': (value, expected) => String(value).includes(expected),
  'not_contains': (value, expected) => !String(value).includes(expected),
  'starts_with': (value, expected) => String(value).startsWith(expected),
  'ends_with': (value, expected) => String(value).endsWith(expected),

  // Array operations
  'in_list': (value, expectedList) => expectedList.includes(value),
  'not_in_list': (value, expectedList) => !expectedList.includes(value)
};

module.exports = {
  ALERT_RULES,
  INCIDENT_RULES,
  POST_INCIDENT_HOOKS,
  CONDITION_OPERATORS
};
