import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';

describe('Nudge API End-to-End Test Suite', () => {
  let app;
  let mockToken;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    
    // Generate a valid mock JWT token for an arbitrary user for tests that require authentication.
    mockToken = await app.jwt.sign({ sub: '11111111-1111-1111-1111-111111111111' }, { expiresIn: '1h' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /healthz should return 200 OK', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
    });
    
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.status).toBe('healthy');
  });

  describe('Authentication Scenarios', () => {
    it('should block completely unauthenticated requests to protected endpoints', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/friends',
      });
      
      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.payload).error).toBeDefined();
    });
    
    it('should reject invalid or fabricated JWT tokens', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/friends',
        headers: {
          authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature'
        }
      });
      
      expect(response.statusCode).toBe(401);
    });
  });

  describe('Malformed Validation Scenarios', () => {
    it('POST /api/v1/statuses should block requests missing required JSON Schema fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/statuses',
        headers: {
          authorization: `Bearer ${mockToken}`
        },
        payload: {
          emoji: '😎' // missing 'text' field
        }
      });
      
      expect(response.statusCode).toBe(400); // Bad Request
    });
    
    it('POST /api/v1/circles should enforce hex color formatting constraints', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/circles',
        headers: {
          authorization: `Bearer ${mockToken}`
        },
        payload: {
          name: 'Weekend Crew',
          color: 'blue' // Invalid, should be hex like #0000FF
        }
      });
      
      expect(response.statusCode).toBe(400);
    });
  });
});
