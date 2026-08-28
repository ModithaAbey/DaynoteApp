/* ============================================================
   DayNote — Data layer
   ------------------------------------------------------------
   Everything reads/writes through the DB object below.

   Storage backend: IndexedDB, not localStorage. localStorage caps
   out around 5-10MB total per origin, which is tight once journal
   photos/drawings are involved; IndexedDB's limit is a large share
   of free disk space instead, so that ceiling is effectively gone.

   To keep every existing call site in the app unchanged (calendar,
   tasks, finance, journal, the today-summary widget, onboarding,
   accounts, app lock — all of it calls things like DB.events.list()
   or DB.getProfile() and expect a plain value back, not a Promise),
   this layer keeps a full in-memory cache of every record. Reads are
   served instantly from that cache — still fully synchronous. Writes
   update the cache immediately AND persist to IndexedDB in the
   background.

   Anything that runs before the cache is populated (i.e. before the
   page has painted anything) should `await DB.ready` first — every
   page's bootstrap script does this once, up front, so nothing else
   needs to worry about it.

   One-time migration: if IndexedDB is empty but the old localStorage
   keys (daynote.events, daynote.accounts, daynote.finance.transactions,
   etc.) still have data from before this update, that data is imported
   into IndexedDB automatically on first load, then the old keys are
   cleared so the freed space goes back to the browser's small
   localStorage quota.
   ============================================================ */

