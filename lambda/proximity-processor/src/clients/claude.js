// ============================================================================
// Claude Sonnet — AI Surroundings Engine
// ============================================================================
// Generates contextual, personalized meetup suggestions using Anthropic's
// Claude Sonnet API. The prompt is constructed with:
//
//   1. Friend context (names, statuses, relationship via circles)
//   2. Venue context (nearby restaurants, cafes, activities from Yelp)
//   3. Weather context (current conditions from Apple WeatherKit)
//   4. Temporal context (time of day, day of week)
//
// CRITICAL CONSTRAINTS (from PRD):
//   - Output must be STRUCTURED JSON exclusively
//   - No markdown preambles
//   - Must execute within a 4-second latency budget
//   - Must feel warm, personal, and contextually intelligent
// ============================================================================

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

// ─── Response JSON Schema ────────────────────────────────────────────────────
// This schema is enforced via Claude's system prompt. The Lambda handler
// validates the response against this structure.

/**
 * @typedef {object} NudgeSuggestion
 * @property {string}   headline        — Short, punchy notification headline (≤60 chars)
 * @property {string}   body            — Notification body with suggestion detail (≤160 chars)
 * @property {string}   emoji           — Single emoji that captures the vibe
 * @property {string}   tone            — "excited" | "chill" | "spontaneous" | "cozy" | "adventurous"
 * @property {object[]} venuePickss     — Top 3 venue recommendations
 * @property {string}   venuePickss[].name
 * @property {string}   venuePickss[].reason    — Why this venue fits the context
 * @property {string}   venuePickss[].category
 * @property {string}   timeframing     — Suggested timing ("right now", "in 15 min", "after work")
 * @property {string}   icebreaker      — Conversation starter or activity idea
 * @property {string}   weatherNote     — Weather-aware suggestion (e.g. "Perfect patio weather!")
 * @property {number}   confidence      — 0.0–1.0 confidence in the suggestion quality
 */

const RESPONSE_SCHEMA = `{
  "headline": "string (≤60 chars, punchy notification title)",
  "body": "string (≤160 chars, the main suggestion)",
  "emoji": "string (single emoji)",
  "tone": "excited | chill | spontaneous | cozy | adventurous",
  "venuePicks": [
    {
      "name": "string (venue name)",
      "reason": "string (≤80 chars, why this venue fits)",
      "category": "string (restaurant | cafe | activity)"
    }
  ],
  "timeframing": "string (suggested timing)",
  "icebreaker": "string (conversation starter or activity idea)",
  "weatherNote": "string (weather-aware note, ≤80 chars)",
  "confidence": "number (0.0-1.0)"
}`;

// ─── System Prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Nudge AI, a warm and socially intelligent assistant that helps friends connect in real life. Your role is to create delightful, contextually-aware meetup suggestions when two friends are detected nearby each other.

## Your Personality
- Warm, enthusiastic, but never pushy
- Socially aware — you read the room (weather, time, venue vibes)
- Concise and punchy — this goes into a mobile push notification
- You use natural language, not corporate-speak
- You're a friend suggesting plans, not a concierge reading a script

## Output Rules — CRITICAL
1. Respond with ONLY a valid JSON object. No markdown, no backticks, no preamble, no explanation.
2. The JSON must exactly match this schema:
${RESPONSE_SCHEMA}
3. The "headline" is the push notification title — make it attention-grabbing but not clickbaity
4. The "body" is the notification body — include the specific suggestion
5. "venuePicks" should contain 1-3 venues from the provided context, with personalized reasons
6. If no venues are available, suggest general activities instead
7. The "icebreaker" should be fun, specific to the context, and not generic
8. "weatherNote" should tie weather conditions to your suggestion (e.g., "Perfect patio weather!" or "Cozy indoor vibes today ☔")
9. "confidence" should reflect how good your context data is (low if weather/venues missing)

