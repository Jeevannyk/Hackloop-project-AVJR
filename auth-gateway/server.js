require('dotenv').config();
const express    = require('express');
const http       = require('http');
const crypto     = require('crypto');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');
const QRCode     = require('qrcode');
const { WebSocketServer } = require('ws');

// ─── Input validators ─────────────────────────────────────────────────────────
const UUID_V4_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIG_HEX_RE  = /^[0-9a-f]{16}$/i;
const EMAIL_RE    = /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+\-]{0,62}[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+$/;

function isUUID(s)  { return typeof s === 'string' && UUID_V4_RE.test(s); }
function isSig(s)   { return typeof s === 'string' && SIG_HEX_RE.test(s); }
function isEmail(s) { return typeof s === 'string' && s.length <= 254 && EMAIL_RE.test(s.trim()) && !s.includes('..'); }

// ─── Keys & secrets ──────────────────────────────────────────────────────────
// RS256 in prod (JWT_PRIVATE_KEY set), HS256 fallback for local dev.
const PRIVATE_KEY   = process.env.JWT_PRIVATE_KEY?.replace(/\\n/g, '\n') ?? null;
const PUBLIC_KEY    = process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, '\n')  ?? null;
const HMAC_SECRET   = process.env.HMAC_SECRET ?? 'dev-hmac-secret-change-me';
const JWT_AUDIENCE  = process.env.JWT_AUDIENCE ?? 'verdant-table-apps';
const JWT_ALGORITHM = PRIVATE_KEY ? 'RS256' : 'HS256';
const JWT_SIGN_KEY  = PRIVATE_KEY ?? 'dev-jwt-secret-change-me';
const SESSION_TTL   = 90_000; // ms

if (!PRIVATE_KEY) {
  console.warn('[auth-gateway] No JWT_PRIVATE_KEY — using HS256 (dev only, not for production)');
}

// ─── In-memory session store ──────────────────────────────────────────────────
// In production: swap this Map for a Redis client with TTL.
// Shape: { status: 'pending'|'scanned'|'consumed', expiresAt: number, sig: string, email: string|null }
const sessions = new Map();

// sessionId → live WebSocket connection (desktop browser)
const sessionSockets = new Map();

// ─── Express + HTTP server ────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(cors({
  origin: (process.env.ALLOWED_ORIGINS ?? 'http://127.0.0.1:5500').split(','),
  credentials: true,
}));

const server = http.createServer(app);

// ─── WebSocket server ────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const url       = new URL(req.url, `http://${req.headers.host}`);
  const sessionId = url.searchParams.get('sessionId');
  const session   = sessions.get(sessionId);

  if (!session || session.status !== 'pending' || Date.now() > session.expiresAt) {
    ws.close(4001, 'Session invalid or expired');
    return;
  }

  sessionSockets.set(sessionId, ws);

  ws.on('close', () => {
    if (sessionSockets.get(sessionId) === ws) sessionSockets.delete(sessionId);
  });
});

function pushToDesktop(sessionId, payload) {
  const ws = sessionSockets.get(sessionId);
  if (ws?.readyState === 1 /* OPEN */) {
    ws.send(JSON.stringify(payload));
  }
}

// ─── Route: Generate QR session ──────────────────────────────────────────────
// POST /auth/qr-session
// Returns: { sessionId, verifyUrl, expiresAt }
app.post('/auth/qr-session', async (_req, res) => {
  const sessionId = crypto.randomUUID();

  // HMAC-SHA256 signature (first 16 hex chars) binds the URL to this session.
  // A replayed or hand-crafted URL without the correct sig is rejected.
  const sig = crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(sessionId)
    .digest('hex')
    .slice(0, 16);

  const expiresAt = Date.now() + SESSION_TTL;

  sessions.set(sessionId, { status: 'pending', expiresAt, sig, email: null });

  // Auto-expire: notify desktop client and clean up
  setTimeout(() => {
    const s = sessions.get(sessionId);
    if (s?.status === 'pending') {
      pushToDesktop(sessionId, { event: 'expired' });
      sessions.delete(sessionId);
      sessionSockets.delete(sessionId);
    }
  }, SESSION_TTL);

  const base      = process.env.AUTH_GATEWAY_URL ?? 'http://localhost:4000';
  const verifyUrl = `${base}/auth/mobile-verify?sessionId=${sessionId}&sig=${sig}`;

  const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
    width: 210,
    margin: 1,
    errorCorrectionLevel: 'H',
    color: { dark: '#2d3d35', light: '#f8f5f0' },
  });

  res.json({ sessionId, verifyUrl, expiresAt, qrDataUrl });
});

