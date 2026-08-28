DayNote — how to open
======================

1. Unzip (if zipped) so all files sit in one folder together:
   index.html, calendar.html, tasks.html, finance.html, journal.html,
   styles.css, data.js, notifications.js, app.js, modals.js,
   journal.canvas.js, cover.art.js, pages.calendar.js, pages.tasks.js,
   pages.finance.js, pages.notes.js, and the assets/covers/ folder
   (10 small images used by the journal's illustrated themes).

2. Double-click index.html — it opens directly in Chrome. No
   install, no server, no build step needed.

What's already working
-----------------------
- Five separate pages, each its own .html file:
    index.html    Home hub — four big buttons that open the sections
    calendar.html Android-style month grid, click a day to see/add
                   events, tasks, or notes on it.
    tasks.html    A dedicated task list (Today / Upcoming / All / Done),
                   backed by the same items you add from the calendar.
    finance.html  Income/expense tracking with a monthly summary.
    journal.html  Journal — freeform notebook pages, with 8 illustrated
                  themes, text/shape/sticker/image/drawing tools, and
                  mixed page styles (blank/dotted/lined/grid, or a
                  photo) that can differ page to page in the same journal.
- index.html's top bar has the hamburger menu, theme icon, and
  profile icon; the same top bar (plus the four buttons in the
  hamburger drawer) appears on all five pages so you can jump
  between sections from anywhere.
- Notifications: when adding/editing an event or task, toggle
  "Notification" and pick same day / 1 day before / 2 days before
  / 1 week before / a fully custom date+time. Chrome will ask for
  notification permission the first time one is due.
- Hamburger menu (top-left, or bottom tab bar on phones) to switch
  between the five sections from any page.
- Profile button (top-right) with Sign out / Delete account —
  currently placeholders (see "Backend" below).
- Theme button (top-right, palette icon) with 11 app-wide color
  themes: 5 neutral (Light, Dark, Maroon, Coffee, Sage) plus 6
  dreamy pastel themes (Blush Bloom, Sage Garden, Lavender Dream,
  Golden Meadow, Dusty Rose, Botanical Cream).

Journal page
------------
- Tap the + to open "New Page": Blank/Dotted/Lined/Grid paper,
  then 8 illustrated themes (Bloom, Verdant, Celestia, Tides,
  Autumn, Indigo, Terra, Wildwood) — each theme creates a 2-page
  journal: an ornate cover page and a quieter matching content
  page, both left blank for you to fill in with the toolbar
  (Text/Shape/Decorate/Image/Draw).
- "Your Own" (last tile in the Themes row) lets you pick any photo
  from your own device as the cover — it's automatically cropped
  to fit the page, no manual resizing needed.
- Any page's background can be changed later too: open the
  Background tool (in the editor's bottom toolbar) and pick a
  color, upload your own photo (also auto-fit to the page), choose
  a plain paper pattern (this clears whatever photo/color was
  there), or clear it back to plain white.
- Bloom/Verdant/Celestia's art is generated locally as vector
  artwork (loads instantly, no internet needed). Tides/Autumn/
  Indigo/Terra/Wildwood are original illustrated PNGs bundled in
  assets/covers/ — also fully local.
- Freehand drawing, undo/redo, real per-selection rich text
  (bold/italic/underline/color/highlight), pinch/wheel zoom + pan,
  and PDF export (needs an internet connection, since that pulls
  in a PDF library) all live in the same toolbar.

Data storage (until the backend is attached)
---------------------------------------------
Everything is saved in the browser's localStorage, scoped to
wherever you're opening the files from. That means:
- Data persists between visits on the same machine/browser.
- It does NOT sync across devices or browsers.
- Theme, profile, and all your data carry over automatically as
  you move between the five pages, since they all read the same
  localStorage.
- Notifications only fire while a DayNote tab is open — real
  "notify me even if the browser is closed" push requires a
  server + service worker.

Wiring up your backend later
-----------------------------
All data access goes through the `DB` object in data.js. Every
page/module calls DB.events, DB.tasks (well, actually tasks are
just DB.events filtered by type), DB.transactions, DB.notes,
DB.getProfile/setProfile, DB.signOut, DB.deleteAccount — nothing
else touches localStorage directly. When your API is ready,
replace the bodies of those methods with fetch() calls; the rest
of the app (calendar, tasks, finance, journal, notifications) needs
no changes. A suggested REST shape is documented at the top of
data.js.
