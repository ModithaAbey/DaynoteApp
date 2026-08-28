/* ============================================================
   DayNote — Shared modal forms
   (calendar/task entry with reminder picker, transactions, notes)
   ============================================================ */

const Modals = (() => {
  function $(sel, root = document) { return root.querySelector(sel); }
  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function nowTimeStr() {
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  /* ================= Entry modal: event / task / note (calendar) ================= */

  const ENTRY_TYPES = [
    { id: 'event', label: 'Event', color: '--calendar' },
    { id: 'task', label: 'Task', color: '--tasks' },
    { id: 'note', label: 'Note', color: '--notes' },
  ];

  function modalTitle(type, editing) {
    if (type === 'event') return editing ? 'Edit event' : 'Add to calendar';
    const label = ENTRY_TYPES.find(t => t.id === type)?.label || 'event';
    return editing ? `Edit ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`;
  }

  function openEntryModal({ onSaved, defaults = {}, editing = null } = {}) {
    const scrim = $('#entry-modal-scrim');
    const form = $('#entry-form');
    form.reset();
    let type = editing?.type || defaults.type || 'event';
    $('#entry-modal-title').textContent = modalTitle(type, editing);
    $('#entry-delete-btn').classList.toggle('hidden', !editing);

    let reminderOn = !!(editing?.reminder?.enabled);
    const offsetKey = 'custom'; // only reminder mode now — a specific date & time
    let customDT = editing?.reminder?.customDateTime || '';

    const dateEl = $('#entry-date');
    const timeEl = $('#entry-time');
    const noTimeEl = $('#entry-no-time');
    // Reads the date/time fields when present; when a page's form doesn't
    // include them (e.g. the tasks page, which only needs title/notes/
    // reminder) falls back to the saved value or today/now. "No time" wins
    // over whatever is left in the time input, so an all-day event never
    // accidentally saves a stale time.
    function entryDate() { return dateEl ? (dateEl.value || todayStr()) : (editing?.date || defaults.date || todayStr()); }
    function entryTime() {
      if (noTimeEl && noTimeEl.checked) return null;
      return timeEl ? (timeEl.value || null) : null;
    }

    $('#entry-title').value = editing?.title || '';
    if (dateEl) dateEl.value = editing?.date || defaults.date || todayStr();
    if (timeEl) timeEl.value = editing?.time || nowTimeStr();
    const noTimePlaceholder = $('#entry-time-placeholder');
    if (noTimeEl) {
      noTimeEl.checked = !!(editing && !editing.time);
      timeEl.disabled = noTimeEl.checked;
      timeEl.classList.toggle('hidden', noTimeEl.checked);
      if (noTimePlaceholder) noTimePlaceholder.classList.toggle('hidden', !noTimeEl.checked);
      noTimeEl.onchange = () => {
        timeEl.disabled = noTimeEl.checked;
        timeEl.classList.toggle('hidden', noTimeEl.checked);
        if (noTimePlaceholder) noTimePlaceholder.classList.toggle('hidden', !noTimeEl.checked);
        updateSummary();
      };
    }
    $('#entry-notes').value = editing?.notes || '';

    // type toggle (absent on pages, like tasks, that only ever add one type)
    const typeWrap = $('#entry-type-toggle');
    function syncTypeButtons() {
      if (!typeWrap) return;
      [...typeWrap.children].forEach((b, i) => b.classList.toggle('active', ENTRY_TYPES[i].id === type));
    }
    if (typeWrap) {
      typeWrap.innerHTML = '';
      ENTRY_TYPES.forEach(t => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = t.label;
        b.style.setProperty('--t-color', `var(${t.color})`);
        b.className = t.id === type ? 'active' : '';
        b.onclick = () => { type = t.id; syncTypeButtons(); syncTimeField(); syncDailyField(); $('#entry-modal-title').textContent = modalTitle(type, editing); };
        typeWrap.appendChild(b);
      });
    }
    // Time is only meaningful for events — tasks and notes just need a date.
    const timeField = $('#entry-time-field');
    function syncTimeField() {
      if (timeField) timeField.classList.toggle('hidden', type !== 'event');
    }
    syncTimeField();

    // Daily-repeat box is only meaningful for tasks.
    const dailyBox = $('#entry-daily-box');
    function syncDailyField() {
      if (dailyBox) dailyBox.classList.toggle('hidden', type !== 'task');
    }
    syncDailyField();

    // reminder switch + detail
    const sw = $('#entry-reminder-switch');
    const detail = $('#entry-reminder-detail');
    sw.classList.toggle('on', reminderOn);
    detail.classList.toggle('open', reminderOn);
    sw.onclick = () => {
      reminderOn = !reminderOn;
      sw.classList.toggle('on', reminderOn);
      detail.classList.toggle('open', reminderOn);
      customRow.classList.toggle('hidden', !reminderOn);
      if (reminderOn) {
        ensureCustomDateDefault();
        // Ask for notification permission right when the person actually
        // wants a reminder — this was never requested anywhere before,
        // so Notification.permission stayed 'default' forever and real
        // system notifications could never fire, only the in-app toast.
        if (typeof Reminders !== 'undefined') Reminders.ensurePermission();
      }
      updateSummary();
    };

    // Repeat switch (task-only): when on, the task repeats daily or
    // weekly (same weekday as its date) for a chosen number of weeks
    // starting from its date — same switch styling as the Notification
    // toggle above.
    let dailyOn = !!(editing?.repeat === 'daily' || editing?.repeat === 'weekly');
    let repeatFreq = editing?.repeat === 'weekly' ? 'weekly' : 'daily';
    let dailyWeeks = editing?.dailyWeeks || 1;
    const dailySwitch = $('#entry-daily-switch');
    const dailyDetail = $('#entry-daily-detail');
    const weeksWrap = $('#entry-daily-weeks-toggle');
    const freqWrap = $('#entry-repeat-freq-toggle');

    function syncFreqButtons() {
      if (!freqWrap) return;
      [...freqWrap.children].forEach(b => b.classList.toggle('active', b.dataset.freq === repeatFreq));
    }
    if (freqWrap) {
      [...freqWrap.children].forEach(b => {
        b.style.setProperty('--t-color', 'var(--tasks)');
        b.onclick = () => { repeatFreq = b.dataset.freq; syncFreqButtons(); };
      });
      syncFreqButtons();
    }

    function syncWeeksButtons() {
      if (!weeksWrap) return;
      [...weeksWrap.children].forEach(b => b.classList.toggle('active', Number(b.dataset.weeks) === dailyWeeks));
    }
    if (weeksWrap) {
      weeksWrap.innerHTML = '';
      [1, 2, 3, 4].forEach(w => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = w === 1 ? '1 week' : `${w} weeks`;
        b.dataset.weeks = w;
        b.style.setProperty('--t-color', 'var(--tasks)');
        b.className = w === dailyWeeks ? 'active' : '';
        b.onclick = () => { dailyWeeks = w; syncWeeksButtons(); };
        weeksWrap.appendChild(b);
      });
    }
    if (dailySwitch) {
      dailySwitch.classList.toggle('on', dailyOn);
      dailyDetail.classList.toggle('open', dailyOn);
      dailySwitch.onclick = () => {
        dailyOn = !dailyOn;
        dailySwitch.classList.toggle('on', dailyOn);
        dailyDetail.classList.toggle('open', dailyOn);
      };
    }

    // Reminder date & time — two separate fields (rather than one combined
    // control) so the native date picker has its own calendar icon.
    const customRow = $('#entry-reminder-custom-row');
    const customDateInput = $('#entry-reminder-custom-date');
    const customTimeInput = $('#entry-reminder-custom-time');
    customRow.classList.toggle('hidden', !reminderOn);

    // customDT (from a saved item) is stored as "YYYY-MM-DDTHH:mm" — split
    // it back into the two fields when editing.
    if (customDT) {
      const [d, t] = customDT.split('T');
      customDateInput.value = d || '';
      customTimeInput.value = t || '';
    } else {
      customDateInput.value = '';
      customTimeInput.value = '';
    }

    // The first time notifications are turned on, default the reminder date
    // to the event's own date (already picked above) so there's nothing
    // extra to fill in — the calendar icon on the field lets you change it.
    function ensureCustomDateDefault() {
      if (!customDateInput.value) customDateInput.value = entryDate();
      if (!customTimeInput.value) customTimeInput.value = entryTime() || nowTimeStr();
    }
    if (reminderOn) ensureCustomDateDefault();

    function getCustomDT() {
      const d = customDateInput.value;
      const t = customTimeInput.value;
      return d && t ? `${d}T${t}` : '';
    }

    function updateSummary() {
      const date = entryDate();
      const time = entryTime() || '09:00';
      const custom = getCustomDT();
      $('#entry-reminder-summary').textContent = Reminders.summarize(date, offsetKey, time, custom);
    }
    updateSummary();
    if (dateEl) dateEl.oninput = updateSummary;
    if (timeEl) timeEl.oninput = updateSummary;
    customDateInput.oninput = updateSummary;
    customTimeInput.oninput = updateSummary;

    syncTypeButtons();
    UI.openModal('#entry-modal-scrim');

    $('#entry-cancel-btn').onclick = () => UI.closeModal('#entry-modal-scrim');
    $('#entry-modal-close').onclick = () => UI.closeModal('#entry-modal-scrim');

    $('#entry-delete-btn').onclick = () => {
      if (editing && confirm('Delete this item?')) {
        DB.events.remove(editing.id);
        if (typeof Reminders !== 'undefined') Reminders.cancelNative(editing.id);
        UI.closeModal('#entry-modal-scrim');
        onSaved && onSaved();
      }
    };

    form.onsubmit = (e) => {
      e.preventDefault();
      const title = $('#entry-title').value.trim();
      if (!title) return;
      const date = entryDate();
      const time = type === 'event' ? entryTime() : null;
      const notesVal = $('#entry-notes').value.trim();
      const custom = getCustomDT();

      let reminder = null;
      if (reminderOn) {
        const at = Reminders.computeAt(date, offsetKey, time, custom);
        reminder = { enabled: true, offsetKey, time, customDateTime: custom, at, fired: false };
      }

      const payload = { type, title, date, time, notes: notesVal, reminder };
      if (type === 'task') {
        payload.done = editing ? (editing.done || false) : false;
        payload.repeat = dailyOn ? repeatFreq : null;
        payload.dailyWeeks = dailyOn ? dailyWeeks : null;
        if (dailyOn) payload.doneDates = editing?.doneDates || [];
      }

      const saved = editing ? DB.events.update(editing.id, payload) : DB.events.create(payload);

      // Keep the real OS-level alarm (native Android app only) in sync
      // with whatever the reminder toggle ended up as — schedule a fresh
      // one if it's on, cancel any old one if it's off or was removed.
      if (typeof Reminders !== 'undefined' && saved) {
        if (reminder) {
          const label = type === 'task' ? 'Task due' : 'Reminder';
          Reminders.scheduleNative(saved.id, `${label}: ${title}`, notesVal || 'Coming up now', reminder.at);
        } else {
          Reminders.cancelNative(saved.id);
        }
      }

      UI.closeModal('#entry-modal-scrim');
      onSaved && onSaved();
    };
  }

  /* ================= Transaction modal (finance) ================= */

  const CATEGORIES = ['Food & groceries', 'Transport', 'Bills & utilities', 'Housing', 'Health', 'Shopping', 'Salary', 'Other'];

  function openTransactionModal({ onSaved, editing = null } = {}) {
    const form = $('#txn-form');
    form.reset();
    $('#txn-modal-title').textContent = editing ? 'Edit transaction' : 'Add transaction';
    $('#txn-delete-btn').classList.toggle('hidden', !editing);

    let kind = editing?.type || 'expense';
    $('#txn-title').value = editing?.title || '';
    $('#txn-amount').value = editing?.amount ?? '';
    $('#txn-date').value = editing?.date || todayStr();

    const catSel = $('#txn-category');
    catSel.innerHTML = CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
    catSel.value = editing?.category || CATEGORIES[0];

    const typeWrap = $('#txn-type-toggle');
    typeWrap.innerHTML = '';
    [{ id: 'income', label: 'Income', color: '--tasks' }, { id: 'expense', label: 'Expense', color: '--danger' }].forEach(t => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = t.label;
      b.style.setProperty('--t-color', `var(${t.color})`);
      b.className = t.id === kind ? 'active' : '';
      b.onclick = () => { kind = t.id; [...typeWrap.children].forEach(x => x.classList.remove('active')); b.classList.add('active'); };
      typeWrap.appendChild(b);
    });

    UI.openModal('#txn-modal-scrim');
    $('#txn-cancel-btn').onclick = () => UI.closeModal('#txn-modal-scrim');
    $('#txn-modal-close').onclick = () => UI.closeModal('#txn-modal-scrim');

    $('#txn-delete-btn').onclick = () => {
      if (editing && confirm('Delete this transaction?')) {
        DB.transactions.remove(editing.id);
        UI.closeModal('#txn-modal-scrim');
        onSaved && onSaved();
      }
    };

    form.onsubmit = (e) => {
      e.preventDefault();
      const title = $('#txn-title').value.trim();
      const amount = parseFloat($('#txn-amount').value);
      if (!title || isNaN(amount)) return;
      const payload = { type: kind, title, amount: Math.abs(amount), category: catSel.value, date: $('#txn-date').value || todayStr() };
      if (editing) DB.transactions.update(editing.id, payload);
      else DB.transactions.create(payload);
      UI.closeModal('#txn-modal-scrim');
      UI.showToast(editing ? 'Saved' : 'Added', title);
      onSaved && onSaved();
    };
  }

  /* ================= Note modal (journal page editor) ================= */

  const NOTE_MOODS = ['\u{1F642}', '\u2764\uFE0F', '\u{1F60C}', '\u{1F914}', '\u{1F622}', '\u2728'];
  const PAGE_SIZES = [
    { id: 'a4', label: 'A4' },
    { id: 'phone', label: 'Phone' },
  ];
  const ZOOM_KEY = 'daynote.noteZoom';
  const PAGESIZE_KEY = 'daynote.notePageSize';

  function openNoteModal({ onSaved, editing = null, defaults = {} } = {}) {
    const form = $('#note-form');
    form.reset();
    $('#note-modal-title').textContent = editing ? 'Edit page' : 'New page';
    $('#note-delete-btn').classList.toggle('hidden', !editing);
    $('#note-title-input').value = editing?.title || '';
    $('#note-body-input').value = editing?.body || '';

    let mood = editing?.mood || '';

    const moodWrap = $('#note-mood-toggle');
    moodWrap.innerHTML = '';
    function syncMoodButtons() {
      [...moodWrap.children].forEach(b => b.classList.toggle('active', b.dataset.mood === mood));
    }
    NOTE_MOODS.forEach(m => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = m;
      b.dataset.mood = m;
      b.className = 'mood-btn' + (m === mood ? ' active' : '');
      b.onclick = () => { mood = (mood === m) ? '' : m; syncMoodButtons(); };
      moodWrap.appendChild(b);
    });

    // ---- Page size (A4 / Phone) + zoom ----
    // pageSize is remembered per-page (falls back to your last choice, then
    // A4); zoom is just a viewing convenience so it's remembered globally
    // across pages rather than saved with each one.
    let pageSize = editing?.pageSize || defaults.pageSize || localStorage.getItem(PAGESIZE_KEY) || 'a4';
    let zoom = parseFloat(localStorage.getItem(ZOOM_KEY)) || 1;

    const frame = $('#note-page-frame');
    const zoomLabel = $('#note-zoom-label');
    const sizeWrap = $('#note-pagesize-toggle');

    function applyFrame() {
      frame.classList.toggle('size-a4', pageSize === 'a4');
      frame.classList.toggle('size-phone', pageSize === 'phone');
      frame.style.transform = `scale(${zoom})`;
      zoomLabel.textContent = Math.round(zoom * 100) + '%';
    }

    sizeWrap.innerHTML = '';
    PAGE_SIZES.forEach(s => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = s.label;
      b.dataset.size = s.id;
      b.className = s.id === pageSize ? 'active' : '';
      b.onclick = () => {
        pageSize = s.id;
        localStorage.setItem(PAGESIZE_KEY, pageSize);
        [...sizeWrap.children].forEach(x => x.classList.toggle('active', x.dataset.size === pageSize));
        applyFrame();
      };
      sizeWrap.appendChild(b);
    });

    $('#note-zoom-in').onclick = () => {
      zoom = Math.min(2, +(zoom + 0.1).toFixed(2));
      localStorage.setItem(ZOOM_KEY, zoom);
      applyFrame();
    };
    $('#note-zoom-out').onclick = () => {
      zoom = Math.max(0.6, +(zoom - 0.1).toFixed(2));
      localStorage.setItem(ZOOM_KEY, zoom);
      applyFrame();
    };
    applyFrame();

    UI.openModal('#note-modal-scrim');
    $('#note-cancel-btn').onclick = () => UI.closeModal('#note-modal-scrim');
    $('#note-modal-close').onclick = () => UI.closeModal('#note-modal-scrim');

    $('#note-delete-btn').onclick = () => {
      if (editing && confirm('Delete this page?')) {
        DB.notes.remove(editing.id);
        UI.closeModal('#note-modal-scrim');
        onSaved && onSaved();
      }
    };

    form.onsubmit = (e) => {
      e.preventDefault();
      const title = $('#note-title-input').value.trim() || 'Untitled page';
      const body = $('#note-body-input').value;
      const payload = { title, body, mood, pageSize };
      if (editing) DB.notes.update(editing.id, payload);
      else DB.notes.create(payload);
      UI.closeModal('#note-modal-scrim');
      onSaved && onSaved();
    };
  }

  return { openEntryModal, openTransactionModal, openNoteModal, todayStr };
})();
