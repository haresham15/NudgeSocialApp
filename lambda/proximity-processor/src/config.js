// ============================================================================
// Lambda Configuration
// ============================================================================
// Environment variables for the Lambda function, loaded from the Lambda
// runtime environment (set via AWS Console, SAM, or CDK).
// ============================================================================

export const config = {
  // ─── Database ────────────────────────────────────────────
  DATABASE_URL: process.env.DATABASE_URL,

  // ─── Anthropic Claude ────────────────────────────────────
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  CLAUDE_MODEL: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
  CLAUDE_MAX_TOKENS: parseInt(process.env.CLAUDE_MAX_TOKENS || '1024', 10),

  // ─── Yelp Fusion ─────────────────────────────────────────
  YELP_FUSION_API_KEY: process.env.YELP_FUSION_API_KEY,
  YELP_SEARCH_LIMIT: parseInt(process.env.YELP_SEARCH_LIMIT || '5', 10),
  YELP_SEARCH_RADIUS: parseInt(process.env.YELP_SEARCH_RADIUS || '800', 10), // meters

  // ─── Apple WeatherKit ────────────────────────────────────
  APPLE_WEATHERKIT_TOKEN: process.env.APPLE_WEATHERKIT_TOKEN,

  // ─── APNs ────────────────────────────────────────────────
  APNS_KEY_ID: process.env.APNS_KEY_ID,
  APNS_TEAM_ID: process.env.APNS_TEAM_ID,
  APNS_BUNDLE_ID: process.env.APNS_BUNDLE_ID || 'com.nudge.app',

  // ─── Tuning ──────────────────────────────────────────────
  /** Maximum time for Claude API call (ms) — PRD mandates 4 seconds */
  AI_LATENCY_BUDGET_MS: parseInt(process.env.AI_LATENCY_BUDGET_MS || '4000', 10),
};
