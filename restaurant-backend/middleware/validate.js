'use strict';

const fs   = require('fs');
const path = require('path');

// ── String helpers ────────────────────────────────────────────────────────────

// Strip HTML/script tags and null bytes — prevents stored XSS.
// Input rendered in the admin panel comes from customers, so any markup
// in their name/email would execute in the admin's browser.
function stripTags(str) {
    return str
        .replace(/<[^>]*>/g, '')   // strip all HTML tags
        .replace(/\0/g, '')         // strip null bytes (NoSQL / protocol injection)
        .trim();
}

// Enforce a string field: must be a string, trimmed length within [min, max].
// Returns the cleaned value or null if invalid.
function cleanString(value, min, max) {
    if (typeof value !== 'string') return null;
    const v = stripTags(value);
    if (v.length < min || v.length > max) return null;
    return v;
}

// ── Field validators ──────────────────────────────────────────────────────────

// RFC 5321-aligned email check (practical subset).
// Max 254 chars per RFC 5321. Rejects consecutive dots, leading/trailing dots.
const EMAIL_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+\-]{0,62}[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+$/;

function isValidEmail(email) {
    return typeof email === 'string'
        && email.length <= 254
        && EMAIL_RE.test(email.trim())
        && !email.includes('..');   // reject consecutive dots
}

// Indian 10-digit mobile number, optionally prefixed +91 or 91.
// First digit must be 6-9 (valid Indian mobile range).
const PHONE_RE = /^(\+91|91)?[6-9][0-9]{9}$/;

function isValidPhone(phone) {
    if (typeof phone !== 'string') return false;
    return PHONE_RE.test(phone.replace(/[\s\-]/g, ''));
}

// Arrival time: must be a parseable date, in the future, and between
// 09:00–22:00 local server time (restaurant operating hours).
// This is the authoritative server-side check — the frontend version is UX only.
function validateArrivalTime(value) {
    if (typeof value !== 'string' && typeof value !== 'number') {
        return { ok: false, message: 'Arrival time is required' };
    }
    const dt = new Date(value);
    if (isNaN(dt.getTime())) {
        return { ok: false, message: 'Invalid arrival time format' };
    }
    if (dt.getTime() < Date.now()) {
        return { ok: false, message: 'Arrival time must be in the future' };
    }
    const hours = dt.getHours();
    if (hours < 9 || hours >= 22) {
        return { ok: false, message: 'Orders are only accepted between 9:00 AM and 10:00 PM' };
    }
    return { ok: true };
}

// ── Image file validation ─────────────────────────────────────────────────────

const ALLOWED_EXTS   = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const ALLOWED_MIMES  = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

// Magic byte signatures for allowed image types.
// Checking the actual file bytes prevents MIME-type spoofing — an attacker
// cannot rename a PHP file to shell.jpg and have it pass as an image.
const IMAGE_SIGNATURES = [
    // JPEG: starts with FF D8 FF
    { mime: 'image/jpeg',  check: b => b[0]===0xFF && b[1]===0xD8 && b[2]===0xFF },
    // PNG: starts with 89 50 4E 47 (‰PNG)
    { mime: 'image/png',   check: b => b[0]===0x89 && b[1]===0x50 && b[2]===0x4E && b[3]===0x47 },
    // GIF: starts with 47 49 46 38 (GIF8)
    { mime: 'image/gif',   check: b => b[0]===0x47 && b[1]===0x49 && b[2]===0x46 && b[3]===0x38 },
    // WebP: RIFF....WEBP
    { mime: 'image/webp',  check: b => b[0]===0x52 && b[1]===0x49 && b[2]===0x46 && b[3]===0x46
                                    && b[8]===0x57 && b[9]===0x45 && b[10]===0x42 && b[11]===0x50 },
];

async function detectImageMime(filepath) {
    const fd  = await fs.promises.open(filepath, 'r');
    const buf = Buffer.alloc(12);
    await fd.read(buf, 0, 12, 0);
    await fd.close();
    for (const sig of IMAGE_SIGNATURES) {
        if (sig.check(buf)) return sig.mime;
    }
    return null;
}

// ── Middleware factories ───────────────────────────────────────────────────────

// Validates and sanitizes the customer order body.
// Runs before the price-recomputation logic in the route handler.
function validateOrder(req, res, next) {
    const body = req.body ?? {};

    // name — 1–100 chars, HTML stripped
    const name = cleanString(body.name ?? '', 1, 100);
    if (!name) {
        return res.status(400).json({ message: 'Name is required and must be 1–100 characters' });
    }

    // email — valid format, normalised to lowercase
    if (!isValidEmail(body.email ?? '')) {
        return res.status(400).json({ message: 'A valid email address is required' });
    }

    // phone — 10-digit Indian mobile
    if (!isValidPhone(body.phone ?? '')) {
        return res.status(400).json({ message: 'A valid 10-digit Indian mobile number is required' });
    }

    // arrivalTime — parseable, future, within operating hours
    const timeResult = validateArrivalTime(body.arrivalTime);
    if (!timeResult.ok) {
        return res.status(400).json({ message: timeResult.message });
    }

    // items — non-empty array, max 20 distinct lines (reasonable cart cap)
    if (!Array.isArray(body.items) || body.items.length === 0) {
        return res.status(400).json({ message: 'Cart cannot be empty' });
    }
    if (body.items.length > 20) {
        return res.status(400).json({ message: 'Cart cannot contain more than 20 distinct items' });
    }

    // Write sanitized values back so the route handler uses clean data
    req.body.name  = name;
    req.body.email = body.email.trim().toLowerCase();

    next();
}

// Validates the admin menu-item creation body (text fields only).
// The image file is validated separately by validateUploadedImage.
function validateMenuPost(req, res, next) {
    const body = req.body ?? {};

    const name = cleanString(body.name ?? '', 1, 100);
    if (!name) {
        return res.status(400).json({ message: 'Dish name is required (1–100 characters)' });
    }

    const description = cleanString(body.description ?? '', 1, 500);
    if (!description) {
        return res.status(400).json({ message: 'Description is required (1–500 characters)' });
    }

    const price = parseFloat(body.price);
    if (isNaN(price) || price < 0 || price > 10_000) {
        return res.status(400).json({ message: 'Price must be a number between 0 and 10,000' });
    }

    req.body.name        = name;
    req.body.description = description;

    next();
}

// Validates an uploaded image file after multer has saved it to disk.
// Three checks in order:
//   1. Extension must be in the allowlist
//   2. No double extension (shell.php.jpg)
//   3. Magic bytes must match a known image format (MIME spoofing defence)
async function validateUploadedImage(req, res, next) {
    if (!req.file) return next();

    const cleanup = () => {
        try { fs.unlinkSync(req.file.path); } catch { /* already gone */ }
    };

    const ext      = path.extname(req.file.originalname).toLowerCase();
    const nameOnly = path.basename(req.file.originalname, ext);

    // Reject double extensions: shell.php.jpg → extname of "shell.php" is ".php"
    if (path.extname(nameOnly)) {
        cleanup();
        return res.status(400).json({ message: 'Invalid file name (double extension detected)' });
    }

    // Allowlist check
    if (!ALLOWED_EXTS.has(ext)) {
        cleanup();
        return res.status(400).json({
            message: `File type not allowed. Accepted: ${[...ALLOWED_EXTS].join(', ')}`,
        });
    }

    // Magic byte check — must match a real image regardless of declared MIME
    let detectedMime;
    try {
        detectedMime = await detectImageMime(req.file.path);
    } catch (err) {
        cleanup();
        return res.status(400).json({ message: 'Could not read file content' });
    }

    if (!detectedMime || !ALLOWED_MIMES.has(detectedMime)) {
        cleanup();
        return res.status(400).json({ message: 'File content is not a valid image' });
    }

    next();
}

// ── Auth-gateway input helpers (used inline, not as Express middleware) ────────

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIG_HEX_RE = /^[0-9a-f]{16}$/i;

function isValidUUIDv4(str) {
    return typeof str === 'string' && UUID_V4_RE.test(str);
}

function isValidSig(str) {
    return typeof str === 'string' && SIG_HEX_RE.test(str);
}

module.exports = {
    stripTags,
    cleanString,
    isValidEmail,
    isValidPhone,
    validateArrivalTime,
    validateOrder,
    validateMenuPost,
    validateUploadedImage,
    isValidUUIDv4,
    isValidSig,
};
