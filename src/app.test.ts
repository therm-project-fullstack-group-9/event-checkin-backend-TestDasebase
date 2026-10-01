import request from 'supertest';
import app from './app';

describe('GET /api/health', () => {
  it('should return status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      message: 'EventsCheckIN Backend is running! 🚀',
    });
  });
});