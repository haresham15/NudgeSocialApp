// ============================================================================
// Lambda Handler — Proximity Match Processor
// ============================================================================
// This is the main entry point for the AWS Lambda function that:
//
//   1. Dequeues proximity match messages from SQS
//   2. Fetches user context from PostgreSQL (names, statuses, push tokens)
//   3. Fetches venue context from Yelp Fusion (nearby places)
//   4. Fetches weather context from Apple WeatherKit (current conditions)
//   5. Generates a personalized meetup suggestion via Claude Sonnet
//   6. Builds an APNs push notification payload
//   7. Updates the nudge_events table with AI results
//   8. (Future) Sends the push notification via APNs HTTP/2
//
// The handler processes SQS events in batches. Each record is processed
// independently — failures are tracked per-record for partial batch
// acknowledgment via SQS batchItemFailures.
//
// Architecture: SQS → Lambda (this) → Claude + Yelp + WeatherKit → DB + APNs
// ============================================================================

import { config } from './config.js';
import { fetchMatchContext, updateNudgeEvent } from './db.js';
import { fetchVenueContext } from './clients/yelp.js';
import { fetchWeatherContext } from './clients/weatherkit.js';
import { generateNudgeSuggestion } from './clients/claude.js';
import { buildNudgeNotification } from './notifications/apns.js';

/**
 * AWS Lambda handler for SQS events.
 *
 * @param {import('aws-lambda').SQSEvent} event
 * @returns {Promise<import('aws-lambda').SQSBatchResponse>}
 */
