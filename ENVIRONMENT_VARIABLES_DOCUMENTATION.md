# Complete Environment Variables Documentation

## Summary

Three comprehensive environment configuration documents have been created:

### 1. **`.env.example`** (4.77 KB)
A template file with all available environment variables with descriptions. Copy this to `.env` and fill in your values.

### 2. **`ENV_SETUP_GUIDE.md`** (13.89 KB)
Detailed guide explaining every environment variable, how to get them, and examples for different environments (dev, staging, production).

### 3. **`ENV_QUICK_REFERENCE.md`** (7.36 KB)
Quick reference card with all variables organized by category, perfect for bookmarking.

---

## Complete Variable List (39 Total)

### REQUIRED (Must Set)
- `NODE_ENV` — Application environment
- `DATABASE_URL` — PostgreSQL connection string
- `GOOGLE_CLIENT_ID` — Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` — Google OAuth client secret
- `JWT_SECRET` — JWT signing secret (production)

### OPTIONAL BUT RECOMMENDED
- `REDIS_HOST` — Redis server hostname
- `REDIS_PORT` — Redis server port
- `REDIS_PASSWORD` — Redis password (if auth enabled)
- `GOOGLE_REDIRECT_URI` — OAuth callback URI

### NOTIFICATION SERVICES
- `SMTP_HOST` — Email server (Gmail, AWS SES, etc.)
- `SMTP_PORT` — Email server port
- `SMTP_USER` — Email username
- `SMTP_PASSWORD` — Email password/token
- `EMAIL_FROM` — From email address
- `TWILIO_ACCOUNT_SID` — SMS service account
- `TWILIO_AUTH_TOKEN` — SMS service token
- `TWILIO_PHONE_NUMBER` — SMS sender number
- `SLACK_WEBHOOK_URL` — Slack incoming webhook

### FEATURE FLAGS
- `FEATURE_CALENDAR_ENABLED` — Google Calendar integration
- `FEATURE_ESCALATION_ENABLED` — Escalation workflows
- `FEATURE_CHECKIN_ENABLED` — Manual check-ins
- `FEATURE_SMS_ENABLED` — SMS notifications
- `FEATURE_EMAIL_ENABLED` — Email notifications
- `FEATURE_SLACK_ENABLED` — Slack notifications

### SYSTEM CONFIGURATION
- `PORT` — HTTP server port
- `LOG_LEVEL` — Logging level (debug, info, warn, error)
- `DB_POOL_MAX` — Max database connections
- `DB_IDLE_TIMEOUT` — Database idle timeout
- `DB_CONNECTION_TIMEOUT` — Database connection timeout
- `ALERT_DELIVERY_ENABLED` — Alert delivery worker
- `ESCALATION_WORKER_ENABLED` — Escalation worker
- `CALENDAR_SYNC_INTERVAL` — Calendar sync frequency

### SECURITY
- `SESSION_SECRET` — Session encryption secret
- `CORS_ORIGINS` — Allowed CORS origins
- `REDIS_DB` — Redis database number

### DEBUGGING
- `DEBUG_REQUESTS` — Log HTTP requests
- `DEBUG_SQL` — Log SQL queries
- `SEED_TEST_DATA` — Seed test data
- `SKIP_OAUTH_VALIDATION` — Skip OAuth validation (dev only)

---

## Quick Setup Examples

### Minimal (Local Development)
```bash
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:password@localhost:5432/incident_management
REDIS_HOST=localhost
REDIS_PORT=6379
GOOGLE_CLIENT_ID=your-local-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-local-secret
LOG_LEVEL=debug
```

### Production Ready
```bash
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:pass@prod-db.example.com:5432/incident_mgmt
REDIS_HOST=prod-redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=secure-password
GOOGLE_CLIENT_ID=prod-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=prod-secret
GOOGLE_REDIRECT_URI=https://yourdomain.com/auth/google/callback
JWT_SECRET=<32-byte-hex-string>
SESSION_SECRET=<32-byte-hex-string>
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
LOG_LEVEL=warn
FEATURE_CALENDAR_ENABLED=true
FEATURE_ESCALATION_ENABLED=true
FEATURE_EMAIL_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=alerts@yourdomain.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=alerts@yourdomain.com
```

---

## Setup Steps

### 1. Create `.env` File
```bash
cp .env.example .env
nano .env  # Edit with your values
```

### 2. Required Configuration

**Database:**
```bash
DATABASE_URL=postgresql://postgres:password@localhost:5432/incident_management
```

**Google OAuth** (get from [Google Cloud Console](https://console.cloud.google.com/)):
```bash
GOOGLE_CLIENT_ID=123456789-abc123def456.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc123def456xyz
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

**Redis:**
```bash
REDIS_HOST=localhost
REDIS_PORT=6379
```

