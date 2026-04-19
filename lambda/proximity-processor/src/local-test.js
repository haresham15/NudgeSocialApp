// ============================================================================
// Local Test Harness — Lambda Proximity Processor
// ============================================================================
// Simulates an SQS event to test the Lambda handler locally without AWS.
//
// Usage: node src/local-test.js
//
// Requires:
//   - .env file with ANTHROPIC_API_KEY (optional for fallback test)
//   - PostgreSQL running with nudge_db (optional for fallback test)
// ============================================================================

import 'dotenv/config';
import { handler } from './handler.js';

// Mock SQS event with a proximity match
const mockSQSEvent = {
  Records: [
    {
      messageId: 'test-msg-001',
      receiptHandle: 'test-receipt',
      body: JSON.stringify({
        version: '1.0',
        type: 'proximity_match',
        data: {
          matchId: 'a1b2c3d4-test-0001-0000-000000000001',
          senderId: 'aaaaaaaa-0000-0000-0000-000000000001',
          receiverId: 'bbbbbbbb-0000-0000-0000-000000000002',
          senderName: null, // Will be fetched from DB
          receiverName: 'Jordan',
          distanceMeters: 234,
          circleId: null,
          circleName: 'College Crew',
          timestamp: new Date().toISOString(),
          // For venue/weather lookup (approximate, not exact GPS)
          approximateLat: 40.7580,
          approximateLng: -73.9855,
        },
      }),
      messageAttributes: {},
      md5OfBody: '',
      eventSource: 'aws:sqs',
      eventSourceARN: 'arn:aws:sqs:us-east-1:123456789:nudge-proximity',
      awsRegion: 'us-east-1',
    },
  ],
};

async function runTest() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  🧪 Local Lambda Test — Proximity Processor');
  console.log('═══════════════════════════════════════════════════════');
  console.log();

  const startTime = Date.now();

  try {
    const result = await handler(mockSQSEvent);
    const totalMs = Date.now() - startTime;

    console.log();
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  ✅ Test completed in ${totalMs}ms`);
    console.log(`  Failures: ${result.batchItemFailures.length}`);
    console.log('═══════════════════════════════════════════════════════');

    if (result.batchItemFailures.length > 0) {
      console.log('  Failed records:', result.batchItemFailures);
    }
  } catch (err) {
    const totalMs = Date.now() - startTime;
    console.error();
    console.error('═══════════════════════════════════════════════════════');
    console.error(`  ❌ Test failed in ${totalMs}ms`);
    console.error(`  Error: ${err.message}`);
    console.error('═══════════════════════════════════════════════════════');
    console.error(err.stack);
  }
}

runTest();
