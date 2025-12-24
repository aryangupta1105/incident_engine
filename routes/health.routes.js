const express = require('express');
const router = express.Router();
const pool = require('../db');

/**
 * GET /health
 * 
 * Health check endpoint that validates:
 * 1. Server is running
 * 2. Database connection is active
 * 
 * Returns:
 * {
 *   "status": "ok",
 *   "db": "connected",
 *   "timestamp": "<ISO string>"
 * }
 * 
 * Status codes:
 * - 200: Healthy
 * - 503: Database unreachable
 */
router.get('/', async (req, res) => {
  try {
    // Execute lightweight query to verify DB connectivity
    const result = await pool.query('SELECT 1 as ping');
    
    if (!result || result.rowCount !== 1) {
      throw new Error('DB query returned unexpected result');
    }

    res.status(200).json({
      status: 'ok',
      db: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Health check failed:', err.message);
    
    res.status(503).json({
      status: 'error',
      db: 'unreachable',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
