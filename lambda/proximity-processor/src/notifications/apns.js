// ============================================================================
// APNs Notification Builder
// ============================================================================
// Constructs Apple Push Notification payloads for nudge events.
// The payload follows the APNs best practices:
//   - Rich notification with title, subtitle, body
//   - Custom data payload with match context for the iOS app
//   - Category for actionable notifications (Vibe Check buttons)
//   - Thread ID for conversation grouping
//   - Sound and badge management
//
// Note: Actual APNs delivery is handled by the iOS app's push infrastructure.
// This module builds the payload that gets stored in the nudge_events table
// and sent to the device via APNs HTTP/2.
// ============================================================================

/**
 * @typedef {object} APNsPayload
 * @property {object} aps           — Standard APNs payload
 * @property {object} nudge         — Custom data for the iOS app
 */

/**
 * Builds an APNs push notification payload for a nudge event.
 *
 * @param {object} params
 * @param {string} params.matchId         — Unique nudge event ID
 * @param {string} params.senderName      — Display name of the person nearby
 * @param {string} params.receiverName    — Display name of the recipient
 * @param {object} params.suggestion      — AI-generated NudgeSuggestion
 * @param {number} params.distanceMeters  — How far apart they are
 * @param {string|null} params.circleName — Circle context
 * @returns {APNsPayload}
 */
export function buildNudgeNotification({
  matchId,
  senderName,
  receiverName,
  suggestion,
  distanceMeters,
  circleName,
}) {
  return {
    // ─── Standard APNs Payload ─────────────────────────────
    aps: {
      alert: {
        title: suggestion.headline,
        subtitle: circleName ? `From your ${circleName} circle` : undefined,
        body: suggestion.body,
      },
      sound: 'nudge_notification.caf',
      badge: 1,
      'thread-id': `nudge-${matchId}`,
      // Category enables actionable notifications in iOS
      // Maps to UNNotificationCategory registered in the iOS app
      category: 'NUDGE_VIBE_CHECK',
      'mutable-content': 1, // Enable Notification Service Extension for rich media
      'interruption-level': 'time-sensitive', // Bypass Focus/DND for proximity alerts
    },

    // ─── Custom Data Payload ───────────────────────────────
    nudge: {
      matchId,
      senderName,
      receiverName,
      emoji: suggestion.emoji,
      tone: suggestion.tone,
      distanceMeters,
      circleName: circleName || null,
      venuePicks: suggestion.venuePicks,
      timeframing: suggestion.timeframing,
      icebreaker: suggestion.icebreaker,
      weatherNote: suggestion.weatherNote,
      confidence: suggestion.confidence,
    },
  };
}

/**
 * Builds an APNs payload for when both users matched (mutual nudge).
 * This is a higher-priority notification indicating both friends are
 * actively nearby.
 *
 * @param {object} params — Same as buildNudgeNotification
 * @returns {APNsPayload}
 */
export function buildMutualNudgeNotification(params) {
  const payload = buildNudgeNotification(params);

  // Upgrade to a mutual nudge
  payload.aps.alert.title = `${params.suggestion.emoji} ${params.senderName} is right here!`;
  payload.aps.sound = 'nudge_mutual.caf';
  payload.nudge.isMutual = true;

  return payload;
}

/**
 * Builds a silent push notification for background data refresh.
 * Used when the AI processing completes and the app needs to update
 * its local state without showing a visible notification.
 *
 * @param {string} matchId
 * @param {object} suggestion
 * @returns {APNsPayload}
 */
export function buildSilentDataPush(matchId, suggestion) {
  return {
    aps: {
      'content-available': 1,
    },
    nudge: {
      type: 'suggestion_ready',
      matchId,
      suggestion,
    },
  };
}
