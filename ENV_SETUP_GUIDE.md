# Environment Variables Setup Guide

## Overview

This guide explains all environment variables required for the Incident Management System and how to configure them.

## Quick Start

```bash
# 1. Copy the example file
cp .env.example .env

# 2. Edit .env with your values
nano .env  # or your preferred editor

# 3. Verify configuration
npm run validate-env
```

## Environment Variables by Category

### APPLICATION SETTINGS

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | Application environment: `development`, `staging`, `production` |
| `PORT` | No | `3000` | HTTP server port |

**Example:**
```bash
NODE_ENV=production
PORT=3000
```

---

### DATABASE (PostgreSQL)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | **YES** | N/A | PostgreSQL connection string |

**Format:**
```
postgresql://username:password@host:port/database
```

**Examples:**

**Local Development:**
```bash
DATABASE_URL=postgresql://postgres:password@localhost:5432/incident_management
```

**Supabase (Cloud):**
```bash
DATABASE_URL=postgresql://[user]:[password]@[host].supabase.co:5432/[database]
```

**PgBouncer (Connection Pooling):**
```bash
DATABASE_URL=postgresql://[user]:[password]@[pgbouncer-host]:6432/[database]?sslmode=require
```

**Required Permissions:**
- CREATE TABLE
- INSERT, SELECT, UPDATE, DELETE
- CREATE INDEX
- CREATE TYPE (for enums)

---

### REDIS (Caching & Message Queue)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_HOST` | No | `localhost` | Redis server hostname |
| `REDIS_PORT` | No | `6379` | Redis server port |
| `REDIS_PASSWORD` | No | (empty) | Redis password (if auth enabled) |
| `REDIS_DB` | No | `0` | Redis database number (0-15) |

**Examples:**

**Local Development:**
```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

**Cloud (Redis Labs, AWS ElastiCache):**
```bash
REDIS_HOST=redis-12345.us-east-1-2.ec2.cloud.redislabs.com
REDIS_PORT=18256
REDIS_PASSWORD=your-secure-password
REDIS_DB=0
```

---

### GOOGLE CALENDAR API (OAuth2)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_CLIENT_ID` | **YES*** | N/A | OAuth 2.0 Client ID from Google Cloud |
| `GOOGLE_CLIENT_SECRET` | **YES*** | N/A | OAuth 2.0 Client Secret from Google Cloud |
| `GOOGLE_REDIRECT_URI` | No | `http://localhost:3000/auth/google/callback` | OAuth redirect URI |

**\* Required only if using Google Calendar integration (STEP 4)**

**How to Get These:**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable Google Calendar API
4. Create OAuth 2.0 credentials (OAuth consent screen)
5. Create OAuth 2.0 Client ID (type: Web application)
6. Add authorized redirect URI:
   - Development: `http://localhost:3000/auth/google/callback`
   - Production: `https://yourdomain.com/auth/google/callback`

**Example:**
```bash
GOOGLE_CLIENT_ID=123456789-abc123def456.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc123def456xyz
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

---

### LOGGING & MONITORING

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LOG_LEVEL` | No | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `DEBUG_REQUESTS` | No | `false` | Log all HTTP requests |

**Example:**
```bash
LOG_LEVEL=debug
DEBUG_REQUESTS=true  # Only in development
```

---

### EMAIL NOTIFICATIONS (Future Use)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SMTP_HOST` | No | N/A | SMTP server hostname |
| `SMTP_PORT` | No | `587` | SMTP server port |
| `SMTP_USER` | No | N/A | SMTP username/email |
| `SMTP_PASSWORD` | No | N/A | SMTP password |
| `EMAIL_FROM` | No | N/A | "From" email address |
| `FEATURE_EMAIL_ENABLED` | No | `true` | Enable email notifications |

**Example (Gmail):**
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password  # Use app-specific password, not main password
EMAIL_FROM=noreply@yourcompany.com
FEATURE_EMAIL_ENABLED=true
```

**Note:** For Gmail, use App Passwords instead of your main password:
1. Enable 2-Step Verification
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Generate app password for "Mail"

---

### TWILIO (SMS/Phone - Future Use)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TWILIO_ACCOUNT_SID` | No | N/A | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | No | N/A | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | No | N/A | Twilio phone number (from) |
| `FEATURE_SMS_ENABLED` | No | `false` | Enable SMS notifications |

