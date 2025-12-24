/**
 * Google OAuth Service
 * 
 * Manages Google Calendar OAuth2 authentication.
 * 
 * Handles:
 * - OAuth2 flow (authorization code exchange)
 * - Token storage and retrieval
 * - Token refresh
 * - Credential management
 */

console.error("🔥 [BOOT TRACE] googleOAuth.js LOADED FROM:", __filename);

const pool = require('../db');
const { v4: uuid, validate: validateUUID } = require('uuid');
const { google } = require('googleapis');
const { GOOGLE_OAUTH_SCOPES } = require('../config/oauth');

/**
 * Safe expiry date calculation for OAuth tokens
 * Returns null if expires_in is missing or invalid (prevents RangeError)
 * @param {number} expiresInSeconds - Seconds until token expires
 * @returns {Date|null} Valid Date or null
 */
function safeExpiryDate(expiresInSeconds) {
  try {
    if (!expiresInSeconds || typeof expiresInSeconds !== 'number' || expiresInSeconds <= 0) {
      console.warn('[OAUTH] Token expires_in missing/invalid, storing NULL');
      return null;
    }
    const expiryDate = new Date(Date.now() + expiresInSeconds * 1000);
    if (isNaN(expiryDate.getTime())) {
      console.warn('[OAUTH] Calculated expiry date invalid, storing NULL');
      return null;
    }
    return expiryDate;
  } catch (err) {
    console.warn('[OAUTH] Error calculating expiry date:', err.message);
    return null;
  }
}

// OAuth config (set from environment)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback';

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.warn('[GOOGLE_OAUTH] Warning: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set in environment');
}

/**
 * Store or update Google OAuth credentials for a user
 * 
 * @param {string} userId - User identifier (Google 'sub' claim or UUID)
 * @param {object} tokens - Token object from Google
 * @param {string} tokens.access_token - Google access token
 * @param {string} tokens.refresh_token - Google refresh token (may be null if not first auth)
 * @param {number} tokens.expires_in - Token expiry in seconds
 * @returns {object} Stored credentials
 * @throws {Error} If userId is invalid, not provided, or storage fails
 */
async function storeCredentials(userId, tokens) {
  // CRITICAL TRACE - FIRST THING
  console.error("🔥 [CRITICAL TRACE] storeCredentials ENTERED | userId =", userId, "| typeof =", typeof userId, "| file =", __filename);

  // HARD VALIDATION: userId must be provided
  if (!userId) {
    throw new Error('[GOOGLE_OAUTH] CRITICAL: userId is required to store credentials');
  }

  // VALIDATION: userId should be a non-empty string
  // Accept Google's 'sub' claim (string) or UUID
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    console.error("🔥 [VALIDATION FAIL] Invalid userId:", userId, "typeof:", typeof userId);
    throw new Error(`[GOOGLE_OAUTH] CRITICAL: userId must be a non-empty string. Got: "${userId}"`);
  }

  // HARD VALIDATION: tokens must be provided with access_token
  if (!tokens || !tokens.access_token) {
    throw new Error('[GOOGLE_OAUTH] Invalid tokens: access_token required');
  }

  // SAFE DATE CALCULATION: handles missing/invalid expires_in gracefully
  const tokenExpiry = safeExpiryDate(tokens.expires_in);

  try {
    console.log(`[GOOGLE_OAUTH] Storing credentials for user ${userId}`);

    // Use UPSERT pattern: insert if not exists, update if exists
    // ON CONFLICT matches the UNIQUE constraint (user_id, provider)
    const result = await pool.query(
      `INSERT INTO calendar_credentials (
        id, user_id, provider, access_token, refresh_token, token_expiry, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (user_id, provider) DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = COALESCE(EXCLUDED.refresh_token, calendar_credentials.refresh_token),
        token_expiry = EXCLUDED.token_expiry,
        updated_at = EXCLUDED.updated_at
      RETURNING user_id, token_expiry, created_at`,
      [
        uuid(),
        userId,
        'google',
        tokens.access_token,
        tokens.refresh_token || null,
        tokenExpiry,
        new Date(),
        new Date()
      ]
    );

    if (result.rows.length === 0) {
      throw new Error('[GOOGLE_OAUTH] Failed to store credentials');
    }

    const stored = result.rows[0];
    console.log(`[GOOGLE_OAUTH] Credentials stored for user ${userId}, expiry: ${stored.token_expiry}`);

    return {
      userId,
      tokenExpiry: stored.token_expiry,
      stored: true
    };
  } catch (err) {
    console.error(`[GOOGLE_OAUTH] Failed to store credentials for user ${userId}:`, err.message);
    throw err;
  }
}

/**
 * Retrieve Google OAuth credentials for a user
 * 
 * @param {string} userId - User UUID
 * @returns {object} Credentials with access_token, refresh_token, token_expiry
 * @throws {Error} If credentials not found or retrieval fails
 */
