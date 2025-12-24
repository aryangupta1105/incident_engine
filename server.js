const app = require('./app');

const PORT = process.env.PORT || 3000;
let server = null;

// Feature flags
const FEATURE_FLAGS = {
  calendar: process.env.FEATURE_CALENDAR_ENABLED === 'true',
  escalation: process.env.FEATURE_ESCALATION_ENABLED === 'true',
  alerts: process.env.FEATURE_ALERTS_ENABLED !== 'false', // Default: true
  checkin: process.env.FEATURE_CHECKIN_ENABLED === 'true',
  scheduler: process.env.FEATURE_SCHEDULER_ENABLED === 'true'
};

// Lazy load workers only if enabled
let escalationWorker = null;
let calendarScheduler = null;
function getEscalationWorker() {
  if (!escalationWorker && FEATURE_FLAGS.escalation) {
    escalationWorker = require('./workers/escalationWorker');
  }
  return escalationWorker;
}

let alertDeliveryWorker = null;
let alertWorkerCleanup = null;
function getAlertDeliveryWorker() {
  if (!alertDeliveryWorker && FEATURE_FLAGS.alerts) {
    alertDeliveryWorker = require('./workers/alertDeliveryWorker');
  }
  return alertDeliveryWorker;
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal) {
  console.log(`\n[SERVER] Received ${signal}, shutting down gracefully...`);
  
  try {
    // Stop accepting new requests
    if (server) {
      server.close(async () => {
        console.log('[SERVER] HTTP server closed');
        
        // Stop escalation worker if it was started
        try {
          const worker = getEscalationWorker();
          if (worker) {
            await worker.stop();
          }
        } catch (err) {
          console.error('[SERVER] Error stopping escalation worker:', err.message);
        }

        // Stop alert delivery worker if it was started
        try {
          if (alertWorkerCleanup) {
            alertWorkerCleanup();
          }
        } catch (err) {
          console.error('[SERVER] Error stopping alert delivery worker:', err.message);
        }

        // Stop calendar scheduler if it was started
        try {
          if (calendarScheduler) {
            calendarScheduler.stopScheduler();
          }
        } catch (err) {
          console.error('[SERVER] Error stopping calendar scheduler:', err.message);
        }
        
        process.exit(0);
      });
    }
    
    // Force shutdown after 10 seconds
    setTimeout(() => {
      console.error('[SERVER] Forced shutdown due to timeout');
      process.exit(1);
    }, 10000);
  } catch (err) {
    console.error('[SERVER] Error during shutdown:', err.message);
    process.exit(1);
  }
}

/**
 * Start server and background workers
 */
async function start() {
  try {
    // Log feature flags for operational clarity
    console.log('[SERVER] Feature flags:');
    console.log(`  calendar=${FEATURE_FLAGS.calendar}`);
    console.log(`  escalation=${FEATURE_FLAGS.escalation}`);
    console.log(`  alerts=${FEATURE_FLAGS.alerts}`);
    console.log(`  checkin=${FEATURE_FLAGS.checkin}`);
    console.log(`  scheduler=${FEATURE_FLAGS.scheduler}`);

    // Start escalation worker ONLY if explicitly enabled
    if (FEATURE_FLAGS.escalation) {
      try {
        const worker = getEscalationWorker();
        await worker.start();
        console.log('[SERVER] Escalation worker started');
      } catch (err) {
        console.error('[SERVER] Failed to start escalation worker:', err.message);
        process.exit(1);
      }
    } else {
      console.log('[SERVER] Escalation worker disabled by feature flag');
    }

    // Start alert delivery worker if alerts are enabled
    if (FEATURE_FLAGS.alerts) {
      try {
        const worker = getAlertDeliveryWorker();
        if (worker) {
          // Start with 5 second poll interval (check for pending alerts every 5 seconds)
          alertWorkerCleanup = worker.startWorker({ pollIntervalMs: 5000 });
          console.log('[SERVER] Alert delivery worker started (5s poll interval)');
        }
      } catch (err) {
        console.error('[SERVER] Failed to start alert delivery worker:', err.message);
        process.exit(1);
      }
    } else {
      console.log('[SERVER] Alert delivery worker disabled by feature flag');
    }

    // Start calendar scheduler if enabled
    if (FEATURE_FLAGS.scheduler) {
      try {
        calendarScheduler = require('./workers/calendarScheduler');
        calendarScheduler.startScheduler();
        console.log('[SERVER] Calendar scheduler started');
      } catch (err) {
        console.error('[SERVER] Failed to start calendar scheduler:', err.message);
        process.exit(1);
      }
    } else {
      console.log('[SERVER] Calendar scheduler disabled by feature flag');
    }

    // Start HTTP server
    server = app.listen(PORT, () => {
      console.log(`[SERVER] Incident Engine running on port ${PORT}`);
    });

    // Register graceful shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle unhandled exceptions
    process.on('uncaughtException', (err) => {
      console.error('[SERVER] Uncaught exception:', err);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('[SERVER] Unhandled rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });
  } catch (err) {
    console.error('[SERVER] Startup failed:', err.message);
    process.exit(1);
  }
}

// Start the server
start();
