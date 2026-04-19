// ============================================================================
// Errors — Custom application error class
// ============================================================================
// Extends the native Error with an HTTP status code and an optional `details`
// payload. Fastify's error handler serializes these into structured JSON
// responses automatically.
// ============================================================================

export class AppError extends Error {
  /**
   * @param {string}  message    — Human-readable error description
   * @param {number}  statusCode — HTTP status code (default 500)
   * @param {string}  [code]     — Machine-readable error code (e.g. 'FRIENDSHIP_EXISTS')
   * @param {object}  [details]  — Optional structured details for the client
   */
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  /** Serialize for Fastify's error response. */
  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

// ─── Convenience factories ───────────────────────────────────────────────────

export const Errors = {
  notFound: (resource = 'Resource') =>
    new AppError(`${resource} not found`, 404, 'NOT_FOUND'),

  unauthorized: (message = 'Authentication required') =>
    new AppError(message, 401, 'UNAUTHORIZED'),

  forbidden: (message = 'Access denied') =>
    new AppError(message, 403, 'FORBIDDEN'),

  badRequest: (message = 'Invalid request', details = null) =>
    new AppError(message, 400, 'BAD_REQUEST', details),

  conflict: (message = 'Resource already exists') =>
    new AppError(message, 409, 'CONFLICT'),

  tooManyRequests: (message = 'Rate limit exceeded') =>
    new AppError(message, 429, 'TOO_MANY_REQUESTS'),

  cooldownActive: (expiresAt) =>
    new AppError(
      'Status cooldown is active',
      429,
      'COOLDOWN_ACTIVE',
      { expires_at: expiresAt },
    ),

  internal: (message = 'Internal server error') =>
    new AppError(message, 500, 'INTERNAL_ERROR'),
};
