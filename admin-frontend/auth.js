'use strict';

/**
 * Decodes the JWT payload without verifying the signature.
 * Verification happens server-side on every authenticated request.
 * Client-side decode is used only to avoid making network calls
 * with a token that is obviously already expired.
 */
function decodeAdminToken(token) {
    try {
        return JSON.parse(atob(token.split('.')[1]));
    } catch {
        return null;
    }
}

function isAdminSessionValid(token) {
    if (!token) return false;
    const payload = decodeAdminToken(token);
    if (!payload || payload.role !== 'admin') return false;
    // exp is Unix seconds
    return payload.exp * 1000 > Date.now();
}

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('authToken');
    if (!isAdminSessionValid(token)) {
        localStorage.removeItem('authToken');
        window.location.href = 'login.html';
    }
});
