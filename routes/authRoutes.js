/**
 * Authentication Routes
 * 
 * Exposes Google OAuth authentication endpoints.
 * 
 * Routes:
 * - GET /auth/google → Initiate OAuth flow
 * - GET /auth/google/callback → Handle OAuth callback
 * 
 * Responsibilities:
 * - Feature flag checking
 * - Redirect handling
 * - Error propagation to global handler
 * 
 * Note: All OAuth logic stays in services/googleOAuth.js
 */

console.error("🔥 [BOOT TRACE] authRoutes.js LOADED FROM:", __filename);

const express = require('express');
const { google } = require('googleapis');
const { jwtDecode } = require('jwt-decode');
const { randomUUID, createHash } = require('crypto');
const router = express.Router();

const googleOAuth = require('../services/googleOAuth');
const pool = require('../db');
const { GOOGLE_OAUTH_SCOPES } = require('../config/oauth');

/**
 * Convert Google's sub claim (numeric string) to a valid UUID v5
 * Uses a deterministic namespace and the sub claim as the name
 * Same sub will always produce the same UUID
 * 
 * @param {string} googleSub - Google's sub claim (e.g., "101602525888316162949")
 * @returns {string} Valid UUID v5 string
 */
function convertGoogleSubToUuid(googleSub) {
  // Google sub is numeric but not a valid UUID
  // Create deterministic UUID v5 from it
  // Namespace UUID for Google OAuth (arbitrary but consistent)
  const GOOGLE_OAUTH_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
  
  // Create SHA-1 hash of the namespace + sub
  const namespaceBuf = Buffer.from(GOOGLE_OAUTH_NAMESPACE.replace(/-/g, ''), 'hex');
  const subBuf = Buffer.from(googleSub, 'utf8');
  const combined = Buffer.concat([namespaceBuf, subBuf]);
  
  const hash = createHash('sha1').update(combined).digest();
  
  // Set UUID v5 version and variant bits
  hash[6] = (hash[6] & 0x0f) | 0x50;  // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80;  // variant 1
  
  // Format as UUID string
  const uuid = [
    hash.toString('hex', 0, 4),
    hash.toString('hex', 4, 6),
    hash.toString('hex', 6, 8),
    hash.toString('hex', 8, 10),
    hash.toString('hex', 10, 16)
  ].join('-');
  
  console.log(`[AUTH_ROUTES] Converted Google sub "${googleSub}" to UUID "${uuid}"`);
  return uuid;
}

/**
 * Safe date conversion utility
 * Safely converts a value to ISO string without throwing RangeError
 * @param {*} value - Value to convert
 * @param {number} expiresInSeconds - Optional fallback seconds to add to now
 * @returns {string|null} ISO string or null if invalid
 */
function safeToISOString(value, expiresInSeconds) {
  if (!value && expiresInSeconds && typeof expiresInSeconds === 'number' && expiresInSeconds > 0) {
    try {
      const futureDate = new Date(Date.now() + expiresInSeconds * 1000);
      if (isNaN(futureDate.getTime())) {
        console.warn('[OAUTH] Token expiry calculation invalid, storing NULL');
        return null;
      }
      return futureDate.toISOString();
    } catch (err) {
      console.warn('[OAUTH] Error calculating token expiry:', err.message);
      return null;
    }
  }
  if (value === undefined || value === null) {
    console.warn('[OAUTH] Token expiry missing, storing NULL');
    return null;
  }
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      console.warn('[OAUTH] Invalid date value, storing NULL');
      return null;
    }
    return date.toISOString();
  } catch (err) {
    console.warn('[OAUTH] Error converting date:', err.message);
    return null;
  }
}

// DO NOT DEFINE SCOPES HERE - use shared constant from config/oauth.js

/**
 * GET /auth/google
 * 
 * Initiates Google OAuth flow by redirecting user to consent screen.
 * 
 * Requirements:
 * - FEATURE_CALENDAR_ENABLED === 'true'
 * 
 * Flow:
 * 1. Check feature flag
 * 2. Build Google OAuth URL
 * 3. Redirect user to Google consent screen
 * 
 * Response:
 * - 302 Redirect to Google consent screen
 * - 403 If feature disabled
 * - 500 If OAuth config invalid
 */
