const express = require('express');
const router = express.Router();

const messages = require('../data/messages');
const { createEvent } = require('../services/eventService');
const { evaluateEvent } = require('../services/incidentService');

/**
 * POST /message
 * 
 * Ingest a message, create an event, and evaluate for incident creation.
 * 
 * Request body:
 * {
 *   "text": "Payment failed for due date 25-Jan-2024"
 * }
 */
router.post('/', async (req, res) => {
  try {
    const { text } = req.body;

    // Validate input
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: 'text is required and must be a non-empty string'
      });
    }

    const message = {
      id: Date.now(),
      text
    };

    messages.push(message);

    const event = createEvent(message);
    const incident = await evaluateEvent(event);

    res.status(201).json({
      message: 'Message received',
      incident_created: !!incident,
      incident: incident || null
    });
  } catch (err) {
    console.error('Error processing message:', err);
    res.status(500).json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'production' 
        ? 'An error occurred while processing the message' 
        : err.message
    });
  }
});

module.exports = router;
