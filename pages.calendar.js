/* ============================================================
   DayNote — Calendar page
   ============================================================ */

Pages.calendar = (() => {
  let viewYear, viewMonth; // 0-indexed month
  let selectedDate = Modals.todayStr();
  let expandedId = null;
  let swipedId = null;

  // Date-highlight picker: pickMode stages taps into pendingPicked; the
  // check button commits pendingPicked into highlightedDates, which is
  // what actually persists (localStorage — this app is local-data-only).
  let pickMode = false;
  let pendingPicked = new Set();
  const HIGHLIGHT_KEY = 'daynote_highlighted_dates';

  function loadHighlighted() {
    try {
      const raw = localStorage.getItem(HIGHLIGHT_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch (e) { return new Set(); }
  }
  function saveHighlighted(set) {
    try { localStorage.setItem(HIGHLIGHT_KEY, JSON.stringify([...set])); } catch (e) {}
  }
  let highlightedDates = loadHighlighted();

  function pad(n) { return String(n).padStart(2, '0'); }
  function dateStr(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
  function todayStr() { return Modals.todayStr(); }

  const TYPE_COLOR = { event: '--calendar', task: '--tasks', note: '--notes' };

  function deleteEvent(it, onDone) {
    if (DB.events && typeof DB.events.remove === 'function') DB.events.remove(it.id);
    else if (DB.events && typeof DB.events.delete === 'function') DB.events.delete(it.id);
    else { Modals.openEntryModal({ editing: it, onSaved: onDone }); return; }
    UI.showToast('Deleted', 'Removed from calendar');
    onDone();
  }

  function render(container) {
    const now = new Date();
    if (viewYear === undefined) { viewYear = now.getFullYear(); viewMonth = now.getMonth(); }

    container.innerHTML = `
      <div class="page-head">
        <div>
          <p class="eyebrow">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h1 class="page-title font-display">Calendar</h1>
        </div>
        <div class="cal-nav">
          <button class="icon-btn" id="cal-prev" aria-label="Previous month">&#8249;</button>
          <div class="month-label font-display" id="cal-month-label"></div>
          <button class="icon-btn" id="cal-next" aria-label="Next month">&#8250;</button>
          <button class="btn ghost" id="cal-today-btn">Today</button>
          <button class="cal-highlight-dot" id="cal-highlight-btn" aria-label="Highlight dates" title="Highlight dates">
            <span class="dot-inner"></span>
          </button>
          <button class="cal-highlight-confirm hidden" id="cal-highlight-confirm" aria-label="Save highlighted dates" title="Save highlighted dates">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
        </div>
      </div>
      <div class="cal-pick-hint hidden" id="cal-pick-hint">
        <span>Tap dates to highlight, then save</span>
        <button type="button" class="btn ghost small" id="cal-pick-cancel">Cancel</button>
      </div>
      <div class="cal-weekdays">
        <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
      </div>
      <div class="cal-grid" id="cal-grid"></div>

      <div class="agenda-head">
        <h2 id="agenda-title" class="font-display"></h2>
      </div>
      <div id="agenda-list"></div>

      <button class="fab cal-fab" id="agenda-add-btn" aria-label="Add to calendar">
        <span class="cal-fab-plus" aria-hidden="true"></span>
      </button>
    `;

    $('#cal-prev').onclick = () => { shiftMonth(-1); };
    $('#cal-next').onclick = () => { shiftMonth(1); };
    $('#cal-today-btn').onclick = () => {
      const t = new Date();
      viewYear = t.getFullYear(); viewMonth = t.getMonth();
      selectedDate = todayStr();
      renderGrid(); renderAgenda();
    };
    $('#agenda-add-btn').onclick = () => {
      Modals.openEntryModal({ defaults: { date: selectedDate }, onSaved: () => { renderGrid(); renderAgenda(); } });
    };

    const highlightBtn = $('#cal-highlight-btn');
    const highlightConfirmBtn = $('#cal-highlight-confirm');
    const pickHint = $('#cal-pick-hint');
    $('#cal-pick-cancel').onclick = () => exitPickMode();

    highlightBtn.onclick = () => {
      if (pickMode) { exitPickMode(); return; }
      pickMode = true;
      pendingPicked = new Set(highlightedDates);
      highlightBtn.classList.add('active');
      highlightConfirmBtn.classList.remove('hidden');
      pickHint.classList.remove('hidden');
      renderGrid();
    };

    highlightConfirmBtn.onclick = () => {
      highlightedDates = new Set(pendingPicked);
      saveHighlighted(highlightedDates);
      exitPickMode();
    };

    function exitPickMode() {
      pickMode = false;
      pendingPicked = new Set();
      highlightBtn.classList.remove('active');
      highlightConfirmBtn.classList.add('hidden');
      pickHint.classList.add('hidden');
      renderGrid();
    }

    renderGrid();
    renderAgenda();

    container.addEventListener('click', (e) => {
      if (swipedId && !e.target.closest('.agenda-row')) closeSwipe();
    });

    function $(sel) { return container.querySelector(sel); }

    function shiftMonth(delta) {
      viewMonth += delta;
      if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      renderGrid();
    }

    function itemsByDate() {
      const map = {};
      DB.events.list().forEach(ev => {
        if (!map[ev.date]) map[ev.date] = [];
        map[ev.date].push(ev);
      });
      return map;
    }

    function renderGrid() {
      $('#cal-month-label').textContent = new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      const grid = $('#cal-grid');
      grid.innerHTML = '';
      const map = itemsByDate();

      const firstOfMonth = new Date(viewYear, viewMonth, 1);
      const startOffset = firstOfMonth.getDay(); // 0=Sun
      const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();
      const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

      for (let i = 0; i < totalCells; i++) {
        const dayNum = i - startOffset + 1;
        let cellDate, outside = false;
        if (dayNum < 1) { cellDate = new Date(viewYear, viewMonth - 1, daysInPrevMonth + dayNum); outside = true; }
        else if (dayNum > daysInMonth) { cellDate = new Date(viewYear, viewMonth + 1, dayNum - daysInMonth); outside = true; }
        else { cellDate = new Date(viewYear, viewMonth, dayNum); }

        const ds = dateStr(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate());
        const isToday = ds === todayStr();
        const isSelected = ds === selectedDate;
        const isPending = pickMode && pendingPicked.has(ds);
        const isHighlighted = !pickMode && highlightedDates.has(ds);
        const cell = document.createElement('div');
        cell.className = 'cal-cell' + (outside ? ' outside' : '') + (isToday ? ' today' : '') + (isSelected ? ' selected' : '') + (isPending ? ' pending-pick' : '');
        const dayItems = map[ds] || [];
        // Only ever show a single dot for a day, regardless of how many items
        // fall on it — colored by the earliest item's type.
        const dots = dayItems.length
          ? `<span class="cal-dot" style="background:var(${TYPE_COLOR[dayItems[0].type]})"></span>`
          : '';
        const tick = isPending ? `<span class="cal-pick-tick" aria-hidden="true">&#10003;</span>` : '';
        cell.innerHTML = `<div class="cal-cell-top"><div class="daynum${isHighlighted ? ' picked' : ''}">${cellDate.getDate()}</div><div class="cal-dots">${dots}</div></div>${tick}`;
        cell.onclick = () => {
          if (pickMode) {
            if (pendingPicked.has(ds)) pendingPicked.delete(ds); else pendingPicked.add(ds);
            renderGrid();
            return;
          }
          selectedDate = ds; renderGrid(); renderAgenda();
        };
        grid.appendChild(cell);
      }
    }

    function renderAgenda() {
      const d = new Date(selectedDate + 'T00:00:00');
      const isToday = selectedDate === todayStr();
      $('#agenda-title').textContent = (isToday ? 'Today \u00B7 ' : '') + d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

      const items = (DB.events.list().filter(e => e.date === selectedDate))
        .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

      const list = $('#agenda-list');
      if (items.length === 0) {
        list.innerHTML = `<div class="empty-state"><div class="glyph"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2"/><line x1="3.5" y1="9.5" x2="20.5" y2="9.5"/><line x1="8" y1="3" x2="8" y2="6.5"/><line x1="16" y1="3" x2="16" y2="6.5"/></svg></div><p>Nothing on this day yet. Add an event, task, or note.</p></div>`;
        return;
      }
      list.innerHTML = '';
      items.forEach(it => {
        const row = document.createElement('div');
        row.className = 'agenda-row';
        row.dataset.id = it.id;
        const hasNotes = !!(it.notes && it.notes.trim());
        const notesText = hasNotes ? UI.escapeHtml(it.notes) : 'No description';

        row.innerHTML = `
          <div class="agenda-row-clip">
            <div class="agenda-row-delete-bg">
              <button type="button" class="agenda-row-delete-btn" aria-label="Delete event">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              </button>
            </div>
            <div class="agenda-row-content${expandedId === it.id ? ' expanded' : ''}">
              <div class="agenda-row-top">
                <div class="list-row-main">
                  <span class="type-dot" style="background:var(${TYPE_COLOR[it.type]})" aria-hidden="true"></span>
                  <div class="list-row-text">
                    <div class="list-row-title">${UI.escapeHtml(it.title)}</div>
                    <div class="list-row-sub">${it.time ? formatTime(it.time) : 'All day'}</div>
                  </div>
                </div>
                <div class="agenda-row-actions">
                  <button type="button" class="icon-btn agenda-row-edit-btn" aria-label="Edit event" title="Edit">&#9998;</button>
                  <button type="button" class="agenda-row-chevron-btn" aria-label="Toggle description" aria-expanded="${expandedId === it.id ? 'true' : 'false'}">
                    <span class="agenda-row-chevron">&#8250;</span>
                  </button>
                </div>
              </div>
              <div class="agenda-row-desc${hasNotes ? '' : ' agenda-row-desc-empty'}">${notesText}</div>
            </div>
          </div>
          ${it.reminder?.enabled ? `<span class="agenda-row-badge" title="Reminder set" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </span>` : ''}
        `;

        const content = row.querySelector('.agenda-row-content');
        row.querySelector('.agenda-row-edit-btn').onclick = (e) => {
          e.stopPropagation();
          Modals.openEntryModal({ editing: it, onSaved: () => { renderGrid(); renderAgenda(); } });
        };
        row.querySelector('.agenda-row-chevron-btn').onclick = (e) => {
          e.stopPropagation();
          expandedId = expandedId === it.id ? null : it.id;
          renderAgenda();
        };
        row.querySelector('.agenda-row-delete-btn').onclick = (e) => {
          e.stopPropagation();
          deleteEvent(it, () => { swipedId = null; renderGrid(); renderAgenda(); });
        };
        wireSwipe(row, content, it.id);

        list.appendChild(row);
      });
    }

    function closeSwipe() {
      const el = list_el();
      if (!el) { swipedId = null; return; }
      const openRow = el.querySelector('.agenda-row-content.swiped');
      if (openRow) { openRow.classList.remove('swiped'); openRow.style.transform = ''; }
      swipedId = null;
    }
    function list_el() { return container.querySelector('#agenda-list'); }

    function wireSwipe(row, content, id) {
      const MAX = 72;
      let startX = 0, startY = 0, dx = 0, dragging = false, axis = null;

      if (swipedId === id) { content.classList.add('swiped'); content.style.transform = `translateX(-${MAX}px)`; }

      content.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX; startY = e.touches[0].clientY; dx = 0; dragging = true; axis = null;
        content.style.transition = 'none';
      }, { passive: true });

      content.addEventListener('touchmove', (e) => {
        if (!dragging) return;
        const curX = e.touches[0].clientX - startX;
        const curY = e.touches[0].clientY - startY;
        if (axis === null) axis = Math.abs(curX) > Math.abs(curY) ? 'x' : 'y';
        if (axis !== 'x') return;
        const base = content.classList.contains('swiped') ? -MAX : 0;
        dx = Math.min(0, Math.max(-MAX, base + curX));
        content.style.transform = `translateX(${dx}px)`;
      }, { passive: true });

      content.addEventListener('touchend', () => {
        if (!dragging) return;
        dragging = false;
        content.style.transition = '';
        if (dx < -MAX / 2) {
          if (swipedId && swipedId !== id) closeSwipe();
          content.classList.add('swiped');
          content.style.transform = `translateX(-${MAX}px)`;
          swipedId = id;
        } else {
          content.classList.remove('swiped');
          content.style.transform = '';
          if (swipedId === id) swipedId = null;
        }
      });
    }

    function formatTime(t) {
      const [h, m] = t.split(':').map(Number);
      const d = new Date(); d.setHours(h, m);
      return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }
  }

  return { render };
})();
