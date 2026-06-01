'use strict';

const jwt      = require('jsonwebtoken');
const mongoose = require('mongoose');
const logger   = require('../logger');
const { config } = require('../config');

// Customer orders: soft auth — guests are allowed through, but an invalid or
// expired token is rejected. A missing token simply means "guest".
function verifyCustomerToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) return next();
    const token = authHeader.slice(7);

    if (!config.JWT_PUBLIC_KEY) {
        logger.warn('JWT_VERIFY_SKIPPED', { event: 'JWT_VERIFY_SKIPPED', ip: req.ip });
        return next();
    }
    try {
        req.user = jwt.verify(token, config.JWT_PUBLIC_KEY, {
            algorithms: ['RS256'],
            audience:   config.JWT_AUDIENCE,
        });
    } catch {
        return res.status(401).json({ message: 'Invalid or expired access token' });
    }
    next();
}

// ObjectId guard — rejects malformed IDs before they reach Mongoose.
// Without this, an invalid ID causes a CastError that bubbles up as a 500.
function validateObjectId(req, res, next) {
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: 'Invalid ID' });
    }
    next();
}

// Admin routes: hard auth — a valid signed JWT is required on every request.
function requireAdmin(req, res, next) {
    const token = req.headers['x-admin-token'];
    if (!token) return res.status(401).json({ message: 'Authentication required' });
    try {
        // jwt.verify checks signature AND expiry.
        req.admin = jwt.verify(token, config.ADMIN_JWT_SECRET, { algorithms: ['HS256'] });
    } catch (err) {
        const expired = err.name === 'TokenExpiredError';
        logger.warn('ADMIN_AUTH_FAILURE', {
            event:  'ADMIN_AUTH_FAILURE',
            reason: expired ? 'token_expired' : 'invalid_token',
            ip:     req.ip,
            path:   req.path,
        });
        return res.status(401).json({
            message: expired
                ? 'Admin session expired — please sign in again'
                : 'Invalid admin token',
        });
    }
    next();
}

module.exports = { verifyCustomerToken, validateObjectId, requireAdmin };
