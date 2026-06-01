'use strict';

const logger = require('../logger');
const { REQUIRED_ENV } = require('./index');

// Fail loud at boot so misconfiguration is caught before serving requests.
// Called from server.js — never at module import time, so tests can load the
// app with a minimal, hand-set environment.
function validateEnv() {
    const missing = REQUIRED_ENV.filter(k => !process.env[k]);
    if (missing.length) {
        logger.error('Missing required env vars — refusing to start', { missing });
        logger.error('Run: node scripts/setup-admin.js');
        process.exit(1);
    }
}

module.exports = validateEnv;
