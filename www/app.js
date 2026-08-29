/* ============================================================
   DayNote — App shell (navigation, theme picker, popovers, toasts)
   Shared by every page (index.html, calendar.html, tasks.html,
   finance.html, journal.html). Each page includes this file and
   calls UI.init('<page-id>') on load — pass null on index.html
   since it isn't one of the four sections.
   ============================================================ */

const THEMES = [
  { id: "light", name: "Light", swatch: ["#FFFFFF", "#1A1A1A", "#111111"] },
  { id: "dark", name: "Dark", swatch: ["#000000", "#FFFFFF", "#F2F2F2"] },
  { id: "maroon", name: "Maroon", swatch: ["#F7ECEA", "#7A2E2E", "#2E1918"] },
  { id: "coffee", name: "Coffee", swatch: ["#EFE4D8", "#5C3A22", "#2C1D12"] },
  { id: "sage", name: "Sage", swatch: ["#F1F2EC", "#3E6249", "#2A2E27"] },
];

// Each item is one of the four real pages. `href` is the actual
// file the browser navigates to now that every section is its
// own page instead of a JS-swapped panel.
const CAL_ICON_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2"/><line x1="3.5" y1="9.5" x2="20.5" y2="9.5"/><line x1="8" y1="3" x2="8" y2="6.5"/><line x1="16" y1="3" x2="16" y2="6.5"/></svg>';
const BOOK_ICON_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 6.5c-1.8-1.3-4-2-6.5-2-.6 0-1 .45-1 1v11c0 .55.4 1 1 1 2.5 0 4.7.7 6.5 2 1.8-1.3 4-2 6.5-2 .6 0 1-.45 1-1v-11c0-.55-.4-1-1-1-2.5 0-4.7.7-6.5 2z"/><line x1="12" y1="6.5" x2="12" y2="19.5"/></svg>';

const NAV_ITEMS = [
  { id: "calendar", label: "Calendar", icon: CAL_ICON_SVG, color: "--calendar", soft: "--calendar-soft", href: "calendar.html", desc: "Month view, events & dated notes" },
  { id: "tasks", label: "Tasks", icon: "\u2713", color: "--tasks", soft: "--tasks-soft", href: "tasks.html", desc: "Today, upcoming, all & done" },
  { id: "finance", label: "Finance", icon: "\u20A8", color: "--finance", soft: "--finance-soft", href: "finance.html", desc: "Income, expenses & monthly totals" },
  { id: "journal", label: "Journal", icon: BOOK_ICON_SVG, color: "--notes", soft: "--notes-soft", href: "journal.html", desc: "Freeform notepad" },
];

const Pages = {}; // each page module registers itself here: Pages.calendar = { render(container) {...} }

