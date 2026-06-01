'use strict';

// Silence winston (no log files written during tests) and stub the data layer
// so these tests exercise auth/validation logic only — no database required.
jest.mock('../logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../models/Order', () => ({ find: jest.fn(), findByIdAndUpdate: jest.fn() }));
jest.mock('../models/MenuItem', () => ({ find: jest.fn(), countDocuments: jest.fn() }));
jest.mock('../services/email', () => ({ sendConfirmationEmail: jest.fn() }));

const request  = require('supertest');
const createApp = require('../app');
const Order    = require('../models/Order');

const app = createApp();
const PASSWORD = process.env.TEST_ADMIN_PASSWORD;

async function loginAndGetToken() {
    const res = await request(app)
        .post('/api/admin/login')
        .send({ username: 'admin', password: PASSWORD });
    return res.body.token;
}

describe('POST /api/admin/login', () => {
    it('returns a token for correct credentials', async () => {
        const res = await request(app)
            .post('/api/admin/login')
            .send({ username: 'admin', password: PASSWORD });

        expect(res.status).toBe(200);
        expect(typeof res.body.token).toBe('string');
        expect(res.body.expiresAt).toBeGreaterThan(Date.now());
    });

    it('rejects a wrong password with 401 and a generic message', async () => {
        const res = await request(app)
            .post('/api/admin/login')
            .send({ username: 'admin', password: 'wrong-password' });

        expect(res.status).toBe(401);
        expect(res.body.message).toBe('Invalid credentials');
    });

    it('rejects an unknown username with the same generic 401', async () => {
        const res = await request(app)
            .post('/api/admin/login')
            .send({ username: 'attacker', password: PASSWORD });

        expect(res.status).toBe(401);
        expect(res.body.message).toBe('Invalid credentials');
    });

    it('rejects non-string fields with 400 (prototype-pollution guard)', async () => {
        const res = await request(app)
            .post('/api/admin/login')
            .send({ username: { $ne: null }, password: { $ne: null } });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Invalid request');
    });
});

describe('requireAdmin guard', () => {
    it('blocks an admin route with no token (401)', async () => {
        const res = await request(app).get('/api/orders');
        expect(res.status).toBe(401);
        expect(res.body.message).toBe('Authentication required');
    });

    it('blocks an admin route with a garbage token (401)', async () => {
        const res = await request(app)
            .get('/api/orders')
            .set('x-admin-token', 'not-a-real-jwt');
        expect(res.status).toBe(401);
        expect(res.body.message).toBe('Invalid admin token');
    });

    it('allows an admin route with a valid token (200)', async () => {
        Order.find.mockResolvedValue([]);
        const token = await loginAndGetToken();

        const res = await request(app)
            .get('/api/orders')
            .set('x-admin-token', token);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });
});

describe('validateObjectId guard', () => {
    it('rejects a malformed id with 400 before hitting the database', async () => {
        const token = await loginAndGetToken();
        const res = await request(app)
            .patch('/api/orders/not-a-valid-objectid')
            .set('x-admin-token', token)
            .send({ status: 'served' });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Invalid ID');
        expect(Order.findByIdAndUpdate).not.toHaveBeenCalled();
    });
});

describe('404 handler', () => {
    it('returns a JSON 404 for an unknown route', async () => {
        const res = await request(app).get('/api/does-not-exist');
        expect(res.status).toBe(404);
        expect(res.body.message).toBe('Not found');
    });
});
