/**
 * Auth Gateway State Machine
 *
 * States:
 *   IDLE → GENERATING → ACTIVE → EXPIRED  (timeout or server push)
 *                              → SCANNED  (server push via WebSocket)
 *                                → VERIFIED (JWT issued)
 *
 * Transport:
 *   - Session creation  : POST /auth/qr-session
 *   - Scan notification : WebSocket /ws?sessionId=…  (event-driven, no polling)
 *   - JWT issuance      : POST /auth/complete
 *   - Email attachment  : POST /auth/enroll
 */

'use strict';

// ── Config ────────────────────────────────────────────────────────────────────
const AUTH_GATEWAY      = (typeof CONFIG !== 'undefined' ? CONFIG.AUTH_GATEWAY    : null) || 'http://localhost:4000';
const RESTAURANT_URL    = (typeof CONFIG !== 'undefined' ? CONFIG.RESTAURANT_URL  : null) || '../customers-frontend/index1.html';
const SESSION_TTL_MS    = 90_000; // Must match server SESSION_TTL

// ── DOM refs ──────────────────────────────────────────────────────────────────
const splitFrame      = document.getElementById('splitFrame');
const qrLoading       = document.getElementById('qrLoading');
const qrImg           = document.getElementById('qrImg');
const qrWrapper       = document.getElementById('qrWrapper');
const expiredOverlay  = document.getElementById('expiredOverlay');
const countdownRow    = document.getElementById('countdownRow');
const countdownBar    = document.getElementById('countdownBar');
const countdownLabel  = document.getElementById('countdownLabel');
const refreshBtn      = document.getElementById('refreshBtn');
const verifiedDash    = document.getElementById('verifiedDashboard');
const verifiedUser    = document.getElementById('verifiedUser');
const tokenDisplay    = document.getElementById('tokenDisplay');
const enrollForm      = document.getElementById('enrollForm');
const enrollStatus    = document.getElementById('enrollStatus');
const ringFill        = document.getElementById('ringFill');
const checkSvg        = document.getElementById('checkSvg');
const checkMark       = document.getElementById('checkMark');

// ── Runtime state ─────────────────────────────────────────────────────────────
let machineState   = 'IDLE';
let currentSession = null;   // { sessionId, verifyUrl, expiresAt }
let ws             = null;
let rafId          = null;   // requestAnimationFrame handle for countdown
let enrolledEmail  = null;   // set after form submit

// ── State machine entry point ─────────────────────────────────────────────────
function transition(next, payload = {}) {
  if (machineState === next) return;
  console.debug(`[auth] ${machineState} → ${next}`, payload);
  machineState = next;

  ({ GENERATING, ACTIVE, EXPIRED, SCANNED, VERIFIED }[next] ?? noop)(payload);
}

// ── State: GENERATING ─────────────────────────────────────────────────────────
async function GENERATING() {
  teardownSession();
  showLoading();

  let session;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${AUTH_GATEWAY}/auth/qr-session`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      session = await res.json();
      break;
    } catch (err) {
      console.warn(`[auth] Session request failed (attempt ${attempt + 1}):`, err);
      if (attempt === 2) {
        showError('Could not reach the auth server. Retrying…');
        setTimeout(() => transition('GENERATING'), 4000);
        return;
      }
      await sleep(1000 * (attempt + 1)); // 1s, 2s back-off
    }
  }

  currentSession = session;
  transition('ACTIVE', { session });
}

// ── State: ACTIVE ─────────────────────────────────────────────────────────────
async function ACTIVE({ session }) {
  // Backend returns qrDataUrl — no client-side QR library needed
  if (!session.qrDataUrl) {
    showError('QR generation failed. Refreshing…');
    setTimeout(() => transition('GENERATING'), 2000);
    return;
  }

  qrImg.src = session.qrDataUrl;
  qrLoading.style.display    = 'none';
  qrImg.style.display        = 'block';
  countdownRow.style.display = 'block';
  qrWrapper.classList.add('qr-pulse');

  startCountdown(session.expiresAt);
  connectWebSocket(session.sessionId);

  // If user already filled the form before QR was ready
  if (enrolledEmail) attachEmail(session.sessionId, enrolledEmail);
}

// ── State: EXPIRED ────────────────────────────────────────────────────────────
function EXPIRED() {
  stopCountdown();
  disconnectWebSocket();

  qrWrapper.classList.remove('qr-pulse');
  qrWrapper.classList.add('qr-blur-out');

  // Reveal expired overlay after blur settles
  setTimeout(() => {
    expiredOverlay.style.display    = 'flex';
    expiredOverlay.style.animation  = 'overlay-rise 0.4s cubic-bezier(0.16,1,0.3,1) forwards';
    countdownRow.style.display      = 'none';
  }, 600);
}

// ── State: SCANNED ────────────────────────────────────────────────────────────
async function SCANNED() {
  stopCountdown();
  disconnectWebSocket();
  qrWrapper.classList.remove('qr-pulse');

  try {
    const res = await fetch(`${AUTH_GATEWAY}/auth/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: currentSession.sessionId }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { token } = await res.json();
    transition('VERIFIED', { token });
  } catch (err) {
    console.error('[auth] JWT issuance failed:', err);
    showError('Authentication error. Please refresh and try again.');
  }
}

