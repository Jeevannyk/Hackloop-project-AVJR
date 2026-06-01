'use strict';

const express = require('express');
const logger  = require('../logger');
const Order    = require('../models/Order');
const MenuItem = require('../models/MenuItem');
const { orderLimiter, adminOpsLimiter } = require('../middleware/rateLimiters');
const { requireAdmin, validateObjectId, verifyCustomerToken } = require('../middleware/auth');
const { sendConfirmationEmail } = require('../services/email');

// Mounted at /api so the customer endpoint can be singular (/api/order) while
// the admin endpoints are plural (/api/orders), matching the existing API.
const router = express.Router();

// GET /api/orders — admin only. Sorted by closeness of arrival time to now.
router.get('/orders', requireAdmin, adminOpsLimiter, async (_req, res) => {
    try {
        const orders = await Order.find();
        const now    = new Date();
        orders.sort((a, b) =>
            Math.abs(new Date(a.arrivalTime) - now) - Math.abs(new Date(b.arrivalTime) - now)
        );
        res.json(orders);
    } catch (err) {
        logger.error('Orders fetch failed', { error: err.message });
        res.status(500).json({ message: 'Failed to retrieve orders' });
    }
});

// PATCH /api/orders/:id — admin only. Updates order status.
router.patch('/orders/:id', requireAdmin, adminOpsLimiter, validateObjectId, async (req, res) => {
    const { status } = req.body;
    if (!['served', 'canceled', 'pending'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
    }
    try {
        const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!order) return res.status(404).json({ message: 'Order not found' });
        logger.info('ADMIN_ACTION', {
            event:   'ADMIN_ACTION',
            action:  'UPDATE_ORDER_STATUS',
            admin:   req.admin.sub,
            orderId: req.params.id,
            status,
        });
        res.json({ message: `Order updated to ${status}`, order });
    } catch (err) {
        logger.error('Order status update failed', { error: err.message });
        res.status(500).json({ message: 'Error updating order status' });
    }
});

// POST /api/order — customer (soft auth). Places an order.
router.post('/order', orderLimiter, verifyCustomerToken, async (req, res) => {
    const { name, email, phone, arrivalTime, items } = req.body ?? {};

    // ── Input presence checks ─────────────────────────────────────────────────
    if (!name || !email || !phone || !arrivalTime) {
        return res.status(400).json({ message: 'Name, email, phone, and arrival time are required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'Cart cannot be empty' });
    }

    // ── Server-side price recomputation ───────────────────────────────────────
    // Client-submitted prices are NEVER trusted. Each item is looked up in the
    // database and the stored price is used, making price manipulation impossible.
    let menuDocs;
    try {
        const submittedNames = [...new Set(items.map(i => String(i.name)))];
        menuDocs = await MenuItem.find({ name: { $in: submittedNames } });
    } catch (err) {
        logger.error('Menu lookup failed during order', { error: err.message });
        return res.status(500).json({ message: 'Failed to validate order items' });
    }

    const priceMap = new Map(menuDocs.map(m => [m.name, m.price]));

    const validatedItems = [];
    for (const submitted of items) {
        const itemName    = String(submitted.name ?? '');
        const serverPrice = priceMap.get(itemName);
        // Reject any item not found in the live menu.
        if (serverPrice === undefined) {
            return res.status(400).json({ message: `"${itemName}" is not on the menu` });
        }
        const qty = parseInt(submitted.quantity, 10);
        if (!Number.isInteger(qty) || qty < 1 || qty > 20) {
            return res.status(400).json({ message: `Invalid quantity for "${itemName}" (must be 1–20)` });
        }
        validatedItems.push({ name: itemName, price: serverPrice, quantity: qty });
    }

    // Recompute total from server prices — client totalPrice is discarded.
    const totalPrice = parseFloat(
        validatedItems.reduce((sum, i) => sum + i.price * i.quantity, 0).toFixed(2)
    );
    const code = Math.floor(10000 + Math.random() * 90000);

    try {
        const order = await new Order({
            name, email, phone, arrivalTime,
            items: validatedItems,
            totalPrice,
            code,
        }).save();
        sendConfirmationEmail({ name, email, items: validatedItems, totalPrice, arrivalTime, code });
        logger.info('ORDER_PLACED', {
            event:   'ORDER_PLACED',
            orderId: order._id,
            ip:      req.ip,
            items:   validatedItems.length,
            total:   totalPrice,
        });
        res.status(201).json(order);
    } catch (err) {
        logger.error('Order placement failed', { error: err.message });
        res.status(500).json({ message: 'Failed to place order' });
    }
});

module.exports = router;
