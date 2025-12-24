# Quick Fix: Set Your BASE_URL for Twilio Webhooks

The error you saw was:
```
Url is not a valid URL: http://localhost:3000/twilio/voice/reminder?...
```

**Twilio rejects localhost URLs** - it requires a publicly accessible URL.

## Quick Setup (3 steps)

### Step 1: Set Up ngrok (if local development)

```bash
# Download ngrok: https://ngrok.com/download
# Or: brew install ngrok (Mac) / choco install ngrok (Windows)

# Start ngrok
ngrok http 3000

# You'll see output like:
# Forwarding                    https://abc-123xyz.ngrok-free.dev -> http://localhost:3000
```

Copy the `https://...` URL (e.g., `https://abc-123xyz.ngrok-free.dev`)

### Step 2: Create .env file

Create `.env` file in `incident-engine/` directory:

```bash
# Copy from .env.example first
cp .env.example .env

# Then edit it and add:
BASE_URL=https://your-ngrok-url.ngrok-free.dev
```

Replace `your-ngrok-url` with your actual ngrok URL from Step 1.

### Step 3: Restart server

```bash
# If running npm run dev, just save the file (nodemon auto-restarts)
# Or manually restart:
npm run dev
```

## Verify It's Working

You should see in server logs:
```
[CALL] Using webhook-based TwiML delivery for event=...
[CALL] Webhook URL: https://abc-123xyz.ngrok-free.dev/twilio/voice/reminder?...
```

✓ If you see this = webhook URL is now valid

## For Production

If deploying to production:
```
BASE_URL=https://your-domain.com
```

(No ngrok needed - use your actual domain)

---

**Need more details?** See [TWILIO_WEBHOOK_FIX_COMPLETE.md](./TWILIO_WEBHOOK_FIX_COMPLETE.md)
