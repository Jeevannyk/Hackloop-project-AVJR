'use strict';

const express    = require('express');
const bodyParser = require('body-parser');
const cors       = require('cors');
const fs         = require('fs');

const { config } = require('./config');
const { securityHeaders, httpsRedirect } = require('./middleware/security');
const { requestLogger, payloadAnomaly }  = require('./middleware/observability');
const { notFound, errorHandler }         = require('./middleware/errorHandlers');
const { globalLimiter }                  = require('./middleware/rateLimiters');

const adminRoutes  = require('./routes/admin');
const menuRoutes   = require('./routes/menu');
const orderRoutes  = require('./routes/orders');

// Build and return the configured Express app, without binding a port or
// connecting to the database. Keeping construction separate from boot lets the
// test suite exercise the app via supertest with no network or DB.
function createApp() {
    const app = express();

    // In production, trust the first reverse proxy (nginx/Cloudflare) so req.ip
    // reflects the real client IP — required for rate limiting and logging.
    if (config.IS_PROD) app.set('trust proxy', 1);

    // ── Security ────────────────────────────────────────────────────────────────
    app.use(securityHeaders);
    if (config.IS_PROD) app.use(httpsRedirect);

    // ── Body parsing — explicit 100 kb cap rejects oversized bodies early ─────────
    app.use(bodyParser.json({ limit: '100kb' }));

    // ── CORS ──────────────────────────────────────────────────────────────────────
    app.use(cors({ origin: config.allowedOrigins }));

    // ── Static uploads ──────────────────────────────────────────────────────────
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    app.use('/uploads', express.static(config.uploadsDir));

    // ── Observability ─────────────────────────────────────────────────────────────
    app.use(requestLogger);
    app.use(payloadAnomaly);

    // ── Global rate limit — applied before every /api route ───────────────────
    // Stops bulk scraping and general API abuse regardless of endpoint.
    app.use('/api', globalLimiter);

    // ── Routes ──────────────────────────────────────────────────────────────────
    app.use('/api/admin', adminRoutes);
    app.use('/api/menu', menuRoutes);
    app.use('/api', orderRoutes); // /api/orders (admin) + /api/order (customer)

    // ── Fallbacks ─────────────────────────────────────────────────────────────────
    app.use(notFound);
    app.use(errorHandler);

    return app;
}

module.exports = createApp;