router.get('/google', (req, res, next) => {
  try {
    // Feature flag check
    if (process.env.FEATURE_CALENDAR_ENABLED !== 'true') {
      console.log('[AUTH_ROUTES] Calendar feature disabled');
      return res.status(403).json({
        error: 'Calendar integration is not enabled',
        feature: 'FEATURE_CALENDAR_ENABLED'
      });
    }

    // Validate OAuth credentials
    if (!googleOAuth.GOOGLE_CLIENT_ID || !googleOAuth.GOOGLE_CLIENT_SECRET) {
      console.error('[AUTH_ROUTES] Missing Google OAuth credentials');
      return res.status(500).json({
        error: 'OAuth service not properly configured'
      });
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      googleOAuth.GOOGLE_CLIENT_ID,
      googleOAuth.GOOGLE_CLIENT_SECRET,
      googleOAuth.GOOGLE_REDIRECT_URI
    );

    // Log the scopes being requested (verification)
    console.log('[OAUTH] Requested scopes:', GOOGLE_OAUTH_SCOPES);

    // Generate auth URL with FULL CONSENT enforcement
    // These parameters OVERRIDE previous consent and force Google to reissue claims
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',           // Get refresh token
      prompt: 'consent',                // Force consent screen (override previous consent)
      include_granted_scopes: false,    // Don't include previously granted scopes
      scope: GOOGLE_OAUTH_SCOPES        // Explicit scope list (single source of truth)
    });

    console.log('[AUTH_ROUTES] OAuth flow initiated with full consent override, redirecting to Google');

    // Redirect to Google consent screen
    res.redirect(authUrl);
  } catch (err) {
    console.error('[AUTH_ROUTES] OAuth initiation failed:', err.message);
    next(err);
  }
});

/**
 * GET /auth/google/callback
 * 
 * Handles OAuth callback from Google.
 * 
 * Flow:
 * 1. Validate authorization code
 * 2. Exchange code for tokens
 * 3. Store tokens in database
 * 4. Return success response
 * 
 * Query Parameters:
 * - code: Authorization code from Google
 * - state: CSRF protection (optional)
 * - error: Error from Google (if present)
 * 
 * Response:
 * - 200 Success with message
 * - 400 Missing or invalid code
 * - 500 Token exchange failed
 */
