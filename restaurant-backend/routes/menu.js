'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const logger  = require('../logger');
const MenuItem = require('../models/MenuItem');
const { config } = require('../config');
const upload  = require('../middleware/upload');
const { requireAdmin, validateObjectId } = require('../middleware/auth');
const { menuReadLimiter, adminOpsLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

// GET /api/menu — public, but rate-limited to prevent scraping.
// 30 reads per minute per IP is enough for any real browser session.
router.get('/', menuReadLimiter, async (_req, res) => {
    try {
        res.json(await MenuItem.find().sort({ createdAt: 1 }));
    } catch (err) {
        logger.error('Menu fetch failed', { error: err.message });
        res.status(500).json({ message: 'Failed to fetch menu' });
    }
});

// POST /api/menu — admin only. Creates an item with an uploaded image.
router.post('/', requireAdmin, adminOpsLimiter, upload.single('image'), async (req, res) => {
    const { name, description, price } = req.body;
    if (!name || !description || !price || !req.file) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({ message: 'Name, description, price, and image are required' });
    }
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ message: 'Price must be a positive number' });
    }
    try {
        const imageUrl = `${config.publicBaseUrl}/uploads/${req.file.filename}`;
        const item     = await MenuItem.create({ name, description, price: parsedPrice, image: imageUrl });
        logger.info('ADMIN_ACTION', {
            event:  'ADMIN_ACTION',
            action: 'ADD_MENU_ITEM',
            admin:  req.admin.sub,
            itemId: item._id,
            name,
        });
        res.status(201).json(item);
    } catch (err) {
        fs.unlinkSync(req.file.path);
        logger.error('Menu item creation failed', { error: err.message });
        res.status(500).json({ message: 'Failed to add menu item' });
    }
});

// DELETE /api/menu/:id — admin only. Removes the item and its uploaded image.
router.delete('/:id', requireAdmin, adminOpsLimiter, validateObjectId, async (req, res) => {
    try {
        const item = await MenuItem.findByIdAndDelete(req.params.id);
        if (!item) return res.status(404).json({ message: 'Item not found' });
        if (item.image.includes('/uploads/')) {
            // path.basename strips any directory components — prevents path traversal.
            const filename = path.basename(item.image);
            const filepath = path.join(config.uploadsDir, filename);
            if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
        }
        logger.info('ADMIN_ACTION', {
            event:  'ADMIN_ACTION',
            action: 'DELETE_MENU_ITEM',
            admin:  req.admin.sub,
            itemId: req.params.id,
            name:   item.name,
        });
        res.json({ message: 'Item removed', id: item._id });
    } catch (err) {
        logger.error('Menu item deletion failed', { error: err.message });
        res.status(500).json({ message: 'Failed to delete menu item' });
    }
});

module.exports = router;
