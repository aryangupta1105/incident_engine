# Environment Variables — Complete Package

## 📦 What You Got

Four comprehensive environment configuration documents:

### 1. **`.env.example`** ⭐ START HERE
**File:** `.env.example` (4.77 KB)

Complete template with all 39 environment variables organized by category. Copy this to `.env` and fill in your values.

```bash
# Copy template to working file
cp .env.example .env

# Edit with your values
nano .env
```

---

### 2. **`ENV_QUICK_REFERENCE.md`** ⚡ FOR QUICK LOOKUP
**File:** `ENV_QUICK_REFERENCE.md` (7.36 KB)

Fast reference card with:
- All variables organized by category
- Minimal setup example
- Production checklist
- One-liners to generate secrets
- Common issues & fixes

**Perfect for:** Bookmarking, quick copy-paste, troubleshooting

---

### 3. **`ENV_SETUP_GUIDE.md`** 📚 FOR DETAILED SETUP
**File:** `ENV_SETUP_GUIDE.md` (13.89 KB)

Complete guide with:
- Detailed explanation of every variable
- How to get secrets (Google, Twilio, Slack, etc.)
- Examples for dev/staging/production
- Connection strings for every database
- Security best practices
- CI/CD integration examples

**Perfect for:** First-time setup, understanding each variable, production deployment

---

### 4. **`ENVIRONMENT_VARIABLES_DOCUMENTATION.md`** 📖 FOR OVERVIEW
**File:** `ENVIRONMENT_VARIABLES_DOCUMENTATION.md` (9.38 KB)

High-level summary with:
- All 39 variables listed
- Quick setup examples
- Configuration by environment
- Security checklist
- Troubleshooting guide

**Perfect for:** Understanding big picture, checklists

---

## 🚀 Quick Start (3 Steps)

### Step 1: Create `.env` File
```bash
cp .env.example .env
```

### Step 2: Fill Required Variables
```bash
# Edit .env and set:
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:password@localhost:5432/incident_management
REDIS_HOST=localhost
REDIS_PORT=6379
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
```

### Step 3: Start Application
```bash
npm start
```

---

## 📋 All Variables by Category

### Essential (5 Required)
```
NODE_ENV              Application environment
PORT                  HTTP server port
DATABASE_URL          PostgreSQL connection string
GOOGLE_CLIENT_ID      Google OAuth client ID
GOOGLE_CLIENT_SECRET  Google OAuth client secret
```

### Database (1 Required + 4 Optional)
```
DATABASE_URL          ✓ PostgreSQL connection
DB_POOL_MAX           Max connections (default: 10)
DB_IDLE_TIMEOUT       Idle timeout (default: 30000ms)
DB_CONNECTION_TIMEOUT Connection timeout (default: 5000ms)
```

### Redis (4 Optional)
```
REDIS_HOST            Hostname (default: localhost)
REDIS_PORT            Port (default: 6379)
REDIS_PASSWORD        Password (optional)
REDIS_DB              Database (default: 0)
```

### Google Calendar (3 Required if enabled)
```
GOOGLE_CLIENT_ID      ✓ Client ID
GOOGLE_CLIENT_SECRET  ✓ Client secret
GOOGLE_REDIRECT_URI   Callback URI (default: http://localhost:3000/auth/google/callback)
```

### Email (5 Optional)
```
SMTP_HOST             Email server (e.g., smtp.gmail.com)
SMTP_PORT             Email port (e.g., 587)
SMTP_USER             Email username
SMTP_PASSWORD         Email password/token
EMAIL_FROM            From email address
```

### SMS (3 Optional)
```
TWILIO_ACCOUNT_SID    Twilio account ID
TWILIO_AUTH_TOKEN     Twilio token
TWILIO_PHONE_NUMBER   Twilio phone number
```

### Slack (2 Optional)
```
SLACK_WEBHOOK_URL     Slack incoming webhook
SLACK_BOT_TOKEN       Slack bot token (alternative)
```

### Security (3 Required for Production)
```
JWT_SECRET            ✓ JWT signing secret
SESSION_SECRET        ✓ Session encryption secret
CORS_ORIGINS          ✓ Allowed CORS origins
```

### Features (6 Optional)
```
FEATURE_CALENDAR_ENABLED       Google Calendar (default: true)
FEATURE_ESCALATION_ENABLED     Escalation (default: true)
FEATURE_CHECKIN_ENABLED        Check-ins (default: false)
FEATURE_SMS_ENABLED            SMS (default: false)
FEATURE_EMAIL_ENABLED          Email (default: true)
FEATURE_SLACK_ENABLED          Slack (default: false)
```