## Context Awareness
- Morning (6am-11am): Coffee, brunch, morning walks
- Lunch (11am-2pm): Lunch spots, quick bites
- Afternoon (2pm-5pm): Activities, shopping, exploring
- Evening (5pm-9pm): Dinner, drinks, events
- Night (9pm+): Late-night food, casual hangouts
- Consider the weather — suggest indoor activities in bad weather
- Consider friend statuses — if someone's status mentions specific moods/activities, incorporate that`;

/**
 * Generates a contextual nudge suggestion using Claude Sonnet.
 *
 * @param {object} context
 * @param {object} context.sender         — { displayName, statusEmoji, statusText }
 * @param {object} context.receiver       — { displayName, statusEmoji, statusText }
 * @param {number} context.distanceMeters — How far apart they are
 * @param {string|null} context.circleName — Circle context if applicable
 * @param {object} context.venues         — { restaurants, cafes, activities }
 * @param {object} context.weather        — WeatherContext object
 * @param {string} context.timestamp      — ISO8601 when the match occurred
 * @returns {Promise<NudgeSuggestion>}
 */
export async function generateNudgeSuggestion(context) {
  if (!config.ANTHROPIC_API_KEY) {
    console.warn('[Claude] API key not configured — returning fallback suggestion');
    return buildFallbackSuggestion(context);
  }

  const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  const userPrompt = buildUserPrompt(context);

  try {
    const response = await client.messages.create({
      model: config.CLAUDE_MODEL,
      max_tokens: config.CLAUDE_MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      // Enforce JSON output
      stop_sequences: [],
      temperature: 0.7,
    });

    // Extract text content
    const text = response.content
      ?.filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');

    if (!text) {
      console.error('[Claude] Empty response');
      return buildFallbackSuggestion(context);
    }

    // Parse and validate JSON
    const suggestion = parseClaudeResponse(text);

    if (!suggestion) {
      console.error('[Claude] Failed to parse response:', text.slice(0, 200));
      return buildFallbackSuggestion(context);
    }

    return suggestion;
  } catch (err) {
    console.error('[Claude] API error:', err.message);
    return buildFallbackSuggestion(context);
  }
}

/**
 * Builds the user prompt with all available context.
 * @param {object} context
 * @returns {string}
 */
function buildUserPrompt(context) {
  const { sender, receiver, distanceMeters, circleName, venues, weather, timestamp } = context;

  const now = new Date(timestamp);
  const hour = now.getHours();
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });

  let timeOfDay;
  if (hour >= 6 && hour < 11) timeOfDay = 'morning';
  else if (hour >= 11 && hour < 14) timeOfDay = 'lunchtime';
  else if (hour >= 14 && hour < 17) timeOfDay = 'afternoon';
  else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
  else timeOfDay = 'night';

  // Build the context string
  let prompt = `Two friends have been detected near each other and may want to meet up.\n\n`;

  prompt += `## Friend Details\n`;
  prompt += `- **Person A**: ${sender.displayName}`;
  if (sender.statusEmoji || sender.statusText) {
    prompt += ` (status: ${sender.statusEmoji || ''} ${sender.statusText || ''})`.trim();
  }
  prompt += `\n`;

  prompt += `- **Person B**: ${receiver.displayName}`;
  if (receiver.statusEmoji || receiver.statusText) {
    prompt += ` (status: ${receiver.statusEmoji || ''} ${receiver.statusText || ''})`.trim();
  }
  prompt += `\n`;

  prompt += `- **Distance**: ~${distanceMeters} meters apart\n`;
  if (circleName) {
    prompt += `- **Friend Circle**: "${circleName}"\n`;
  }

  prompt += `\n## Timing\n`;
  prompt += `- **Day**: ${dayName}\n`;
  prompt += `- **Time**: ${timeOfDay} (${hour}:${String(now.getMinutes()).padStart(2, '0')})\n`;

  prompt += `\n## Weather\n`;
  if (weather && weather.conditionCode !== 'Unknown') {
    prompt += `- **Conditions**: ${weather.description}\n`;
    if (weather.temperatureF != null) {
      prompt += `- **Temperature**: ${weather.temperatureF}°F (${weather.temperatureC}°C)\n`;
    }
    if (weather.humidity != null) {
      prompt += `- **Humidity**: ${Math.round(weather.humidity * 100)}%\n`;
    }
    prompt += `- **Time of Day**: ${weather.daylight}\n`;
    if (weather.precipChance != null && weather.precipChance > 0.3) {
      prompt += `- **Rain Likely**: Yes\n`;
    }
  } else {
    prompt += `- Weather data unavailable\n`;
  }

  prompt += `\n## Nearby Venues\n`;

  const allVenues = [
    ...(venues.restaurants || []),
    ...(venues.cafes || []),
    ...(venues.activities || []),
  ];

  if (allVenues.length > 0) {
    for (const v of allVenues) {
      prompt += `- **${v.name}** (${v.category}) — ${v.distanceM}m away`;
      if (v.rating) prompt += `, ${v.rating}★`;
      if (v.priceLevel) prompt += `, ${v.priceLevel}`;
      prompt += `\n`;
    }
  } else {
    prompt += `- No specific venue data available — suggest general activities.\n`;
  }

  prompt += `\nGenerate a personalized nudge suggestion. Respond with ONLY the JSON object.`;

  return prompt;
}

