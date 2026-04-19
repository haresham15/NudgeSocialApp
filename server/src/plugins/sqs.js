// ============================================================================
// Plugin — AWS SQS (Proximity Match Queue)
// ============================================================================
// Creates an SQS client and decorates the Fastify instance with `fastify.sqs`.
// Provides a `sendProximityMatch` method that formats and sends proximity
// match messages to the configured SQS queue for async AI processing.
//
// Message schema follows the Nudge proximity match format, which the Lambda
// consumer (Step 3) will dequeue and process through Claude Sonnet.
//
// In development mode without AWS credentials, messages are logged to console.
// ============================================================================

import fp from 'fastify-plugin';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

/**
 * @typedef {object} ProximityMatchMessage
 * @property {string} senderId      — User who triggered the location check
 * @property {string} receiverId    — Matched friend
 * @property {number} distanceMeters — Computed Haversine distance
 * @property {string|null} circleId — Circle context (if any)
 * @property {string|null} circleName
 * @property {string} timestamp     — ISO8601 when the match occurred
 * @property {string} matchId       — Unique match identifier for idempotency
 */

async function sqsPlugin(fastify) {
  const queueUrl = fastify.config.SQS_PROXIMITY_QUEUE_URL;
  const region = fastify.config.AWS_REGION;

  // If no SQS URL configured, run in stub mode (development)
  if (!queueUrl) {
    fastify.log.warn(
      'SQS_PROXIMITY_QUEUE_URL not configured — running in local stub mode. ' +
      'Proximity matches will be logged but not queued.',
    );

    fastify.decorate('sqs', {
      /**
       * Stub: logs the message instead of sending to SQS.
       * @param {ProximityMatchMessage} message
       */
      async sendProximityMatch(message) {
        fastify.log.info(
          { message },
          '[SQS STUB] Proximity match (would be queued)',
        );
        return { MessageId: `stub-${Date.now()}`, stubbed: true };
      },
    });

    return;
  }

  // Production: create real SQS client
  const client = new SQSClient({ region });

  fastify.log.info({ region, queueUrl: queueUrl.slice(-40) }, 'SQS client initialized');

  fastify.decorate('sqs', {
    /**
     * Sends a proximity match message to the SQS queue.
     *
     * Message attributes include:
     *   - matchType: "proximity" (for future routing/filtering)
     *   - priority: "high" (proximity matches are time-sensitive)
     *
     * The message body is JSON with the full match context needed by
     * the Lambda consumer to:
     *   1. Fetch venue data from Yelp Fusion
     *   2. Fetch weather from Apple WeatherKit
     *   3. Generate suggestions via Claude Sonnet
     *   4. Send push notifications via APNs
     *
     * @param {ProximityMatchMessage} message
     * @returns {Promise<import('@aws-sdk/client-sqs').SendMessageCommandOutput>}
     */
    async sendProximityMatch(message) {
      const command = new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({
          version: '1.0',
          type: 'proximity_match',
          data: message,
        }),
        MessageAttributes: {
          matchType: {
            DataType: 'String',
            StringValue: 'proximity',
          },
          priority: {
            DataType: 'String',
            StringValue: 'high',
          },
        },
        // Use the canonical pair key as deduplication ID
        // (SQS FIFO queues only, but future-proof)
        MessageGroupId: 'proximity-matches',
        // 5-minute deduplication window at the SQS level as a safety net
        MessageDeduplicationId: message.matchId,
      });

      try {
        const result = await client.send(command);

        fastify.log.info(
          { messageId: result.MessageId, matchId: message.matchId },
          'Proximity match queued to SQS',
        );

        return result;
      } catch (err) {
        fastify.log.error(
          { err, matchId: message.matchId },
          'Failed to send proximity match to SQS',
        );
        throw err;
      }
    },
  });

  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    fastify.log.info('Destroying SQS client…');
    client.destroy();
  });
}

export default fp(sqsPlugin, {
  name: 'sqs',
});
