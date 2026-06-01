'use strict';

const path = require('path');

// ── Configuration ──────────────────────────────────────────────────────────────
// Centralised, read-once view of every environment variable the app depends on.
// Reading them here (instead of sprinkling process.env across the codebase) means
// there is exactly one place to look when wiring up a new environment.

const IS_PROD = process.env.NODE_ENV === 'production';

const config = {
    IS_PROD,
    PORT: process.env.PORT ?? 5000,

    // Where to connect for persistence
    MONGO_URI: process.env.MONGO_URI,

    // Admin auth
    ADMIN_USERNAME:      process.env.ADMIN_USERNAME ?? 'admin',
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
    ADMIN_JWT_SECRET:    process.env.ADMIN_JWT_SECRET,
    ADMIN_SESSION_TTL:   '8h', // shift-length session

    // Customer-facing JWT (RS256, issued by the auth-gateway). Optional —
    // when unset, customer token verification is skipped (dev convenience).
    JWT_PUBLIC_KEY: process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, '\n') ?? null,
    JWT_AUDIENCE:   process.env.JWT_AUDIENCE ?? 'verdant-table-apps',

    // CORS allow-list
    allowedOrigins: (process.env.CORS_ORIGIN ?? 'http://127.0.0.1:5500')
        .split(',')
        .map(o => o.trim()),

    // Filesystem location for uploaded menu images
    uploadsDir: path.join(__dirname, '..', 'uploads'),

    // Public base URL used when building absolute image URLs. Behind a proxy in
    // production set PUBLIC_URL (e.g. https://api.example.com); falls back to
    // localhost for local development.
    publicBaseUrl: process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 5000}`,
};

// REQUIRED_ENV is validated explicitly at boot (see config/validateEnv.js) rather
// than at import time, so that tests can import the app without a full .env.
const REQUIRED_ENV = ['MONGO_URI', 'ADMIN_PASSWORD_HASH', 'ADMIN_JWT_SECRET'];

module.exports = { config, REQUIRED_ENV };