const DB = (() => {
  const IDB_NAME = 'daynote-db';
  const IDB_VERSION = 1;
  const STORES = ['events', 'tasks', 'transactions', 'notes', 'kv', 'financeTxns'];

  async function sha256Hex(str) {
    const enc = new TextEncoder().encode(str);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---------------- IndexedDB plumbing ----------------
  let idbPromise = null;
  function openIDB() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        STORES.forEach((name) => {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return idbPromise;
  }

  function idbGetAll(storeName) {
    return openIDB().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    }));
  }

  function idbPut(storeName, record) {
    return openIDB().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    })).catch((e) => console.error('DayNote: IndexedDB write failed', storeName, e));
  }

  function idbDelete(storeName, id) {
    return openIDB().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    })).catch((e) => console.error('DayNote: IndexedDB delete failed', storeName, e));
  }

  function idbClear(storeName) {
    return openIDB().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }));
  }

  // ---------------- one-time migration from localStorage ----------------
  const OLD_KEYS = {
    events: 'daynote.events',
    tasks: 'daynote.tasks',
    transactions: 'daynote.transactions',
    notes: 'daynote.notes',
    theme: 'daynote.theme',
    profile: 'daynote.profile',
    lockPin: 'daynote.lockpin',
    accounts: 'daynote.accounts',
    activeAccountId: 'daynote.activeAccountId',
    onboarded: 'daynote.onboarded',
    financeTxns: 'daynote.finance.transactions',
    financeBudget: 'daynote.finance.budget',
    financeBudgetHistory: 'daynote.finance.budgetHistory',
    financeCategorizeEnabled: 'daynote.finance.categorizeEnabled',
  };

  function readOldJSON(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function migrateIfNeeded() {
    return Promise.all(STORES.map((s) => idbGetAll(s))).then((results) => {
      const allEmpty = results.every((list) => list.length === 0);
      const hasOldData = Object.values(OLD_KEYS).some((k) => localStorage.getItem(k) !== null);
      if (!allEmpty || !hasOldData) return;

      const jobs = [];
      const putAllIfArray = (storeName, raw) => {
        if (Array.isArray(raw)) raw.forEach((r) => { if (r && r.id) jobs.push(idbPut(storeName, r)); });
      };
      putAllIfArray('events', readOldJSON(OLD_KEYS.events));
      putAllIfArray('tasks', readOldJSON(OLD_KEYS.tasks));
      putAllIfArray('transactions', readOldJSON(OLD_KEYS.transactions));
      putAllIfArray('notes', readOldJSON(OLD_KEYS.notes));
      putAllIfArray('financeTxns', readOldJSON(OLD_KEYS.financeTxns));

      const putKV = (id, value) => { if (value !== null && value !== undefined) jobs.push(idbPut('kv', { id, value })); };
      putKV('theme', readOldJSON(OLD_KEYS.theme));
      putKV('profile', readOldJSON(OLD_KEYS.profile));
      putKV('lockPin', localStorage.getItem(OLD_KEYS.lockPin)); // stored as a raw hash string, not JSON
      putKV('accounts', readOldJSON(OLD_KEYS.accounts));
      putKV('activeAccountId', readOldJSON(OLD_KEYS.activeAccountId));
      putKV('onboarded', readOldJSON(OLD_KEYS.onboarded));
      putKV('financeBudget', readOldJSON(OLD_KEYS.financeBudget));
      putKV('financeBudgetHistory', readOldJSON(OLD_KEYS.financeBudgetHistory));
      const oldCategorize = localStorage.getItem(OLD_KEYS.financeCategorizeEnabled);
      if (oldCategorize !== null) jobs.push(idbPut('kv', { id: 'financeCategorizeEnabled', value: oldCategorize === 'true' }));

      return Promise.all(jobs).then(() => {
        // Free up the old localStorage quota now that data lives in IndexedDB.
        Object.values(OLD_KEYS).forEach((k) => localStorage.removeItem(k));
      });
    });
  }

  // ---------------- in-memory cache ----------------
  const cache = {
    events: [], tasks: [], transactions: [], notes: [], financeTxns: [],
    kv: {}, // theme, profile, lockPin, biometricCredId, accounts, activeAccountId,
            // onboarded, financeBudget, financeBudgetHistory, financeCategorizeEnabled
  };

  function loadCacheFromIDB() {
    return Promise.all([
      idbGetAll('events'), idbGetAll('tasks'), idbGetAll('transactions'),
      idbGetAll('notes'), idbGetAll('financeTxns'), idbGetAll('kv'),
    ]).then(([events, tasks, transactions, notes, financeTxns, kvRows]) => {
      cache.events = events;
      cache.tasks = tasks;
      cache.transactions = transactions;
      cache.notes = notes;
      cache.financeTxns = financeTxns;
      cache.kv = {};
      kvRows.forEach((row) => { cache.kv[row.id] = row.value; });
    });
  }

  const ready = migrateIfNeeded().then(loadCacheFromIDB).catch((e) => {
    console.error('DayNote: storage init failed', e);
  });

  // ---------------- generic CRUD over a cached collection ----------------
  function collection(storeName) {
    return {
      list() { return cache[storeName]; },
      get(id) { return cache[storeName].find((x) => x.id === id) || null; },
      create(item) {
        const record = { id: uid(), createdAt: Date.now(), ...item };
        cache[storeName].push(record);
        idbPut(storeName, record);
        return record;
      },
      update(id, patch) {
        const items = cache[storeName];
        const idx = items.findIndex((x) => x.id === id);
        if (idx === -1) return null;
        items[idx] = { ...items[idx], ...patch, updatedAt: Date.now() };
        idbPut(storeName, items[idx]);
        return items[idx];
      },
      remove(id) {
        cache[storeName] = cache[storeName].filter((x) => x.id !== id);
        idbDelete(storeName, id);
      },
      clear() {
        cache[storeName] = [];
        idbClear(storeName);
      },
    };
  }

  function kvGet(key, fallback) {
    return key in cache.kv ? cache.kv[key] : fallback;
  }
  function kvSet(key, value) {
    cache.kv[key] = value;
    idbPut('kv', { id: key, value });
  }
  function kvDelete(key) {
    delete cache.kv[key];
    idbDelete('kv', key);
  }

  function getStorageEstimate() {
    if (!(navigator.storage && navigator.storage.estimate)) return Promise.resolve(null);
    return navigator.storage.estimate().then((est) => {
      if (!est.quota) return null;
      return {
        usageMB: est.usage / (1024 * 1024),
        quotaMB: est.quota / (1024 * 1024),
        percent: (est.usage / est.quota) * 100,
      };
    }).catch(() => null);
  }

  return {
    ready, // await this before the first read, e.g. `await DB.ready` in each page's bootstrap script

    events: collection('events'),
    tasks: collection('tasks'),
    transactions: collection('transactions'),
    notes: collection('notes'),

    getTheme() { return kvGet('theme', 'parchment'); },
    setTheme(id) { kvSet('theme', id); },

    getProfile() { return kvGet('profile', { name: 'You', email: 'you@example.com' }); },
    setProfile(patch) { kvSet('profile', { ...kvGet('profile', {}), ...patch }); },

    // ---- Onboarding / local "accounts" ----
    // "Signing in" personalizes the local profile shown around the app;
    // Firebase (wired in app.js) is what makes it a real, verified sign-in
    // now. "Accounts" are still a small saved list you can switch between
    // on this device — switching swaps the displayed name/email/initial,
    // it does NOT separate your calendar/tasks/finance/journal data per
    // account, that all stays shared on this device either way.
    isOnboarded() { return !!kvGet('onboarded', false); },
    completeOnboarding({ name, email }) {
      kvSet('onboarded', true);
      return this.addAccount({ name, email });
    },
    listAccounts() { return kvGet('accounts', []); },
    getActiveAccountId() { return kvGet('activeAccountId', null); },
    addAccount({ name, email }) {
      const accounts = kvGet('accounts', []);
      const account = { id: uid(), name: (name || 'You').trim(), email: (email || '').trim() };
      accounts.push(account);
      kvSet('accounts', accounts);
      kvSet('activeAccountId', account.id);
      kvSet('profile', { name: account.name, email: account.email });
      return account;
    },
    switchAccount(id) {
      const accounts = kvGet('accounts', []);
      const account = accounts.find((a) => a.id === id);
      if (!account) return null;
      kvSet('activeAccountId', account.id);
      kvSet('profile', { name: account.name, email: account.email });
      return account;
    },
    removeAccount(id) {
      const accounts = kvGet('accounts', []).filter((a) => a.id !== id);
      kvSet('accounts', accounts);
      if (kvGet('activeAccountId', null) === id) {
        const next = accounts[0];
        if (next) { kvSet('activeAccountId', next.id); kvSet('profile', { name: next.name, email: next.email }); }
        else kvSet('activeAccountId', null);
      }
    },

    signOut() {
      if (typeof firebase !== 'undefined' && firebase.auth) firebase.auth().signOut().catch(() => {});
      sessionStorage.removeItem('daynote.unlocked');
      return true;
    },
    async deleteAccount() {
      if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
        try { await firebase.auth().currentUser.delete(); }
        catch (e) {
          // Firebase requires a recent sign-in for this; if that's why it
          // failed, at least sign the person out so the account isn't left
          // in a half-deleted-looking state on this device.
          if (e && e.code === 'auth/requires-recent-login') await firebase.auth().signOut().catch(() => {});
        }
      }
      ['events', 'tasks', 'transactions', 'notes', 'financeTxns'].forEach((s) => collection(s).clear());
      await idbClear('kv');
      cache.kv = {};
      return true;
    },

    // ---- Backup / restore ----
    // Exports/imports everything in the cache — the collections plus the
    // kv store (theme, profile, accounts, lock/biometric, finance budget).
    // importAll also accepts a backup file made by the old localStorage
    // version of the app (a flat "daynote.xxx" key -> JSON string map), so
    // older exports still restore correctly after this update.
    exportAll() {
      return {
        app: 'DayNote',
        version: 2,
        exportedAt: new Date().toISOString(),
        data: {
          events: cache.events, tasks: cache.tasks, transactions: cache.transactions,
          notes: cache.notes, financeTxns: cache.financeTxns, kv: cache.kv,
        },
      };
    },
    async importAll(payload) {
      if (!payload || typeof payload !== 'object' || !payload.data || typeof payload.data !== 'object') {
        throw new Error('That file doesn\u2019t look like a DayNote backup.');
      }
      const d = payload.data;
      const isOldFlatShape = !('kv' in d) && !Array.isArray(d.events);

      if (isOldFlatShape) {
        // Old backup: flat map of localStorage-style keys to JSON strings.
        const get = (k) => { try { return JSON.parse(d[k]); } catch (e) { return null; } };
        const putAllIfArray = (storeName, raw) => {
          if (Array.isArray(raw)) raw.forEach((r) => { if (r && r.id) idbPut(storeName, r); });
        };
        await collection('events').clear(); putAllIfArray('events', get(OLD_KEYS.events));
        await collection('tasks').clear(); putAllIfArray('tasks', get(OLD_KEYS.tasks));
        await collection('transactions').clear(); putAllIfArray('transactions', get(OLD_KEYS.transactions));
        await collection('notes').clear(); putAllIfArray('notes', get(OLD_KEYS.notes));
        await collection('financeTxns').clear(); putAllIfArray('financeTxns', get(OLD_KEYS.financeTxns));
        const putKV = (id, value) => { if (value !== null && value !== undefined) idbPut('kv', { id, value }); };
        putKV('theme', get(OLD_KEYS.theme));
        putKV('profile', get(OLD_KEYS.profile));
        if (d[OLD_KEYS.lockPin]) putKV('lockPin', d[OLD_KEYS.lockPin]);
        putKV('accounts', get(OLD_KEYS.accounts));
        putKV('activeAccountId', get(OLD_KEYS.activeAccountId));
        putKV('onboarded', get(OLD_KEYS.onboarded));
        putKV('financeBudget', get(OLD_KEYS.financeBudget));
        putKV('financeBudgetHistory', get(OLD_KEYS.financeBudgetHistory));
      } else {
        // Current shape: { events:[], tasks:[], transactions:[], notes:[], financeTxns:[], kv:{} }
        for (const s of ['events', 'tasks', 'transactions', 'notes', 'financeTxns']) {
          await collection(s).clear();
          if (Array.isArray(d[s])) d[s].forEach((r) => { if (r && r.id) idbPut(s, r); });
        }
        await idbClear('kv');
        if (d.kv && typeof d.kv === 'object') {
          Object.entries(d.kv).forEach(([id, value]) => idbPut('kv', { id, value }));
        }
      }
      await loadCacheFromIDB();
      return true;
    },

    // ---- App lock (device-only PIN, not a real auth system) ----
    // Stored as a SHA-256 hash rather than plain text so a casual glance
    // at devtools storage doesn't reveal the PIN — this is meant to keep
    // the app off someone idly picking up the phone, not to withstand a
    // determined attacker with device access.
    hasLockPin() { return !!kvGet('lockPin', null); },
    async setLockPin(pin) { kvSet('lockPin', await sha256Hex(String(pin))); },
    async checkLockPin(pin) {
      const stored = kvGet('lockPin', null);
      if (!stored) return true;
      return (await sha256Hex(String(pin))) === stored;
    },
    clearLockPin() { kvDelete('lockPin'); },

    // ---- Biometric unlock (WebAuthn, on top of the PIN above) ----
    // This uses the phone/laptop's own fingerprint or face unlock via the
    // browser's WebAuthn API. There's no server to verify a signature
    // against (this app has none), so the security model here is simply
    // "did the OS's platform authenticator confirm it's you" — that's
    // appropriate for an on-device app lock, the same trust level as the
    // PIN above, not for anything that needs to prove identity to a server.
    hasBiometric() { return !!kvGet('biometricCredId', null); },
    async isBiometricAvailable() {
      if (!window.PublicKeyCredential || !PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return false;
      try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }
      catch (e) { return false; }
    },
    async registerBiometric() {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userId = crypto.getRandomValues(new Uint8Array(16));
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'DayNote' },
          user: { id: userId, name: 'daynote-local-user', displayName: 'DayNote' },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
          timeout: 60000,
        },
      });
      if (!cred) throw new Error('Biometric setup was cancelled.');
      kvSet('biometricCredId', btoa(String.fromCharCode(...new Uint8Array(cred.rawId))));
      return true;
    },
    async verifyBiometric() {
      const storedId = kvGet('biometricCredId', null);
      if (!storedId) return false;
      const rawId = Uint8Array.from(atob(storedId), (c) => c.charCodeAt(0));
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      try {
        const assertion = await navigator.credentials.get({
          publicKey: {
            challenge,
            allowCredentials: [{ id: rawId, type: 'public-key' }],
            userVerification: 'required',
            timeout: 60000,
          },
        });
        return !!assertion;
      } catch (e) {
        return false; // cancelled, failed match, or no matching authenticator
      }
    },
    clearBiometric() { kvDelete('biometricCredId'); },

    // Finance page's own ledger + budget (kept as a separate store, same
    // as it was a separate localStorage key before — this only swaps the
    // backend, it doesn't change what data lives where).
    finance: {
      transactions: collection('financeTxns'),
      getBudget(fallback) { return kvGet('financeBudget', fallback); },
      setBudget(value) { kvSet('financeBudget', value); },
      getBudgetHistory(fallback) { return kvGet('financeBudgetHistory', fallback); },
      setBudgetHistory(value) { kvSet('financeBudgetHistory', value); },
      getCategorizeEnabled(fallback) { return kvGet('financeCategorizeEnabled', fallback); },
      setCategorizeEnabled(value) { kvSet('financeCategorizeEnabled', value); },
    },

    getStorageEstimate,

    uid,
  };
})();
