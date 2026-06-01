'use strict';

const logger = require('../logger');

// ── Per-IP anomaly counters ───────────────────────────────────────────────────
// Tracks 401 (auth failures) and 404 (unknown routes) per IP in a rolling
// 5-minute window. A burst from one IP triggers a security warning that
// operators can act on (block the IP at the firewall/CDN level).
//
// Stored in-process. For multi-instance deployments, move to Redis.

const ANOMALY_WINDOW_MS  = 5 * 60 * 1000;
const ALERT_THRESHOLD_401 = 10; // > 10 auth failures from one IP in 5 min
const ALERT_THRESHOLD_404 = 20; // > 20 unknown-route hits from one IP in 5 min

const _ipCounters = new Map(); // ip → { c401, c404, windowStart }

function getOrCreateCounter(ip) {
    const now = Date.now();
    let c = _ipCounters.get(ip);
    if (!c || now - c.windowStart > ANOMALY_WINDOW_MS) {
        c = { c401: 0, c404: 0, windowStart: now };
        _ipCounters.set(ip, c);
    }
    return c;
}

// Flush stale entries every 10 minutes so the Map doesn't grow forever.
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of _ipCounters) {
        if (now - v.windowStart > ANOMALY_WINDOW_MS) _ipCounters.delete(k);
    }
}, 10 * 60 * 1000).unref();

// ── Middleware: request logger ────────────────────────────────────────────────
// Logs every request on completion with method, path, status, duration, and IP.
// Status >= 400 is warned; >= 500 is errored. Slow requests (> 3 s) are flagged.
// Also drives the anomaly counters for 401 and 404 responses.
function requestLogger(req, res, next) {
    const startedAt = Date.now();

    res.on('finish', () => {
        const ms   = Date.now() - startedAt;
        const ip   = req.ip ?? 'unknown';
        const meta = {
            method: req.method,
            path:   req.path,
            status: res.statusCode,
            ms,
            ip,
            ua:     req.get('user-agent') ?? '',
        };

        if (res.statusCode >= 500)      logger.error('REQUEST', meta);
        else if (res.statusCode >= 400) logger.warn('REQUEST',  meta);
        else                            logger.info('REQUEST',  meta);

        if (ms > 3000) logger.warn('SLOW_REQUEST', { event: 'SLOW_REQUEST', ...meta });

        // ── Anomaly detection ──────────────────────────────────────────────────
        if (res.statusCode === 401) {
            const c = getOrCreateCounter(ip);
            c.c401 += 1;
            if (c.c401 === ALERT_THRESHOLD_401) {
                logger.warn('ANOMALY_401_BURST', {
                    event:   'ANOMALY_401_BURST',
                    ip,
                    count:   c.c401,
                    windowMs: ANOMALY_WINDOW_MS,
                    note:    'Consider blocking this IP at the firewall/CDN',
                });
            }
        }

        if (res.statusCode === 404) {
            const c = getOrCreateCounter(ip);
            c.c404 += 1;
            if (c.c404 === ALERT_THRESHOLD_404) {
                logger.warn('ANOMALY_404_BURST', {
                    event:   'ANOMALY_404_BURST',
                    ip,
                    count:   c.c404,
                    windowMs: ANOMALY_WINDOW_MS,
                    note:    'Route scanning suspected — consider blocking this IP',
                });
            }
        }
    });

    next();
}

// ── Middleware: payload anomaly ───────────────────────────────────────────────
// Logs requests whose declared Content-Length exceeds the body parser cap.
// bodyParser rejects them before they reach a route handler, but we still
// want a security-log record for traffic analysis.
function payloadAnomaly(req, _res, next) {
    const cl = parseInt(req.headers['content-length'] ?? '0', 10);
    if (cl > 100 * 1024) {
        logger.warn('OVERSIZED_PAYLOAD', {
            event: 'OVERSIZED_PAYLOAD',
            ip:    req.ip,
            path:  req.path,
            bytes: cl,
        });
    }
    next();
}

module.exports = { requestLogger, payloadAnomaly };