// ── State: VERIFIED ───────────────────────────────────────────────────────────
function VERIFIED({ token }) {
  // Persist token and identity so other pages (order form) can use them
  localStorage.setItem('auth_token', token);
  if (enrolledEmail) localStorage.setItem('auth_email', enrolledEmail);

  // Animate split frame out
  splitFrame.classList.add('frame-out');

  setTimeout(() => {
    splitFrame.style.display = 'none';

    // Populate dashboard
    verifiedUser.textContent = enrolledEmail ? `Signed in as ${enrolledEmail}` : 'Guest Session';
    tokenDisplay.textContent = token.length > 60 ? `${token.slice(0, 55)}…` : token;

    // Wire up the continue button to navigate to the restaurant
    document.getElementById('continueBtn').href = RESTAURANT_URL;

    verifiedDash.style.display = 'flex';
    verifiedDash.classList.add('dash-in');

    playVerificationRing();
  }, 420);
}

// ── Countdown (rAF-based, no setInterval drift) ───────────────────────────────
function startCountdown(expiresAt) {
  stopCountdown();
  countdownBar.classList.remove('bar-warn');
  countdownBar.style.background   = 'var(--ember)';
  countdownLabel.style.color      = 'var(--ember)';

  function tick() {
    const remaining = expiresAt - Date.now();

    if (remaining <= 0) {
      countdownBar.style.width    = '0%';
      countdownLabel.textContent  = '0:00';
      if (machineState === 'ACTIVE') transition('EXPIRED');
      return;
    }

    const pct  = (remaining / SESSION_TTL_MS) * 100;
    const secs = Math.ceil(remaining / 1000);
    const m    = Math.floor(secs / 60);
    const s    = secs % 60;

    countdownBar.style.width   = `${pct}%`;
    countdownLabel.textContent = `${m}:${String(s).padStart(2, '0')}`;

    if (secs <= 20 && !countdownBar.classList.contains('bar-warn')) {
      countdownBar.style.background  = 'oklch(55% 0.18 28)';
      countdownLabel.style.color     = 'oklch(55% 0.18 28)';
      countdownBar.classList.add('bar-warn');
    }

    rafId = requestAnimationFrame(tick);
  }

  rafId = requestAnimationFrame(tick);
}

function stopCountdown() {
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
}

// ── WebSocket (event-driven, no polling) ──────────────────────────────────────
function connectWebSocket(sessionId) {
  disconnectWebSocket();

  const wsUrl = AUTH_GATEWAY.replace(/^http/, 'ws') + `/ws?sessionId=${sessionId}`;
  ws = new WebSocket(wsUrl);

  ws.onmessage = ({ data }) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    if (msg.event === 'scanned' && machineState === 'ACTIVE') {
      transition('SCANNED');
    } else if (msg.event === 'expired' && machineState === 'ACTIVE') {
      transition('EXPIRED');
    }
  };

  ws.onerror = () => console.warn('[auth] WebSocket error');

  ws.onclose = ({ code }) => {
    if (code === 4001) console.warn('[auth] WS rejected — session invalid');
  };
}

function disconnectWebSocket() {
  if (!ws) return;
  ws.onmessage = ws.onerror = ws.onclose = null;
  if (ws.readyState < WebSocket.CLOSING) ws.close();
  ws = null;
}

// ── Email attachment ───────────────────────────────────────────────────────────
async function attachEmail(sessionId, email) {
  try {
    const res = await fetch(`${AUTH_GATEWAY}/auth/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, email }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.warn('[auth] Email attach failed:', err);
  }
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function showLoading() {
  qrWrapper.classList.remove('qr-blur-out', 'qr-pulse');
  qrImg.style.display           = 'none';
  qrLoading.style.display       = 'flex';
  expiredOverlay.style.display  = 'none';
  countdownRow.style.display    = 'none';

  // Reset countdown bar
  countdownBar.style.width       = '100%';
  countdownBar.style.background  = 'var(--ember)';
  countdownLabel.style.color     = 'var(--ember)';
  countdownBar.classList.remove('bar-warn');
}

function showError(msg) {
  enrollStatus.textContent     = msg;
  enrollStatus.style.color     = 'oklch(55% 0.15 45)';
  enrollStatus.classList.remove('hidden');
  setTimeout(() => enrollStatus.classList.add('hidden'), 5000);
}

function teardownSession() {
  stopCountdown();
  disconnectWebSocket();
  currentSession = null;
}

// ── Verification ring animation ───────────────────────────────────────────────
function playVerificationRing() {
  // Draw ring in
  ringFill.style.strokeDashoffset = '0';

  // After ring completes: swap to checkmark
  setTimeout(() => {
    ringFill.style.transition  = 'opacity 0.35s ease';
    ringFill.style.opacity     = '0';

    checkSvg.style.transition  = 'opacity 0.25s ease 0.1s';
    checkSvg.style.opacity     = '1';
    checkMark.style.strokeDashoffset = '0';
  }, 1400);
}

// ── Enrollment form ───────────────────────────────────────────────────────────
enrollForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('enrollEmail').value.trim();
  const name  = document.getElementById('enrollName').value.trim();
  if (!email || !name) return;

  enrolledEmail = email;

  enrollStatus.style.color = 'var(--mist)';
  enrollStatus.textContent = 'Linking your email to this session…';
  enrollStatus.classList.remove('hidden');

  if (currentSession?.sessionId && machineState === 'ACTIVE') {
    await attachEmail(currentSession.sessionId, email);
    enrollStatus.textContent = `Linked: ${email}. Now scan the QR code to complete sign-in.`;
  } else {
    enrollStatus.textContent = 'Email saved. Complete QR scan to finish sign-in.';
  }
});

// ── Refresh button ────────────────────────────────────────────────────────────
refreshBtn.addEventListener('click', () => transition('GENERATING'));

// ── Utilities ─────────────────────────────────────────────────────────────────
const noop  = () => {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Boot ──────────────────────────────────────────────────────────────────────
transition('GENERATING');
