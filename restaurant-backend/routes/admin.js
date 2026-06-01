'use strict';

const express = require('express');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const logger  = require('../logger');
const { config } = require('../config');
const {
    loginSlowDown,
    loginLimiter,
    isUsernameLocked,
    recordUsernameFail,
    clearUsernameFails,
} = require('../middleware/rateLimiters');

const router = express.Router();

// Decoy hash — comparing against this on a wrong username keeps response
// time constant and prevents timing-based username enumeration.
const DECOY_HASH = '$2a$12$invalidhashpaddingtomatchtime000000000000000000000000000';

// POST /api/admin/login
// Chain: slowDown (progressive delay) → loginLimiter (hard block at 5 fails)
// Then: per-username distributed-brute-force check, then bcrypt comparison.
router.post('/login', loginSlowDown, loginLimiter, async (req, res) => {
    const { username, password } = req.body ?? {};
    const ip = req.ip;

    // Type check before touching bcrypt — guards against prototype-pollution attacks.
    if (typeof username !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ message: 'Invalid request' });
    }

    // Per-username lockout: catches distributed attacks where many IPs each
    // try a small number of passwords against the same account.
    if (isUsernameLocked(username)) {
        logger.warn('USERNAME_LOCKED_REJECT', {
            event:    'USERNAME_LOCKED_REJECT',
            ip,
            username: username.slice(0, 32),
        });
        // Return the same message as a wrong password — don't confirm the username exists.
        return res.status(401).json({ message: 'Invalid credentials' });
    }

    const usernameMatch = username === config.ADMIN_USERNAME;
    // Always run bcrypt.compare even on a wrong username so timing is identical
    // regardless of whether the username is valid.
    const passwordMatch = await bcrypt.compare(
        password,
        usernameMatch ? config.ADMIN_PASSWORD_HASH : DECOY_HASH
    );

    if (!usernameMatch || !passwordMatch) {
        recordUsernameFail(username); // increment distributed-brute-force counter
        logger.warn('AUTH_FAILURE', {
            event:    'AUTH_FAILURE',
            ip,
            username: username.slice(0, 32), // truncated — never log the password
        });
        return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Successful login — clear the per-username counter so a human who typed
    // the wrong password several times doesn't stay locked after logging in.
    clearUsernameFails(username);

    const token = jwt.sign(
        { sub: config.ADMIN_USERNAME, role: 'admin' },
        config.ADMIN_JWT_SECRET,
        { algorithm: 'HS256', expiresIn: config.ADMIN_SESSION_TTL }
    );

    logger.info('AUTH_SUCCESS', { event: 'AUTH_SUCCESS', ip, username: config.ADMIN_USERNAME });
    res.json({ token, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
});

module.exports = router;
