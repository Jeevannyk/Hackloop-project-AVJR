'use strict';

// The single most important security behaviour in this backend: the server
// recomputes order totals from its own database and ignores any price the
// client submits. These tests lock that in.

jest.mock('../logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../services/email', () => ({ sendConfirmationEmail: jest.fn() }));

// Order is used as a constructor (`new Order(doc).save()`); the saved doc is
// echoed back so the test can inspect the persisted prices/total.
jest.mock('../models/Order', () => {
    function Order(doc) { Object.assign(this, doc); }
    Order.prototype.save = function () {
        return Promise.resolve({ _id: 'order-test-id', ...this });
    };
    Order.find = jest.fn();
    Order.findByIdAndUpdate = jest.fn();
    return Order;
});
jest.mock('../models/MenuItem', () => ({ find: jest.fn() }));

const request   = require('supertest');
const createApp = require('../app');
const MenuItem  = require('../models/MenuItem');
const { sendConfirmationEmail } = require('../services/email');

const app = createApp();

const validCustomer = {
    name:        'Asha',
    email:       'asha@example.com',
    phone:       '9999999999',
    arrivalTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
};

beforeEach(() => jest.clearAllMocks());

describe('POST /api/order — price recomputation', () => {
    it('ignores a client-tampered price and uses the database price', async () => {
        // Client claims the pizza costs Rs.1; the DB says Rs.109.
        MenuItem.find.mockResolvedValue([{ name: 'Veggie Pizza', price: 109 }]);

        const res = await request(app).post('/api/order').send({
            ...validCustomer,
            items: [{ name: 'Veggie Pizza', price: 1, quantity: 2 }],
        });

        expect(res.status).toBe(201);
        expect(res.body.items[0].price).toBe(109);        // DB price, not 1
        expect(res.body.totalPrice).toBe(218);            // 109 * 2, not 2
        expect(sendConfirmationEmail).toHaveBeenCalledTimes(1);
    });

    it('rejects an item that is not on the live menu', async () => {
        MenuItem.find.mockResolvedValue([]); // nothing matches

        const res = await request(app).post('/api/order').send({
            ...validCustomer,
            items: [{ name: 'Free Gold Bar', price: 0, quantity: 1 }],
        });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe('"Free Gold Bar" is not on the menu');
    });

    it('rejects an out-of-range quantity', async () => {
        MenuItem.find.mockResolvedValue([{ name: 'Veggie Pizza', price: 109 }]);

        const res = await request(app).post('/api/order').send({
            ...validCustomer,
            items: [{ name: 'Veggie Pizza', price: 109, quantity: 999 }],
        });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/Invalid quantity/);
    });
});

describe('POST /api/order — input validation', () => {
    it('rejects a request with missing customer fields', async () => {
        const res = await request(app).post('/api/order').send({
            name:  'Asha',
            items: [{ name: 'Veggie Pizza', quantity: 1 }],
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/required/);
    });

    it('rejects an empty cart', async () => {
        const res = await request(app).post('/api/order').send({
            ...validCustomer,
            items: [],
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Cart cannot be empty');
    });
});