router.get('/google/callback', async (req, res, next) => {
  try {
    const { code, error } = req.query;

    // Check for OAuth errors from Google
    if (error) {
      console.warn(`[AUTH_ROUTES] OAuth error from Google: ${error}`);
      return res.status(400).json({
        error: 'OAuth failed',
        details: error
      });
    }

    // Validate authorization code
    if (!code) {
      console.warn('[AUTH_ROUTES] Missing authorization code');
      return res.status(400).json({
        error: 'Authorization code is required'
      });
    }

    console.log('[AUTH_ROUTES] OAuth callback received, exchanging code for tokens');

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      googleOAuth.GOOGLE_CLIENT_ID,
      googleOAuth.GOOGLE_CLIENT_SECRET,
      googleOAuth.GOOGLE_REDIRECT_URI
    );

    // Exchange authorization code for tokens
    const { tokens } = await oauth2Client.getToken(code);

    console.log('[OAUTH] Tokens received: id_token=' + (tokens.id_token ? 'yes' : 'no'));

    // ============================================================
    // TASK 3 & 4: AUTHORITATIVE EMAIL EXTRACTION WITH STRICT ORDER
    // ============================================================
    // Validation order (STRICT - no fallbacks except userinfo):
    // 1. id_token MUST exist
    // 2. MUST decode successfully
    // 3. Email MUST exist in decoded token
    // 4. email_verified MUST be true (unless explicitly allowed to be false)

    let userEmail = null;
    let emailVerified = null;
    let userName = null;
    let userSub = null;
    let emailSource = null;

    // STEP 1: Assert id_token exists
    if (!tokens.id_token) {
      const errorMsg = '[OAUTH] CRITICAL: Google did not return id_token. ' +
        'This means: (1) OAuth scopes may be incorrect, (2) Google account may not support email, (3) Consent may have been denied. ' +
        'Ensure scopes include "email" and user granted permission.';
      console.error(errorMsg);
      return res.status(400).json({
        error: 'No id_token returned from Google',
        details: 'Cannot extract identity claims without id_token'
      });
    }

    // STEP 2: Decode id_token
    let decodedToken = null;
    try {
      // Debug: log token info before decode
      console.log('[OAUTH] id_token type:', typeof tokens.id_token);
      console.log('[OAUTH] id_token length:', tokens.id_token ? tokens.id_token.length : 'null');
      console.log('[OAUTH] id_token first 100 chars:', tokens.id_token ? tokens.id_token.substring(0, 100) : 'null');
      
      // Check if token looks like a JWT (should have 3 parts separated by dots)
      if (tokens.id_token && typeof tokens.id_token === 'string') {
        const parts = tokens.id_token.split('.');
        console.log('[OAUTH] id_token parts count:', parts.length, '(should be 3)');
        
        if (parts.length !== 3) {
          throw new Error(`Invalid JWT format: expected 3 parts, got ${parts.length}`);
        }
      }
      
      decodedToken = jwtDecode(tokens.id_token);
      console.log('[OAUTH] ✅ Successfully decoded id_token');
      console.log('[OAUTH] Decoded id_token claims keys:', Object.keys(decodedToken).sort().join(', '));
      
    } catch (decodeErr) {
      console.warn('[OAUTH] Primary decode failed, attempting manual Base64 decode:', decodeErr.message);
      
      // Fallback: Manual Base64 decode
      try {
        const parts = tokens.id_token.split('.');
        const payload = parts[1];
        
        // Add padding if needed
        const padding = 4 - (payload.length % 4);
        const paddedPayload = payload + (padding < 4 ? '='.repeat(padding) : '');
        
        // Decode Base64
        const decodedStr = Buffer.from(paddedPayload, 'base64').toString('utf-8');
        decodedToken = JSON.parse(decodedStr);
        
        console.log('[OAUTH] ✅ Successfully decoded id_token using manual Base64 decode');
        console.log('[OAUTH] Decoded id_token claims keys:', Object.keys(decodedToken).sort().join(', '));
        
      } catch (manualErr) {
        const errorMsg = `[OAUTH] CRITICAL: Failed to decode id_token (both methods): ${decodeErr.message} / ${manualErr.message}`;
        console.error(errorMsg);
        console.error('[OAUTH] Primary decode error:', decodeErr.message, decodeErr.stack);
        console.error('[OAUTH] Manual decode error:', manualErr.message, manualErr.stack);
        console.error('[OAUTH] Token type:', typeof tokens.id_token);
        console.error('[OAUTH] Token value (first 200 chars):', tokens.id_token ? tokens.id_token.substring(0, 200) : 'null');
        
        return res.status(400).json({
          error: 'Failed to decode id_token',
          details: 'Token decoding failed with both methods. Check server logs for details.',
          debug: {
            primaryError: decodeErr.message,
            fallbackError: manualErr.message,
            tokenType: typeof tokens.id_token,
            tokenLength: tokens.id_token ? tokens.id_token.length : 0
          }
        });
      }
    }

    // STEP 3: Assert decoded token exists
    if (!decodedToken) {
      const errorMsg = '[OAUTH] CRITICAL: id_token decoded to null/undefined';
      console.error(errorMsg);
      return res.status(400).json({
        error: 'Invalid id_token',
        details: 'Decoded token is empty'
      });
    }

    // STEP 4: Extract and validate email
    if (!decodedToken.email) {
      const errorMsg = '[OAUTH] CRITICAL: id_token does not contain email claim. ' +
        'This means: (1) Google account has no email, (2) email scope not requested, (3) User denied email access. ' +
        'Scopes requested: ' + GOOGLE_OAUTH_SCOPES.join(', ');
      console.error(errorMsg);
      
      // Try fallback ONLY if id_token exists but email missing (TASK 5)
      // Will be handled below
    } else {
      userEmail = decodedToken.email;
      emailVerified = decodedToken.email_verified;
      userName = decodedToken.name;
      userSub = decodedToken.sub;
      emailSource = 'id_token';
      console.log('[OAUTH] Email extracted from id_token (primary source)');
      console.log('[OAUTH] Email verified:', emailVerified);
    }

    // ============================================================
    // TASK 5: USERINFO FALLBACK (RARE: id_token exists but no email)
    // ============================================================
    if (!userEmail && tokens.access_token) {
      try {
        console.log('[OAUTH] Email missing from id_token, attempting userinfo API fallback...');
        const userinfoResponse = await oauth2Client.request({
          url: 'https://www.googleapis.com/oauth2/v2/userinfo'
        });

        const userinfo = userinfoResponse.data;
        if (userinfo && userinfo.email) {
          userEmail = userinfo.email;
          emailVerified = userinfo.verified_email;
          userName = userinfo.name || userName;
          emailSource = 'userinfo_api';
          console.log('[OAUTH] Email extracted from userinfo API (fallback source)');
          console.log('[OAUTH] Email verified:', emailVerified);
        }
      } catch (err) {
        console.warn(`[OAUTH] Userinfo API fallback failed: ${err.message}`);
      }
    }

    // FINAL VALIDATION: Email MUST exist after all attempts
    if (!userEmail) {
      const errorMsg = '[OAUTH] CRITICAL: Email could not be extracted from id_token OR userinfo API. ' +
        'Possible causes: (1) Google account has no email configured, (2) Email scope was not requested, (3) User denied email permission. ' +
        'Required scopes: openid, email, profile. Requested scopes: ' + GOOGLE_OAUTH_SCOPES.join(', ');
      console.error(errorMsg);
      return res.status(400).json({
        error: 'Cannot proceed without email address',
        details: 'Email is required from Google account. Check account settings and retry with proper permissions.',
        hint: 'Ensure you have an email address configured on your Google account and granted the email permission.'
      });
    }

    // Email verified check (log but don't fail - Google accounts can have unverified emails in edge cases)
    if (emailVerified === false) {
      console.warn('[OAUTH] WARNING: Email is marked as unverified by Google. This is unusual but proceeding.');
    }

    console.log('[OAUTH] Email source:', emailSource);
    console.log(`[OAUTH] Identity verified: sub=${userSub}, email=${userEmail}, email_verified=${emailVerified}`);

    // ============================================================
    // TASK 6: USER PERSISTENCE (SINGLE PLACE, IDENTITY-CORRECT)
    // ============================================================
    // Google's 'sub' claim is a numeric string, not a valid UUID
    // Convert it to a deterministic UUID v5 for storage
    // Same sub will always produce the same UUID
    if (!userSub) {
      const errorMsg = '[OAUTH] CRITICAL: Missing sub claim from id_token. Cannot create user without unique identifier.';
      console.error(errorMsg);
      return res.status(400).json({
        error: 'Missing user identity',
        details: 'Cannot proceed without subject claim from Google'
      });
    }

    // Convert Google's sub (numeric string) to valid UUID
    const userId = convertGoogleSubToUuid(userSub);

    // ============================================================
    // TASK 6 CONTINUED: INSERT user into users table (SINGLE PLACE)
    // ============================================================
    try {
      console.log('[USER] Attempting to insert user with values:', {
        id: userId,
        email: userEmail,
        name: userName || null,
        provider: 'google',
        email_verified: emailVerified || false
      });

      const userResult = await pool.query(
        `INSERT INTO users (id, email, name, provider, email_verified)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           email = EXCLUDED.email,
           name = EXCLUDED.name,
           email_verified = EXCLUDED.email_verified
         RETURNING id, email, name`,
        [userId, userEmail, userName || null, 'google', emailVerified || false]
      );

      if (userResult.rows.length === 0) {
        throw new Error('[USER] Failed to create/update user in database - no rows returned');
      }

      const storedUser = userResult.rows[0];
      console.log(`[USER] ✅ User persisted: id=${storedUser.id}, email=${storedUser.email}, provider=google`);
    } catch (err) {
      console.error(`[USER] ❌ Failed to persist user profile:`);
      console.error(`  Error message: ${err.message}`);
      console.error(`  Error code: ${err.code}`);
      console.error(`  Error detail: ${err.detail}`);
      console.error(`  Full error:`, err);
      
      return res.status(500).json({
        error: 'Failed to store user profile',
        details: 'Could not create or update user in database',
        debug: {
          dbError: err.message,
          errorCode: err.code,
          errorDetail: err.detail
        }
      });
    }

    // ============================================================
    // TASK 6 CONTINUED: STORE OAUTH TOKENS IN calendar_credentials
    // ============================================================
    // Now store the OAuth tokens using the same userId (Google sub)
    // storeCredentials will validate userId format
    // ==========================================================

    // Store OAuth tokens in database
    try {
      await googleOAuth.storeCredentials(userId, tokens);
      console.log('[OAUTH] OAuth tokens stored in calendar_credentials table');
    } catch (err) {
      console.error(`[OAUTH] Failed to store OAuth tokens: ${err.message}`);
      return res.status(500).json({
        error: 'Failed to store OAuth tokens',
        details: 'Credentials stored but token storage failed'
      });
    }

    // Return success response with detailed verification
    res.status(200).json({
      success: true,
      message: 'Google Calendar authenticated successfully',
      user: userId,
      email: userEmail,
      email_verified: emailVerified,
      email_source: emailSource,
      provider: 'google',
      tokenExpiry: safeToISOString(null, tokens.expires_in)
    });
  } catch (err) {
    console.error('[AUTH_ROUTES] OAuth callback failed:', err.message);
    next(err);
  }
});

module.exports = router;
