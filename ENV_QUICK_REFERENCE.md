# Environment Variables Quick Reference

## All Required Variables

```bash
# ========== ESSENTIAL (Required) ==========
NODE_ENV=production                          # or development, staging
PORT=3000
DATABASE_URL=postgresql://user:pass@host/db  # PostgreSQL connection string
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
JWT_SECRET=generate-long-random-hex-string

# ========== REDIS (Recommended) ==========
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=                              # Leave empty if no auth
REDIS_DB=0

# ========== GOOGLE OAUTH (Optional but recommended) ==========
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback

# ========== NOTIFICATIONS (Optional) ==========
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=noreply@example.com
FEATURE_EMAIL_ENABLED=true

# ========== SMS (Optional) ==========
TWILIO_ACCOUNT_SID=your-sid
TWILIO_AUTH_TOKEN=your-token
TWILIO_PHONE_NUMBER=+1234567890
FEATURE_SMS_ENABLED=false

# ========== SLACK (Optional) ==========
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
FEATURE_SLACK_ENABLED=false

# ========== SECURITY (Production) ==========
SESSION_SECRET=generate-another-random-hex-string
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

# ========== FEATURES ==========
FEATURE_CALENDAR_ENABLED=true
FEATURE_ESCALATION_ENABLED=true
FEATURE_CHECKIN_ENABLED=false

# ========== SYSTEM ==========
LOG_LEVEL=info                               # debug, info, warn, error
DEBUG_REQUESTS=false
ALERT_DELIVERY_ENABLED=true
ESCALATION_WORKER_ENABLED=true
CALENDAR_SYNC_INTERVAL=60                    # minutes, 0=disabled

# ========== DATABASE TUNING (Advanced) ==========
DB_POOL_MAX=10
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=5000

# ========== DEVELOPMENT ONLY ==========
DEBUG_SQL=false
SEED_TEST_DATA=false
SKIP_OAUTH_VALIDATION=false
```

## Minimal Setup (Local Development)

```bash
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:password@localhost:5432/incident_management
REDIS_HOST=localhost
REDIS_PORT=6379
GOOGLE_CLIENT_ID=your-local-client-id
GOOGLE_CLIENT_SECRET=your-local-secret
LOG_LEVEL=debug
```

## Production Setup Checklist

```bash
# Core
[ ] NODE_ENV=production
[ ] PORT=3000
[ ] DATABASE_URL=postgresql://...  # Verify connection works
[ ] REDIS_HOST=...
[ ] REDIS_PASSWORD=...             # Required in production
[ ] LOG_LEVEL=warn                 # Don't log debug in prod

# Security
[ ] JWT_SECRET=<long-random-hex>   # 32+ bytes hex
[ ] SESSION_SECRET=<long-random>   # 32+ bytes hex
[ ] CORS_ORIGINS=https://yourdomain.com

# Google
[ ] GOOGLE_CLIENT_ID=production-id
[ ] GOOGLE_CLIENT_SECRET=production-secret
[ ] GOOGLE_REDIRECT_URI=https://yourdomain.com/auth/google/callback

# Notifications
[ ] SMTP_HOST=smtp.gmail.com
[ ] SMTP_PORT=587
[ ] SMTP_USER=alerts@yourdomain.com
[ ] SMTP_PASSWORD=<app-password>
[ ] EMAIL_FROM=alerts@yourdomain.com
[ ] FEATURE_EMAIL_ENABLED=true

# Features
[ ] FEATURE_CALENDAR_ENABLED=true
[ ] FEATURE_ESCALATION_ENABLED=true
[ ] ALERT_DELIVERY_ENABLED=true
[ ] ESCALATION_WORKER_ENABLED=true

# Verify
[ ] No .env in git
[ ] No hardcoded secrets in code
[ ] All URLs use HTTPS
[ ] Database backed up
[ ] Redis persisted
```

## Generate Secrets (One-liners)