// ─── Route: Mobile QR scan handler ───────────────────────────────────────────
// GET /auth/mobile-verify?sessionId=…&sig=…
app.get('/auth/mobile-verify', (req, res) => {
  const { sessionId, sig } = req.query;

  // Reject malformed inputs before touching the session map.
  // An attacker probing with random strings would never match a UUID v4.
  if (!isUUID(sessionId) || !isSig(sig)) {
    return res.status(400).send(mobilePageHtml('Invalid Code', 'This link is malformed. Please scan the original QR code again.'));
  }

  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(410).send(mobilePageHtml('Expired', 'This code has expired. Please refresh on the other device.'));
  }
  if (session.status !== 'pending') {
    return res.status(409).send(mobilePageHtml('Already Used', 'This code was already scanned. If that wasn\'t you, please contact staff.'));
  }
  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    return res.status(410).send(mobilePageHtml('Expired', 'This code has expired. Please refresh on the other device.'));
  }

  // Constant-time comparison — both buffers are now guaranteed to be exactly
  // 16 hex chars so the lengths are always equal (no padding needed).
  const expected = Buffer.from(session.sig, 'hex');
  const received = Buffer.from(sig,         'hex');
  if (!crypto.timingSafeEqual(expected, received)) {
    return res.status(403).send(mobilePageHtml('Invalid Code', 'This link is invalid. Please scan the original QR code again.'));
  }

  session.status = 'scanned';
  pushToDesktop(sessionId, { event: 'scanned', sessionId });

  res.send(mobilePageHtml('Confirmed', 'Identity confirmed. You may close this tab and return to the main screen.'));
});

// ─── Route: Attach email to session ──────────────────────────────────────────
// POST /auth/enroll  { sessionId, email }
app.post('/auth/enroll', (req, res) => {
  const { sessionId, email } = req.body ?? {};

  if (!isUUID(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }
  if (!isEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  const session = sessions.get(sessionId);
  if (!session || !['pending', 'scanned'].includes(session.status)) {
    return res.status(410).json({ error: 'Session expired or invalid' });
  }

  session.email = email.trim().toLowerCase();
  res.json({ ok: true });
});

// ─── Route: Complete auth — issue JWT ────────────────────────────────────────
// POST /auth/complete  { sessionId }
app.post('/auth/complete', (req, res) => {
  const { sessionId } = req.body ?? {};

  if (!isUUID(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  const session = sessions.get(sessionId);
  if (!session || session.status !== 'scanned') {
    return res.status(400).json({ error: 'Session not in scanned state' });
  }

  const payload = {
    sub: session.email ?? 'guest',
    iss: 'auth.verdant-table.local',
    aud: JWT_AUDIENCE,
    sessionId,
  };

  const token = jwt.sign(payload, JWT_SIGN_KEY, {
    algorithm:  JWT_ALGORITHM,
    expiresIn: '1h',
  });

  // Mark consumed so the sessionId cannot be replayed
  session.status = 'consumed';
  sessions.delete(sessionId);
  sessionSockets.delete(sessionId);

  res.json({ token, algorithm: JWT_ALGORITHM, publicKey: PUBLIC_KEY });
});

// ─── Route: Public key endpoint (for client apps to verify tokens) ────────────
// GET /auth/.well-known/public-key
app.get('/auth/.well-known/public-key', (_req, res) => {
  if (!PUBLIC_KEY) return res.status(404).json({ error: 'RS256 not configured' });
  res.type('text/plain').send(PUBLIC_KEY);
});

// ─── Minimal mobile confirmation page ────────────────────────────────────────
function mobilePageHtml(heading, body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Verdant Table · ${heading}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@300;400&family=Inter:wght@300;400&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
       background:oklch(96% 0.015 85);color:oklch(22% 0.04 160);font-family:'Inter',sans-serif;padding:2rem;text-align:center}
  .icon{width:56px;height:56px;margin:0 auto 1.5rem;border-radius:50%;display:flex;align-items:center;justify-content:center;
        background:oklch(62% 0.15 45 / 0.12)}
  h1{font-family:'Fraunces',serif;font-weight:300;font-size:1.75rem;margin-bottom:.75rem;color:oklch(22% 0.04 160)}
  p{font-size:.875rem;font-weight:300;line-height:1.6;color:oklch(45% 0.03 160);max-width:280px}
</style></head>
<body>
  <div class="icon">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <polyline points="20,6 9,17 4,12" stroke="oklch(62% 0.15 45)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </div>
  <h1>${heading}</h1>
  <p>${body}</p>
</body></html>`;
}

// ─── Boot ────────────────────────────────────────────────────────────────────
const PORT = process.env.AUTH_PORT ?? 4000;
server.listen(PORT, () => {
  console.log(`[auth-gateway] Running on http://localhost:${PORT}`);
  console.log(`[auth-gateway] JWT algorithm: ${JWT_ALGORITHM}`);
  console.log(`[auth-gateway] Session TTL: ${SESSION_TTL / 1000}s`);
});
