'use strict';

const multer = require('multer');
const path   = require('path');
const { config } = require('../config');

// Disk storage for uploaded menu images. Filenames are randomised to avoid
// collisions and to stop a client controlling the on-disk path.
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, config.uploadsDir),
    filename:    (_req, file, cb) => {
        const ext  = path.extname(file.originalname).toLowerCase();
        const name = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
        cb(null, name);
    },
});

// 5 MB cap, images only.
const upload = multer({
    storage,
    limits:     { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) return cb(new Error('Images only'));
        cb(null, true);
    },
});

module.exports = upload;
