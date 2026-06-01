'use strict';

const helmet  = require('helmet');
const logger  = require('../logger');
const { config } = require('../config');

// Security headers. helmet sets X-Content-Type-Options, X-Frame-Options,
// Strict-Transport-Security, Referrer-Policy and more.
//
// CSP is intentionally off — this is a JSON + static-image API, not an HTML
// app. HSTS is only meaningful over HTTPS, so it is enabled in production only.
const securityHeaders = helmet({
    hsts: config.IS_PROD
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
        : false,
    contentSecurityPolicy: false,
});

// Redirect plain HTTP to HTTPS in production. Skipped in development so
// localhost works without a certificate. Honours x-forwarded-proto so it
// works behind a TLS-terminating proxy.
function httpsRedirect(req, res, next) {
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    if (!isHttps) {
        logger.warn('HTTP_DOWNGRADE_ATTEMPT', {
            event: 'HTTP_DOWNGRADE_ATTEMPT',
            ip:    req.ip,
            path:  req.path,
        });
        return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
}

module.exports = { securityHeaders, httpsRedirect };
