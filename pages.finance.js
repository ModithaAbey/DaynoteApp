/* ============================================================
   DayNote — Finance page
   ------------------------------------------------------------
   - "Plan your budget" opens a modal to set an income figure and
     per-category budgets (Food, Utility & Bills, Transport, Others,
     Savings) for a Month / Week / 2-Week period.
   - The three top boxes (Income / Expenses / Balance) always
     reflect a single selected day: Income comes from the budget
     plan, Expenses is the sum of that day's logged entries, and
     Balance is the difference. They can't be edited directly —
     only "Plan your budget" changes the Income figure.
   - Below the boxes, the selected date can be stepped with the
     arrows, tapped to open a date picker, or the ledger can be
     swiped left/right to move a day at a time.
   - Each entry in the ledger is an underlined row (no boxed
     border) with amount, category and an optional description
     that expands under a chevron. Rows are editable, and the +
     button (bottom-right) adds a new one for the selected day.

   NOTE: storage is routed through DB.finance (see data.js), which
   keeps its own separate collection from the calendar/tasks/notes
   data — this page never touches localStorage directly.
   ============================================================ */

Pages.finance = (() => {
  const CATEGORIES = [
    { id: 'Food', label: 'Food', color: 'var(--tasks)' },
    { id: 'Utilities', label: 'Utility & Bills', color: 'var(--calendar)' },
    { id: 'Transport', label: 'Transport', color: 'var(--notes)' },
    { id: 'Others', label: 'Others', color: 'var(--danger)' },
    { id: 'Savings', label: 'Savings', color: 'var(--finance)' },
  ];

  function escapeHtml(s) {
    if (window.UI && UI.escapeHtml) return UI.escapeHtml(s);
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function toast(title, body) {
    if (window.UI && UI.showToast) UI.showToast(title, body);
  }
  // Number inputs (amount / income / budget figures) should only change via
  // typing — not by scrolling the mouse wheel over them while focused, which
  // is the browser's default behavior for <input type="number">.
  function disableWheelChange(el) {
    if (!el) return;
    el.addEventListener('wheel', (e) => { e.preventDefault(); }, { passive: false });
  }

  /* ---- storage ----
     Backed by DB.finance (see data.js), which is IndexedDB under the
     hood with an in-memory cache — these helpers keep the exact same
     synchronous call shape the rest of this file already uses, so
     nothing below this block needs to change. */
  function loadTxns() { return DB.finance.transactions.list(); }
  function saveTxns(list) {
    // DB.finance.transactions is record-based (create/update/remove), not
    // a single blob, so a "replace the whole list" call is reconciled here:
    // diff against the current cache and issue the minimal set of writes.
    const current = DB.finance.transactions.list();
    const nextIds = new Set(list.map((t) => t.id).filter(Boolean));
    current.filter((t) => !nextIds.has(t.id)).forEach((t) => DB.finance.transactions.remove(t.id));
    list.forEach((t) => {
      if (t.id && current.some((c) => c.id === t.id)) DB.finance.transactions.update(t.id, t);
      else {
        const created = DB.finance.transactions.create(t);
        t.id = created.id; // keep caller's reference in sync for any code using it after saveTxns()
      }
    });
  }

  // Recurring expenses: a transaction with `repeat` set ('weekly' |
  // 'monthly') acts as a template. Each time the Finance page loads, walk
  // forward from `repeatGeneratedThrough` (or its own date, the first
  // time) creating one concrete transaction per missed interval, up to
  // today — so opening the app after a week away still backfills last
  // Monday's rent instead of silently skipping it. Generated occurrences
  // are plain transactions (repeat: null) linked back via `seriesId`, so
  // they don't themselves spawn further copies.
  function generateRecurringTxns() {
    const list = loadTxns();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let changed = false;
    list.forEach(t => {
      if (!t.repeat) return;
      let through = new Date((t.repeatGeneratedThrough || t.date) + 'T00:00:00');
      let guard = 0;
      while (guard++ < 104) { // cap ~2 years of weekly catch-up so a stale template can't loop forever
        const next = new Date(through);
        if (t.repeat === 'weekly') next.setDate(next.getDate() + 7);
        else next.setMonth(next.getMonth() + 1);
        if (next > today) break;
        list.push({
          id: 'txn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          amount: t.amount, category: t.category, description: t.description,
          date: fmtDate(next), seriesId: t.seriesId || t.id, repeat: null,
        });
        through = next;
        changed = true;
      }
      t.repeatGeneratedThrough = fmtDate(through);
    });
    if (changed) saveTxns(list);
  }
  function fmtDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // A single master switch, not one per category: when on (default), the
  // Add Expense category picker and the category breakdown/filter in
  // Manage Categories are both active. Switched off, new expenses skip
  // categorization entirely (logged under a single general bucket) and
  // the category views step aside rather than showing empty controls.
  function loadCategorizeEnabled() { return DB.finance.getCategorizeEnabled(true); }
  function saveCategorizeEnabled(on) { DB.finance.setCategorizeEnabled(!!on); }

  function defaultBudget() {
    return { period: 'month', income: 0, food: 0, utilities: 0, transport: 0, others: 0, savings: 0 };
  }
  function loadBudget() { return Object.assign(defaultBudget(), DB.finance.getBudget({}) || {}); }
  function saveBudget(b) { DB.finance.setBudget(b); }

  // A separate archive of past budget plans, keyed by the calendar month
  // they were active in. This is what a future "monthly report" would read
  // from — so clearing the live plan below never loses that history.
  function loadBudgetHistory() { return DB.finance.getBudgetHistory({}) || {}; }
  function saveBudgetHistory(hist) { DB.finance.setBudgetHistory(hist); }
  // A month can accumulate several archived plans (e.g. a couple of weekly
  // plans plus a monthly one), so each month key holds an array. Older data
  // saved before this existed may still have a single object per key —
  // getMonthHistory() below normalizes that on read.
  function archiveBudgetForReport(b) {
    const now = new Date();
    const monthKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    const hist = loadBudgetHistory();
    const existing = Array.isArray(hist[monthKey]) ? hist[monthKey] : (hist[monthKey] ? [hist[monthKey]] : []);
    existing.push({ ...b, archivedAt: now.toISOString() });
    hist[monthKey] = existing;
    saveBudgetHistory(hist);
  }
  function getMonthHistory(monthKey) {
    const entry = loadBudgetHistory()[monthKey];
    if (!entry) return [];
    return Array.isArray(entry) ? entry : [entry];
  }

  /* ---- date helpers ---- */
  function toDateStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function todayStr() { return toDateStr(new Date()); }
  function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return toDateStr(d);
  }
  function formatDateLabel(dateStr) {
    const today = todayStr();
    if (dateStr === today) return 'Today';
    if (dateStr === addDays(today, -1)) return 'Yesterday';
    if (dateStr === addDays(today, 1)) return 'Tomorrow';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function fmt(n) {
    return 'Rs ' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  function monthKeyOf(dateStr) { return dateStr.slice(0, 7); }
  function monthLabel(monthKey) {
    const [y, m] = monthKey.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  function monthRange(monthKey) {
    const [y, m] = monthKey.split('-').map(Number);
    const from = monthKey + '-01';
    const lastDay = new Date(y, m, 0).getDate();
    const to = monthKey + '-' + String(lastDay).padStart(2, '0');
    return { from, to };
  }
  function shiftMonth(monthKey, delta) {
    const [y, m] = monthKey.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  // Mon–Sun calendar weeks overlapping a given month, clipped to the
  // month's own start/end. Used for the "delete a specific week" option —
  // the app doesn't track custom week boundaries, so calendar weeks are
  // the simplest thing that lines up with the daily ledger.
  function weeksInMonth(monthKey) {
    const { from, to } = monthRange(monthKey);
    const monthStart = new Date(from + 'T00:00:00');
    const monthEnd = new Date(to + 'T00:00:00');
    const cur = new Date(monthStart);
    const dow = cur.getDay();
    cur.setDate(cur.getDate() + ((dow === 0 ? -6 : 1) - dow));
    const weeks = [];
    while (cur <= monthEnd) {
      const wEndRaw = new Date(cur); wEndRaw.setDate(wEndRaw.getDate() + 6);
      const from2 = toDateStr(cur) > from ? toDateStr(cur) : from;
      const to2 = toDateStr(wEndRaw) < to ? toDateStr(wEndRaw) : to;
      const shortFmt = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      weeks.push({ from: from2, to: to2, label: `${shortFmt(from2)} \u2013 ${shortFmt(to2)}` });
      cur.setDate(cur.getDate() + 7);
    }
    return weeks;
  }

  // The date range the *currently active* budget plan actually represents,
  // based on its period. A 'week' plan is compared against the calendar
  // week (Mon–Sun) containing today; a 'twoweek' plan against whichever
  // half of the month today falls in (1st–14th or 15th–end) since the app
  // has no separate start-date picker for fortnightly plans; a 'month'
  // plan against the whole current month.
  function currentPeriodRange(period) {
    const today = todayStr();
    const monthKey = monthKeyOf(today);
    if (period === 'week') {
      const weeks = weeksInMonth(monthKey);
      const w = weeks.find(w => today >= w.from && today <= w.to) || weeks[weeks.length - 1];
      return { from: w.from, to: w.to, label: 'this week' };
    }
    if (period === 'twoweek') {
      const { from, to } = monthRange(monthKey);
      const dayNum = Number(today.slice(8, 10));
      if (dayNum <= 14) return { from, to: monthKey + '-14', label: 'this 2-week period' };
      return { from: monthKey + '-15', to, label: 'this 2-week period' };
    }
    const { from, to } = monthRange(monthKey);
    return { from, to, label: 'this month' };
  }

  // Shared markup for one category's spend-vs-budget row — used by both
  // the Monthly Report and Manage Categories so the two stay visually
  // consistent instead of duplicating a table layout.
  function catBreakdownRowHtml(cat, compareSpent, budgeted, share, figuresLine, showName = true) {
    const pct = budgeted > 0 ? Math.round((compareSpent / budgeted) * 100) : null;
    const barPct = pct === null ? 0 : Math.min(100, pct);
    const over = pct !== null && pct > 100;
    const barColor = over ? 'var(--danger)' : 'var(--finance)';
    return `
      <div class="cat-report-row">
        <div class="cat-report-top">
          ${showName ? `<div class="cat-report-name"><span class="txn-dot" style="background:${cat.color};display:inline-block;"></span>${cat.label}</div>` : '<span></span>'}
          <div class="cat-report-share">${share}% of spending</div>
        </div>
        ${figuresLine ? `<div class="cat-report-figures">${figuresLine}</div>` : ''}
        ${budgeted > 0 ? `
          <div class="cat-progress-track"><div class="cat-progress-fill" style="width:${barPct}%;background:${barColor};"></div></div>
          <div class="cat-progress-label"><span>${fmt(compareSpent)} of ${fmt(budgeted)}</span><span style="color:${over ? 'var(--danger)' : 'inherit'}">${pct}%</span></div>
        ` : `
          <div class="cat-progress-label"><span>${fmt(compareSpent)} spent</span><span>No budget set</span></div>
        `}
      </div>`;
  }

  // Plain-language status for the Savings category, shown in the Monthly
  // Report. "Saved" here means money actually logged under the Savings
  // category (an expense in the ledger, just like Food or Transport) —
  // not merely money that happened not to get spent.
  function savingsGoalMessage(actualSavings, savingsGoal, balance) {
    if (!savingsGoal || savingsGoal <= 0) return null; // no goal set for the period
    const shortfall = savingsGoal - actualSavings;
    if (shortfall <= 0) {
      return shortfall === 0
        ? `You\u2019ve hit your savings goal exactly \u2014 nice work!`
        : `You\u2019ve saved more than enough \u2014 ${fmt(Math.abs(shortfall))} over your savings goal as you set your budget.`;
    }
    if (balance > 0) {
      return `You need to save ${fmt(shortfall)} more to complete your savings goal.`;
    }
    return `You\u2019re ${fmt(shortfall)} short of your savings goal, with no balance left this period to cover it.`;
  }

  function render(container) {
    generateRecurringTxns();
    let selectedDate = todayStr();
    let expandedId = null;
    let editingId = null;
    let swipedId = null;
    let activeFilter = null; // category id, or null for no filter

    container.innerHTML = `
      <div class="page-head">
        <div>
          <p class="eyebrow">${new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p>
          <h1 class="page-title font-display">Finance</h1>
        </div>
        <button class="btn" id="plan-budget-btn" style="background:var(--finance);">Plan your budget</button>
      </div>

      <div class="finance-strip" id="finance-summary"></div>

      <div class="finance-date-row">
        <button class="icon-btn" id="date-prev" aria-label="Previous day">&#8249;</button>
        <div class="finance-date-center">
          <button type="button" class="finance-date-btn" id="finance-date-btn"></button>
          <input type="date" id="finance-date-input" class="visually-hidden" />
        </div>
        <button class="icon-btn" id="date-next" aria-label="Next day">&#8250;</button>
      </div>

      <div class="agenda-head" style="margin:14px 0 4px;">
        <h2 class="font-display">Daily expenses</h2>
        <button type="button" class="cat-filter-chip hidden" id="txn-filter-chip" title="Clear filter"></button>
      </div>

      <div id="txn-sheet" class="txn-sheet"></div>

      <button class="fab finance-fab" id="txn-fab" aria-label="Add expense" style="background:var(--finance);">
        <span class="finance-fab-plus" aria-hidden="true"></span>
      </button>
    `;

    const $ = sel => container.querySelector(sel);

    /* ---- shared els ---- */
    const summaryEl = $('#finance-summary');
    const dateBtn = $('#finance-date-btn');
    const dateInput = $('#finance-date-input');
    const prevBtn = $('#date-prev');
    const nextBtn = $('#date-next');
    const sheetEl = $('#txn-sheet');
    const filterChip = $('#txn-filter-chip');
    filterChip.onclick = () => { activeFilter = null; refresh(); };

    /* ---- expense modal (global markup in finance.html) ---- */
    const txnScrim = document.getElementById('txn-modal-scrim');
    const txnModalTitle = document.getElementById('txn-modal-title');
    const txnForm = document.getElementById('txn-form');
    const txnAmount = document.getElementById('txn-amount');
    const txnCategory = document.getElementById('txn-category');
    const txnDesc = document.getElementById('txn-desc');
    const txnRepeat = document.getElementById('txn-repeat');
    const txnRepeatField = document.getElementById('txn-repeat-field');
    const txnCategoryField = document.getElementById('txn-category-field');
    const txnDeleteBtn = document.getElementById('txn-delete-btn');
    const txnCancelBtn = document.getElementById('txn-cancel-btn');
    const txnCloseBtn = document.getElementById('txn-modal-close');
    disableWheelChange(txnAmount);

    // The category picker is always shown when adding/editing an expense —
    // the "Categorize expenses" switch only controls whether the daily
    // list is grouped by category, not whether a category gets chosen.
    function populateExpenseCategoryOptions() {
      txnCategory.innerHTML = CATEGORIES.map(c => `<option value="${c.id}">${c.label}</option>`).join('');
    }
    populateExpenseCategoryOptions();

    function openExpenseModal(existing) {
      editingId = existing ? existing.id : null;
      txnCategoryField.classList.remove('hidden');
      txnModalTitle.textContent = existing ? 'Edit expense' : 'Add expense';
      txnAmount.value = existing ? existing.amount : '';
      txnCategory.value = existing ? existing.category : (txnCategory.options[0] ? txnCategory.options[0].value : 'Food');
      txnDesc.value = existing ? (existing.description || '') : '';
      txnRepeat.value = existing ? (existing.repeat || '') : '';
      txnDeleteBtn.classList.toggle('hidden', !existing);
      txnScrim.classList.add('open');
      setTimeout(() => txnAmount.focus(), 50);
    }
    function closeExpenseModal() {
      txnScrim.classList.remove('open');
      editingId = null;
      txnForm.reset();
    }
    txnCancelBtn.onclick = closeExpenseModal;
    txnCloseBtn.onclick = closeExpenseModal;
    txnScrim.onclick = (e) => { if (e.target === txnScrim) closeExpenseModal(); };
    txnDeleteBtn.onclick = () => {
      if (!editingId) return;
      saveTxns(loadTxns().filter(t => t.id !== editingId));
      closeExpenseModal();
      toast('Deleted', 'Expense removed');
      refresh();
    };
    txnForm.onsubmit = (e) => {
      e.preventDefault();
      const amount = parseFloat(txnAmount.value);
      if (isNaN(amount) || amount <= 0) { txnAmount.focus(); return; }
      const list = loadTxns();
      const repeat = txnRepeat.value || null;
      if (editingId) {
        const idx = list.findIndex(t => t.id === editingId);
        if (idx > -1) {
          list[idx] = { ...list[idx], amount: Math.abs(amount), category: txnCategory.value, description: txnDesc.value.trim(), repeat };
        }
      } else {
        list.push({
          id: 'txn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          amount: Math.abs(amount),
          category: txnCategory.value,
          description: txnDesc.value.trim(),
          date: selectedDate,
          repeat,
          repeatGeneratedThrough: repeat ? selectedDate : undefined,
        });
      }
      saveTxns(list);
      const wasEditing = !!editingId;
      closeExpenseModal();
      toast(wasEditing ? 'Updated' : 'Added', 'Expense saved');
      refresh();
    };

    $('#txn-fab').onclick = () => openExpenseModal(null);

    /* ---- budget modal (global markup in finance.html) ---- */
    const budgetScrim = document.getElementById('budget-modal-scrim');
    const budgetForm = document.getElementById('budget-form');
    const budgetPeriodToggle = document.getElementById('budget-period-toggle');
    const budgetIncome = document.getElementById('budget-income');
    const budgetFood = document.getElementById('budget-food');
    const budgetUtilities = document.getElementById('budget-utilities');
    const budgetTransport = document.getElementById('budget-transport');
    const budgetOthers = document.getElementById('budget-others');
    const budgetSavings = document.getElementById('budget-savings');
    const budgetCancelBtn = document.getElementById('budget-cancel-btn');
    const budgetCloseBtn = document.getElementById('budget-modal-close');
    const budgetClearBtn = document.getElementById('budget-clear-btn');
    [budgetIncome, budgetFood, budgetUtilities, budgetTransport, budgetOthers, budgetSavings].forEach(disableWheelChange);

    let budgetPeriod = 'month';
    function setBudgetPeriod(p) {
      budgetPeriod = p;
      budgetPeriodToggle.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.period === p));
    }
    budgetPeriodToggle.querySelectorAll('button').forEach(b => {
      b.onclick = () => setBudgetPeriod(b.dataset.period);
    });

    function openBudgetModal() {
      const b = loadBudget();
      setBudgetPeriod(b.period);
      budgetIncome.value = b.income || '';
      budgetFood.value = b.food || '';
      budgetUtilities.value = b.utilities || '';
      budgetTransport.value = b.transport || '';
      budgetOthers.value = b.others || '';
      budgetSavings.value = b.savings || '';
      budgetScrim.classList.add('open');
    }
    function closeBudgetModal() { budgetScrim.classList.remove('open'); }
    budgetCancelBtn.onclick = closeBudgetModal;
    budgetCloseBtn.onclick = closeBudgetModal;
    budgetScrim.onclick = (e) => { if (e.target === budgetScrim) closeBudgetModal(); };
    budgetClearBtn.onclick = () => {
      const current = loadBudget();
      const hasData = !!(current.income || current.food || current.utilities || current.transport || current.others || current.savings);
      if (hasData && !confirm('Clear this budget plan? It will be saved to this month\u2019s report first, then reset. Your daily expenses are not affected.')) return;

      // Save what's currently on the form for the monthly report before
      // wiping it — clearing never loses that data, it just stops being
      // the *active* plan.
      archiveBudgetForReport(current);

      const cleared = defaultBudget();
      saveBudget(cleared);

      setBudgetPeriod(cleared.period);
      budgetIncome.value = '';
      budgetFood.value = '';
      budgetUtilities.value = '';
      budgetTransport.value = '';
      budgetOthers.value = '';
      budgetSavings.value = '';

      toast('Cleared', 'Budget plan reset for this month');
      // Income / Expenses / Balance immediately reflect the cleared plan;
      // the logged daily expenses themselves are untouched.
      refresh();
    };
    budgetForm.onsubmit = (e) => {
      e.preventDefault();
      saveBudget({
        period: budgetPeriod,
        income: parseFloat(budgetIncome.value) || 0,
        food: parseFloat(budgetFood.value) || 0,
        utilities: parseFloat(budgetUtilities.value) || 0,
        transport: parseFloat(budgetTransport.value) || 0,
        others: parseFloat(budgetOthers.value) || 0,
        savings: parseFloat(budgetSavings.value) || 0,
      });
      closeBudgetModal();
      toast('Saved', 'Budget updated');
      refresh();
    };
    $('#plan-budget-btn').onclick = openBudgetModal;

    /* ---- finance settings popover (button lives in the topbar, beside
       the theme icon — see finance.html) ---- */
    const settingsBtn = document.getElementById('finance-settings-btn');
    const settingsPopover = document.getElementById('finance-settings-popover');
    settingsBtn.onclick = (e) => {
      e.stopPropagation();
      const willOpen = !settingsPopover.classList.contains('open');
      document.querySelectorAll('.popover').forEach(p => p.classList.remove('open'));
      if (willOpen) settingsPopover.classList.add('open');
    };
    document.addEventListener('click', () => settingsPopover.classList.remove('open'));
    document.getElementById('open-report-item').onclick = () => { settingsPopover.classList.remove('open'); openReportModal(); };
    document.getElementById('open-categories-item').onclick = () => { settingsPopover.classList.remove('open'); openCategoriesModal(); };
    document.getElementById('open-reset-item').onclick = () => { settingsPopover.classList.remove('open'); openResetModal(); };

    /* ---- monthly report (global markup in finance.html) ---- */
    const reportScrim = document.getElementById('report-modal-scrim');
    const reportBody = document.getElementById('report-body');
    const reportMonthLabelEl = document.getElementById('report-month-label');
    const reportPrevBtn = document.getElementById('report-prev');
    const reportNextBtn = document.getElementById('report-next');
    const reportPdfBtn = document.getElementById('report-pdf-btn');
    let reportMonth = monthKeyOf(todayStr());

    document.getElementById('report-modal-close').onclick = () => reportScrim.classList.remove('open');
    document.getElementById('report-close-btn').onclick = () => reportScrim.classList.remove('open');
    reportScrim.onclick = (e) => { if (e.target === reportScrim) reportScrim.classList.remove('open'); };

    function categoryTotalsForRange(txns, from, to) {
      const totals = {};
      CATEGORIES.forEach(c => totals[c.id] = 0);
      txns.filter(t => t.date >= from && t.date <= to).forEach(t => { totals[t.category] = (totals[t.category] || 0) + t.amount; });
      return totals;
    }

    function buildReportData(monthKey) {
      const { from, to } = monthRange(monthKey);
      const allTxns = loadTxns();
      const monthTxns = allTxns.filter(t => t.date >= from && t.date <= to);
      const actualTotals = categoryTotalsForRange(allTxns, from, to);
      const totalSpent = monthTxns.reduce((s, t) => s + t.amount, 0);

      const history = getMonthHistory(monthKey);
      const isCurrentMonth = monthKey === monthKeyOf(todayStr());
      // The "headline" budget shown for the month: the live plan if we're
      // looking at the current month, otherwise the most recent archived
      // month-period plan (falling back to whatever was archived last).
      let mainBudget = isCurrentMonth
        ? loadBudget()
        : ([...history].reverse().find(h => h.period === 'month') || history[history.length - 1] || defaultBudget());
      const weeklyEntries = history.filter(h => h.period === 'week' || h.period === 'twoweek');

      return { monthKey, monthTxns, actualTotals, totalSpent, mainBudget, weeklyEntries };
    }

    function reportTablesHtml(data) {
      const b = data.mainBudget || defaultBudget();
      const income = b.income || 0;
      const planned = { Food: b.food || 0, Utilities: b.utilities || 0, Transport: b.transport || 0, Others: b.others || 0, Savings: b.savings || 0 };
      const balance = income - data.totalSpent;
      // "% of income saved" = money still unspent PLUS money actively put
      // into the Savings category — not just whatever's left over. Since
      // Savings entries are counted inside totalSpent (they're logged as
      // expenses), adding actualSavings back cancels that deduction out.
      const actualSavings = data.actualTotals.Savings || 0;
      const savingsGoal = planned.Savings || 0;
      const savedTotal = balance + actualSavings;
      const savingsRate = income > 0 ? Math.round((savedTotal / income) * 100) : null;
      const savingsMsg = savingsGoalMessage(actualSavings, savingsGoal, balance);

      // Budgeted-vs-actual rendered as a real sheet — one row per category,
      // aligned numeric columns, a totals row — rather than the stacked
      // progress-bar cards (those still power the live Manage Categories
      // view, where per-day/per-period figures need more room).
      let totalPlanned = 0;
      const catRows = CATEGORIES.map(c => {
        const spent = data.actualTotals[c.id] || 0;
        const plan = planned[c.id] || 0;
        totalPlanned += plan;
        const remaining = plan - spent;
        const pct = plan > 0 ? Math.round((spent / plan) * 100) : null;
        const isSavings = c.id === 'Savings';
        // Both overspending a regular category and falling short of a
        // savings target are flagged using the theme's --finance color,
        // not red/green, so the report reads as neutral figures rather
        // than pass/fail indicators.
        const remainingFlagged = isSavings ? (plan > 0 && remaining > 0) : remaining < 0;
        const pctFlagged = isSavings ? (pct !== null && pct < 100) : (pct !== null && pct > 100);
        const flagColor = 'var(--finance)';
        return `<tr>
          <td><span class="txn-dot" style="background:${c.color};display:inline-block;margin-right:7px;"></span>${c.label}</td>
          <td class="num">${fmt(plan)}</td>
          <td class="num">${fmt(spent)}</td>
          <td class="num" style="color:${remainingFlagged ? flagColor : 'inherit'}">${remaining < 0 ? '\u2212' : ''}${fmt(Math.abs(remaining))}</td>
          <td class="num" style="color:${pctFlagged ? flagColor : 'inherit'}">${pct === null ? '\u2014' : pct + '%'}</td>
        </tr>`;
      }).join('');
      const totalRemaining = totalPlanned - data.totalSpent;
      const totalPct = totalPlanned > 0 ? Math.round((data.totalSpent / totalPlanned) * 100) : null;
      const catTableHtml = `
        <table class="report-table report-cat-table">
          <thead><tr><th>Category</th><th class="num">Budgeted</th><th class="num">Expenses</th><th class="num">Remaining</th><th class="num">% Used</th></tr></thead>
          <tbody>
            ${catRows}
            <tr class="total-row">
              <td>Total</td>
              <td class="num">${fmt(totalPlanned)}</td>
              <td class="num">${fmt(data.totalSpent)}</td>
              <td class="num" style="color:${totalRemaining < 0 ? 'var(--finance)' : 'inherit'}">${totalRemaining < 0 ? '\u2212' : ''}${fmt(Math.abs(totalRemaining))}</td>
              <td class="num">${totalPct === null ? '\u2014' : totalPct + '%'}</td>
            </tr>
          </tbody>
        </table>`;

      const weeklyHtml = data.weeklyEntries.length ? `
        <div class="section-title" style="margin-top:16px;">Weekly plans this month</div>
        <table class="report-table">
          <thead><tr><th>Plan</th><th>Archived</th><th class="num">Income</th><th class="num">Savings</th></tr></thead>
          <tbody>${data.weeklyEntries.map((w, i) => `<tr><td>${w.period === 'week' ? 'Weekly' : '2-Week'} plan ${i + 1}</td><td>${new Date(w.archivedAt).toLocaleDateString()}</td><td class="num">${fmt(w.income)}</td><td class="num">${fmt(w.savings)}</td></tr>`).join('')}</tbody>
        </table>` : '';

      return `
        <div class="report-letterhead">
          <div>
            <p class="report-kicker">DayNote &middot; Statement of account</p>
            <h3 class="font-display report-period">${monthLabel(data.monthKey)}</h3>
          </div>
          <p class="report-generated">Generated ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
        </div>
        <div class="finance-strip">
          <div class="finance-seg"><p class="label">Income</p><p class="value" style="color:var(--finance)">${fmt(income)}</p></div>
          <div class="finance-seg"><p class="label">Expenses</p><p class="value" style="color:var(--finance)">${fmt(data.totalSpent)}</p></div>
          <div class="finance-seg"><p class="label">Balance</p><p class="value" style="color:var(--finance)">${balance >= 0 ? '+' : ''}${fmt(balance)}</p></div>
        </div>
        <p class="report-sub">${data.monthTxns.length} expense${data.monthTxns.length === 1 ? '' : 's'} logged${savingsRate !== null ? ` &middot; ${savingsRate}% of income saved` : ''}</p>
        ${savingsMsg ? `<div class="savings-note">${escapeHtml(savingsMsg)}</div>` : ''}
        <div class="section-title">Budget vs Expenses</div>
        <div class="table-scroll">
          ${catTableHtml}
          ${weeklyHtml}
        </div>
      `;
    }

    function refreshReport() {
      reportMonthLabelEl.textContent = monthLabel(reportMonth);
      const data = buildReportData(reportMonth);
      reportBody.innerHTML = reportTablesHtml(data);
      reportPdfBtn.onclick = () => downloadReportPdf(data);
    }
    function openReportModal() {
      reportMonth = monthKeyOf(todayStr());
      refreshReport();
      reportScrim.classList.add('open');
    }
    reportPrevBtn.onclick = () => { reportMonth = shiftMonth(reportMonth, -1); refreshReport(); };
    reportNextBtn.onclick = () => { reportMonth = shiftMonth(reportMonth, 1); refreshReport(); };

    // Builds a standalone, sheet-styled report page in a new tab and
    // triggers the browser's print dialog, where "Save as PDF" produces
    // the actual file. Keeps this offline-friendly with no external PDF
    // library / CDN dependency.
    function downloadReportPdf(data) {
      const b = data.mainBudget || defaultBudget();
      const income = b.income || 0;
      const planned = { Food: b.food || 0, Utilities: b.utilities || 0, Transport: b.transport || 0, Others: b.others || 0, Savings: b.savings || 0 };
      const balance = income - data.totalSpent;
      const actualSavings = data.actualTotals.Savings || 0;
      const savingsGoal = planned.Savings || 0;
      const savingsRate = income > 0 ? Math.round(((balance + actualSavings) / income) * 100) : null;
      const savingsMsg = savingsGoalMessage(actualSavings, savingsGoal, balance);

      const catRows = CATEGORIES.map(c => {
        const spent = data.actualTotals[c.id] || 0;
        const plan = planned[c.id] || 0;
        const pct = plan > 0 ? Math.round((spent / plan) * 100) : null;
        return `<tr><td>${c.label}</td><td class="num">${fmt(plan)}</td><td class="num">${fmt(spent)}</td><td class="num">${fmt(plan - spent)}</td><td class="num">${pct === null ? '\u2014' : pct + '%'}</td></tr>`;
      }).join('');
      const weeklyRows = data.weeklyEntries.map((w, i) => `<tr><td>${w.period === 'week' ? 'Weekly' : '2-Week'} plan ${i + 1}</td><td>${new Date(w.archivedAt).toLocaleDateString()}</td><td class="num">${fmt(w.income)}</td><td class="num">${fmt(w.savings)}</td></tr>`).join('');

      const html = `<!doctype html><html><head><meta charset="utf-8"><title>DayNote Finance Report \u2014 ${monthLabel(data.monthKey)}</title>
<style>
  body{font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;max-width:760px;margin:40px auto;padding:0 24px;}
  h1{font-size:1.4rem;margin-bottom:2px;}
  .sub{color:#555;font-size:.85rem;margin-top:0;margin-bottom:28px;}
  h2{font-size:1rem;text-transform:uppercase;letter-spacing:.04em;border-bottom:2px solid #1a1a1a;padding-bottom:4px;margin-top:28px;}
  table{width:100%;border-collapse:collapse;margin-top:8px;font-size:.92rem;}
  th,td{padding:7px 10px;border-bottom:1px solid #ddd;text-align:left;}
  th{font-size:.75rem;text-transform:uppercase;letter-spacing:.03em;color:#555;}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;}
  .total-row td{font-weight:700;border-top:2px solid #1a1a1a;border-bottom:none;}
  .savings-note-print{background:#f0f0f0;border-radius:8px;padding:9px 12px;font-size:.85rem;margin-top:10px;}
  footer{margin-top:36px;font-size:.72rem;color:#999;text-align:center;}
  @media print{ body{margin:0;padding:24px;} }
</style></head><body>
  <h1>DayNote \u2014 Monthly Finance Report</h1>
  <p class="sub">${monthLabel(data.monthKey)} &middot; generated ${new Date().toLocaleDateString()}</p>
  <h2>Summary</h2>
  <table>
    <tr><td>Income</td><td class="num">${fmt(income)}</td></tr>
    <tr><td>Total Expenses</td><td class="num">${fmt(data.totalSpent)}</td></tr>
    <tr class="total-row"><td>Balance</td><td class="num">${balance >= 0 ? '+' : ''}${fmt(balance)}</td></tr>
    ${savingsRate !== null ? `<tr><td>% of Income Saved</td><td class="num">${savingsRate}%</td></tr>` : ''}
  </table>
  ${savingsMsg ? `<p class="savings-note-print">${savingsMsg}</p>` : ''}
  <h2>By Category</h2>
  <table>
    <thead><tr><th>Category</th><th class="num">Budgeted</th><th class="num">Expenses</th><th class="num">Remaining</th><th class="num">% Used</th></tr></thead>
    <tbody>${catRows}</tbody>
  </table>
  ${weeklyRows ? `<h2>Weekly Plans</h2><table><thead><tr><th>Plan</th><th>Archived</th><th class="num">Income</th><th class="num">Savings</th></tr></thead><tbody>${weeklyRows}</tbody></table>` : ''}
  <footer>DayNote &middot; personal finance report</footer>
</body></html>`;

      const win = window.open('', '_blank');
      if (!win) { toast('Blocked', 'Allow pop-ups to download the PDF'); return; }
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 300);
    }

    /* ---- manage categories (global markup in finance.html) ---- */
    const categoriesScrim = document.getElementById('categories-modal-scrim');
    const categoriesBody = document.getElementById('categories-body');
    document.getElementById('categories-modal-close').onclick = () => categoriesScrim.classList.remove('open');
    document.getElementById('categories-close-btn').onclick = () => categoriesScrim.classList.remove('open');
    categoriesScrim.onclick = (e) => { if (e.target === categoriesScrim) categoriesScrim.classList.remove('open'); };

    function openCategoriesModal() {
      const categorizing = loadCategorizeEnabled();

      const masterToggleHtml = `
        <div class="cat-master-toggle">
          <div class="cat-master-toggle-lbl">
            <span>Categorize expenses</span>
            <span class="cat-master-toggle-sub">When off, the daily list isn't grouped by category</span>
          </div>
          <button type="button" class="switch finance${categorizing ? ' on' : ''}" id="cat-master-switch"
            aria-label="${categorizing ? 'Turn off' : 'Turn on'} categorization"></button>
        </div>`;

      if (!categorizing) {
        categoriesBody.innerHTML = masterToggleHtml + `
          <div class="empty-state" style="padding:34px 16px;">
            <p>Categorization is off, so today's expenses aren't grouped right now. Switch it back on to see them broken out by category.</p>
          </div>`;
        document.getElementById('cat-master-switch').onclick = () => {
          saveCategorizeEnabled(true);
          openCategoriesModal();
          refresh();
        };
        categoriesScrim.classList.add('open');
        return;
      }

      // Expenses are already broken out by category right on the page
      // (each category gets its own heading with a subtotal in the daily
      // list), so this modal doesn't duplicate that as a second breakdown
      // — it's just the switch plus a quick way to jump to one category.
      const rows = CATEGORIES.map(c => `
        <button type="button" class="cat-filter-row" data-filter-cat="${c.id}">
          <span class="cat-filter-left"><span class="txn-dot" style="background:${c.color}"></span>${c.label}</span>
          <span class="cat-filter-hint">View today &rsaquo;</span>
        </button>`).join('');

      categoriesBody.innerHTML = masterToggleHtml + `<div class="cat-filter-list">${rows}</div>`;

      document.getElementById('cat-master-switch').onclick = () => {
        saveCategorizeEnabled(false);
        activeFilter = null;
        openCategoriesModal();
        refresh();
      };
      categoriesBody.querySelectorAll('[data-filter-cat]').forEach(btn => {
        btn.onclick = () => {
          activeFilter = btn.dataset.filterCat;
          categoriesScrim.classList.remove('open');
          refresh();
        };
      });

      categoriesScrim.classList.add('open');
    }

    /* ---- reset finance data (global markup in finance.html) ---- */
    const resetScrim = document.getElementById('reset-modal-scrim');
    const resetScopeSel = document.getElementById('reset-scope');
    const resetMonthField = document.getElementById('reset-month-field');
    const resetMonthSel = document.getElementById('reset-month');
    const resetWeekField = document.getElementById('reset-week-field');
    const resetWeekSel = document.getElementById('reset-week');
    document.getElementById('reset-modal-close').onclick = () => resetScrim.classList.remove('open');
    document.getElementById('reset-cancel-btn').onclick = () => resetScrim.classList.remove('open');
    resetScrim.onclick = (e) => { if (e.target === resetScrim) resetScrim.classList.remove('open'); };

    function monthsWithData() {
      const set = new Set();
      loadTxns().forEach(t => set.add(monthKeyOf(t.date)));
      Object.keys(loadBudgetHistory()).forEach(k => set.add(k));
      return [...set].sort().reverse();
    }
    function refreshResetWeeks() {
      const monthKey = resetMonthSel.value;
      if (!monthKey) { resetWeekSel.innerHTML = ''; return; }
      const weeks = weeksInMonth(monthKey);
      resetWeekSel.innerHTML = `<option value="">Entire month</option>` + weeks.map((w, i) => `<option value="${i}">Week: ${w.label}</option>`).join('');
    }
    function refreshResetFields() {
      const scope = resetScopeSel.value;
      const show = scope !== 'all';
      resetMonthField.classList.toggle('hidden', !show);
      resetWeekField.classList.toggle('hidden', !show);
      if (!show) return;
      const months = monthsWithData();
      resetMonthSel.innerHTML = months.length ? months.map(m => `<option value="${m}">${monthLabel(m)}</option>`).join('') : `<option value="">No data yet</option>`;
      refreshResetWeeks();
    }
    resetScopeSel.onchange = refreshResetFields;
    resetMonthSel.onchange = refreshResetWeeks;

    function openResetModal() {
      resetScopeSel.value = 'all';
      refreshResetFields();
      resetScrim.classList.add('open');
    }

    document.getElementById('reset-confirm-btn').onclick = () => {
      const scope = resetScopeSel.value;
      if (scope === 'all') {
        if (!confirm('Delete ALL finance data \u2014 every expense, budget plan and report history? This cannot be undone.')) return;
        saveTxns([]);
        saveBudget(defaultBudget());
        saveBudgetHistory({});
        toast('Reset', 'All finance data cleared');
      } else {
        const monthKey = resetMonthSel.value;
        if (!monthKey) return;
        const weekIdx = resetWeekSel.value;
        if (weekIdx === '') {
          if (!confirm(`Delete all data for ${monthLabel(monthKey)}? This cannot be undone.`)) return;
          const { from, to } = monthRange(monthKey);
          saveTxns(loadTxns().filter(t => !(t.date >= from && t.date <= to)));
          const hist = loadBudgetHistory();
          delete hist[monthKey];
          saveBudgetHistory(hist);
          toast('Reset', `${monthLabel(monthKey)} cleared`);
        } else {
          const w = weeksInMonth(monthKey)[Number(weekIdx)];
          if (!w) return;
          if (!confirm(`Delete expenses from ${w.label}? This cannot be undone.`)) return;
          saveTxns(loadTxns().filter(t => !(t.date >= w.from && t.date <= w.to)));
          toast('Reset', 'Week cleared');
        }
      }
      resetScrim.classList.remove('open');
      refresh();
    };

    /* ---- date navigation ---- */
    function goToDate(newDate) {
      selectedDate = newDate;
      expandedId = null;
      dateInput.value = selectedDate;
      refresh();
    }
    dateInput.value = selectedDate;
    dateBtn.onclick = () => { if (dateInput.showPicker) dateInput.showPicker(); else dateInput.focus(); };
    dateInput.onchange = () => { if (dateInput.value) goToDate(dateInput.value); };
    prevBtn.onclick = () => goToDate(addDays(selectedDate, -1));
    nextBtn.onclick = () => goToDate(addDays(selectedDate, 1));


    /* ---- render ---- */
    function refresh() {
      const budget = loadBudget();
      const allDayTxns = loadTxns()
        .filter(t => t.date === selectedDate)
        .sort((a, b) => String(b.id).localeCompare(String(a.id)));
      const dayTxns = activeFilter ? allDayTxns.filter(t => t.category === activeFilter) : allDayTxns;

      const income = budget.income || 0;
      // Income / Expenses / Balance always reflect the whole day, even
      // while a category filter narrows which rows are listed below.
      const expense = allDayTxns.reduce((s, t) => s + t.amount, 0);
      const balance = income - expense;

      if (activeFilter) {
        const cat = CATEGORIES.find(c => c.id === activeFilter);
        filterChip.classList.remove('hidden');
        filterChip.innerHTML = `Filtered: ${escapeHtml(cat ? cat.label : activeFilter)} &nbsp;&#10005;`;
      } else {
        filterChip.classList.add('hidden');
      }

      summaryEl.innerHTML = `
        <div class="finance-seg"><p class="label">Income</p><p class="value" style="color:var(--tasks)">${fmt(income)}</p></div>
        <div class="finance-seg"><p class="label">Expenses</p><p class="value" style="color:var(--danger)">${fmt(expense)}</p></div>
        <div class="finance-seg"><p class="label">Balance</p><p class="value" style="color:${balance >= 0 ? 'var(--tasks)' : 'var(--danger)'}">${balance >= 0 ? '+' : ''}${fmt(balance)}</p></div>
      `;

      dateBtn.textContent = formatDateLabel(selectedDate);

      if (dayTxns.length === 0) {
        const msg = activeFilter
          ? `No ${(CATEGORIES.find(c => c.id === activeFilter) || {}).label || activeFilter} expenses logged for this day.`
          : 'No expenses logged for this day. Tap + to add one.';
        sheetEl.innerHTML = `<div class="empty-state"><div class="glyph">\u20A8</div><p>${escapeHtml(msg)}</p></div>`;
        return;
      }

      sheetEl.innerHTML = '';

      // Builds one expense row as a DOM element — shared by both the flat
      // list and the grouped-by-category view below, so editing, deleting
      // and swipe behavior stay identical either way. In the grouped view
      // the category is already shown once in the group heading, so the
      // row itself replaces that category label with the description,
      // kept in the same single line as the amount and the edit icon
      // (truncated with an ellipsis, tap to expand in place) — no
      // separate icon for the description.
      function buildRow(t, grouped) {
        const cat = CATEGORIES.find(c => c.id === t.category) || CATEGORIES[3];
        const rawDesc = (t.description || '').trim();
        const hasDesc = !!rawDesc;
        const isExpanded = expandedId === t.id;
        const row = document.createElement('div');
        row.className = 'sheet-row';
        row.dataset.id = t.id;

        let belowHtml = '';
        let middleHtml;
        let actionsHtml = `<button type="button" class="icon-btn sheet-edit-btn" aria-label="Edit expense" title="Edit">&#9998;</button>`;
        if (grouped) {
          middleHtml = hasDesc
            ? `<span class="sheet-row-desc-inline${isExpanded ? ' expanded' : ''}" data-desc-toggle="1">${escapeHtml(rawDesc)}</span>`
            : `<span class="sheet-row-desc-inline sheet-row-desc-inline-empty"></span>`;
        } else {
          middleHtml = `<span class="sheet-row-cat"><span class="txn-dot" style="background:${cat.color};display:inline-block;margin-right:6px;"></span>${cat.label}${t.repeat ? `<span class="txn-repeat-badge" title="Repeats ${t.repeat}">&#8635;</span>` : ''}</span>`;
          actionsHtml += `<button type="button" class="sheet-row-chevron-btn" aria-label="Toggle description" aria-expanded="${isExpanded ? 'true' : 'false'}">
                    <span class="sheet-row-chevron">&#8250;</span>
                  </button>`;
          const descText = hasDesc ? escapeHtml(rawDesc) : 'No description';
          belowHtml = `<div class="sheet-row-desc${hasDesc ? '' : ' sheet-row-desc-empty'}">${descText}</div>`;
        }

        row.innerHTML = `
          <div class="sheet-row-clip">
            <div class="sheet-row-delete-bg">
              <button type="button" class="sheet-row-delete-btn" aria-label="Delete expense">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              </button>
            </div>
            <div class="sheet-row-content${isExpanded ? ' expanded' : ''}">
              <div class="sheet-row-main${grouped ? ' grouped' : ''}">
                <span class="sheet-row-amount">${fmt(t.amount)}</span>
                ${middleHtml}
                <div class="sheet-row-actions">
                  ${actionsHtml}
                </div>
              </div>
              ${belowHtml}
            </div>
          </div>
        `;
        const content = row.querySelector('.sheet-row-content');
        const chevronBtn = row.querySelector('.sheet-row-chevron-btn');
        if (chevronBtn) {
          chevronBtn.onclick = (e) => {
            e.stopPropagation();
            expandedId = expandedId === t.id ? null : t.id;
            refresh();
          };
        }
        const descToggle = row.querySelector('[data-desc-toggle]');
        if (descToggle) {
          descToggle.onclick = (e) => {
            e.stopPropagation();
            expandedId = expandedId === t.id ? null : t.id;
            refresh();
          };
        }
        row.querySelector('.sheet-edit-btn').onclick = (e) => { e.stopPropagation(); openExpenseModal(t); };
        row.querySelector('.sheet-row-delete-btn').onclick = (e) => {
          e.stopPropagation();
          saveTxns(loadTxns().filter(x => x.id !== t.id));
          swipedId = null;
          toast('Deleted', 'Expense removed');
          refresh();
        };
        wireSwipe(row, content, t.id);
        return row;
      }

      // When categorization is on (and we're not already narrowed to one
      // category via the filter chip), group the day's rows under a small
      // heading per category instead of one flat chronological list. Each
      // category gets its own boxed sheet — the heading sits above the
      // box, not inside it.
      const categorizing = loadCategorizeEnabled();
      if (categorizing && !activeFilter) {
        const groups = new Map();
        dayTxns.forEach(t => {
          const catId = t.category || 'Others';
          if (!groups.has(catId)) groups.set(catId, []);
          groups.get(catId).push(t);
        });
        CATEGORIES.filter(c => groups.has(c.id)).forEach(cat => {
          const txns = groups.get(cat.id);
          const subtotal = txns.reduce((s, t) => s + t.amount, 0);
          const heading = document.createElement('div');
          heading.className = 'sheet-group-head';
          heading.innerHTML = `
            <span class="sheet-group-name"><span class="txn-dot" style="background:${cat.color};display:inline-block;margin-right:6px;"></span>${cat.label}</span>
            <span class="sheet-group-total">${fmt(subtotal)}</span>`;
          sheetEl.appendChild(heading);
          const box = document.createElement('div');
          box.className = 'sheet-box';
          txns.forEach(t => box.appendChild(buildRow(t, true)));
          sheetEl.appendChild(box);
        });
      } else {
        const box = document.createElement('div');
        box.className = 'sheet-box';
        dayTxns.forEach(t => box.appendChild(buildRow(t, false)));
        sheetEl.appendChild(box);
      }
    }

    function closeSwipe() {
      const openRow = sheetEl.querySelector('.sheet-row-content.swiped');
      if (openRow) { openRow.classList.remove('swiped'); openRow.style.transform = ''; }
      swipedId = null;
    }

    function wireSwipe(row, content, id) {
      const MAX = 64;
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

    container.addEventListener('click', (e) => {
      if (swipedId && !e.target.closest('.sheet-row')) closeSwipe();
    });

    refresh();
  }

  return { render };
})();