**Example:**
```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+1234567890
FEATURE_SMS_ENABLED=true
```

---

### SLACK INTEGRATION (Future Use)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SLACK_WEBHOOK_URL` | No | N/A | Slack incoming webhook URL |
| `SLACK_BOT_TOKEN` | No | N/A | Slack bot token (alternative to webhook) |
| `FEATURE_SLACK_ENABLED` | No | `false` | Enable Slack notifications |

**Example:**
```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/[YOUR_TEAM_ID]/[YOUR_BOT_ID]/[YOUR_WEBHOOK_TOKEN]
FEATURE_SLACK_ENABLED=true
```

---

### SYSTEM CONFIGURATION

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_POOL_MAX` | No | `10` | Max concurrent database connections |
| `DB_IDLE_TIMEOUT` | No | `30000` | Idle connection timeout (ms) |
| `DB_CONNECTION_TIMEOUT` | No | `5000` | Connection timeout (ms) |
| `ALERT_DELIVERY_ENABLED` | No | `true` | Enable alert delivery worker |
| `ESCALATION_WORKER_ENABLED` | No | `true` | Enable escalation worker |
| `CALENDAR_SYNC_INTERVAL` | No | `60` | Calendar sync interval (minutes, 0=disabled) |

**Example:**
```bash
DB_POOL_MAX=20
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=5000
ALERT_DELIVERY_ENABLED=true
ESCALATION_WORKER_ENABLED=true
CALENDAR_SYNC_INTERVAL=60
```

---

### SECURITY

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | **YES** | N/A | JWT signing secret (production only) |
| `SESSION_SECRET` | No | N/A | Session secret |
| `CORS_ORIGINS` | No | `http://localhost:3000` | Allowed CORS origins (comma-separated) |

**Example:**
```bash
# Generate a strong secret:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

JWT_SECRET=abc123def456ghi789jkl012mno345pqr678stu901vwx234yz
SESSION_SECRET=xyz987wvu654tsr321qpo987mnl654kji321hgf098edc
CORS_ORIGINS=http://localhost:3000,https://yourdomain.com,https://app.yourdomain.com
```

---

### FEATURE FLAGS

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FEATURE_CALENDAR_ENABLED` | No | `true` | Enable Google Calendar integration |
| `FEATURE_ESCALATION_ENABLED` | No | `true` | Enable escalation workflows |
| `FEATURE_CHECKIN_ENABLED` | No | `false` | Enable manual check-ins |
| `FEATURE_SMS_ENABLED` | No | `false` | Enable SMS notifications |
| `FEATURE_EMAIL_ENABLED` | No | `true` | Enable email notifications |
| `FEATURE_SLACK_ENABLED` | No | `false` | Enable Slack notifications |

**Example:**
```bash
FEATURE_CALENDAR_ENABLED=true
FEATURE_ESCALATION_ENABLED=true
FEATURE_CHECKIN_ENABLED=false
FEATURE_SMS_ENABLED=false
FEATURE_EMAIL_ENABLED=true
FEATURE_SLACK_ENABLED=false
```

---

### DEBUGGING (Development Only)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DEBUG_SQL` | No | `false` | Log all SQL queries |
| `DEBUG_API` | No | `false` | Log HTTP requests/responses |
| `SEED_TEST_DATA` | No | `false` | Seed database with test data |
| `SKIP_OAUTH_VALIDATION` | No | `false` | Skip OAuth validation (dev only) |

**Example (Development):**
```bash
DEBUG_SQL=true
DEBUG_API=true
SEED_TEST_DATA=false
SKIP_OAUTH_VALIDATION=false
```

---

## Configuration by Environment

### Development

```bash
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:password@localhost:5432/incident_management
REDIS_HOST=localhost
REDIS_PORT=6379
GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc123
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
LOG_LEVEL=debug
DEBUG_REQUESTS=true
DEBUG_SQL=false
FEATURE_CALENDAR_ENABLED=true
FEATURE_ESCALATION_ENABLED=true
```

### Staging

```bash
NODE_ENV=staging
PORT=3000
DATABASE_URL=postgresql://user:password@staging-db.example.com:5432/incident_mgmt
REDIS_HOST=staging-redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
GOOGLE_CLIENT_ID=staging-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-staging-secret
GOOGLE_REDIRECT_URI=https://staging.yourdomain.com/auth/google/callback
LOG_LEVEL=info
DEBUG_REQUESTS=false
JWT_SECRET=generate-long-random-string
SESSION_SECRET=generate-another-random-string
CORS_ORIGINS=https://staging.yourdomain.com
FEATURE_CALENDAR_ENABLED=true
FEATURE_ESCALATION_ENABLED=true
```

