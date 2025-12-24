
# 🧪 QUICK TEST CHECKLIST

## Pre-Test (5 minutes)

- [ ] **ngrok running** → `ngrok http 3000`
  - Copy HTTPS URL (e.g., `https://abc123.ngrok.io`)
  
- [ ] **Update `.env`** → Set `CALL_WEBHOOK_URL=https://abc123.ngrok.io`

- [ ] **Update Twilio Console** → Phone Number Voice Webhook
  - From: `https://demo.twilio.com/welcome/voice/`
  - To: `https://abc123.ngrok.io/twilio/voice/reminder`
  - Method: POST
  - Save

- [ ] **Server running** → `node server.js`

## Automated Validation (1 minute)

```bash
node test-twilio-webhook.js
```

Expected output:
```
✅ TEST 1: Verify Environment Setup
✅ TEST 2: Test HMAC Signature (Security)
✅ TEST 3: Test TwiML Generation
✅ TEST 4: Test Webhook Endpoint (HTTP)
✅ ALL TESTS PASSED
```

If any test fails, fix it before proceeding.

## Call Test (5-10 minutes)

**Terminal 1 (already running):**
```bash
node server.js  # Should be running from Pre-Test
```

**Terminal 2:**
```bash
node test-duplicate-setup.js
```

**Output will show:**
```
✓ Created meeting: 8568cfe9-...
✓ Created MEETING_CRITICAL_CALL
✓ Created MEETING_UPCOMING_EMAIL
✓ Created MEETING_URGENT_MESSAGE
```

Copy the meeting ID (e.g., `8568cfe9-...`)

**Watch your phone:**
- Within 10 seconds, you should get a call
- After trial disclaimer, you'll hear:
  ```
  "Hi, this is an important reminder from SaveHub."
  "Your meeting titled TEST MEETING starts in 3 minutes."
  "The meeting starts at 05:23."
  "Missing this could cost you valuable time or money."
  "Please join now. Thank you."
  ```

**Check server logs (Terminal 1):**
```
[CALL] Using webhook-based TwiML delivery for event=8568cfe9-...
[CALL] Reminder context: "TEST MEETING" at 05:23 (3min)
[TWIML] Serving reminder for event=8568cfe9-...
[TWIML] Twilio will play this TwiML to the call recipient
```

✅ If you hear the message and see these logs, **THE FIX IS WORKING!**

## Verification (2 minutes)

**Terminal 2 (after call):**
```bash
node verify-duplicate-test.js 8568cfe9-...
```

Expected output:
```
✅ MEETING_CRITICAL_CALL
   Total: 1 | Delivered: 1 | Pending: 0

✅ MEETING_UPCOMING_EMAIL
   Total: 1 | Delivered: 1 | Pending: 0

✅ MEETING_URGENT_MESSAGE
   Total: 1 | Delivered: 1 | Pending: 0

✅ TEST PASSED!
   No duplicates detected.
```

---

## Troubleshooting Matrix

| Problem | Check | Solution |
|---------|-------|----------|
| No call received | Twilio Console | Voice Webhook must be set to `/twilio/voice/reminder` |
| Call received, but no reminder message | Voice Webhook URL | Make sure it's not still pointing to `demo.twilio.com` |
| Call received, trial disclaimer plays, but custom message cuts off | Server logs | Look for errors at `[TWIML]` lines |
| ngrok URL keeps changing | ngrok session | Re-run `ngrok http 3000`, update .env and Twilio Console |
| "Invalid signature" in logs | TWILIO_AUTH_TOKEN | Verify it matches exactly (no extra spaces) |
| Server shows `Cannot find module` | Node modules | Run `npm install` to reinstall dependencies |

---

## Production Deployment

Once testing is complete:

1. **Deploy code** to production server
2. **Update `.env`**: `CALL_WEBHOOK_URL=https://yourdomain.com`
3. **Update Twilio Console**: Voice Webhook → `https://yourdomain.com/twilio/voice/reminder`
4. Test with a real production meeting
5. Monitor logs for any issues

---

## Key Files

| File | Purpose |
|------|---------|
| `services/autoCallService.js` | Creates calls with webhook URL |
| `routes/twilioRoutes.js` | Handles `/twilio/voice/reminder` endpoint |
| `test-twilio-webhook.js` | Automated validation |
| `test-duplicate-setup.js` | Creates test meeting and alerts |
| `verify-duplicate-test.js` | Verifies no duplicates |
| `TESTING_TWILIO_WEBHOOK.md` | Detailed testing guide |

---

**Status:** ✅ Ready to test
**Time to complete:** ~15 minutes
**Success indicator:** Hear custom reminder message after trial disclaimer

