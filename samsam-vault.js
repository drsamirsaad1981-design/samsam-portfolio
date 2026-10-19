// samsam-vault.js — encryption for everything the app keeps on this device or puts in a backup file.
// Uses only the browser's built-in Web Crypto API (no third-party library):
//
//  • Device vault (at rest): AES-256-GCM with a random key generated on this device. The key is created
//    "non-extractable" and kept in IndexedDB, so the browser can use it but no script — not even this
//    app — can read its bytes or copy it off the device. Old-app data left in localStorage is moved
//    into the vault and the plain copy is deleted.
//  • Backup files: AES-256-GCM with a key derived from your password (PBKDF2-SHA-256, 600,000 rounds,
//    random 16-byte salt, random 12-byte IV). Without the password the file is unreadable; a wrong
//    password or a modified file is rejected (GCM authentication).
(function () {
  'use strict';
  var subtle = window.crypto && window.crypto.subtle;
  var VAULT_PREFIX = 'samsam_vault:';
  var KDF_ITER = 600000;
  var enc = new TextEncoder(), dec = new TextDecoder();

  function b64(buf) { var s = '', a = new Uint8Array(buf); for (var i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(s) { var bin = atob(s), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
  function rand(n) { return crypto.getRandomValues(new Uint8Array(n)); }
  function need() { if (!subtle) throw new Error('This browser has no Web Crypto support (open the site over https).'); }

  // ── device key (IndexedDB, non-extractable) ────────────────────────────────
  var keyPromise = null;
  function idb() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open('samsam-vault', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('keys'); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
  }
  function idbOp(mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('keys', mode), st = tx.objectStore('keys'), out;
        var req = fn(st); if (req) req.onsuccess = function () { out = req.result; };
        tx.oncomplete = function () { db.close(); res(out); }; tx.onerror = tx.onabort = function () { db.close(); rej(tx.error); };
      });
    });
  }
  function deviceKey() {
    if (keyPromise) return keyPromise;
    keyPromise = Promise.resolve().then(function () {
      need();
      return idbOp('readonly', function (st) { return st.get('device'); });
    }).then(function (k) {
      if (k) return k;
      return subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']).then(function (nk) {
        return idbOp('readwrite', function (st) { st.put(nk, 'device'); }).then(function () { return nk; });
      });
    });
    keyPromise.catch(function () { keyPromise = null; });
    return keyPromise;
  }

  function seal(key, obj, aad) {
    var iv = rand(12);
    var p = { name: 'AES-GCM', iv: iv }; if (aad) p.additionalData = enc.encode(aad);
    return subtle.encrypt(p, key, enc.encode(JSON.stringify(obj))).then(function (ct) { return { iv: b64(iv), ct: b64(ct) }; });
  }
  function open(key, rec, aad) {
    var p = { name: 'AES-GCM', iv: unb64(rec.iv) }; if (aad) p.additionalData = enc.encode(aad);
    return subtle.decrypt(p, key, unb64(rec.ct)).then(function (pt) { return JSON.parse(dec.decode(pt)); });
  }

  // ── device vault API ───────────────────────────────────────────────────────
  function vaultSet(name, obj) {
    return deviceKey().then(function (k) { return seal(k, obj, VAULT_PREFIX + name); })
      .then(function (r) { localStorage.setItem(VAULT_PREFIX + name, JSON.stringify({ v: 1, alg: 'AES-256-GCM', iv: r.iv, ct: r.ct })); });
  }
  function vaultGet(name, fallback) {
    var raw; try { raw = localStorage.getItem(VAULT_PREFIX + name); } catch (_) { raw = null; }
    if (!raw) return Promise.resolve(fallback === undefined ? null : fallback);
    return deviceKey().then(function (k) { return open(k, JSON.parse(raw), VAULT_PREFIX + name); })
      .catch(function (e) { console.warn('[SamsamVault] cannot open', name, e); return fallback === undefined ? null : fallback; });
  }
  // Move plain-text localStorage entries into the vault, then delete the plain copies.
  function sealKeys(keys) {
    var todo = (keys || []).filter(function (k) { try { return localStorage.getItem(k) != null; } catch (_) { return false; } });
    if (!todo.length || !subtle) return Promise.resolve(0);
    return todo.reduce(function (p, k) {
      return p.then(function (n) {
        var v = localStorage.getItem(k), parsed; try { parsed = JSON.parse(v); } catch (_) { parsed = v; }
        return vaultSet(k, parsed).then(function () { return vaultGet(k); }).then(function (back) {
          // delete the plain copy only after the encrypted copy reads back identically
          if (JSON.stringify(back) === JSON.stringify(parsed)) { localStorage.removeItem(k); return n + 1; }
          return n;
        });
      });
    }, Promise.resolve(0));
  }
  // Read a legacy key: plain copy if it is still there, otherwise the vault copy.
  function readKey(k, fallback) {
    try { var v = localStorage.getItem(k); if (v != null) return Promise.resolve(JSON.parse(v)); } catch (_) {}
    return vaultGet(k, fallback);
  }

  // ── password-encrypted backup files ────────────────────────────────────────
  var FILE_AAD = 'samsam-portfolio/encrypted-backup/v1';
  function passKey(password, salt, iter) {
    return subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  function encryptBackup(obj, password) {
    need();
    if (!password || password.length < 8) return Promise.reject(new Error('Use a password of at least 8 characters.'));
    var salt = rand(16);
    return passKey(password, salt, KDF_ITER).then(function (k) { return seal(k, obj, FILE_AAD); }).then(function (r) {
      return { app: 'samsam-portfolio', kind: 'encrypted-backup', v: 1, exportedAt: new Date().toISOString(),
        kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: KDF_ITER, salt: b64(salt) },
        cipher: { name: 'AES-GCM', length: 256, iv: r.iv }, data: r.ct };
    });
  }
  function isEncrypted(j) { return !!(j && j.kind === 'encrypted-backup' && j.cipher && j.kdf && j.data); }
  function decryptBackup(j, password) {
    need();
    if (!isEncrypted(j)) return Promise.reject(new Error('This file is not an encrypted Samsam backup.'));
    if (j.kdf.name !== 'PBKDF2' || j.cipher.name !== 'AES-GCM' || !(j.kdf.iterations >= 100000)) return Promise.reject(new Error('Unsupported backup format.'));
    return passKey(password || '', unb64(j.kdf.salt), j.kdf.iterations)
      .then(function (k) { return open(k, { iv: j.cipher.iv, ct: j.data }, FILE_AAD); })
      .catch(function (e) { if (e && e.name === 'OperationError') throw new Error('Wrong password, or the file was changed.'); throw e; });
  }

  // ── small password dialog (same look as the app; no native prompt) ─────────
  function askPassword(o) {
    o = o || {};
    var confirm2 = o.mode === 'set';
    return new Promise(function (resolve) {
      if (!document.getElementById('ssPwCss')) {
        var css = document.createElement('style'); css.id = 'ssPwCss';
        css.textContent = '#ssPw{position:fixed;inset:0;z-index:100100;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(2,6,23,.6)}' +
          '#ssPw form{width:min(380px,100%);background:var(--bg2,var(--card,#111827));color:var(--fg,#e5e7eb);border:1px solid var(--border,#374151);border-radius:14px;padding:18px;font:14px/1.45 system-ui,-apple-system,sans-serif;box-shadow:0 18px 40px rgba(0,0,0,.45)}' +
          '#ssPw h3{margin:0 0 6px;font-size:1rem}#ssPw p{margin:0 0 12px;color:var(--fg2,#9ca3af);font-size:.85rem}' +
          '#ssPw input{width:100%;box-sizing:border-box;height:42px;margin:0 0 10px;padding:0 12px;border-radius:10px;border:1px solid var(--border,#374151);background:var(--bg3,#1f2937);color:inherit;font:inherit}' +
          '#ssPw .e{color:#ef4444;font-size:.82rem;min-height:1.2em;margin-bottom:8px}#ssPw .r{display:flex;gap:8px}' +
          '#ssPw button{flex:1;min-height:42px;border-radius:10px;border:1px solid var(--border,#374151);background:var(--bg3,#1f2937);color:inherit;font:inherit;font-weight:600;cursor:pointer}' +
          '#ssPw button[type=submit]{background:#2563eb;border-color:#2563eb;color:#fff}';
        document.head.appendChild(css);
      }
      var wrap = document.createElement('div'); wrap.id = 'ssPw';
      var f = document.createElement('form'); f.autocomplete = 'off';
      var h = document.createElement('h3'); h.textContent = o.title || (confirm2 ? '🔐 Encrypt backup' : '🔐 Backup password');
      var p = document.createElement('p'); p.textContent = o.text || (confirm2 ? 'Choose a password (8+ characters). You will need it to restore this file — it cannot be recovered.' : 'Enter the password used when this backup was made.');
      var a = document.createElement('input'); a.type = 'password'; a.placeholder = 'Password'; a.id = 'ssPwA'; a.autocomplete = confirm2 ? 'new-password' : 'current-password';
      var b = document.createElement('input'); b.type = 'password'; b.placeholder = 'Repeat password'; b.id = 'ssPwB'; b.autocomplete = 'new-password';
      var e = document.createElement('div'); e.className = 'e';
      var r = document.createElement('div'); r.className = 'r';
      var cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
      var ok = document.createElement('button'); ok.type = 'submit'; ok.textContent = o.okText || (confirm2 ? 'Encrypt & download' : 'Unlock');
      r.append(cancel, ok); f.append(h, p, a); if (confirm2) f.append(b); f.append(e, r); wrap.append(f); document.body.append(wrap);
      var done = function (v) { wrap.remove(); document.removeEventListener('keydown', esc, true); resolve(v); };
      var esc = function (ev) { if (ev.key === 'Escape') { ev.stopPropagation(); done(null); } };
      document.addEventListener('keydown', esc, true);
      cancel.onclick = function () { done(null); };
      wrap.addEventListener('click', function (ev) { if (ev.target === wrap) done(null); });
      f.onsubmit = function (ev) {
        ev.preventDefault();
        if (confirm2 && a.value.length < 8) { e.textContent = 'At least 8 characters.'; return; }
        if (confirm2 && a.value !== b.value) { e.textContent = 'The two passwords are different.'; return; }
        if (!a.value) { e.textContent = 'Enter the password.'; return; }
        done(a.value);
      };
      setTimeout(function () { a.focus(); }, 0);
    });
  }

  window.SamsamVault = Object.freeze({
    available: !!subtle,
    set: vaultSet, get: vaultGet, sealKeys: sealKeys, readKey: readKey,
    encryptBackup: encryptBackup, decryptBackup: decryptBackup, isEncrypted: isEncrypted, askPassword: askPassword,
    PREFIX: VAULT_PREFIX, ITERATIONS: KDF_ITER,
  });
})();