### System (7 Optional)
```
LOG_LEVEL                      Logging level (default: info)
DEBUG_REQUESTS                 Log HTTP (default: false)
ALERT_DELIVERY_ENABLED         Alert worker (default: true)
ESCALATION_WORKER_ENABLED      Escalation worker (default: true)
CALENDAR_SYNC_INTERVAL         Sync frequency minutes (default: 60)
```

### Debugging (4 Optional - Dev Only)
```
DEBUG_SQL             Log SQL queries (default: false)
SEED_TEST_DATA        Seed test data (default: false)
SKIP_OAUTH_VALIDATION Skip OAuth validation (default: false)
```

---

## 📊 Variable Matrix

| Category | Count | Required | Optional |
|----------|-------|----------|----------|
| Core | 2 | 1 | 1 |
| Database | 5 | 1 | 4 |
| Redis | 4 | 0 | 4 |
| Google | 3 | 2 | 1 |
| Email | 5 | 0 | 5 |
| SMS | 3 | 0 | 3 |
| Slack | 2 | 0 | 2 |
| Security | 3 | 1 | 2 |
| Features | 6 | 0 | 6 |
| System | 7 | 0 | 7 |
| Debug | 4 | 0 | 4 |
| **TOTAL** | **44** | **5+** | **39** |

---

## 🔑 How to Get Each Secret

### Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create project (or use existing)
3. Enable Google Calendar API
4. Create OAuth 2.0 credentials
5. Add redirect URI: `http://localhost:3000/auth/google/callback`
6. Copy Client ID & Secret to `.env`

