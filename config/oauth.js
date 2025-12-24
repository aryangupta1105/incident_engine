/**
 * OAuth Configuration
 * 
 * Single source of truth for Google OAuth configuration.
 * All files using OAuth scopes must import this constant.
 * 
 * Requirements:
 * - openid: Required for id_token with identity claims
 * - email: Required for email claim in id_token
 * - profile: Required for name claim in id_token
 * - calendar.readonly: Required for calendar sync
 */

const GOOGLE_OAUTH_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.readonly'
];

module.exports = {
  GOOGLE_OAUTH_SCOPES
};
