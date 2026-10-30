/** Small HTTP helpers shared by the MathMon functions: JSON replies, input validation, admin key. */
const { timingSafeEqual } = require('crypto');

function json(status, body) {
    return { status, jsonBody: body, headers: { 'Cache-Control': 'no-store' } };
}

async function readBody(request) {
    try {
        const body = await request.json();
        return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    } catch (error) {
        return {};
    }
}

/** Player ids come from the browser (`web-<time>-<random>`): allow only a safe, short charset. */
function playerId(value) {
    const id = String(value || '');
    return /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
}

function text(value, max) {
    return String(value == null ? '' : value).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
}

function number(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Feature vector from js/adaptive-ml.js: exactly `length` finite numbers, else null. */
function features(value, length) {
    if (!Array.isArray(value) || value.length !== length) return null;
    const out = value.map(Number);
    return out.every((n) => Number.isFinite(n) && Math.abs(n) < 100) ? out : null;
}

/** Admin endpoints need the `x-admin-key` header to match ML_ADMIN_KEY (disabled when unset). */
function isAdmin(request) {
    const expected = process.env.ML_ADMIN_KEY || '';
    const given = request.headers.get('x-admin-key') || '';
    if (!expected || given.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

module.exports = { json, readBody, playerId, text, number, features, isAdmin };