/**
 * Parses and validates Claude's JSON response.
 * Strips any accidental markdown fencing or preamble.
 *
 * @param {string} text — Raw response text
 * @returns {NudgeSuggestion|null}
 */
function parseClaudeResponse(text) {
  // Strip potential markdown code fencing
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  try {
    const parsed = JSON.parse(cleaned);

    // Validate required fields
    if (!parsed.headline || !parsed.body || !parsed.emoji) {
      console.warn('[Claude] Response missing required fields');
      return null;
    }

    // Clamp/default values
    return {
      headline: String(parsed.headline).slice(0, 60),
      body: String(parsed.body).slice(0, 160),
      emoji: String(parsed.emoji).slice(0, 4),
      tone: ['excited', 'chill', 'spontaneous', 'cozy', 'adventurous'].includes(parsed.tone)
        ? parsed.tone
        : 'spontaneous',
      venuePicks: Array.isArray(parsed.venuePicks)
        ? parsed.venuePicks.slice(0, 3).map((v) => ({
            name: String(v.name || '').slice(0, 100),
            reason: String(v.reason || '').slice(0, 80),
            category: String(v.category || 'activity'),
          }))
        : [],
      timeframing: String(parsed.timeframing || 'right now').slice(0, 50),
      icebreaker: String(parsed.icebreaker || '').slice(0, 200),
      weatherNote: String(parsed.weatherNote || '').slice(0, 80),
      confidence: typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5,
    };
  } catch (err) {
    console.error('[Claude] JSON parse error:', err.message);
    return null;
  }
}

/**
 * Builds a reasonable fallback suggestion when Claude is unavailable.
 * Uses venue context if available.
 *
 * @param {object} context
 * @returns {NudgeSuggestion}
 */
function buildFallbackSuggestion(context) {
  const { sender, receiver, venues } = context;
  const topVenue = venues?.restaurants?.[0] || venues?.cafes?.[0] || venues?.activities?.[0];

  return {
    headline: `${sender.displayName} is nearby! 👋`,
    body: topVenue
      ? `You're both near ${topVenue.name} — perfect chance to catch up!`
      : `You and ${receiver.displayName} are close by — time to hang out?`,
    emoji: '👋',
    tone: 'spontaneous',
    venuePicks: topVenue
      ? [{ name: topVenue.name, reason: 'Closest open venue nearby', category: topVenue.category }]
      : [],
    timeframing: 'right now',
    icebreaker: `Ask ${receiver.displayName} what they're up to!`,
    weatherNote: '',
    confidence: 0.3,
  };
}
