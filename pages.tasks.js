/* ============================================================
   DayNote — Tasks page (shows type:"task" items from DB.events)
   ------------------------------------------------------------
   - One add flow: the fixed "+" FAB at the bottom opens the shared
     entry modal (same one calendar/notes use) to add or edit a task.
   - A task can be one-off, or repeat daily via the Daily switch in
     that modal — repeat:"daily" tasks are tracked with a doneDates
     list (one entry per completed day) instead of a single done
     flag, and stay active for dailyWeeks weeks from their date.
   - Filters: Upcoming / All / Done.
   ============================================================ */

// Small line-icon bell (currentColor), matching the drawn-SVG style used
// for the other nav/section icons instead of the emoji glyph this used to
// render as.
const TASK_BELL_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';

// Bin icon shown in the swipe-to-delete reveal, same line-icon style as
// the rest of the app's SVGs.
const TASK_TRASH_SVG = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';

Pages.tasks = (() => {
  let filter = 'upcoming'; // upcoming | all | done
  const REVEAL_WIDTH = 72; // px the row slides to expose the delete button, matches .agenda-row-delete-bg width

  // Swipe-left-to-delete, same touch/drag mechanism used for the calendar
  // agenda list and finance sheet rows: `contentEl` slides left inside
  // `clipEl` to reveal a delete button sitting underneath. Only one row
  // stays revealed at a time; tapping the content while revealed closes
  // it instead of opening the edit modal.
  let openSwipeContent = null;
  function closeOpenSwipe() {
    if (openSwipeContent) {
      openSwipeContent.style.transform = '';
      openSwipeContent.classList.remove('swiped');
      openSwipeContent = null;
    }
  }
  function attachSwipeToDelete(clipEl, contentEl, onOpen, onDelete) {
    let startX = 0, startY = 0, dx = 0, dragging = false, decided = false, horizontal = false, suppressClick = false;

    function start(x, y) {
      if (openSwipeContent && openSwipeContent !== contentEl) closeOpenSwipe();
      startX = x; startY = y; dx = 0; dragging = true; decided = false; horizontal = false;
      contentEl.style.transition = 'none';
    }
    function move(x, y) {
      if (!dragging) return;
      const mx = x - startX, my = y - startY;
      if (!decided) {
        if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
        decided = true;
        horizontal = Math.abs(mx) > Math.abs(my);
      }
      if (!horizontal) return;
      const base = contentEl.classList.contains('swiped') ? -REVEAL_WIDTH : 0;
      // Hard-clamp at -REVEAL_WIDTH, same as calendar/finance — no
      // rubber-banding past the bin, so it can't be dragged too far left.
      dx = Math.min(0, Math.max(-REVEAL_WIDTH, base + mx));
      contentEl.style.transform = `translateX(${dx}px)`;
    }
    function end() {
      if (!dragging) return;
      dragging = false;
      contentEl.style.transition = 'transform 180ms ease';
      // A decided horizontal drag (even one that snaps back) shouldn't also
      // register as a tap that opens the edit modal.
      suppressClick = decided && horizontal;
      if (horizontal && dx < -REVEAL_WIDTH / 2) {
        contentEl.style.transform = `translateX(-${REVEAL_WIDTH}px)`;
        contentEl.classList.add('swiped');
        openSwipeContent = contentEl;
      } else {
        contentEl.style.transform = '';
        contentEl.classList.remove('swiped');
        if (openSwipeContent === contentEl) openSwipeContent = null;
      }
    }

    clipEl.addEventListener('touchstart', e => { const t = e.touches[0]; start(t.clientX, t.clientY); }, { passive: true });
    clipEl.addEventListener('touchmove', e => { const t = e.touches[0]; move(t.clientX, t.clientY); }, { passive: true });
    clipEl.addEventListener('touchend', end);

    // Mouse drag too, so swipe-to-delete is usable on desktop.
    let mouseDown = false;
    contentEl.addEventListener('mousedown', e => { mouseDown = true; start(e.clientX, e.clientY); });
    window.addEventListener('mousemove', e => { if (mouseDown) move(e.clientX, e.clientY); });
    window.addEventListener('mouseup', () => { if (mouseDown) { mouseDown = false; end(); } });

    clipEl.querySelector('.agenda-row-delete-btn').onclick = (e) => {
      e.stopPropagation();
      onDelete();
    };

    // Tapping while revealed closes it instead of opening the edit modal;
    // a tap right after a drag gesture (even one that snapped back) is
    // swallowed so a swipe attempt never accidentally opens the row.
    contentEl.addEventListener('click', () => {
      if (suppressClick) { suppressClick = false; return; }
      if (contentEl.classList.contains('swiped')) {
        closeOpenSwipe();
      } else {
        onOpen();
      }
    });
  }

  function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function formatSelectedDate(ds) {
    const today = Modals.todayStr();
    if (ds === today) return 'Today';
    if (ds === addDays(today, -1)) return 'Yesterday';
    if (ds === addDays(today, 1)) return 'Tomorrow';
    const d = new Date(ds + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  // Whether a task counts as "done" for the currently-selected day: a
  // one-off task just uses its own done flag; a daily/weekly task is done
  // for whichever days appear in its doneDates list.
  function isDoneForView(t, selectedDate) {
    return (t.repeat === 'daily' || t.repeat === 'weekly') ? (t.doneDates || []).includes(selectedDate) : !!t.done;
  }
  // A daily task is active every day within its window; a weekly task is
  // only active on the same weekday as its original date, within that
  // same weeks-long window.
  function isActiveOn(t, selectedDate) {
    if (t.repeat !== 'daily' && t.repeat !== 'weekly') return true;
    const weeks = t.dailyWeeks || 1;
    const end = addDays(t.date, weeks * 7 - 1);
    if (selectedDate < t.date || selectedDate > end) return false;
    if (t.repeat === 'weekly') {
      const startDow = new Date(t.date + 'T00:00:00').getDay();
      const selDow = new Date(selectedDate + 'T00:00:00').getDay();
      return startDow === selDow;
    }
    return true;
  }

  function render(container) {
    let selectedDate = Modals.todayStr();

    container.innerHTML = `
      <div class="page-head">
        <div>
          <p class="eyebrow">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h1 class="page-title font-display">Tasks</h1>
        </div>
      </div>

      <div class="finance-date-row" style="margin-bottom:14px;">
        <button class="icon-btn" id="tasks-date-prev" aria-label="Previous day">&#8249;</button>
        <div class="finance-date-center">
          <button type="button" class="finance-date-btn" id="tasks-date-btn"></button>
          <input type="date" id="tasks-date-input" class="visually-hidden" />
        </div>
        <button class="icon-btn" id="tasks-date-next" aria-label="Next day">&#8250;</button>
      </div>

      <div class="type-toggle" id="task-filters" style="max-width:420px;margin-bottom:18px;"></div>
      <div id="task-list"></div>
      <button class="fab tasks-fab" id="task-fab" aria-label="Add task" style="background:var(--tasks);">
        <span class="tasks-fab-plus" aria-hidden="true"></span>
      </button>
    `;
    const $ = sel => container.querySelector(sel);

    const filters = [
      { id: 'upcoming', label: 'Upcoming' },
      { id: 'all', label: 'All' },
      { id: 'done', label: 'Done' },
    ];
    const fWrap = $('#task-filters');
    fWrap.innerHTML = '';
    filters.forEach(f => {
      const b = document.createElement('button');
      b.textContent = f.label;
      b.style.setProperty('--t-color', 'var(--tasks)');
      b.className = f.id === filter ? 'active' : '';
      b.onclick = () => { filter = f.id; renderList(); [...fWrap.children].forEach(x => x.classList.remove('active')); b.classList.add('active'); };
      fWrap.appendChild(b);
    });

    /* ---- date nav (which day daily-task completion is shown/toggled for) ---- */
    const dateBtn = $('#tasks-date-btn');
    const dateInput = $('#tasks-date-input');
    function goToDate(d) {
      selectedDate = d;
      dateInput.value = selectedDate;
      dateBtn.textContent = formatSelectedDate(selectedDate);
      renderList();
    }
    dateInput.value = selectedDate;
    dateBtn.textContent = formatSelectedDate(selectedDate);
    dateBtn.onclick = () => { if (dateInput.showPicker) dateInput.showPicker(); else dateInput.focus(); };
    dateInput.onchange = () => { if (dateInput.value) goToDate(dateInput.value); };
    $('#tasks-date-prev').onclick = () => goToDate(addDays(selectedDate, -1));
    $('#tasks-date-next').onclick = () => goToDate(addDays(selectedDate, 1));

    /* ---- add one-off task (shared entry modal / FAB) ---- */
    const openAdd = () => Modals.openEntryModal({ defaults: { type: 'task', date: selectedDate }, onSaved: renderList });
    $('#task-fab').onclick = openAdd;

    // Close a revealed swipe-to-delete row when the user taps anywhere
    // outside it (e.g. the filters, date nav, or the FAB).
    container.addEventListener('click', (e) => {
      if (openSwipeContent && !openSwipeContent.contains(e.target)) closeOpenSwipe();
    }, true);

    renderList();

    function renderList() {
      closeOpenSwipe();
      const list = $('#task-list');
      const today = Modals.todayStr();
      let tasks = DB.events.list().filter(e => e.type === 'task');

      if (filter === 'upcoming') tasks = tasks.filter(t => (t.repeat === 'daily' || t.repeat === 'weekly') ? (isActiveOn(t, selectedDate) && !isDoneForView(t, selectedDate)) : (!t.done && t.date >= today));
      else if (filter === 'done') tasks = tasks.filter(t => isDoneForView(t, selectedDate));
      // 'all' = no filter

      // Daily/weekly tasks float to the top of the list (sorted by their
      // own time), one-off tasks follow sorted by date + time as before.
      tasks.sort((a, b) => {
        const keyOf = t => (t.repeat === 'daily' || t.repeat === 'weekly') ? ('0000-00-00' + (t.time || '')) : (t.date + (t.time || ''));
        return keyOf(a).localeCompare(keyOf(b));
      });

      if (tasks.length === 0) {
        list.innerHTML = `<div class="empty-state"><div class="glyph">\u2713</div><p>No tasks here. Tap "Add task" to create one.</p></div>`;
        return;
      }

      list.innerHTML = '';
      tasks.forEach(t => {
        const isDaily = t.repeat === 'daily' || t.repeat === 'weekly';
        const done = isDoneForView(t, selectedDate);
        const subParts = [];
        if (isDaily) {
          const freqLabel = t.repeat === 'weekly' ? 'Weekly' : 'Daily';
          subParts.push(`\u21BB ${freqLabel} \u00B7 ${t.dailyWeeks || 1} wk${(t.dailyWeeks || 1) > 1 ? 's' : ''}`);
        }

        // Swipe-left-to-delete wrapper: .agenda-row stays unclipped so the
        // reminder badge can pop out of the corner; .agenda-row-clip is the
        // layer that actually clips the reveal; .agenda-row-content is what
        // slides to expose the delete button underneath.
        const row = document.createElement('div');
        row.className = 'agenda-row tasks-agenda-row';
        row.innerHTML = `
          ${t.reminder?.enabled ? `<span class="list-row-badge">${TASK_BELL_SVG}</span>` : ''}
          <div class="agenda-row-clip">
            <div class="agenda-row-delete-bg">
              <button type="button" class="agenda-row-delete-btn" aria-label="Delete task">${TASK_TRASH_SVG}</button>
            </div>
            <div class="agenda-row-content">
              <div class="agenda-row-top">
                <div class="list-row-main">
                  <span class="checkbox ${done ? 'checked' : ''}" data-id="${t.id}">${done ? '\u2713' : ''}</span>
                  <div class="list-row-text">
                    <div class="list-row-title ${done ? 'done' : ''}">${UI.escapeHtml(t.title)}</div>
                    ${subParts.length ? `<div class="list-row-sub">${subParts.join(' \u00B7 ')}</div>` : ''}
                  </div>
                </div>
                <div class="agenda-row-actions">
                  <button type="button" class="icon-btn tasks-row-edit-btn" aria-label="Edit task" title="Edit">&#9998;</button>
                </div>
              </div>
            </div>
          </div>
        `;
        const contentEl = row.querySelector('.agenda-row-content');
        const clipEl = row.querySelector('.agenda-row-clip');

        row.querySelector('.tasks-row-edit-btn').onclick = (e) => {
          e.stopPropagation();
          Modals.openEntryModal({ editing: t, onSaved: renderList });
        };
        row.querySelector('.checkbox').onclick = (e) => {
          e.stopPropagation();
          if (isDaily) {
            const doneDates = new Set(t.doneDates || []);
            if (doneDates.has(selectedDate)) doneDates.delete(selectedDate); else doneDates.add(selectedDate);
            DB.events.update(t.id, { doneDates: [...doneDates] });
          } else {
            DB.events.update(t.id, { done: !t.done });
          }
          renderList();
        };
        attachSwipeToDelete(
          clipEl, contentEl,
          () => {}, // row content is no longer tap-to-edit — use the edit icon
          () => { DB.events.remove(t.id); renderList(); }
        );
        list.appendChild(row);
      });
    }
  }

  return { render };
})();
