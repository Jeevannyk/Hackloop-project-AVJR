'use strict';

const rateLimit = require('express-rate-limit');
const slowDown  = require('express-slow-down');
const logger    = require('../logger');

// ── Shared 429 handler ────────────────────────────────────────────────────────
// Logs the event to the security log and returns a consistent error shape.
function makeHandler(message) {
    return (req, res) => {
        logger.warn('RATE_LIMIT_HIT', {
            event:   'RATE_LIMIT_HIT',
            ip:      req.ip,
            path:    req.path,
            message,
        });
        res.status(429).json({ message });
    };
}

// ─────────────────────────────────────────────────────────────────────────────
//  1. GLOBAL API limiter
//     Blanket protection across every /api route. Stops bulk scraping and
//     general API abuse regardless of which endpoint is targeted.
//     300 requests per 15 minutes is generous enough for any real user but
//     will trip a script hitting the API in a tight loop.
// ─────────────────────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
    windowMs:        15 * 60 * 1000,
    max:             300,
    standardHeaders: true,
    legacyHeaders:   false,
    handler:         makeHandler('Too many requests. Please slow down.'),
});

// ─────────────────────────────────────────────────────────────────────────────
//  2. LOGIN slow-down (progressive delay)
//     Starts adding latency BEFORE the hard block kicks in.
//     After the 2nd attempt in a 15-min window each subsequent request from
//     that IP is delayed by an extra 500 ms (capped at 5 s).
//     This destroys automated brute-force tools without immediately locking
//     out a human who fat-fingered their password once.
// ─────────────────────────────────────────────────────────────────────────────
const loginSlowDown = slowDown({
    windowMs:    15 * 60 * 1000,
    delayAfter:  2,
    delayMs:     (used) => (used - 2) * 500,
    maxDelayMs:  5_000,
});

// ─────────────────────────────────────────────────────────────────────────────
//  3. LOGIN hard block
//     After 5 failed attempts in 15 min from the same IP, all further login
//     requests are rejected. skipSuccessfulRequests means a correct login
//     doesn't count against the window.
// ─────────────────────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
    windowMs:               15 * 60 * 1000,
    max:                    5,
    standardHeaders:        true,
    legacyHeaders:          false,
    skipSuccessfulRequests: true,
    handler:                makeHandler('Too many login attempts. Try again in 15 minutes.'),
});

// ─────────────────────────────────────────────────────────────────────────────
//  4. Per-username failed-attempt tracker (distributed brute-force defence)
//     IP-based limiters are defeated when an attacker rotates through many IPs
//     (e.g. a botnet). Tracking per-username catches the case where 10 IPs
//     each make 3 attempts against the same account.
//
//     Stored in-process (Map with TTL). For a multi-server deployment swap
//     this for a Redis counter with EXPIRE.
// ─────────────────────────────────────────────────────────────────────────────
const USERNAME_WINDOW_MS   = 15 * 60 * 1000;
const USERNAME_MAX_FAILS   = 10; // across ALL IPs

const _usernameFailMap = new Map(); // username → { count, firstSeen }

// Remove entries whose window has elapsed — runs every 5 minutes.
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of _usernameFailMap) {
        if (now - v.firstSeen > USERNAME_WINDOW_MS) _usernameFailMap.delete(k);
    }
}, 5 * 60 * 1000).unref(); // .unref() so this timer doesn't keep the process alive

function isUsernameLocked(username) {
    const entry = _usernameFailMap.get(username);
    if (!entry) return false;
    if (Date.now() - entry.firstSeen > USERNAME_WINDOW_MS) {
        _usernameFailMap.delete(username);
        return false;
    }
    return entry.count >= USERNAME_MAX_FAILS;
}

function recordUsernameFail(username) {
    const now   = Date.now();
    const entry = _usernameFailMap.get(username);
    if (!entry || (now - entry.firstSeen) > USERNAME_WINDOW_MS) {
        _usernameFailMap.set(username, { count: 1, firstSeen: now });
    } else {
        entry.count += 1;
    }
    const current = _usernameFailMap.get(username);
    if (current.count === USERNAME_MAX_FAILS) {
        logger.warn('USERNAME_LOCKOUT', {
            event:    'USERNAME_LOCKOUT',
            username: username.slice(0, 32),
            count:    current.count,
        });
    }
}

function clearUsernameFails(username) {
    _usernameFailMap.delete(username);
}

// ─────────────────────────────────────────────────────────────────────────────
//  5. MENU read limiter
//     GET /api/menu is public — without a limiter a bot could poll it every
//     millisecond. 30 reads per minute is enough for any real browser session
//     (the page only loads the menu once) but trips automated scrapers.
// ─────────────────────────────────────────────────────────────────────────────
const menuReadLimiter = rateLimit({
    windowMs:        60 * 1000,
    max:             30,
    standardHeaders: true,
    legacyHeaders:   false,
    handler:         makeHandler('Too many menu requests. Please wait a moment.'),
});

// ─────────────────────────────────────────────────────────────────────────────
//  6. ADMIN operations limiter
//     Separate cap on authenticated admin routes. Even with a valid session an
//     admin (or a stolen session token) cannot hammer the DB at full speed.
//     100 requests per 15 minutes covers all realistic dashboard usage.
// ─────────────────────────────────────────────────────────────────────────────
const adminOpsLimiter = rateLimit({
    windowMs:        15 * 60 * 1000,
    max:             100,
    standardHeaders: true,
    legacyHeaders:   false,
    handler:         makeHandler('Admin rate limit reached. Wait a few minutes.'),
});

// ─────────────────────────────────────────────────────────────────────────────
//  7. ORDER placement limiter
//     Max 20 orders per 10 minutes per IP. A human placing an order typically
//     does it once; this prevents order-spam and fake-booking attacks.
// ─────────────────────────────────────────────────────────────────────────────
const orderLimiter = rateLimit({
    windowMs:        10 * 60 * 1000,
    max:             20,
    standardHeaders: true,
    legacyHeaders:   false,
    handler:         makeHandler('Too many order requests. Please wait a moment.'),
});

module.exports = {
    globalLimiter,
    loginSlowDown,
    loginLimiter,
    menuReadLimiter,
    adminOpsLimiter,
    orderLimiter,
    isUsernameLocked,
    recordUsernameFail,
    clearUsernameFails,
};
