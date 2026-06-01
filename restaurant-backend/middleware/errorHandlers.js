'use strict';

const logger = require('../logger');
const { config } = require('../config');

// 404 handler — catches requests to any path not matched by a route.
// A burst of 404s from one IP often indicates route enumeration/scanning.
function notFound(req, res) {
    logger.warn('NOT_FOUND', {
        event:  'NOT_FOUND',
        method: req.method,
        path:   req.path,
        ip:     req.ip,
    });
    res.status(404).json({ message: 'Not found' });
}

// Global error handler — catches unhandled throws and next(err) calls.
// Returns a generic message; the stack trace is logged but never sent to the
// client (and omitted entirely from logs in production).
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
    logger.error('UNHANDLED_ERROR', {
        event:  'UNHANDLED_ERROR',
        error:  err.message,
        stack:  config.IS_PROD ? undefined : err.stack,
        method: req.method,
        path:   req.path,
        ip:     req.ip,
    });
    res.status(500).json({ message: 'Internal server error' });
}

module.exports = { notFound, errorHandler };
