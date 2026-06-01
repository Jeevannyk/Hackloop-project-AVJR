'use strict';

const mongoose = require('mongoose');
const logger   = require('../logger');
const MenuItem = require('../models/MenuItem');
const MENU_SEED = require('./menuSeed');
const { config } = require('./index');

// Connect to MongoDB and seed the menu on first run (empty collection).
// On connection failure we exit the process — a backend with no database is
// not usefully "up", so failing fast is preferable to serving 500s.
async function connectDB() {
    try {
        await mongoose.connect(config.MONGO_URI);
        logger.info('MongoDB connected');

        const count = await MenuItem.countDocuments();
        if (count === 0) {
            await MenuItem.insertMany(MENU_SEED);
            logger.info('Menu seeded', { count: MENU_SEED.length });
        }
    } catch (err) {
        logger.error('MongoDB connection failed', { error: err.message });
        process.exit(1);
    }
}

module.exports = connectDB;
