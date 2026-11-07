/* ============================================================
   auth.js — Access Code Authentication for Satu Langkah Coursebook
   ============================================================ */

(function (global) {
  'use strict';

  const CODES_URL = 'codes.json';
  const LS_KEY_CODE = 'sl_access_code';
  const LS_KEY_NAME = 'sl_access_name';
  const LS_KEY_DATE = 'sl_access_date';

  // ---------- Helpers ----------
  function normalizeCode(input) {
    if (!input) return '';
    return String(input)
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '')      // hapus semua spasi
      .replace(/[^A-Z0-9-]/g, ''); // hanya huruf, angka, strip
  }

  function isValidFormat(code) {
    // Format: SALAM-YYYY-XXXX (12+ karakter)
    return /^SALAM-\d{4}-[A-Z0-9]{4}$/.test(code);
  }

  // ---------- Codes fetch (with cache-busting) ----------
  let codesCache = null;
  let codesCacheTime = 0;
  const CACHE_TTL = 60 * 1000; // 1 menit

  async function fetchCodes(force = false) {
    const now = Date.now();
    if (!force && codesCache && (now - codesCacheTime) < CACHE_TTL) {
      return codesCache;
    }
    const url = CODES_URL + '?v=' + now; // cache-bust
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch codes');
    const data = await res.json();
    codesCache = data;
    codesCacheTime = now;
    return data;
  }

  // ---------- Validation ----------
  async function validateCode(rawCode) {
    const code = normalizeCode(rawCode);

    if (!code) {
      return { ok: false, reason: 'empty', message: 'Please enter a code.' };
    }
    if (!isValidFormat(code)) {
      return { ok: false, reason: 'format', message: 'Invalid format. Codes look like SALAM-2026-A7K3.' };
    }

    let codes;
    try {
      codes = await fetchCodes(true); // force fresh
    } catch (e) {
      return { ok: false, reason: 'network', message: 'Could not reach the server. Check your connection and try again.' };
    }

    const entry = codes[code];
    if (!entry) {
      return { ok: false, reason: 'not_found', message: 'Code not found. Please double-check or contact us.' };
    }
    if (!entry.active) {
      return { ok: false, reason: 'inactive', message: 'This code is no longer active. Contact us if you believe this is a mistake.' };
    }

    return { ok: true, code, name: entry.name || '', entry };
  }

  // ---------- Session storage ----------
  function saveSession(code, name) {
    try {
      localStorage.setItem(LS_KEY_CODE, code);
      localStorage.setItem(LS_KEY_NAME, name || '');
      localStorage.setItem(LS_KEY_DATE, new Date().toISOString());
    } catch (e) {
      console.warn('localStorage save failed', e);
    }
  }

  function getSession() {
    try {
      const code = localStorage.getItem(LS_KEY_CODE);
      if (!code) return null;
      return {
        code,
        name: localStorage.getItem(LS_KEY_NAME) || '',
        date: localStorage.getItem(LS_KEY_DATE) || ''
      };
    } catch (e) {
      return null;
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(LS_KEY_CODE);
      localStorage.removeItem(LS_KEY_NAME);
      localStorage.removeItem(LS_KEY_DATE);
    } catch (e) {}
  }

  // ---------- Page guards ----------
  async function requireAuth(redirectTo = 'unlock.html') {
    const session = getSession();
    if (!session) {
      window.location.replace(redirectTo);
      return null;
    }
    // Re-validate against server (catch revoked codes)
    try {
      const result = await validateCode(session.code);
      if (!result.ok) {
        clearSession();
        window.location.replace(redirectTo + '?reason=' + encodeURIComponent(result.reason));
        return null;
      }
      // Refresh name in case it was updated
      if (result.name && result.name !== session.name) {
        saveSession(session.code, result.name);
        session.name = result.name;
      }
      return session;
    } catch (e) {
      // Network error — allow cached session (graceful degradation)
      return session;
    }
  }

  async function redirectIfAuthorized(redirectTo = 'app.html') {
    const session = getSession();
    if (!session) return false;
    try {
      const result = await validateCode(session.code);
      if (result.ok) {
        window.location.replace(redirectTo);
        return true;
      }
      clearSession();
      return false;
    } catch (e) {
      // Network fail — allow cached session
      window.location.replace(redirectTo);
      return true;
    }
  }

  // ---------- Expose ----------
  global.SLAuth = {
    normalizeCode,
    isValidFormat,
    validateCode,
    saveSession,
    getSession,
    clearSession,
    requireAuth,
    redirectIfAuthorized
  };
})(window);