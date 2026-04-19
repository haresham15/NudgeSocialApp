// ============================================================================
// Auth Module — Service Layer
// ============================================================================
// Business logic for authentication:
//   1. Apple Sign-In: Server-side JWT validation via Apple's JWKS endpoint
//   2. Twilio Verify: Phone number OTP send & check
//   3. User upsert: Creates or retrieves user from PostgreSQL
//
// Apple token validation uses the `jose` library to fetch Apple's published
// JWKS (JSON Web Key Set) and cryptographically verify the identity token.
// This is the highest-security approach (vs. trusting client-side validation).
// ============================================================================

import * as jose from 'jose';
import {
  APPLE_JWKS_URI,
  APPLE_TOKEN_ISSUER,
} from '../../utils/constants.js';
import { Errors } from '../../utils/errors.js';

// ─── Apple JWKS cache (in-memory, refreshed automatically by jose) ──────────
let appleJWKS = null;

/**
 * Returns a cached JWKS remote key set for Apple's identity service.
 * jose handles key rotation and caching internally.
 */
function getAppleJWKS() {
  if (!appleJWKS) {
    appleJWKS = jose.createRemoteJWKSet(new URL(APPLE_JWKS_URI));
  }
  return appleJWKS;
}

/**
 * Validates an Apple identity token (JWT) against Apple's JWKS endpoint.
 *
 * @param {string} identityToken — The raw JWT from Sign in with Apple
 * @param {string} clientId      — Expected audience (bundle ID)
 * @returns {Promise<object>}    — Decoded token payload { sub, email, ... }
 * @throws {AppError}            — 401 if token is invalid or expired
 */
export async function validateAppleToken(identityToken, clientId) {
  try {
    const jwks = getAppleJWKS();
    const { payload } = await jose.jwtVerify(identityToken, jwks, {
      issuer: APPLE_TOKEN_ISSUER,
      audience: clientId,
    });
    return payload;
  } catch (err) {
    throw Errors.unauthorized(
      `Apple token validation failed: ${err.message}`,
    );
  }
}

/**
 * Upserts a user based on Apple ID. If the user already exists, updates
 * last_active_at and returns the existing record. If new, creates a fresh
 * user row.
 *
 * @param {import('pg').Pool} db
 * @param {object} params
 * @param {string} params.appleId     — Apple's unique `sub` claim
 * @param {string} params.displayName — User's chosen display name
 * @param {string} [params.email]     — Email (only on first Apple sign-in)
 * @returns {Promise<{user: object, isNewUser: boolean}>}
 */
export async function upsertUserByAppleId(db, { appleId, displayName, email }) {
  // Try to find existing user
  const existing = await db.query(
    'SELECT * FROM users WHERE apple_id = $1',
    [appleId],
  );

  if (existing.rows.length > 0) {
    // Update last_active_at
    await db.query(
      'UPDATE users SET last_active_at = NOW() WHERE id = $1',
      [existing.rows[0].id],
    );
    return { user: existing.rows[0], isNewUser: false };
  }

  // Create new user
  const result = await db.query(
    `INSERT INTO users (apple_id, display_name, settings)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [appleId, displayName, JSON.stringify({ email })],
  );

  return { user: result.rows[0], isNewUser: true };
}

/**
 * Sends an OTP to a phone number via Twilio Verify.
 *
 * @param {object} config — Fastify config with Twilio credentials
 * @param {string} phoneNumber — E.164 formatted phone number
 * @returns {Promise<{status: string}>}
 */
export async function sendPhoneVerification(config, phoneNumber) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } = config;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
    throw Errors.internal('Twilio credentials not configured');
  }

  const url = `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/Verifications`;
  const credentials = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To: phoneNumber,
      Channel: 'sms',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw Errors.badRequest(`Twilio error: ${error.message || 'Failed to send OTP'}`);
  }

  const data = await response.json();
  return { status: data.status };
}

/**
 * Verifies a phone number OTP via Twilio Verify.
 *
 * @param {object} config — Fastify config with Twilio credentials
 * @param {string} phoneNumber — E.164 phone number
 * @param {string} code — OTP code entered by user
 * @returns {Promise<{valid: boolean}>}
 */
export async function checkPhoneVerification(config, phoneNumber, code) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } = config;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
    throw Errors.internal('Twilio credentials not configured');
  }

  const url = `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`;
  const credentials = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To: phoneNumber,
      Code: code,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw Errors.badRequest(`Twilio error: ${error.message || 'Verification failed'}`);
  }

  const data = await response.json();
  return { valid: data.status === 'approved' };
}

/**
 * Marks a user's phone number as verified in the database.
 *
 * @param {import('pg').Pool} db
 * @param {string} userId — UUID of the user
 * @param {string} phoneNumber — Verified phone number
 */
export async function markPhoneVerified(db, userId, phoneNumber) {
  await db.query(
    `UPDATE users
     SET phone_number = $1, phone_verified = TRUE, updated_at = NOW()
     WHERE id = $2`,
    [phoneNumber, userId],
  );
}