async function getCredentials(userId) {
  if (!userId) {
    throw new Error('[GOOGLE_OAUTH] userId is required');
  }

  try {
    const result = await pool.query(
      `SELECT access_token, refresh_token, token_expiry 
       FROM calendar_credentials 
       WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error(`[GOOGLE_OAUTH] No credentials found for user ${userId}`);
    }

    return result.rows[0];
  } catch (err) {
    console.error(`[GOOGLE_OAUTH] Failed to retrieve credentials for user ${userId}:`, err.message);
    throw err;
  }
}

/**
 * Refresh Google OAuth access token using refresh token
 * 
 * TASK 2: IMPLEMENT REFRESH PROPERLY
 * Uses EXACT Google flow:
 * - oauth2Client.setCredentials({ refresh_token })
 * - const { credentials } = await oauth2Client.refreshAccessToken()
 * - Extract credentials.access_token and credentials.expiry_date
 * - DO NOT expect refresh_token again
 * 
 * @param {string} userId - User UUID
 * @returns {object} New credentials with access_token, expiry_date
 * @throws {Error} If refresh_token missing or refresh fails
 */
async function refreshAccessToken(userId) {
  console.log(`[TOKEN] Attempting refresh for user ${userId}`);
  
  try {
    // Get existing credentials (need refresh_token)
    const existingCredentials = await getCredentials(userId);
    
    // TASK 5: FAIL ONLY ON REAL FAILURE
    // Only throw if refresh_token missing
    if (!existingCredentials.refresh_token) {
      const error = `[TOKEN] Refresh token missing for user ${userId} - reconnect required`;
      console.error(error);
      throw new Error(error);
    }
    
    console.log(`[TOKEN] Refresh token present`);
    
    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );
    
    // Set credentials with only refresh_token
    oauth2Client.setCredentials({
      refresh_token: existingCredentials.refresh_token
    });
    
    // TASK 2: EXACT GOOGLE FLOW
    // Call refreshAccessToken() and extract credentials
    const { credentials } = await oauth2Client.refreshAccessToken();
    
    console.log(`[TOKEN] Refresh success`);
    
    // Extract new tokens
    const newAccessToken = credentials.access_token;
    const newExpiryDate = credentials.expiry_date ? new Date(credentials.expiry_date) : null;
    
    // TASK 3: PERSIST TOKENS SAFELY
    // Update DB: preserve refresh_token, update access_token + expiry_date
    try {
      const result = await pool.query(
        `UPDATE calendar_credentials 
         SET access_token = $1, 
             token_expiry = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $3 AND provider = 'google'
         RETURNING access_token, refresh_token, token_expiry`,
        [newAccessToken, newExpiryDate, userId]
      );
      
      if (result.rows.length === 0) {
        throw new Error(`[TOKEN] Failed to update credentials for user ${userId}`);
      }
      
      console.log(`[TOKEN] Credentials persisted: access_token updated, expiry=${newExpiryDate}`);
      
      return {
        access_token: newAccessToken,
        expiry_date: newExpiryDate,
        refresh_token: existingCredentials.refresh_token // IMPORTANT: preserve original
      };
    } catch (dbErr) {
      console.error(`[TOKEN] Failed to persist refreshed token:`, dbErr.message);
      throw dbErr;
    }
  } catch (err) {
    console.error(`[TOKEN] Refresh failed — reconnect required: ${err.message}`);
    throw err;
  }
}

/**
 * Check if credentials are expired
 * 
 * @param {Date} tokenExpiry - Token expiry date
 * @param {number} bufferSeconds - Buffer before expiry to consider expired (default 300s = 5 min)
 * @returns {boolean} True if expired or about to expire
 */
function isTokenExpired(tokenExpiry, bufferSeconds = 300) {
  const now = new Date();
  const expiryWithBuffer = new Date(tokenExpiry);
  expiryWithBuffer.setSeconds(expiryWithBuffer.getSeconds() - bufferSeconds);
  return now >= expiryWithBuffer;
}

/**
 * Check if user has stored credentials
 * 
 * @param {string} userId - User UUID
 * @returns {boolean} True if credentials exist
 */
async function hasCredentials(userId) {
  try {
    const result = await pool.query(
      `SELECT 1 FROM calendar_credentials WHERE user_id = $1`,
      [userId]
    );
    return result.rows.length > 0;
  } catch (err) {
    console.error(`[GOOGLE_OAUTH] Error checking credentials for user ${userId}:`, err.message);
    return false;
  }
}

/**
 * Delete credentials for a user
 * 
 * @param {string} userId - User UUID
 * @returns {boolean} True if deleted
 */
async function deleteCredentials(userId) {
  try {
    const result = await pool.query(
      `DELETE FROM calendar_credentials WHERE user_id = $1 RETURNING user_id`,
      [userId]
    );

    if (result.rows.length > 0) {
      console.log(`[GOOGLE_OAUTH] Credentials deleted for user ${userId}`);
      return true;
    }

    return false;
  } catch (err) {
    console.error(`[GOOGLE_OAUTH] Failed to delete credentials for user ${userId}:`, err.message);
    throw err;
  }
}

module.exports = {
  storeCredentials,
  getCredentials,
  refreshAccessToken,
  isTokenExpired,
  hasCredentials,
  deleteCredentials,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
};