export async function handler(event) {
  console.log(`[Handler] Processing ${event.Records.length} proximity match(es)`);

  const batchItemFailures = [];

  for (const record of event.Records) {
    try {
      await processRecord(record);
    } catch (err) {
      console.error(
        `[Handler] Failed to process record ${record.messageId}:`,
        err.message,
      );
      // Report this record as failed — SQS will retry it
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  console.log(
    `[Handler] Batch complete: ${event.Records.length - batchItemFailures.length} succeeded, ` +
    `${batchItemFailures.length} failed`,
  );

  // Return partial batch response — only failed items will be retried
  return { batchItemFailures };
}

/**
 * Processes a single SQS record containing a proximity match.
 *
 * @param {import('aws-lambda').SQSRecord} record
 */
async function processRecord(record) {
  const startTime = Date.now();

  // 1. Parse the SQS message
  const message = JSON.parse(record.body);

  if (message.version !== '1.0' || message.type !== 'proximity_match') {
    console.warn(`[Handler] Unknown message format: ${message.type} v${message.version}`);
    return; // Acknowledge to prevent infinite retry
  }

  const match = message.data;
  console.log(
    `[Handler] Processing match ${match.matchId}: ` +
    `${match.senderId.slice(0, 8)}… ↔ ${match.receiverId.slice(0, 8)}… ` +
    `(${match.distanceMeters}m)`,
  );

  // 2. Fetch user context from PostgreSQL (with fallback for dev/offline)
  let sender, receiver;
  try {
    const matchCtx = await fetchMatchContext(
      config.DATABASE_URL,
      match.senderId,
      match.receiverId,
    );
    sender = matchCtx.sender;
    receiver = matchCtx.receiver;
  } catch (err) {
    console.warn(`[Handler] DB unavailable — using SQS message data: ${err.message}`);
    sender = {
      id: match.senderId,
      displayName: match.senderName || 'Friend',
      avatarUrl: null,
      statusEmoji: null,
      statusText: null,
      pushToken: null,
    };
    receiver = {
      id: match.receiverId,
      displayName: match.receiverName || 'Friend',
      avatarUrl: null,
      statusEmoji: null,
      statusText: null,
      pushToken: null,
    };
  }

  console.log(
    `[Handler] Users: ${sender.displayName} ↔ ${receiver.displayName}`,
  );

  // 3. Fetch venue and weather context IN PARALLEL
  //    We use a midpoint (approximate — since we don't have exact coords in Lambda)
  //    In production, the SQS message could include an approximate area slug
  //    or the Lambda could use the nudge_events table's approximate context.
  const [venueContext, weatherContext] = await Promise.all([
    fetchVenueContextSafe(match),
    fetchWeatherContextSafe(match),
  ]);

  const contextFetchMs = Date.now() - startTime;
  console.log(`[Handler] Context fetched in ${contextFetchMs}ms`);

  // 4. Generate AI suggestion via Claude Sonnet (within 4s budget)
  const aiStartTime = Date.now();
  const suggestion = await generateNudgeSuggestion({
    sender: {
      displayName: sender.displayName,
      statusEmoji: sender.statusEmoji,
      statusText: sender.statusText,
    },
    receiver: {
      displayName: receiver.displayName,
      statusEmoji: receiver.statusEmoji,
      statusText: receiver.statusText,
    },
    distanceMeters: match.distanceMeters,
    circleName: match.circleName,
    venues: venueContext,
    weather: weatherContext,
    timestamp: match.timestamp,
  });

  const aiMs = Date.now() - aiStartTime;
  console.log(
    `[Handler] Claude generated suggestion in ${aiMs}ms ` +
    `(budget: ${config.AI_LATENCY_BUDGET_MS}ms, ` +
    `${aiMs <= config.AI_LATENCY_BUDGET_MS ? 'WITHIN' : 'EXCEEDED'} budget)`,
  );

  // 5. Build APNs push notification payload
  const notification = buildNudgeNotification({
    matchId: match.matchId,
    senderName: sender.displayName,
    receiverName: receiver.displayName,
    suggestion,
    distanceMeters: match.distanceMeters,
    circleName: match.circleName,
  });

  // 6. Update nudge_events table with AI results
  try {
    await updateNudgeEvent(config.DATABASE_URL, match.matchId, {
      aiSuggestion: suggestion,
      venueContext,
      weatherContext,
    });
    console.log(`[Handler] Nudge event ${match.matchId} updated with AI suggestion`);
  } catch (err) {
    // Non-fatal — the suggestion was generated, we just couldn't persist it
    console.error(`[Handler] Failed to update nudge event:`, err.message);
  }

  // 7. Send push notification (placeholder — full APNs HTTP/2 in Step 5)
  if (receiver.pushToken) {
    console.log(
      `[Handler] Would send push to ${receiver.displayName}: "${notification.aps.alert.title}"`,
    );
    // TODO Step 5: APNs HTTP/2 push delivery
    // await sendAPNsPush(receiver.pushToken, notification);
  } else {
    console.log(`[Handler] No push token for ${receiver.displayName} — notification skipped`);
  }

  const totalMs = Date.now() - startTime;
  console.log(
    `[Handler] Match ${match.matchId} processed in ${totalMs}ms ` +
    `(context: ${contextFetchMs}ms, AI: ${aiMs}ms, confidence: ${suggestion.confidence})`,
  );
}

/**
 * Safely fetches venue context. If venue data is unavailable, returns
 * empty arrays rather than failing the entire pipeline.
 *
 * Note: In a real deployment, the SQS message would include approximate
 * coordinates or an area identifier. Since we don't store GPS in the
 * message (privacy), we'd need a short-lived coordinate lookup.
 * For now, this uses a configurable default location or the midpoint
 * from a brief Redis lookup.
 *
 * @param {object} match
 * @returns {Promise<{restaurants: Array, cafes: Array, activities: Array}>}
 */
async function fetchVenueContextSafe(match) {
  try {
    // In production: resolve approximate location from a short-lived cache
    // For now, return empty if no location context available
    // The Lambda would receive approximate area from an enriched SQS message
    const lat = match.approximateLat;
    const lng = match.approximateLng;

    if (lat && lng) {
      return await fetchVenueContext(lat, lng);
    }

    console.log('[Handler] No location context for venue lookup — using empty venues');
    return { restaurants: [], cafes: [], activities: [] };
  } catch (err) {
    console.error('[Handler] Venue fetch failed:', err.message);
    return { restaurants: [], cafes: [], activities: [] };
  }
}

/**
 * Safely fetches weather context.
 *
 * @param {object} match
 * @returns {Promise<object>}
 */
async function fetchWeatherContextSafe(match) {
  try {
    const lat = match.approximateLat;
    const lng = match.approximateLng;

    if (lat && lng) {
      return await fetchWeatherContext(lat, lng);
    }

    console.log('[Handler] No location context for weather lookup — using fallback');
    return {
      conditionCode: 'Unknown',
      description: 'Weather data unavailable',
      temperatureC: null,
      temperatureF: null,
      humidity: null,
      windSpeedKmh: null,
      uvIndex: 0,
      daylight: new Date().getHours() >= 6 && new Date().getHours() < 20 ? 'day' : 'night',
      precipChance: null,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[Handler] Weather fetch failed:', err.message);
    return {
      conditionCode: 'Unknown',
      description: 'Weather data unavailable',
      temperatureC: null,
      temperatureF: null,
      humidity: null,
      windSpeedKmh: null,
      uvIndex: 0,
      daylight: 'day',
      precipChance: null,
      fetchedAt: new Date().toISOString(),
    };
  }
}