const UI = (() => {
  let currentPage = null;

  function $(sel, root = document) { return root.querySelector(sel); }

  function init(pageId) {
    currentPage = pageId || null;
    guardOnboarding(() => {
      guardAppLock();
      wireTopbar(); // refresh in case onboarding just set the profile
      buildTodaySummary();
    });
    document.documentElement.setAttribute('data-theme', DB.getTheme());
    buildDrawer();
    buildBottomNav();
    buildTodaySummary();
    buildProfilePopover();
    buildThemeModal();
    wireTopbar();
    wireModalDismissal();
    highlightNav(currentPage);
    if (typeof Reminders !== 'undefined') Reminders.start();
    registerServiceWorker();
    wireInstallPrompt();
  }

  // ---------------- PWA: service worker + install prompt ----------------
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    // file:// (opening the HTML directly instead of through a server)
    // can't register a service worker — silently skip rather than
    // throwing a console error for that case.
    if (location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  function isStandalone() {
    // True for an installed PWA (browsers set this media feature), and
    // also true inside the installed native Capacitor app -- which never
    // sets display-mode: standalone, so without this check the install
    // banner would keep popping up on every page even after the user
    // already has the real app installed.
    const isNativeApp = typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    return isNativeApp || window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  // Android gets a banner whose button downloads the DayNote APK directly
  // (no PWA install-prompt flow). iOS Safari has no APK equivalent, so it
  // still gets the short "how to" banner pointing at the Share sheet.
  // Nothing shows once the app is already running installed (standalone).
  // This is a multi-page site — each page load re-runs init() — and
  // dismissing the banner doesn't persist across pages, so it reappears
  // every time the user navigates to a new page.

  // Path to the built APK — served from the GitHub Release asset.
  const APK_URL = 'https://github.com/ModithaAbey/DaynoteApp/releases/download/latest/app-debug.apk';

  function wireInstallPrompt() {
    if (isStandalone()) return;

    const ua = navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua) && !window.MSStream;
    const isAndroid = /android/i.test(ua);

    if (isAndroid) showInstallBanner('android');
    else if (isIOS) showInstallBanner('ios');
  }

  function downloadApk() {
    const a = document.createElement('a');
    a.href = APK_URL;
    a.download = 'DayNote.apk';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function showInstallBanner(kind) {
    if ($('#install-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'install-banner';
    banner.className = 'install-banner';
    banner.innerHTML = kind === 'ios'
      ? `<span class="install-banner-icon">&#128241;</span>
         <span class="install-banner-text">Install DayNote: tap <b>Share</b> <span style="font-size:1.1em;">&#8593;</span> then <b>Add to Home Screen</b>.</span>
         <button type="button" class="install-banner-close" aria-label="Dismiss">&#10005;</button>`
      : `<span class="install-banner-icon">&#128241;</span>
         <span class="install-banner-text">Install DayNote on this phone for quick access, even offline.</span>
         <button type="button" class="install-banner-install">Install</button>
         <button type="button" class="install-banner-close" aria-label="Dismiss">&#10005;</button>`;
    document.body.appendChild(banner);

    const dismiss = () => { banner.remove(); };
    banner.querySelector('.install-banner-close').onclick = dismiss;
    const installBtn = banner.querySelector('.install-banner-install');
    if (installBtn) {
      installBtn.onclick = () => {
        downloadApk();
        banner.remove();
        showToast('Downloading DayNote', 'Open the downloaded APK to install. You may need to allow installs from this source.');
      };
    }
  }

  // ---------------- Modal dismissal (click outside / Escape) ----------------
  function wireModalDismissal() {
    document.querySelectorAll('.modal-scrim').forEach(scrim => {
      scrim.addEventListener('click', (e) => {
        if (e.target === scrim) scrim.classList.remove('open');
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      document.querySelectorAll('.modal-scrim.open').forEach(s => s.classList.remove('open'));
      closeDrawer();
      closeAllPopovers();
    });
  }

  // ---------------- Drawer (hamburger menu) ----------------
  function buildDrawer() {
    const nav = $('#drawer-nav');
    if (!nav) return;
    nav.innerHTML = '';
    NAV_ITEMS.forEach(item => {
      const a = document.createElement('a');
      a.className = 'drawer-item';
      a.dataset.page = item.id;
      a.href = item.href;
      a.style.setProperty('--item-color', `var(${item.color})`);
      a.style.setProperty('--item-soft', `var(${item.soft})`);
      a.innerHTML = `<span class="dot">${item.icon}</span><span>${item.label}</span>`;
      nav.appendChild(a);
    });
    $('#hamburger-btn')?.addEventListener('click', openDrawer);
    $('#scrim')?.addEventListener('click', closeDrawer);
  }
  function openDrawer() { $('#drawer')?.classList.add('open'); $('#scrim')?.classList.add('open'); }
  function closeDrawer() { $('#drawer')?.classList.remove('open'); $('#scrim')?.classList.remove('open'); }

  function highlightNav(page) {
    document.querySelectorAll('.drawer-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
    document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
    const item = NAV_ITEMS.find(n => n.id === page);
    if (item) document.documentElement.style.setProperty('--active', `var(${item.color})`);
  }

  // ---------------- Bottom tab bar (small screens) ----------------
  function buildBottomNav() {
    const nav = $('#bottom-nav');
    if (!nav) return;
    nav.innerHTML = '';
    NAV_ITEMS.forEach(item => {
      const a = document.createElement('a');
      a.className = 'bottom-nav-item';
      a.dataset.page = item.id;
      a.href = item.href;
      a.style.setProperty('--item-color', `var(${item.color})`);
      a.innerHTML = `<span class="bn-icon">${item.icon}</span><span class="bn-label">${item.label}</span>`;
      nav.appendChild(a);
    });
  }

  // ---------------- Today summary (home page only) ----------------
  // Pulls one glance's worth from Calendar, Tasks, and Finance so the home
  // page shows what's actually due today instead of just four link tiles.
  function todayStrLocal() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function addDaysLocal(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  // Same daily/weekly semantics as the Tasks page: a one-off task uses its
  // own done flag/date; a daily task is active every day in its window; a
  // weekly task only on the same weekday its window started on.
  function taskActiveAndUndoneToday(t, today) {
    const isRecurring = t.repeat === 'daily' || t.repeat === 'weekly';
    if (!isRecurring) return t.date === today && !t.done;
    const weeks = t.dailyWeeks || 1;
    const end = addDaysLocal(t.date, weeks * 7 - 1);
    if (today < t.date || today > end) return false;
    if (t.repeat === 'weekly') {
      const startDow = new Date(t.date + 'T00:00:00').getDay();
      const todayDow = new Date(today + 'T00:00:00').getDay();
      if (startDow !== todayDow) return false;
    }
    return !(t.doneDates || []).includes(today);
  }
  function todaySpend(today) {
    try {
      const list = JSON.parse(localStorage.getItem('daynote.finance.transactions')) || [];
      return list.filter(t => t.date === today).reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    } catch (e) { return 0; }
  }
  function buildTodaySummary() {
    const mount = $('#today-summary');
    if (!mount) return; // only the home page has this container
    const today = todayStrLocal();
    const allEvents = DB.events.list();
    const events = allEvents.filter(e => e.type === 'event' && e.date === today)
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const tasks = allEvents.filter(e => e.type === 'task' && taskActiveAndUndoneToday(e, today))
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const spend = todaySpend(today);
    const profile = DB.getProfile();
    const firstName = (profile?.name || '').split(' ')[0];

    function rows(items, emptyLabel, renderRow) {
      if (!items.length) return `<div class="today-empty">${emptyLabel}</div>`;
      return items.slice(0, 3).map(renderRow).join('') +
        (items.length > 3 ? `<div class="today-more">+${items.length - 3} more</div>` : '');
    }

    mount.innerHTML = `
      <div class="today-card">
        <div class="today-card-head">
          <span class="font-display today-card-title">Today${firstName ? `, ${escapeHtml(firstName)}` : ''}</span>
          <span class="today-card-date">${new Date(today + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
        </div>
        <div class="today-sections">
          <div class="today-section">
            <a class="today-section-head" href="calendar.html">
              <span>Events</span><span class="today-section-count">${events.length}</span>
            </a>
            ${rows(events, 'Nothing on the calendar today', e => `
              <div class="today-row"><span class="today-row-dot" style="background:var(--calendar);"></span>
                <span class="today-row-title">${escapeHtml(e.title || 'Untitled')}</span>
                <span class="today-row-time">${e.time ? escapeHtml(e.time) : ''}</span>
              </div>`)}
          </div>
          <div class="today-section">
            <a class="today-section-head" href="tasks.html">
              <span>Tasks due</span><span class="today-section-count">${tasks.length}</span>
            </a>
            ${rows(tasks, 'Nothing due today', t => `
              <div class="today-row"><span class="today-row-dot" style="background:var(--tasks);"></span>
                <span class="today-row-title">${escapeHtml(t.title || 'Untitled')}</span>
              </div>`)}
          </div>
          <div class="today-section">
            <a class="today-section-head" href="finance.html">
              <span>Spent today</span><span class="today-section-count">Rs ${spend.toLocaleString()}</span>
            </a>
          </div>
        </div>
      </div>
    `;
  }

  // ---------------- Profile popover ----------------
  function buildProfilePopover() {
    const profileBtn = $('#profile-btn');
    if (!profileBtn) return;
    profileBtn.onclick = (e) => {
      e.stopPropagation();
      togglePopover('#profile-popover');
    };
    $('#signout-item').onclick = () => {
      closeAllPopovers();
      showConfirm({
        title: 'Sign out of DayNote?', body: 'You can sign back in any time.', confirmLabel: 'Sign out',
        onConfirm: () => {
          DB.signOut();
          showToast('Signed out', 'Backend not connected yet \u2014 this is a placeholder action.');
        },
      });
    };
    $('#delete-account-item').onclick = () => {
      closeAllPopovers();
      showConfirm({
        title: 'Delete your account?', body: 'This removes all local DayNote data on this device \u2014 calendar, tasks, finance, journal, everything. This can\u2019t be undone.',
        confirmLabel: 'Delete everything', danger: true,
        onConfirm: () => {
          DB.deleteAccount();
          showToast('Account deleted', 'All local data was cleared.');
          setTimeout(() => location.reload(), 500);
        },
      });
    };
    injectAccountsMenu();
    injectDataAndLockMenu();
    document.addEventListener('click', closeAllPopovers);
  }

  // ---------------- Generic confirm modal ----------------
  // Used instead of window.confirm()/alert() for destructive actions —
  // those dialogs are frequently blocked or silently no-op in installed
  // PWAs and embedded webviews, which made "Delete account" look broken
  // even though DB.deleteAccount() itself worked fine.
  function buildConfirmModalOnce() {
    if ($('#confirm-modal-scrim')) return;
    const scrim = document.createElement('div');
    scrim.className = 'modal-scrim';
    scrim.id = 'confirm-modal-scrim';
    scrim.innerHTML = `
      <div class="modal" id="confirm-modal">
        <div class="modal-head">
          <h2 class="font-display" id="confirm-modal-title">Are you sure?</h2>
          <button class="icon-btn" id="confirm-modal-close" aria-label="Close">&#10005;</button>
        </div>
        <p id="confirm-modal-body" style="color:var(--ink-soft);font-size:.88rem;line-height:1.5;margin:0 0 18px;"></p>
        <div class="btn-row">
          <button type="button" class="btn ghost" id="confirm-modal-cancel">Cancel</button>
          <button type="button" class="btn" id="confirm-modal-ok">Confirm</button>
        </div>
      </div>`;
    document.body.appendChild(scrim);
    $('#confirm-modal-close').onclick = () => closeModal('#confirm-modal-scrim');
    $('#confirm-modal-cancel').onclick = () => closeModal('#confirm-modal-scrim');
  }
  function showConfirm({ title, body, confirmLabel, danger, onConfirm }) {
    buildConfirmModalOnce();
    $('#confirm-modal-title').textContent = title || 'Are you sure?';
    $('#confirm-modal-body').textContent = body || '';
    const okBtn = $('#confirm-modal-ok');
    okBtn.textContent = confirmLabel || 'Confirm';
    okBtn.className = 'btn' + (danger ? ' danger' : '');
    okBtn.style.background = danger ? '' : 'var(--calendar)';
    okBtn.onclick = () => { closeModal('#confirm-modal-scrim'); onConfirm && onConfirm(); };
    openModal('#confirm-modal-scrim');
  }

  // ---------------- Accounts: switcher + "Add account" ----------------
  function injectAccountsMenu() {
    const popover = $('#profile-popover');
    const accountLabel = popover?.querySelector('.popover-label');
    if (!popover || !accountLabel || $('#add-account-item')) return;

    const wrap = document.createElement('div');
    wrap.id = 'accounts-list-wrap';
    accountLabel.insertAdjacentElement('afterend', wrap);

    const addBtn = document.createElement('button');
    addBtn.className = 'popover-item';
    addBtn.id = 'add-account-item';
    addBtn.innerHTML = '<span>&#10133;</span><span>Add account</span>';
    wrap.insertAdjacentElement('afterend', addBtn);

    function renderAccounts() {
      const accounts = DB.listAccounts();
      const activeId = DB.getActiveAccountId();
      wrap.innerHTML = accounts.map(a => `
        <button class="popover-item" data-account-id="${a.id}">
          <span>${a.id === activeId ? '&#10003;' : ''}</span>
          <span>${escapeHtml(a.name)}${a.email ? ` <span style="color:var(--ink-faint);font-weight:400;">(${escapeHtml(a.email)})</span>` : ''}</span>
        </button>`).join('');
      wrap.querySelectorAll('[data-account-id]').forEach(btn => {
        btn.onclick = () => {
          closeAllPopovers();
          DB.switchAccount(btn.dataset.accountId);
          wireTopbar();
          showToast('Switched account', escapeHtml(DB.getProfile()?.name || ''));
        };
      });
    }
    renderAccounts();

    addBtn.onclick = () => {
      closeAllPopovers();
      openAddAccountForm(() => { renderAccounts(); wireTopbar(); });
    };
  }

  function buildAddAccountModalOnce() {
    if ($('#addaccount-modal-scrim')) return;
    const scrim = document.createElement('div');
    scrim.className = 'modal-scrim';
    scrim.id = 'addaccount-modal-scrim';
    scrim.innerHTML = `
      <div class="modal" id="addaccount-modal">
        <div class="modal-head">
          <h2 class="font-display">Add account</h2>
          <button class="icon-btn" id="addaccount-modal-close" aria-label="Close">&#10005;</button>
        </div>
        <p style="color:var(--ink-soft);font-size:.82rem;line-height:1.5;margin:0 0 16px;">
          No server yet, so this just saves another local profile you can switch to \u2014 your calendar, tasks, finance and journal entries stay shared on this device across accounts.
        </p>
        <form id="addaccount-form">
          <div class="field"><label for="addaccount-name">Name</label><input type="text" id="addaccount-name" required /></div>
          <div class="field"><label for="addaccount-email">Email</label><input type="email" id="addaccount-email" required /></div>
          <div class="btn-row">
            <button type="button" class="btn ghost" id="addaccount-cancel">Cancel</button>
            <button type="submit" class="btn" style="background:var(--calendar);">Add</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(scrim);
    $('#addaccount-modal-close').onclick = () => closeModal('#addaccount-modal-scrim');
    $('#addaccount-cancel').onclick = () => closeModal('#addaccount-modal-scrim');
  }
  function openAddAccountForm(onAdded) {
    buildAddAccountModalOnce();
    $('#addaccount-name').value = '';
    $('#addaccount-email').value = '';
    $('#addaccount-form').onsubmit = (e) => {
      e.preventDefault();
      DB.addAccount({ name: $('#addaccount-name').value.trim(), email: $('#addaccount-email').value.trim() });
      closeModal('#addaccount-modal-scrim');
      showToast('Account added', 'Switched to the new account.');
      onAdded && onAdded();
    };
    openModal('#addaccount-modal-scrim');
    setTimeout(() => $('#addaccount-name')?.focus(), 50);
  }

  // ---------------- Backup / restore + App lock menu items ----------------
  // Injected via JS (rather than duplicated in every .html file) since the
  // profile popover markup is repeated across 5 pages already.
  function injectDataAndLockMenu() {
    const popover = $('#profile-popover');
    const divider = popover.querySelector('.popover-divider');
    if (!popover || !divider || popover.querySelector('#backup-export-item')) return;

    const dataSection = document.createElement('div');
    dataSection.innerHTML = `
      <div class="popover-label">Data</div>
      <button class="popover-item" id="backup-export-item"><span>&#11015;&#65039;</span><span>Export backup</span></button>
      <button class="popover-item" id="backup-import-item"><span>&#11014;&#65039;</span><span>Import backup</span></button>
      <input type="file" id="backup-import-input" accept="application/json" style="display:none;" />
      <div class="popover-divider"></div>
      <div class="popover-label">Privacy</div>
      <button class="popover-item" id="app-lock-item"><span>&#128274;</span><span id="app-lock-item-label">Set app lock</span></button>
    `;
    popover.insertBefore(dataSection, divider);

    $('#backup-export-item').onclick = () => {
      closeAllPopovers();
      const payload = DB.exportAll();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `daynote-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Backup exported', 'Saved as a .json file \u2014 keep it somewhere safe.');
    };

    const importInput = $('#backup-import-input');
    $('#backup-import-item').onclick = () => { closeAllPopovers(); importInput.click(); };
    importInput.onchange = () => {
      const file = importInput.files[0];
      importInput.value = '';
      if (!file) return;
      if (!confirm('Import this backup? It will overwrite your current DayNote data on this device.')) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const payload = JSON.parse(reader.result);
          DB.importAll(payload);
          showToast('Backup restored', 'Reloading\u2026');
          setTimeout(() => location.reload(), 600);
        } catch (e) {
          showToast('Import failed', e.message || 'That file couldn\u2019t be read as a DayNote backup.');
        }
      };
      reader.readAsText(file);
    };

    const lockLabel = $('#app-lock-item-label');
    lockLabel.textContent = DB.hasLockPin() ? 'Change or remove app lock' : 'Set app lock';
    $('#app-lock-item').onclick = () => {
      closeAllPopovers();
      openAppLockSetup();
    };
  }

  // ---------------- App lock: setup modal + unlock overlay ----------------
  function buildLockModalOnce() {
    if ($('#applock-modal-scrim')) return;
    const scrim = document.createElement('div');
    scrim.className = 'modal-scrim';
    scrim.id = 'applock-modal-scrim';
    scrim.innerHTML = `
      <div class="modal" id="applock-modal">
        <div class="modal-head">
          <h2 class="font-display">App lock</h2>
          <button class="icon-btn" id="applock-modal-close" aria-label="Close">&#10005;</button>
        </div>
        <form id="applock-form">
          <div class="section-title" id="applock-hint">Set a 4+ digit PIN required to open DayNote on this device.</div>
          <div class="field">
            <label for="applock-pin" class="visually-hidden">PIN</label>
            <input type="password" inputmode="numeric" pattern="[0-9]*" id="applock-pin" placeholder="New PIN" minlength="4" autocomplete="off" />
          </div>
          <div class="field">
            <label for="applock-pin-confirm" class="visually-hidden">Confirm PIN</label>
            <input type="password" inputmode="numeric" pattern="[0-9]*" id="applock-pin-confirm" placeholder="Confirm PIN" minlength="4" autocomplete="off" />
          </div>
          <div class="btn-row">
            <button type="button" class="btn danger" id="applock-remove-btn" style="display:none;margin-right:auto;">Remove lock</button>
            <button type="submit" class="btn" style="background:var(--notes);">Save</button>
          </div>
        </form>
        <div class="popover-divider" style="margin:16px 0;"></div>
        <div class="section-title" id="biometric-row-label">Fingerprint / Face unlock</div>
        <div class="btn-row">
          <button type="button" class="btn" id="biometric-toggle-btn" style="width:100%;"></button>
        </div>
      </div>`;
    document.body.appendChild(scrim);
    $('#applock-modal-close').onclick = () => closeModal('#applock-modal-scrim');
    $('#applock-remove-btn').onclick = () => {
      DB.clearLockPin();
      sessionStorage.removeItem('daynote.unlocked');
      showToast('App lock removed', '');
      closeModal('#applock-modal-scrim');
      const label = $('#app-lock-item-label');
      if (label) label.textContent = 'Set app lock';
    };
    $('#applock-form').onsubmit = async (e) => {
      e.preventDefault();
      const pin = $('#applock-pin').value.trim();
      const confirmPin = $('#applock-pin-confirm').value.trim();
      if (pin.length < 4) { showToast('PIN too short', 'Use at least 4 digits.'); return; }
      if (pin !== confirmPin) { showToast('PINs don\u2019t match', 'Try again.'); return; }
      await DB.setLockPin(pin);
      showToast('App lock set', 'You\u2019ll need this PIN to open DayNote on this device.');
      closeModal('#applock-modal-scrim');
      const label = $('#app-lock-item-label');
      if (label) label.textContent = 'Change or remove app lock';
    };

    $('#biometric-toggle-btn').onclick = async () => {
      const btn = $('#biometric-toggle-btn');
      if (DB.hasBiometric()) {
        DB.clearBiometric();
        showToast('Fingerprint unlock turned off', '');
        refreshBiometricButton();
        return;
      }
      try {
        await DB.registerBiometric();
        showToast('Fingerprint unlock enabled', 'You can now unlock DayNote with your fingerprint or face.');
      } catch (e) {
        showToast('Couldn\u2019t set up fingerprint unlock', e.message || 'Try again.');
      }
      refreshBiometricButton();
    };
  }

  async function refreshBiometricButton() {
    const btn = $('#biometric-toggle-btn');
    const label = $('#biometric-row-label');
    if (!btn || !label) return;
    const available = await DB.isBiometricAvailable();
    if (!available) {
      label.textContent = 'Fingerprint / Face unlock (not available on this device)';
      btn.style.display = 'none';
      return;
    }
    btn.style.display = '';
    if (DB.hasBiometric()) {
      label.textContent = 'Fingerprint / Face unlock is on';
      btn.textContent = 'Turn off fingerprint unlock';
      btn.classList.add('danger');
    } else {
      label.textContent = 'Fingerprint / Face unlock';
      btn.textContent = 'Enable fingerprint unlock';
      btn.classList.remove('danger');
    }
  }



  function openAppLockSetup() {
    buildLockModalOnce();
    $('#applock-pin').value = '';
    $('#applock-pin-confirm').value = '';
    $('#applock-remove-btn').style.display = DB.hasLockPin() ? 'inline-flex' : 'none';
    openModal('#applock-modal-scrim');
    refreshBiometricButton();
    setTimeout(() => $('#applock-pin')?.focus(), 50);
  }

  // Blocks the page behind a full-screen PIN prompt until the correct PIN
  // is entered. Runs once per browser tab session (sessionStorage), not
  // once per app-open, since this is a multi-page site and re-prompting
  // on every single navigation would be unusable.
  // ---------------- First-launch sign-in (real Firebase Auth) ----------------
  // Real email/password + Google sign-in via Firebase — see
  // firebase-config.js for the one-time project setup this needs.
  // "Continue without an account" stays available since DayNote's actual
  // data lives on-device either way; signing in only personalizes the
  // profile shown around the app (name/photo) and identifies the person
  // for any future cross-device sync.
  function guardOnboarding(onDone) {
    if (DB.isOnboarded()) { onDone(); return; }

    const completeFromUser = (user) => {
      DB.completeOnboarding({ name: user.displayName || (user.email ? user.email.split('@')[0] : 'You'), email: user.email || '' });
      onDone();
    };

    // If we just came back from signInWithRedirect (mobile Google
    // sign-in), Firebase resolves the pending user here. Check this
    // before building the overlay so a returning mobile user doesn't
    // see the sign-in screen flash before it's dismissed.
    if (typeof firebase !== 'undefined' && firebase.auth) {
      firebase.auth().getRedirectResult().then((result) => {
        if (result && result.user) { completeFromUser(result.user); return; }
        buildOnboardingOverlay(onDone);
      }).catch((e) => {
        buildOnboardingOverlay(onDone);
        // Show the real reason the redirect sign-in failed, instead of
        // silently dropping back to the sign-in screen with no clue.
        console.error('Google redirect sign-in failed:', e);
        setTimeout(() => {
          const errEl = document.getElementById('onboard-error');
          if (errEl) { errEl.textContent = e.message || 'Google sign-in failed.'; errEl.style.display = 'block'; }
        }, 0);
      });
    } else {
      buildOnboardingOverlay(onDone);
    }
  }

  function buildOnboardingOverlay(onDone) {
    const overlay = document.createElement('div');
    overlay.className = 'applock-overlay';
    overlay.innerHTML = `
      <div class="applock-box">
        <div class="brand-mark" style="margin:0 auto 14px;">D</div>
        <div class="font-display applock-title">Welcome to DayNote</div>
        <p class="onboard-sub">Sign in to personalize your journal.</p>
        <button type="button" class="btn" id="onboard-google-btn" style="width:100%;background:#fff;color:#1f1f1f;border:1px solid #dadce0;display:flex;align-items:center;justify-content:center;gap:10px;">
          <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.08-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.87 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.97v2.33C2.45 15.98 5.48 18 9 18z"/><path fill="#FBBC05" d="M3.97 10.72c-.18-.54-.28-1.12-.28-1.72s.1-1.18.28-1.72V4.95H.97C.35 6.18 0 7.55 0 9s.35 2.82.97 4.05l3-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0 5.48 0 2.45 2.02.97 4.95l3 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg>
          Continue with Google
        </button>
        <div class="onboard-divider"><span>or</span></div>
        <form id="onboard-form">
          <input type="email" id="onboard-email" placeholder="Email" autocomplete="email" required />
          <input type="password" id="onboard-password" placeholder="Password" autocomplete="current-password" required minlength="6" />
          <div class="applock-error" id="onboard-error" style="display:none;"></div>
          <button type="submit" class="btn" style="background:var(--calendar);width:100%;" id="onboard-submit-btn">Sign in</button>
        </form>
        <button type="button" class="onboard-skip" id="onboard-toggle-mode">Don\u2019t have an account? Create one</button>
      </div>`;
    document.body.appendChild(overlay);

    let mode = 'signin'; // or 'signup'
    const errEl = $('#onboard-error', overlay);
    const showError = (msg) => { errEl.textContent = msg; errEl.style.display = 'block'; };

    const finishWithFirebaseUser = (user) => {
      DB.completeOnboarding({ name: user.displayName || (user.email ? user.email.split('@')[0] : 'You'), email: user.email || '' });
      overlay.remove();
      onDone();
    };

    $('#onboard-toggle-mode', overlay).onclick = () => {
      mode = mode === 'signin' ? 'signup' : 'signin';
      $('#onboard-submit-btn', overlay).textContent = mode === 'signin' ? 'Sign in' : 'Create account';
      $('#onboard-toggle-mode', overlay).textContent = mode === 'signin' ? 'Don\u2019t have an account? Create one' : 'Already have an account? Sign in';
      errEl.style.display = 'none';
    };

    $('#onboard-google-btn', overlay).onclick = async () => {
      if (typeof firebase === 'undefined') { showError('Firebase isn\u2019t configured yet \u2014 see firebase-config.js.'); return; }
      const provider = new firebase.auth.GoogleAuthProvider();
      try {
        // Try a popup first on every device. Redirect-based sign-in relies
        // on a background connection to the Firebase authDomain to relay
        // the result back, which modern mobile browsers (Safari's "Prevent
        // Cross-Site Tracking", Chrome's privacy sandbox) increasingly
        // block outright \u2014 it fails silently with no error and no user.
        // Popups avoid that relay and are reliable as long as they're
        // triggered directly from this click handler, which this is.
        const result = await firebase.auth().signInWithPopup(provider);
        finishWithFirebaseUser(result.user);
      } catch (e) {
        if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
          // Genuine popup block (rare, but happens in some in-app browsers)
          // \u2014 fall back to redirect as a last resort.
          try { await firebase.auth().signInWithRedirect(provider); return; }
          catch (e2) { showError(e2.message || 'Google sign-in failed.'); return; }
        }
        if (e && e.code === 'auth/cancelled-popup-request') return; // user opened it twice; ignore
        if (e && e.code === 'auth/popup-closed-by-user') return; // user closed it; no error needed
        showError(e.message || 'Google sign-in failed.');
      }
    };

    $('#onboard-form', overlay).onsubmit = async (e) => {
      e.preventDefault();
      errEl.style.display = 'none';
      const email = $('#onboard-email', overlay).value.trim();
      const password = $('#onboard-password', overlay).value;
      if (typeof firebase === 'undefined') { showError('Firebase isn\u2019t configured yet \u2014 see firebase-config.js.'); return; }
      try {
        const cred = mode === 'signin'
          ? await firebase.auth().signInWithEmailAndPassword(email, password)
          : await firebase.auth().createUserWithEmailAndPassword(email, password);
        finishWithFirebaseUser(cred.user);
      } catch (e) {
        showError(e.message || 'Sign-in failed.');
      }
    };

    setTimeout(() => $('#onboard-email', overlay)?.focus(), 50);
  }

  function guardAppLock() {
    if (!DB.hasLockPin() || sessionStorage.getItem('daynote.unlocked') === '1') return;
    const overlay = document.createElement('div');
    overlay.className = 'applock-overlay';
    overlay.innerHTML = `
      <div class="applock-box">
        <div class="applock-icon">&#128274;</div>
        <div class="font-display applock-title">DayNote is locked</div>
        <form id="applock-unlock-form">
          <input type="password" inputmode="numeric" pattern="[0-9]*" id="applock-unlock-pin" placeholder="Enter PIN" autocomplete="off" autofocus />
          <div class="applock-error" id="applock-unlock-error" style="display:none;">Wrong PIN \u2014 try again.</div>
          <button type="submit" class="btn" style="background:var(--notes);width:100%;">Unlock</button>
        </form>
        <button type="button" class="onboard-skip" id="applock-biometric-btn" style="display:none;">Use fingerprint instead</button>
      </div>`;
    document.body.appendChild(overlay);
    const input = $('#applock-unlock-pin', overlay);
    const err = $('#applock-unlock-error', overlay);
    const unlock = () => { sessionStorage.setItem('daynote.unlocked', '1'); overlay.remove(); };

    $('#applock-unlock-form', overlay).onsubmit = async (e) => {
      e.preventDefault();
      const ok = await DB.checkLockPin(input.value.trim());
      if (ok) {
        unlock();
      } else {
        err.style.display = 'block';
        input.value = '';
        input.focus();
      }
    };

    const bioBtn = $('#applock-biometric-btn', overlay);
    const tryBiometric = async () => {
      if (!DB.hasBiometric()) return;
      const ok = await DB.verifyBiometric();
      if (ok && document.body.contains(overlay)) unlock();
    };
    if (DB.hasBiometric()) {
      bioBtn.style.display = 'block';
      bioBtn.onclick = tryBiometric;
      tryBiometric(); // prompt automatically; PIN stays available as a fallback if it's cancelled or fails
    }

    setTimeout(() => input.focus(), 50);
  }

  function togglePopover(sel) {
    const el = $(sel);
    const willOpen = !el.classList.contains('open');
    closeAllPopovers();
    if (willOpen) el.classList.add('open');
  }
  function closeAllPopovers() { document.querySelectorAll('.popover').forEach(p => p.classList.remove('open')); }

  // ---------------- Theme picker modal ----------------
  function buildThemeModal() {
    const grid = $('#theme-grid');
    if (!grid) return;
    grid.innerHTML = '';

    function makeSwatch(t) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'swatch-btn';
      btn.dataset.id = t.id;
      btn.innerHTML = `<div class="dots">${t.swatch.map(c => `<span style="background:${c}"></span>`).join('')}</div><div class="swatch-name">${t.name}</div>`;
      btn.onclick = () => {
        document.documentElement.setAttribute('data-theme', t.id);
        DB.setTheme(t.id);
        document.querySelectorAll('.swatch-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      };
      return btn;
    }
    THEMES.forEach(t => grid.appendChild(makeSwatch(t)));

    $('#theme-btn')?.addEventListener('click', () => {
      const active = DB.getTheme();
      document.querySelectorAll('.swatch-btn').forEach(b => b.classList.toggle('active', b.dataset.id === active));
      openModal('#theme-modal-scrim');
    });
    $('#theme-modal-close')?.addEventListener('click', () => closeModal('#theme-modal-scrim'));
  }

  // ---------------- Topbar ----------------
  function wireTopbar() {
    const profile = DB.getProfile();
    const initialEl = $('#profile-initial');
    if (initialEl) initialEl.textContent = (profile?.name || 'U').charAt(0).toUpperCase();
  }

  // ---------------- Generic modal helpers ----------------
  function openModal(sel) { $(sel)?.classList.add('open'); }
  function closeModal(sel) { $(sel)?.classList.remove('open'); }

  // ---------------- Toasts ----------------
  function showToast(title, body) {
    const stack = $('#toast-stack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<div class="t-title">${escapeHtml(title)}</div>${body ? `<div class="t-body">${escapeHtml(body)}</div>` : ''}`;
    stack.appendChild(el);
    setTimeout(() => { el.remove(); }, 5000);
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  return { init, openModal, closeModal, showToast, escapeHtml, closeAllPopovers, get currentPage() { return currentPage; } };
})();