### 3. Generate Secrets (Production Only)
```bash
# Generate JWT secret
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"

# Generate session secret
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Verify Configuration
```bash
# Test database connection
npm run test-db

# Start server
npm start
```

---

## Configuration by Environment

### Development
- File: `.env`
- Setting: `NODE_ENV=development`
- Log level: `debug`
- Database: Local PostgreSQL
- Redis: Local
- Debug: Enabled
- Features: All enabled

### Staging
- File: `.env.staging`
- Setting: `NODE_ENV=staging`
- Log level: `info`
- Database: Staging RDS/Supabase
- Redis: Cloud (Redis Labs, AWS)
- Debug: Disabled
- Features: All enabled
- Secrets: Unique per environment

### Production
- File: `.env.production` (stored securely)
- Setting: `NODE_ENV=production`
- Log level: `warn`
- Database: Production RDS with backups
- Redis: Production cluster
- Debug: Disabled
- Features: All enabled + monitoring
- Secrets: Long, cryptographically secure, rotated regularly

---

## Security Checklist

✅ **Before Deploying:**
- [ ] Copy `.env.example` to `.env` (never use example)
- [ ] Fill in all required variables
- [ ] Generate unique secrets: `JWT_SECRET`, `SESSION_SECRET`
- [ ] Use strong database passwords (20+ chars, mixed case)
- [ ] Set `CORS_ORIGINS` to your domains only
- [ ] Verify `.env` is in `.gitignore`
- [ ] Don't commit `.env` to version control
- [ ] Use environment-specific secrets (dev/staging/prod)
- [ ] Rotate secrets every 90 days
- [ ] Store production `.env` in secure vault (AWS Secrets Manager, HashiCorp Vault, 1Password)
- [ ] Audit who has access to `.env`

---

## Common Configurations

### Google Calendar Integration
```bash
FEATURE_CALENDAR_ENABLED=true
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
CALENDAR_SYNC_INTERVAL=60  # Sync every hour
```

### Email Notifications
```bash
FEATURE_EMAIL_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=alerts@yourdomain.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=alerts@yourdomain.com
```

### SMS Notifications
```bash
FEATURE_SMS_ENABLED=true
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+1234567890
```

### Slack Notifications
```bash
FEATURE_SLACK_ENABLED=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00000000/B00000000/XXXX
```

### Escalation Workflows
```bash
FEATURE_ESCALATION_ENABLED=true
ESCALATION_WORKER_ENABLED=true
ALERT_DELIVERY_ENABLED=true
```

---

## Database Connection Strings

**PostgreSQL Local:**
```
postgresql://postgres:password@localhost:5432/incident_management
```

**Supabase:**
```
postgresql://postgres.[project-id]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

**AWS RDS:**
```
postgresql://admin:password@mydb.c9akciq32.us-east-1.rds.amazonaws.com:5432/incident_mgmt
```

**Azure Database:**
```
postgresql://user@server:password@server.postgres.database.azure.com:5432/incident_mgmt
```

**PgBouncer (Connection Pooling):**
```
postgresql://user:password@pgbouncer.example.com:6432/incident_mgmt
```

---

## Troubleshooting

### "Error: DATABASE_URL not set"
- Ensure `.env` file exists (not `.env.example`)
- Check variable name spelling
- Restart application after changing `.env`

### "Error: Redis connection refused"
- Verify Redis is running: `redis-cli ping`
- Check `REDIS_HOST` and `REDIS_PORT`
- Verify firewall allows connection

### "Error: Google OAuth failed"
- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- Check `GOOGLE_REDIRECT_URI` matches Google Cloud Console
- Ensure Google Calendar API is enabled
- Verify OAuth consent screen is configured

### "Error: SMTP authentication failed"
- For Gmail: Use App Password instead of main password
- Enable 2-Step Verification
- Check `SMTP_USER` and `SMTP_PASSWORD`
- Try `SMTP_PORT=465` instead of `587`

### "Error: CORS blocked"
- Add your frontend URL to `CORS_ORIGINS`
- Use comma-separated list: `https://domain1.com,https://domain2.com`
- No trailing slashes in CORS_ORIGINS

---

## File Locations

```
incident-engine/
├── .env                          # Your secrets (DO NOT COMMIT)
├── .env.example                  # Template (COMMIT THIS)
├── .gitignore                    # Should include: .env
├── ENV_SETUP_GUIDE.md            # Detailed guide
└── ENV_QUICK_REFERENCE.md        # Quick reference
```

---

## Next Steps

1. **Read**: `ENV_QUICK_REFERENCE.md` for overview
2. **Setup**: `cp .env.example .env && nano .env`
3. **Configure**: Fill in variables for your environment
4. **Verify**: Test database connection
5. **Deploy**: Run application with configured `.env`

See `ENV_SETUP_GUIDE.md` for detailed explanations of every variable.
