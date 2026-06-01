'use strict';

const winston = require('winston');
const path    = require('path');
const fs      = require('fs');

const logsDir = path.join(__dirname, 'logs');
fs.mkdirSync(logsDir, { recursive: true });

const { combine, timestamp, json, colorize, printf } = winston.format;

// Human-readable format for the dev console
const devFormat = combine(
    colorize(),
    timestamp({ format: 'HH:mm:ss' }),
    printf(({ level, message, timestamp: ts, event, ...meta }) => {
        const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
        return `${ts} ${level} ${event ? `[${event}] ` : ''}${message}${extra}`;
    })
);

// Structured JSON for file transports — machine-parseable by any SIEM/log tool
const jsonFormat = combine(timestamp(), json());

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL ?? 'info',
    defaultMeta: { service: 'restaurant-backend' },
    transports: [
        // All levels — general application log
        new winston.transports.File({
            filename:  path.join(logsDir, 'combined.log'),
            format:    jsonFormat,
            maxsize:   10 * 1024 * 1024, // 10 MB
            maxFiles:  10,
            tailable:  true,
        }),
        // Errors only — persisted separately for quick triage
        new winston.transports.File({
            filename:  path.join(logsDir, 'error.log'),
            level:     'error',
            format:    jsonFormat,
            maxsize:   10 * 1024 * 1024,
            maxFiles:  10,
            tailable:  true,
        }),
        // Security events — auth, rate limits, anomalies. Keep 30 files for audit trail.
        new winston.transports.File({
            filename:  path.join(logsDir, 'security.log'),
            level:     'warn',
            format:    jsonFormat,
            maxsize:   10 * 1024 * 1024,
            maxFiles:  30,
            tailable:  true,
        }),
    ],
});

// Dev: readable console output; prod: JSON to stdout for container log collection
if (process.env.NODE_ENV === 'production') {
    logger.add(new winston.transports.Console({ format: jsonFormat }));
} else {
    logger.add(new winston.transports.Console({ format: devFormat }));
}

module.exports = logger;