### Twilio (SMS)
1. Sign up at [Twilio.com](https://twilio.com)
2. Get Account SID, Auth Token, Phone Number
3. Set in `.env`

### Slack (Notifications)
1. Go to [Slack API](https://api.slack.com/)
2. Create app → Enable incoming webhooks
3. Get webhook URL
4. Set in `.env`

### SMTP (Email)
**Gmail:**
- Enable 2-Step Verification
- Generate [App Password](https://myaccount.google.com/apppasswords)
- Use app password in `SMTP_PASSWORD`

**AWS SES:**
- Create SMTP credentials in AWS console
- Use provided username/password

**Other Providers:**
- Get SMTP details from provider documentation

### JWT Secret
```bash
# Generate strong secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## ⚙️ Environment-Specific Examples

### Development
```bash
NODE_ENV=development
DATABASE_URL=postgresql://postgres:password@localhost:5432/incident_management
REDIS_HOST=localhost
REDIS_PORT=6379
GOOGLE_CLIENT_ID=dev-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=dev-secret
LOG_LEVEL=debug
DEBUG_REQUESTS=true
```

### Staging
```bash
NODE_ENV=staging
DATABASE_URL=postgresql://user:pass@staging-db.example.com/incident_mgmt
REDIS_HOST=staging-redis.example.com
REDIS_PASSWORD=secure-password
GOOGLE_CLIENT_ID=staging-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=staging-secret
JWT_SECRET=<32-byte-hex>
LOG_LEVEL=info
```

### Production
```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@prod-db.example.com/incident_mgmt
REDIS_HOST=prod-redis.example.com
REDIS_PASSWORD=very-secure-password
GOOGLE_CLIENT_ID=prod-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=prod-secret
GOOGLE_REDIRECT_URI=https://yourdomain.com/auth/google/callback
JWT_SECRET=<very-long-32-byte-hex>
SESSION_SECRET=<very-long-32-byte-hex>
CORS_ORIGINS=https://yourdomain.com
LOG_LEVEL=warn
FEATURE_EMAIL_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_USER=alerts@yourdomain.com
SMTP_PASSWORD=app-password
```

---

## ✅ Pre-Deployment Checklist

- [ ] Copy `.env.example` to `.env` (don't use example directly)
- [ ] Set all required variables
- [ ] Generate unique `JWT_SECRET` and `SESSION_SECRET`
- [ ] Test database connection
- [ ] Verify Redis connection
- [ ] Validate Google OAuth credentials
- [ ] Check `.env` is in `.gitignore`
- [ ] Never commit `.env` to git
- [ ] Store production `.env` in secure vault
- [ ] Use HTTPS for CORS_ORIGINS in production
- [ ] Rotate secrets every 90 days
- [ ] Audit access to `.env` file

---

## 📖 Where to Find Information

| Need | File | Section |
|------|------|---------|
| Quick lookup | `ENV_QUICK_REFERENCE.md` | All categories |
| Detailed setup | `ENV_SETUP_GUIDE.md` | Each variable explained |
| Overview | `ENVIRONMENT_VARIABLES_DOCUMENTATION.md` | High-level summary |
| Template | `.env.example` | Copy & edit |
| Production | `ENV_SETUP_GUIDE.md` | "Production" section |
| Google OAuth | `ENV_SETUP_GUIDE.md` | "Google Calendar API" |
| Troubleshooting | All docs | Troubleshooting section |

---

## 🔒 Security Best Practices

### ✅ DO:
- ✓ Use environment variables for all secrets
- ✓ Generate cryptographically secure secrets
- ✓ Rotate secrets every 90 days
- ✓ Use different secrets per environment
- ✓ Store in secure vault (AWS Secrets Manager, Vault, 1Password)
- ✓ Audit who has access
- ✓ Log accesses to sensitive variables
- ✓ Use HTTPS for all redirects

### ✗ DON'T:
- ✗ Hardcode secrets in code
- ✗ Commit `.env` to git
- ✗ Share secrets via email/Slack
- ✗ Use same secret in dev/staging/prod
- ✗ Log secrets in debug output
- ✗ Expose secrets in error messages
- ✗ Use simple/guessable secrets
- ✗ Store credentials in version control

---

## 🆘 Troubleshooting Quick Links

**Database issues:** See `ENV_SETUP_GUIDE.md` → "Database (PostgreSQL)" → "Examples"

**Redis issues:** See `ENV_QUICK_REFERENCE.md` → "Common Issues & Fixes"

**Google OAuth issues:** See `ENV_SETUP_GUIDE.md` → "Google Calendar API"

**SMTP/Email issues:** See `ENV_QUICK_REFERENCE.md` → "Common Issues & Fixes"

**CORS issues:** See `ENV_QUICK_REFERENCE.md` → "Common Issues & Fixes"

---

## 📞 Getting Help

1. **Check files in this order:**
   - `ENV_QUICK_REFERENCE.md` (quick answers)
   - `ENV_SETUP_GUIDE.md` (detailed explanations)
   - `ENVIRONMENT_VARIABLES_DOCUMENTATION.md` (overview)

2. **Common scenarios:**
   - **"What variable do I need?"** → `ENV_QUICK_REFERENCE.md`
   - **"How do I get Google credentials?"** → `ENV_SETUP_GUIDE.md`
   - **"My email isn't working"** → `ENV_SETUP_GUIDE.md` → Email section
   - **"Database connection failed"** → `ENV_SETUP_GUIDE.md` → Database section
   - **"I got an error"** → Each doc has "Troubleshooting" section

3. **Validate your setup:**
   ```bash
   # Check syntax
   node -e "require('dotenv').config(); console.log(process.env)" 
   
   # Test database
   npm run test-db
   
   # Start app
   npm start
   ```

---

## 📦 Files Summary

```
.env.example                                   [TEMPLATE]
├─ Copy this to .env and edit
└─ Don't use this directly

ENV_QUICK_REFERENCE.md                         [BOOKMARK ME]
├─ All variables at a glance
├─ Setup examples
├─ One-liners for secrets
└─ Common issues

ENV_SETUP_GUIDE.md                             [DETAILED]
├─ Every variable explained
├─ How to get each secret
├─ Connection string examples
├─ Dev/staging/production configs
└─ Security best practices

ENVIRONMENT_VARIABLES_DOCUMENTATION.md         [OVERVIEW]
├─ High-level summary
├─ Configuration by environment
├─ Complete checklist
└─ Troubleshooting guide
```

---

## 🎯 Next Steps

1. **Review:** Read `ENV_QUICK_REFERENCE.md` (5 min)
2. **Setup:** Copy `.env.example` to `.env` (1 min)
3. **Configure:** Fill in your variables (10-30 min depending on setup)
4. **Verify:** Test database & Redis (2 min)
5. **Deploy:** Start application (1 min)

**Total time:** 20-40 minutes for first setup

---

**Start with `ENV_QUICK_REFERENCE.md` for immediate answers, then check `ENV_SETUP_GUIDE.md` for detailed explanations.**
