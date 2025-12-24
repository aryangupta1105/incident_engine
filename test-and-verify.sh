#!/bin/bash
# Quick Test & Verify Script
# Run this to test the Twilio webhook implementation

echo "=================================="
echo "Twilio Webhook - Quick Test"
echo "=================================="
echo ""

# Check if server is running
echo "[1] Checking if server is running..."
curl -s http://localhost:3000/health > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✓ Server is running on port 3000"
else
    echo "✗ Server is not running. Start with: npm start"
    exit 1
fi

echo ""
echo "[2] Running comprehensive test suite..."
node test-twilio-webhook-complete.js

echo ""
echo "[3] Test Summary"
echo "=================================="
echo "If all 5 tests passed:"
echo "  ✓ Wait 3-5 minutes for a test call"
echo "  ✓ Listen for trial disclaimer + YOUR custom reminder"
echo "  ✓ Check server logs for: [TWIML] Serving reminder..."
echo ""
echo "If tests failed:"
echo "  ✗ Check .env for TWILIO_AUTH_TOKEN"
echo "  ✗ Verify server is running: npm start"
echo "  ✗ Check BASE_URL is set and publicly accessible"
echo ""
echo "Expected Call Message:"
echo '  "Your meeting titled AUTOMATED TEST - Reminder Check'
echo '   starts in 3 minutes at [time]"'
echo "=================================="
