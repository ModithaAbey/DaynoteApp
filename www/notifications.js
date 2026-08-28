/* ============================================================
   DayNote — Reminders & notifications
   ------------------------------------------------------------
   Reminders are stored as an absolute epoch-ms timestamp
   (`reminder.at`) on an event/task record, computed once when
   the user picks an option like "1 day before at 4:00 PM".

   IMPORTANT LIMITATION (until the backend is attached):
   this only fires while the DayNote tab is open in the browser,
   because it works by polling on a timer. Real "notify me even
   if the browser is closed" push requires a server that sends a
   push message plus a service worker — wire that in alongside
   the backend and swap `pollReminders()` below for a push
   subscription.
   ============================================================ */

const Reminders = (() => {
  let permission = (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported';

  // True only inside the installed native Android app (Capacitor), never
  // in the regular browser or the installed PWA — those keep using the
  // polling fallback below, which only works while the tab is open.
  function isNative() {
    return typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  }

  function nativePlugin() {
    return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications;
  }

  // Turns a DayNote item id (a string like "abc123") into the small
  // integer id Android's notification system requires, by hashing it —
  // same input always produces the same output, so scheduling twice for
  // the same item safely replaces rather than duplicates.
  function toNativeId(itemId) {
    let hash = 0;
    for (let i = 0; i < itemId.length; i++) { hash = (hash * 31 + itemId.charCodeAt(i)) | 0; }
    return Math.abs(hash) % 2147483647;
  }

  async function ensureNativePermission() {
    const plugin = nativePlugin();
    if (!plugin) return false;
    const check = await plugin.checkPermissions();
    if (check.display === 'granted') return true;
    const req = await plugin.requestPermissions();
    return req.display === 'granted';
  }

  // Schedules a real OS-level alarm via Android's AlarmManager (through
  // the Capacitor plugin) — this fires even if DayNote is fully closed,
  // unlike everything else in this file which needs the app open.
  async function scheduleNative(itemId, title, body, atMs) {
    const plugin = nativePlugin();
    if (!plugin || !atMs || atMs <= Date.now()) return;
    const ok = await ensureNativePermission();
    if (!ok) return;
    try {
      await plugin.schedule({
        notifications: [{
          id: toNativeId(itemId),
          title,
          body,
          schedule: { at: new Date(atMs) },
        }],
      });
    } catch (e) { /* ignore — falls back to the in-app poll below */ }
  }

  async function cancelNative(itemId) {
    const plugin = nativePlugin();
    if (!plugin) return;
    try { await plugin.cancel({ notifications: [{ id: toNativeId(itemId) }] }); } catch (e) { /* ignore */ }
  }

  async function ensurePermission() {
    if (isNative()) return ensureNativePermission() ? 'granted' : 'denied';
    if (typeof Notification === 'undefined') return 'unsupported';
    if (Notification.permission === 'default') {
      permission = await Notification.requestPermission();
    } else {
      permission = Notification.permission;
    }
    return permission;
  }

  function fire(title, body) {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try { new Notification(title, { body, icon: undefined }); } catch (e) { /* ignore */ }
    }
    UI.showToast(title, body);
  }

  // Offsets in ms
  const OFFSETS = {
    none: 0,
    on_day: 0,
    one_day: 24 * 60 * 60 * 1000,
    two_days: 2 * 24 * 60 * 60 * 1000,
    one_week: 7 * 24 * 60 * 60 * 1000,
  };

  /**
   * Compute the absolute reminder timestamp.
   * @param {string} dateStr - YYYY-MM-DD of the event/task
   * @param {string} offsetKey - key in OFFSETS, or "custom"
   * @param {string} timeStr - HH:MM the reminder should fire at (for non-custom)
   * @param {string} customDateTime - full "YYYY-MM-DDTHH:MM" when offsetKey === "custom"
   */
  function computeAt(dateStr, offsetKey, timeStr, customDateTime) {
    if (offsetKey === 'custom' && customDateTime) {
      return new Date(customDateTime).getTime();
    }
    const [h, m] = (timeStr || '09:00').split(':').map(Number);
    const base = new Date(dateStr + 'T00:00:00');
    base.setHours(h, m, 0, 0);
    const offset = OFFSETS[offsetKey] ?? 0;
    return base.getTime() - offset;
  }

  function summarize(dateStr, offsetKey, timeStr, customDateTime) {
    const at = computeAt(dateStr, offsetKey, timeStr, customDateTime);
    const d = new Date(at);
    const dateLabel = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const timeLabel = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `Reminds ${dateLabel} at ${timeLabel}`;
  }

  function poll() {
    if (isNative()) return; // native alarms handle firing themselves, even while closed
    const now = Date.now();
    // Tasks live in DB.events too (same collection, type: 'task'), so one
    // scan covers both — DB.tasks is a separate, unused collection and was
    // never actually populated by anything, so reminders on tasks never
    // fired through that branch.
    DB.events.list().forEach(item => {
      const r = item.reminder;
      if (r && r.enabled && !r.fired && r.at <= now) {
        const label = item.type === 'task' ? 'Task due' : 'Reminder';
        fire(`${label}: ${item.title}`, item.notes || 'Coming up now');
        DB.events.update(item.id, { reminder: { ...r, fired: true } });
      }
    });
  }

  function start() {
    poll();
    setInterval(poll, 20000);
  }

  return { ensurePermission, computeAt, summarize, start, scheduleNative, cancelNative, isNative, get permission() { return permission; } };
})();