### Production

```bash
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:password@prod-db.example.com:5432/incident_mgmt
REDIS_HOST=prod-redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=your-secure-redis-password
GOOGLE_CLIENT_ID=prod-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-prod-secret
GOOGLE_REDIRECT_URI=https://yourdomain.com/auth/google/callback
LOG_LEVEL=warn
DEBUG_REQUESTS=false
DEBUG_SQL=false
JWT_SECRET=very-long-cryptographically-secure-random-string
SESSION_SECRET=another-very-long-secure-random-string
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
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

## Validation Checklist

Before running the application, verify:

- [ ] `.env` file exists (not `.env.example`)
- [ ] `DATABASE_URL` is set and accessible
- [ ] `REDIS_HOST` and `REDIS_PORT` are correct
- [ ] `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set
- [ ] `JWT_SECRET` is set to a strong random value (production)
- [ ] `CORS_ORIGINS` includes all frontend URLs
- [ ] No hardcoded secrets in code
- [ ] `.env` is in `.gitignore`

---

## Generating Secure Secrets

```bash
# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate session secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Or use OpenSSL
openssl rand -hex 32
```

---

## Troubleshooting

### "Error: DATABASE_URL not set"
- Ensure `.env` file exists
- Run `source .env` (Unix/Mac) or load it in your IDE
- Check for typos in variable names

### "Error: Redis connection refused"
- Verify Redis is running: `redis-cli ping`
- Check `REDIS_HOST` and `REDIS_PORT`
- Verify firewall allows connection

### "Error: Google OAuth credentials invalid"
- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- Check OAuth redirect URI matches in Google Cloud Console
- Ensure Google Calendar API is enabled in project

### "Error: PostgreSQL connection timeout"
- Verify database is running and accessible
- Check `DATABASE_URL` format
- Test connection: `psql <DATABASE_URL>`
- Check firewall/security groups

---

## Security Best Practices

1. **Never commit `.env` to version control**
   ```bash
   echo ".env" >> .gitignore
   ```

2. **Use strong secrets in production**
   ```bash
   # Generate 32-byte hex string
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. **Rotate secrets periodically**
   - Change `JWT_SECRET` → requires re-authentication
   - Change `SESSION_SECRET` → requires re-login
   - Update Google OAuth → require user reconnection

4. **Use environment-specific secrets**
   - Never reuse development secrets in production
   - Use separate Google OAuth apps (dev, staging, prod)

5. **Limit secret access**
   - Only share `.env` securely (1Password, AWS Secrets Manager, etc.)
   - Use IAM roles instead of hardcoded credentials
   - Audit who has access to secrets

6. **Monitor secret exposure**
   - Scan for accidental commits: `git-secrets`, `detect-secrets`
   - Use `.env` validators to prevent invalid configs
   - Log secret usage without exposing values

---

## CI/CD Integration

### GitHub Actions

```yaml
env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
  REDIS_HOST: ${{ secrets.REDIS_HOST }}
  GOOGLE_CLIENT_ID: ${{ secrets.GOOGLE_CLIENT_ID }}
  GOOGLE_CLIENT_SECRET: ${{ secrets.GOOGLE_CLIENT_SECRET }}
  JWT_SECRET: ${{ secrets.JWT_SECRET }}
```

### GitLab CI

```yaml
variables:
  DATABASE_URL: $DATABASE_URL
  REDIS_HOST: $REDIS_HOST
  GOOGLE_CLIENT_ID: $GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET: $GOOGLE_CLIENT_SECRET
  JWT_SECRET: $JWT_SECRET
```

### Docker

```dockerfile
# Store secrets in .env file, don't COPY to image
ARG ENVIRONMENT=production
ENV NODE_ENV=${ENVIRONMENT}
```

---

## Summary

| Environment | Required Variables | Count |
|-------------|-------------------|-------|
| Development | NODE_ENV, PORT, DATABASE_URL, REDIS_* | 6+ |
| Staging | All dev + JWT_SECRET, SESSION_SECRET | 10+ |
| Production | All staging + SMTP_*, Security settings | 15+ |

Copy `.env.example` to `.env` and fill in your values based on your environment.
