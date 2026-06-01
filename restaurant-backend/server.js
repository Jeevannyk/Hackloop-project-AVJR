'use strict';

require('dotenv').config();

const logger      = require('./logger');
const validateEnv = require('./config/validateEnv');
const connectDB   = require('./config/db');
const createApp   = require('./app');
const { config }  = require('./config');

// Fail loud on missing secrets before doing anything else.
validateEnv();

// Connect to the database (and seed on first run), then start serving.
connectDB();

const app = createApp();

app.listen(config.PORT, () => {
    logger.info('Server started', {
        port:  config.PORT,
        env:   process.env.NODE_ENV ?? 'development',
        https: config.IS_PROD ? 'enforced' : 'off (dev)',
        hsts:  config.IS_PROD ? 'enabled' : 'disabled',
    });
});