```bash
# Generate JWT secret (32 bytes hex)
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"

# Generate session secret (32 bytes hex)
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"

# Or use OpenSSL
openssl rand -hex 32
openssl rand -base64 32

# Generate using node
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Google OAuth Setup (5 Steps)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create project > Enable Google Calendar API
3. Create OAuth 2.0 credentials (type: Web application)
4. Add authorized redirect URIs:
   - `http://localhost:3000/auth/google/callback` (dev)
   - `https://yourdomain.com/auth/google/callback` (prod)
5. Copy Client ID & Client Secret to `.env`

## Database Connection Strings

**Local PostgreSQL:**
```
postgresql://postgres:password@localhost:5432/incident_management
```

**Supabase:**
```
postgresql://[user]:[password]@[project].supabase.co:5432/postgres
```

**AWS RDS:**
```
postgresql://[user]:[password]@[endpoint].rds.amazonaws.com:5432/[dbname]
```

**Heroku:**
```
postgresql://[user]:[password]@[host].herokuapp.com:5432/[dbname]
```

## Redis Connection

**Local:**
```
Host: localhost
Port: 6379
```

**Redis Labs:**
```
Host: redis-xxxxx.us-east-1-2.ec2.cloud.redislabs.com
Port: 18256
Password: your-password
```

**AWS ElastiCache:**
```
Host: [endpoint].cache.amazonaws.com
Port: 6379
Password: (if auth token enabled)
```

## Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| `Error: DATABASE_URL not set` | Create `.env` file, don't use `.env.example` |
| `Error: Redis connection refused` | Ensure Redis is running: `redis-cli ping` |
| `Error: Google OAuth invalid` | Verify CLIENT_ID/SECRET, check redirect URI |
| `Error: SMTP auth failed` | Use app-specific password for Gmail |
| `Error: Connection timeout` | Check firewall, verify host:port, test connection |

## Quick Start (Copy & Paste)

```bash
# 1. Create .env file
cat > .env << EOF
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:password@localhost:5432/incident_management
REDIS_HOST=localhost
REDIS_PORT=6379
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
LOG_LEVEL=debug
FEATURE_CALENDAR_ENABLED=true
FEATURE_ESCALATION_ENABLED=true
EOF

# 2. Edit with your values
nano .env

# 3. Test connection
npm run test-db

# 4. Start server
npm start
```

## Environment-Specific Profiles

### .env.development
```bash
NODE_ENV=development
LOG_LEVEL=debug
DEBUG_REQUESTS=true
DEBUG_SQL=false
FEATURE_CALENDAR_ENABLED=true
```

### .env.staging
```bash
NODE_ENV=staging
LOG_LEVEL=info
DEBUG_REQUESTS=false
FEATURE_CALENDAR_ENABLED=true
FEATURE_ESCALATION_ENABLED=true
```

### .env.production
```bash
NODE_ENV=production
LOG_LEVEL=warn
DEBUG_REQUESTS=false
DEBUG_SQL=false
FEATURE_CALENDAR_ENABLED=true
FEATURE_ESCALATION_ENABLED=true
FEATURE_EMAIL_ENABLED=true
```

## Variable Count by Category

| Category | Count | Required |
|----------|-------|----------|
| Application | 2 | 1 |
| Database | 1 | 1 |
| Redis | 4 | 0 |
| Google | 3 | 2 |
| Email | 5 | 0 |
| SMS | 3 | 0 |
| Slack | 2 | 0 |
| Security | 3 | 1 |
| Features | 6 | 0 |
| System | 6 | 0 |
| Debug | 4 | 0 |
| **TOTAL** | **39** | **5+** |

## Where to Store Secrets

| Environment | Method |
|-------------|--------|
| Local Development | `.env` file (untracked) |
| CI/CD | GitHub/GitLab Secrets |
| Staging | AWS Secrets Manager / Vault |
| Production | AWS Secrets Manager / HashiCorp Vault / 1Password Business |

## Next Steps

1. Copy `.env.example` → `.env`
2. Fill in required variables
3. Run `npm run validate-env` (when available)
4. Start server: `npm start`
5. Verify: `npm test`

---

See `ENV_SETUP_GUIDE.md` for detailed explanations and examples.
