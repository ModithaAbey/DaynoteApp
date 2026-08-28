/* ============================================================
   DayNote — Journal page
   ------------------------------------------------------------
   Three views inside #page-root:
     - grid:      dashboard — "Continue writing" (most recent
                  title), a "My Journals" shelf, and a "Templates"
                  shelf. Tap the fab to open the template picker.
     - templates: "New Page" screen — blank paper styles (blank/
                  dotted/lined/grid) plus a handful of pre-filled
                  templates. Tapping any tile creates a title and
                  opens it straight into the editor.
     - editor:    one title at a time. A title can hold several A4
                  pages, navigated via a left thumbnail rail (tap
                  a thumbnail to jump to that page, + at the
                  bottom adds a new one).

   Editor features:
     - every page is a fixed A4 (portrait) proportion, ready for
       PDF export/printing
     - real zoom: pinch scales up to 400% for fine detail work,
       and once zoomed in you can drag to pan around the page
       (drag is disabled at 100% so it never fights normal use)
     - undo/redo, scoped to this editing session
     - text, shape (box/round/note/callout/circle), sticker/tape
       decorations, and image boxes — all draggable, resizable,
       rotatable, duplicable
     - real per-selection rich text: highlight some words inside
       a box and Bold/Italic/Underline/color/highlight apply to
       just that selection (font family, size, and alignment
       apply to the whole box)
     - per-page background (color or your own photo) — this is
       what makes any page work as a fully custom cover
     - a simple freehand drawing layer per page
     - bin icons for every delete action (box / page / title)
   ============================================================ */

Pages.notes = (() => {
  const FONTS = [
    { id: "'Patrick Hand', cursive", label: 'Handwritten' },
    { id: "'Caveat', cursive", label: 'Script' },
    { id: "'Source Serif 4', Georgia, serif", label: 'Serif' },
    { id: "'Inter', sans-serif", label: 'Sans' },
  ];
  const SHAPES = [
    { id: 'rect', label: 'Box', glyph: '&#9645;' },
    { id: 'round', label: 'Round', glyph: '&#9646;' },
    { id: 'note', label: 'Note', glyph: '&#9646;' },
    { id: 'callout', label: 'Callout', glyph: '&#9634;' },
    { id: 'circle', label: 'Circle', glyph: '&#9675;' },
  ];
  const DECOS = [
    { id: 'blossom', label: 'Blossom', glyph: '\u{1F338}' },
    { id: 'leaf', label: 'Leaf', glyph: '\u{1F33F}' },
    { id: 'butterfly', label: 'Butterfly', glyph: '\u{1F98B}' },
    { id: 'sparkle', label: 'Sparkle', glyph: '\u2728' },
    { id: 'heart', label: 'Heart', glyph: '\u2661', color: '#b98d83' },
    { id: 'star', label: 'Star', glyph: '\u2727', color: '#9b866d' },
    { id: 'tape', label: 'Tape', glyph: '&#9645;', tape: true, fill: '#e8c9bd' },
  ];
  const MOODS = [
    { id: 'sunny', label: 'Sunny', glyph: '\u2600\uFE0F' },
    { id: 'cloudy', label: 'Cloudy', glyph: '\u2601\uFE0F' },
    { id: 'rainy', label: 'Rainy', glyph: '\u{1F327}\uFE0F' },
    { id: 'snowy', label: 'Snowy', glyph: '\u2744\uFE0F' },
    { id: 'happy', label: 'Happy', glyph: '\u{1F60A}' },
    { id: 'calm', label: 'Calm', glyph: '\u{1F60C}' },
    { id: 'tired', label: 'Tired', glyph: '\u{1F634}' },
    { id: 'sad', label: 'Sad', glyph: '\u{1F622}' },
  ];
  const PATTERNS = [
    { id: 'blank', label: 'Blank Page' },
    { id: 'dotted', label: 'Dotted Paper' },
    { id: 'lined', label: 'Lined Paper' },
    { id: 'grid', label: 'Grid Paper' },
  ];
  const ZOOM_KEY = 'daynote.noteZoom';
  const ZOOM_MIN = 1, ZOOM_MAX = 4; // never below 100% — the page must always fill its A4 box
  const UNDO_MAX = 30;
  const UNDO_COALESCE_MS = 800;

  function uid(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function setTopbarTitle(text) {
    const el = document.getElementById('topbar-title');
    if (el) el.textContent = text;
  }

  function formatWhen(ts) {
    const d = new Date(ts);
    const now = new Date();
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return `today, ${time}`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function plainPreview(elements) {
    const raw = (elements || []).find(e => (e.type === 'text' || e.type === 'shape') && e.content)?.content || '';
    return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // A4 page's own internal coordinate system (matches what template/box
  // x,y,w,h values are authored against) — used to scale real element
  // positions/sizes down into any small thumbnail box.
  const A4_BASE_W = 340, A4_BASE_H = Math.round(340 * 297 / 210);

  // Draws a lightweight, non-interactive miniature of a page's actual
  // boxes into a thumbnail element — real positions/colors, not just a
  // text snippet. Cheap (plain divs, no screenshot library) so it can
  // re-render on every rail/card refresh.
  function renderMiniPage(hostEl, pageData) {
    hostEl.innerHTML = '';
    const w = hostEl.clientWidth || 56;
    const scale = w / A4_BASE_W;
    (pageData.elements || []).forEach(el => {
      const mini = document.createElement('div');
      mini.className = 'thumb-mini';
      mini.style.left = (el.x * scale) + 'px';
      mini.style.top = (el.y * scale) + 'px';
      mini.style.width = Math.max(2, el.w * scale) + 'px';
      mini.style.height = Math.max(2, el.h * scale) + 'px';
      mini.style.transform = `rotate(${el.rot || 0}deg)`;
      if (el.type === 'image') {
        const img = document.createElement('img');
        img.src = el.src;
        img.alt = '';
        mini.appendChild(img);
      } else if (el.type === 'shape') {
        mini.style.background = el.fill || '#e8ddc9';
        mini.style.border = '0.5px solid ' + (el.border || '#8d7565');
        mini.style.borderRadius = el.shape === 'circle' ? '50%' : '1px';
      } else if (el.type === 'deco' && el.variant === 'tape') {
        mini.style.background = el.fill || '#e8c9bd';
        mini.style.opacity = el.opacity != null ? el.opacity : 0.75;
      } else if (el.type === 'deco') {
        mini.style.background = el.color || '#b98d83';
        mini.style.opacity = 0.6;
        mini.style.borderRadius = '50%';
      } else {
        // plain text block — represented as a soft bar, too small to read
        mini.style.background = 'rgba(73, 55, 45, 0.16)';
        mini.style.borderRadius = '1px';
      }
      hostEl.appendChild(mini);
    });
  }

  // ---- template element builders ----
  function tEl(content, x, y, w, h, fontSize, opts = {}) {
    return { id: uid('e'), type: 'text', x, y, w, h, rot: opts.rot || 0, font: opts.font || "'Caveat', cursive", fontSize, align: opts.align || 'left', content, ...(opts.color ? { color: opts.color } : {}) };
  }
  function sEl(shape, content, x, y, w, h, fill, border, opts = {}) {
    return { id: uid('e'), type: 'shape', shape, x, y, w, h, rot: opts.rot || 0, font: opts.font || "'Inter', sans-serif", fontSize: opts.fontSize || 13, align: opts.align || 'center', content, fill, border };
  }
  function dEl(glyph, x, y, w, h, rot, color, fontSize) {
    return { id: uid('e'), type: 'deco', variant: 'sticker', x, y, w, h, rot, glyph, color, fontSize, opacity: 0.9 };
  }
  function tpEl(x, y, w, h, rot, fill) {
    return { id: uid('e'), type: 'deco', variant: 'tape', x, y, w, h, rot, fill, opacity: 0.75 };
  }

  // ---- one template per theme (Bloom, Verdant, Celestia, Tides, Autumn,
  // Indigo, Terra, Wildwood — see cover_art.js): a themed cover page, plus
  // one themed content page (the same art in its quiet, single-accent
  // form) ready for the user's own writing. No pre-filled layout — just
  // the art; the toolbar (Text/Shape/Decorate/Image) is how the person
  // fills it in, and it's all editable afterwards either way. ----
  const TEMPLATES = Object.entries(CoverArt.categories).map(([catId, cat]) => ({
    id: catId,
    label: cat.label,
    group: 'Themes',
    icon: null,
    pattern: 'blank',
    background: cat.cover,
    pages: [
      { pattern: 'blank', background: cat.cover, build: () => [] },
      { pattern: 'blank', background: cat.content, build: () => [] },
    ],
  }));

  // A title used to just be one page (elements/body/pageSize stored right
  // on the note, sometimes with a 'phone' page size that no longer exists).
  // Fold that into a one-page `pages` array the first time we touch an old
  // record, so old titles keep working — every page is A4 from here on.
  // Turns a page's saved `background` (a plain hex string from older
  // records, or {type:'color'|'image', value, color?}) into an inline
  // style string. Shared by every place that shows a page preview — rail
  // chips, template tiles, and the My Journals / Continue-writing cards —
  // so they all actually reflect what's saved instead of just the dot/
  // line/grid pattern. For an image background, `color` (when present) is
  // applied underneath as a fallback so the preview still looks intentional
  // if the image can't load (offline, blocked, etc.).
  function pageBgStyle(bg) {
    if (!bg) return '';
    if (typeof bg === 'string') return `background-color:${bg};`;
    if (bg.type === 'color') return `background-color:${bg.value};`;
    if (bg.type === 'image') {
      const wash = bg.wash ? `linear-gradient(${bg.wash}, ${bg.wash}),` : '';
      return `background-image:${wash}url('${bg.value}');background-size:cover;background-position:center;${bg.color ? `background-color:${bg.color};` : ''}`;
    }
    return '';
  }
  function normalizeNote(note) {
    if (note.pages && note.pages.length) {
      return {
        ...note, pages: note.pages.map(p => ({
          id: p.id || uid('p'), elements: p.elements || [], drawing: p.drawing || null,
          background: p.background || null, pattern: p.pattern || 'dotted',
        })),
      };
    }
    let elements = note.elements;
    if ((!elements || elements.length === 0) && note.body) {
      elements = [{ id: uid('b'), type: 'text', x: 20, y: 20, w: 240, h: 160, rot: 0, font: "'Patrick Hand', cursive", fontSize: 16, align: 'left', content: note.body }];
    }
    elements = elements || [];
    return { ...note, pages: [{ id: uid('p'), elements, drawing: null, background: null, pattern: 'dotted' }] };
  }

  function render(container) {
    // Every view (grid / template picker / editor) that adds document-level
    // listeners registers a teardown for them via trackCleanup(). Since
    // showGrid/showTemplatePicker/showEditor can each be re-entered many
    // times in one session (switching titles, going back and forth),
    // without this those listeners would silently pile up forever.
    let viewCleanups = [];
    function trackCleanup(fn) { viewCleanups.push(fn); }
    function teardownView() { viewCleanups.forEach(fn => fn()); viewCleanups = []; }

    function createFromTemplate(templateId, patternOverride) {
      const tpl = TEMPLATES.find(t => t.id === templateId);
      if (!tpl) {
        // "Blank Pages" row — no theme, just one page in the chosen paper pattern
        const rec = DB.notes.create({
          title: 'Untitled',
          pages: [{ id: uid('p'), elements: [], drawing: null, background: null, pattern: patternOverride || 'dotted' }],
        });
        showEditor(rec.id);
        return;
      }
      // Themed templates are multi-page: an ornate cover page, then one or
      // more quieter content pages that share the same theme's art.
      const rec = DB.notes.create({
        title: tpl.label,
        themeId: tpl.id,
        pages: tpl.pages.map(p => ({ id: uid('p'), elements: p.build(), drawing: null, background: p.background, pattern: p.pattern })),
      });
      showEditor(rec.id);
    }

    function showGrid() {
      teardownView();
      setTopbarTitle('DayNote');
      const notes = [...DB.notes.list()].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
      const mostRecent = notes[0] ? normalizeNote(notes[0]) : null;

      container.innerHTML = `
        <div class="page-head">
          <div>
            <p class="eyebrow">Pages</p>
            <h1 class="page-title font-display font-hand">Journal</h1>
          </div>
        </div>
        ${mostRecent ? `
        <p class="journal-section-label">Continue writing</p>
        <div class="continue-card" id="continue-card">
          <div class="continue-card-thumb pattern-${mostRecent.pages[0]?.pattern || 'dotted'}" style="${pageBgStyle(mostRecent.pages[0]?.background)}"></div>
          <div class="continue-card-body">
            <div class="continue-card-title">${UI.escapeHtml(mostRecent.title || 'Untitled')}</div>
            <div class="continue-card-meta">Last edited ${formatWhen(mostRecent.updatedAt || mostRecent.createdAt)}</div>
            <button type="button" class="btn continue-card-btn" id="continue-card-btn">Continue Editing</button>
          </div>
        </div>` : ''}
        <div class="journal-section-head">
          <p class="journal-section-label">My Journals</p>
        </div>
        <div class="journal-shelf" id="journal-shelf"></div>
        <div class="journal-section-head">
          <p class="journal-section-label">Templates</p>
          <button type="button" class="journal-see-all" id="templates-see-all">See all</button>
        </div>
        <div class="journal-shelf" id="templates-shelf"></div>
        <button class="fab notes-fab" id="note-fab" aria-label="New title" title="New title"><span class="notes-fab-plus"></span></button>
      `;
      const $ = sel => container.querySelector(sel);
      $('#note-fab').onclick = () => showTemplatePicker();
      $('#templates-see-all').onclick = () => showTemplatePicker();
      if (mostRecent) {
        $('#continue-card-btn').onclick = () => showEditor(mostRecent.id);
        $('#continue-card').onclick = () => showEditor(mostRecent.id);
        renderMiniPage($('#continue-card').querySelector('.continue-card-thumb'), mostRecent.pages[0] || { elements: [] });
      }

      const shelf = $('#journal-shelf');
      if (notes.length === 0) {
        shelf.innerHTML = `<div class="empty-state"><div class="glyph">\u270E</div><p>No pages yet. Tap + to start your first one.</p></div>`;
      } else {
        shelf.innerHTML = '';
        notes.forEach(n => {
          const note = normalizeNote(n);
          const firstPage = note.pages[0] || { elements: [] };
          const preview = plainPreview(firstPage.elements);
          const card = document.createElement('div');
          card.className = 'note-card shelf-card';
          const d = new Date(n.updatedAt || n.createdAt);
          card.innerHTML = `
            <div class="note-card-thumb pattern-${firstPage.pattern || 'dotted'}" style="${pageBgStyle(firstPage.background)}"></div>
            <div class="note-title">${UI.escapeHtml(n.title || 'Untitled')}</div>
            <div class="note-snippet">${UI.escapeHtml(preview)}</div>
            <div class="note-meta">${note.pages.length} page${note.pages.length === 1 ? '' : 's'} &middot; ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
          `;
          card.onclick = () => showEditor(n.id);
          shelf.appendChild(card);
          renderMiniPage(card.querySelector('.note-card-thumb'), firstPage);
        });
      }

      // Dashboard preview — one tile per theme; "See all" opens the full
      // picker (same 8 tiles plus the blank-paper and upload-your-own options).
      const templatesShelf = $('#templates-shelf');
      templatesShelf.innerHTML = '';
      TEMPLATES.forEach(t => {
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'tpl-tile shelf-tpl-tile';
        tile.innerHTML = `<div class="tpl-tile-preview pattern-${t.pattern}" style="${pageBgStyle(t.background)}"></div><span class="tpl-tile-label">${t.label}</span>`;
        tile.onclick = () => createFromTemplate(t.id);
        templatesShelf.appendChild(tile);
      });
    }

    // Creates a 2-page note (cover + a plain paper page to keep writing on)
    // from a user-supplied photo. `background-size:cover` (applied by
    // applyPatternAndBackground/pageBgStyle, same as every other cover)
    // means whatever the person picks is auto-cropped to the page's A4
    // proportions — no manual resizing needed on their end.
    function createFromCustomImage(dataUrl) {
      const rec = DB.notes.create({
        title: 'Untitled',
        pages: [
          { id: uid('p'), elements: [], drawing: null, background: { type: 'image', value: dataUrl }, pattern: 'blank' },
          { id: uid('p'), elements: [], drawing: null, background: null, pattern: 'dotted' },
        ],
      });
      showEditor(rec.id);
    }

    function showTemplatePicker() {
      teardownView();
      setTopbarTitle('New Page');
      container.innerHTML = `
        <div class="tpl-head">
          <button class="icon-btn" id="tpl-back-btn" title="Back" aria-label="Back">&larr;</button>
          <h1 class="tpl-page-title font-display">New Page</h1>
        </div>
        <p class="journal-section-label">Blank Pages</p>
        <div class="tpl-row" id="tpl-blank-row"></div>
        <p class="journal-section-label">Themes</p>
        <div class="tpl-row" id="tpl-theme-row"></div>
        <input type="file" id="tpl-custom-input" accept="image/*" hidden />
      `;
      const $ = sel => container.querySelector(sel);
      $('#tpl-back-btn').onclick = () => showGrid();

      const blankRow = $('#tpl-blank-row');
      PATTERNS.forEach(p => {
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'tpl-tile';
        tile.innerHTML = `<div class="tpl-tile-preview pattern-${p.id}"></div><span class="tpl-tile-label">${p.label}</span>`;
        tile.onclick = () => createFromTemplate(null, p.id);
        blankRow.appendChild(tile);
      });

      const themeRow = $('#tpl-theme-row');
      TEMPLATES.forEach(t => {
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'tpl-tile';
        tile.innerHTML = `<div class="tpl-tile-preview pattern-${t.pattern}" style="${pageBgStyle(t.background)}"></div><span class="tpl-tile-label">${t.label}</span>`;
        tile.onclick = () => createFromTemplate(t.id);
        themeRow.appendChild(tile);
      });
      // "Your Own" — pick any photo from the gallery as the cover; it's
      // auto-fit to the page the same way every other cover art is.
      const customInput = $('#tpl-custom-input');
      const customTile = document.createElement('button');
      customTile.type = 'button';
      customTile.className = 'tpl-tile tpl-tile-custom';
      customTile.innerHTML = `<div class="tpl-tile-preview tpl-tile-upload"><span class="tpl-tile-plus">+</span></div><span class="tpl-tile-label">Your Own</span>`;
      customTile.onclick = () => customInput.click();
      themeRow.appendChild(customTile);
      customInput.onchange = () => {
        const file = customInput.files && customInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => createFromCustomImage(reader.result);
        reader.readAsDataURL(file);
        customInput.value = '';
      };
    }

    function showEditor(noteId) {
      teardownView();
      let note = DB.notes.get(noteId);
      if (!note) { showGrid(); return; }
      note = normalizeNote(note);

      // Working copy — each entry is { id, elements, drawing, background,
      // pattern }. Pan/zoom are view-only and never saved.
      let pages = note.pages.map(p => ({ id: p.id, elements: p.elements || [], drawing: p.drawing || null, background: p.background || null, pattern: p.pattern || 'dotted' }));
      // Clamp in case an old session left a sub-100% value in storage —
      // that's what caused the page to look smaller than its own box.
      let zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, parseFloat(localStorage.getItem(ZOOM_KEY)) || 1));
      localStorage.setItem(ZOOM_KEY, zoom);
      let pan = { x: 0, y: 0 };
      // The page-window's on-screen box is responsive (min(300px,78vw)), but
      // every element on a page is positioned in raw px against a fixed
      // A4_BASE_W/A4_BASE_H design canvas. fitScale is the ratio between
      // the two — applied as part of the frame's transform so the full
      // page always shows, instead of the design canvas overflowing past
      // whatever the actual (usually narrower) window box happens to be.
      let fitScale = 1;
      let activeIndex = 0;
      let drawModeOn = false;
      let activeCanvas = null; // JournalCanvas instance for whichever page is on screen

      let undoStack = [];
      let redoStack = [];
      let lastPushAt = 0;

      setTopbarTitle(note.title || 'Untitled');

      container.innerHTML = `
        <div class="editor-toolbar">
          <button class="icon-btn" id="editor-back-btn" title="Back" aria-label="Back">&larr;</button>
          <input type="text" class="editor-title-input" id="editor-title-input" placeholder="Untitled" maxlength="120" />
          <button class="icon-btn" id="editor-undo-btn" title="Undo" aria-label="Undo">&#8617;</button>
          <button class="icon-btn" id="editor-redo-btn" title="Redo" aria-label="Redo">&#8618;</button>
          <div class="editor-more-wrap">
            <button class="icon-btn" id="editor-more-btn" title="More" aria-label="More">&#8942;</button>
            <div class="popover" id="editor-more-popover">
              <button type="button" class="popover-item" id="editor-pdf-btn"><span>&#8681;</span><span>Export PDF</span></button>
              <div class="popover-divider"></div>
              <button type="button" class="popover-item danger" id="editor-delete-btn"><span>&#128465;</span><span>Delete</span></button>
            </div>
          </div>
        </div>
        <div class="editor-body" id="editor-body">
          <div class="page-rail" id="page-rail">
            <div class="page-rail-list" id="page-rail-list"></div>
            <button type="button" class="page-rail-add" id="page-rail-add" title="Add page" aria-label="Add page"><span class="page-rail-add-plus" aria-hidden="true"></span></button>
            <div class="popover footer-popover" id="page-type-popover">
              <div class="popover-label">New page</div>
              ${PATTERNS.map(p => `<button type="button" class="popover-item" data-pattern="${p.id}"><span>&#128196;</span><span>${p.label}</span></button>`).join('')}
            </div>
          </div>
          <div class="page-viewport" id="editor-viewport">
            <div class="page-window" id="page-window">
              <div class="page-frame" id="page-frame"></div>
            </div>
          </div>
        </div>
        <div class="editor-footer" id="editor-footer">
          <button type="button" class="tool-chip" id="add-text-btn" title="Add text">
            <span class="tool-chip-icon">T</span><span class="tool-chip-label">Text</span>
          </button>
          <div class="editor-more-wrap">
            <button type="button" class="tool-chip" id="add-shape-btn" title="Add shape">
              <span class="tool-chip-icon">&#9645;</span><span class="tool-chip-label">Shape</span>
            </button>
            <div class="popover footer-popover" id="shape-popover">
              ${SHAPES.map(s => `<button type="button" class="popover-item" data-shape="${s.id}"><span>${s.glyph}</span><span>${s.label}</span></button>`).join('')}
            </div>
          </div>
          <div class="editor-more-wrap">
            <button type="button" class="tool-chip" id="add-deco-btn" title="Add decoration">
              <span class="tool-chip-icon">&#10047;</span><span class="tool-chip-label">Decorate</span>
            </button>
            <div class="popover footer-popover" id="deco-popover">
              <div class="popover-label">Stickers</div>
              ${DECOS.map(d => `<button type="button" class="popover-item" data-deco="${d.id}"><span>${d.glyph}</span><span>${d.label}</span></button>`).join('')}
              <div class="popover-divider"></div>
              <div class="popover-label">Stamps</div>
              <button type="button" class="popover-item" id="deco-date-stamp"><span>&#128197;</span><span>Today's date</span></button>
              <div class="popover-divider"></div>
              <div class="popover-label">Mood &amp; weather</div>
              ${MOODS.map(d => `<button type="button" class="popover-item" data-mood="${d.id}"><span>${d.glyph}</span><span>${d.label}</span></button>`).join('')}
            </div>
          </div>
          <button type="button" class="tool-chip" id="add-image-btn" title="Add image">
            <span class="tool-chip-icon">&#128247;</span><span class="tool-chip-label">Image</span>
          </button>
          <div class="editor-more-wrap">
            <button type="button" class="tool-chip" id="bg-btn" title="Page background">
              <span class="tool-chip-icon">&#127912;</span><span class="tool-chip-label">Background</span>
            </button>
            <div class="popover footer-popover" id="bg-popover">
              <div class="popover-label">Page background</div>
              <div style="display:flex;align-items:center;gap:10px;padding:6px 12px;">
                <input type="color" id="bg-color-input" value="#f6efe2" title="Background color" />
                <span style="font-size:.78rem;color:var(--ink-soft);">Color</span>
              </div>
              <button type="button" class="popover-item" id="bg-upload-item"><span>&#128247;</span><span>Upload image</span></button>
              <div class="popover-divider"></div>
              <div class="popover-label">Paper pattern</div>
              ${PATTERNS.map(p => `<button type="button" class="popover-item" data-bg-pattern="${p.id}"><span>&#128196;</span><span>${p.label}</span></button>`).join('')}
              <div class="popover-divider"></div>
              <button type="button" class="popover-item danger" id="bg-clear-item"><span>&#10005;</span><span>Clear background</span></button>
            </div>
          </div>
          <button type="button" class="tool-chip" id="draw-toggle-btn" title="Draw">
            <span class="tool-chip-icon">&#9998;</span><span class="tool-chip-label">Draw</span>
          </button>
          <div class="tool-chip tool-chip-static" id="draw-style-chip" style="display:none;">
            <div class="richtext-controls">
              <button type="button" class="zoom-btn draw-tool-btn active" id="draw-tool-pen" title="Pen">&#9998;</button>
              <button type="button" class="zoom-btn draw-tool-btn" id="draw-tool-highlighter" title="Highlighter">&#128998;</button>
              <button type="button" class="zoom-btn draw-tool-btn" id="draw-tool-eraser" title="Eraser">&#9003;</button>
              <input type="color" id="draw-color" value="#49372d" title="Brush color" />
              <input type="range" id="draw-size" min="1" max="24" value="4" title="Brush size" />
            </div>
            <span class="tool-chip-label">Brush</span>
          </div>
          <div class="tool-chip tool-chip-static">
            <div class="richtext-controls">
              <input type="color" id="rt-color" value="#302923" title="Text color (selection)" />
            </div>
            <span class="tool-chip-label">Text color</span>
          </div>
          <div class="tool-chip tool-chip-static">
            <div class="richtext-controls">
              <input type="color" id="rt-highlight" value="#fff2a8" title="Highlight color (selection)" />
            </div>
            <span class="tool-chip-label">Highlight</span>
          </div>
          <div class="tool-chip tool-chip-static" id="shape-fill-chip" style="display:none;">
            <div class="richtext-controls">
              <input type="color" id="shape-fill" value="#f5eee8" title="Shape fill color" />
            </div>
            <span class="tool-chip-label">Fill</span>
          </div>
          <div class="tool-chip tool-chip-static" id="shape-border-chip" style="display:none;">
            <div class="richtext-controls">
              <input type="color" id="shape-border" value="#8d7565" title="Shape border color" />
            </div>
            <span class="tool-chip-label">Outline</span>
          </div>
          <div class="tool-chip tool-chip-static">
            <div class="richtext-controls">
              <button type="button" class="zoom-btn" id="rt-bold" title="Bold (selection)"><b>B</b></button>
              <button type="button" class="zoom-btn" id="rt-italic" title="Italic (selection)"><i>I</i></button>
              <button type="button" class="zoom-btn" id="rt-underline" title="Underline (selection)"><u>U</u></button>
            </div>
            <span class="tool-chip-label">Style</span>
          </div>
          <div class="tool-chip tool-chip-static">
            <div class="richtext-controls">
              <button type="button" class="zoom-btn" id="rt-bullet" title="Bullet list">&#8226;</button>
              <button type="button" class="zoom-btn" id="rt-numbered" title="Numbered list">1.</button>
              <button type="button" class="zoom-btn" id="rt-letter" title="Lettered list">a.</button>
              <button type="button" class="zoom-btn rt-checklist-btn" id="rt-checklist" title="Checklist item">&#9744;</button>
            </div>
            <span class="tool-chip-label">List</span>
          </div>
          <div class="tool-chip tool-chip-static">
            <div class="richtext-controls">
              <button type="button" class="zoom-btn" id="align-left" title="Align left">L</button>
              <button type="button" class="zoom-btn" id="align-center" title="Align center">C</button>
              <button type="button" class="zoom-btn" id="align-right" title="Align right">R</button>
            </div>
            <span class="tool-chip-label">Align</span>
          </div>
          <div class="tool-chip tool-chip-static">
            <select class="font-select" id="font-select"></select>
            <span class="tool-chip-label">Font</span>
          </div>
          <div class="tool-chip tool-chip-static">
            <div class="font-size-controls">
              <button type="button" class="zoom-btn" id="font-size-down" title="Decrease font size" aria-label="Decrease font size">A&#8595;</button>
              <button type="button" class="zoom-btn" id="font-size-up" title="Increase font size" aria-label="Increase font size">A&#8593;</button>
            </div>
            <span class="tool-chip-label">Size</span>
          </div>
          <button type="button" class="tool-chip" id="duplicate-btn" title="Duplicate">
            <span class="tool-chip-icon">&#10064;</span><span class="tool-chip-label">Copy</span>
          </button>
          <div class="tool-chip tool-chip-static">
            <span class="zoom-label" id="editor-zoom-label">100%</span>
            <span class="tool-chip-label">Zoom</span>
          </div>
        </div>
      `;
      const $ = sel => container.querySelector(sel);

      $('#editor-back-btn').onclick = () => { showGrid(); };

      // ---- title ----
      const titleInput = $('#editor-title-input');
      titleInput.value = note.title || '';
      let titleSaveTimer = null;
      titleInput.addEventListener('input', () => {
        setTopbarTitle(titleInput.value.trim() || 'Untitled');
        clearTimeout(titleSaveTimer);
        titleSaveTimer = setTimeout(() => {
          DB.notes.update(noteId, { title: titleInput.value.trim() || 'Untitled' });
        }, 300);
      });

      // ---- popovers: "..." menu, shape picker, decoration picker, background
      // picker, new-page-type picker. The last four are triggered from
      // inside .editor-footer, which scrolls sideways and has
      // overflow-y:hidden — the default position:absolute popover was
      // being silently clipped there (it opened, it just wasn't visible).
      // These are positioned as position:fixed off the trigger button's
      // live on-screen rect instead, so they escape that clipping. ----
      const moreBtn = $('#editor-more-btn');
      const morePop = $('#editor-more-popover');
      const shapeBtn = $('#add-shape-btn');
      const shapePop = $('#shape-popover');
      const decoBtn = $('#add-deco-btn');
      const decoPop = $('#deco-popover');
      const bgBtn = $('#bg-btn');
      const bgPop = $('#bg-popover');
      const railAddBtn = $('#page-rail-add');
      const pageTypePop = $('#page-type-popover');
      function closeAllPopovers(except) {
        [morePop, shapePop, decoPop, bgPop, pageTypePop].forEach(p => { if (p !== except) p.classList.remove('open'); });
      }
      function onPopoverOutsideClick(e) {
        if (!morePop.contains(e.target) && e.target !== moreBtn) morePop.classList.remove('open');
        if (!shapePop.contains(e.target) && e.target !== shapeBtn) shapePop.classList.remove('open');
        if (!decoPop.contains(e.target) && e.target !== decoBtn) decoPop.classList.remove('open');
        if (!bgPop.contains(e.target) && e.target !== bgBtn) bgPop.classList.remove('open');
        if (!pageTypePop.contains(e.target) && e.target !== railAddBtn) pageTypePop.classList.remove('open');
      }
      // Places a footer popover just under (or, if there's no room, just
      // above) whichever button opened it, clamped to stay on-screen.
      function positionFooterPopover(btn, pop) {
        const r = btn.getBoundingClientRect();
        pop.style.right = 'auto';
        const popW = pop.offsetWidth || 200, popH = pop.offsetHeight || 160;
        const left = Math.max(8, Math.min(r.left, window.innerWidth - popW - 8));
        let top = r.bottom + 8;
        if (top + popH > window.innerHeight - 8) top = Math.max(8, r.top - popH - 8);
        pop.style.left = left + 'px';
        pop.style.top = top + 'px';
      }
      function toggleFooterPopover(btn, pop) {
        const willOpen = !pop.classList.contains('open');
        closeAllPopovers();
        if (willOpen) { pop.classList.add('open'); positionFooterPopover(btn, pop); }
      }
      moreBtn.onclick = (e) => { e.stopPropagation(); closeAllPopovers(morePop); morePop.classList.toggle('open'); };
      shapeBtn.onclick = (e) => { e.stopPropagation(); toggleFooterPopover(shapeBtn, shapePop); };
      decoBtn.onclick = (e) => { e.stopPropagation(); toggleFooterPopover(decoBtn, decoPop); };
      bgBtn.onclick = (e) => { e.stopPropagation(); toggleFooterPopover(bgBtn, bgPop); };
      railAddBtn.onclick = (e) => { e.stopPropagation(); toggleFooterPopover(railAddBtn, pageTypePop); };
      pageTypePop.querySelectorAll('.popover-item').forEach(btn => {
        btn.onclick = () => { pageTypePop.classList.remove('open'); addPage(btn.dataset.pattern); };
      });
      document.addEventListener('click', onPopoverOutsideClick);
      trackCleanup(() => document.removeEventListener('click', onPopoverOutsideClick));
      shapePop.querySelectorAll('.popover-item').forEach(btn => {
        btn.onclick = () => {
          shapePop.classList.remove('open');
          activeCanvas?.addShape(btn.dataset.shape);
        };
      });
      decoPop.querySelectorAll('.popover-item').forEach(btn => {
        btn.onclick = () => {
          decoPop.classList.remove('open');
          if (btn.id === 'deco-date-stamp') {
            const label = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            activeCanvas?.addDeco({ glyph: label, color: '#5c4a3d', fontSize: 15, w: 92, h: 34 });
            return;
          }
          if (btn.dataset.mood) {
            const m = MOODS.find(x => x.id === btn.dataset.mood);
            if (m) activeCanvas?.addDeco({ glyph: m.glyph, fontSize: 32, w: 56, h: 56 });
            return;
          }
          const d = DECOS.find(x => x.id === btn.dataset.deco);
          if (!d) return;
          if (d.tape) activeCanvas?.addTape({ fill: d.fill });
          else activeCanvas?.addDeco({ glyph: d.glyph, color: d.color });
        };
      });

      $('#editor-delete-btn').onclick = () => {
        morePop.classList.remove('open');
        if (confirm('Delete this title and all its pages?')) {
          DB.notes.remove(noteId);
          showGrid();
        }
      };

      // ---- saving ----
      let saveTimer = null;
      function scheduleSave() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          DB.notes.update(noteId, { pages: pages.map(p => ({ id: p.id, elements: p.elements, drawing: p.drawing, background: p.background, pattern: p.pattern })) });
        }, 250);
      }

      // ---- undo / redo ----
      const undoBtn = $('#editor-undo-btn');
      const redoBtn = $('#editor-redo-btn');
      function updateUndoRedoButtons() {
        undoBtn.disabled = undoStack.length === 0;
        redoBtn.disabled = redoStack.length === 0;
        undoBtn.classList.toggle('disabled', undoStack.length === 0);
        redoBtn.classList.toggle('disabled', redoStack.length === 0);
      }
      function snapshotPages() { return JSON.parse(JSON.stringify(pages)); }
      function pushUndo() {
        const now = Date.now();
        if (now - lastPushAt > UNDO_COALESCE_MS) {
          undoStack.push(snapshotPages());
          if (undoStack.length > UNDO_MAX) undoStack.shift();
          redoStack.length = 0;
          updateUndoRedoButtons();
        }
        lastPushAt = now;
      }
      function undo() {
        if (!undoStack.length) return;
        const prev = undoStack.pop();
        redoStack.push(snapshotPages());
        if (redoStack.length > UNDO_MAX) redoStack.shift();
        pages = prev;
        activeIndex = Math.min(activeIndex, pages.length - 1);
        lastPushAt = 0;
        renderActivePage();
        scheduleSave();
        updateUndoRedoButtons();
      }
      function redo() {
        if (!redoStack.length) return;
        const next = redoStack.pop();
        undoStack.push(snapshotPages());
        if (undoStack.length > UNDO_MAX) undoStack.shift();
        pages = next;
        activeIndex = Math.min(activeIndex, pages.length - 1);
        lastPushAt = 0;
        renderActivePage();
        scheduleSave();
        updateUndoRedoButtons();
      }
      undoBtn.onclick = undo;
      redoBtn.onclick = redo;
      updateUndoRedoButtons();

      // ---- single active page: rail on the left, one page shown at a time ----
      const win = $('#page-window');
      const viewport = $('#editor-viewport');
      const railList = $('#page-rail-list');
      window.addEventListener('resize', updateFitScale);
      trackCleanup(() => window.removeEventListener('resize', updateFitScale));

      function applyFrameTransform() {
        const frame = $('#page-frame');
        if (!frame) return;
        frame.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${fitScale * zoom})`;
      }
      // Keeps the design canvas (.page-frame) at a fixed A4_BASE_W/H native
      // size — matching the raw px every box is positioned in — and instead
      // scales that whole frame down to fit whatever size .page-window is
      // actually rendered at. Without this, the frame silently stretched to
      // the window's (smaller) box while children kept their full-size
      // coordinates, so only the top-left portion of the page was visible
      // and text ran off the right edge. Re-run on resize since the
      // window's box (min(300px,78vw)) changes with viewport width.
      function updateFitScale() {
        const frame = $('#page-frame');
        if (!frame || !win) return;
        frame.style.width = A4_BASE_W + 'px';
        frame.style.height = A4_BASE_H + 'px';
        const winWidth = win.clientWidth || A4_BASE_W;
        fitScale = winWidth / A4_BASE_W;
        applyFrameTransform();
      }
      function applyZoomUI() {
        applyFrameTransform();
        const zoomLabel = $('#editor-zoom-label');
        if (zoomLabel) zoomLabel.textContent = Math.round(zoom * 100) + '%';
        win.classList.toggle('zoomed', zoom > 1);
      }
      function setZoom(z) {
        zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +z.toFixed(2)));
        localStorage.setItem(ZOOM_KEY, zoom);
        pan = { x: 0, y: 0 };
        applyZoomUI();
      }
      function clampPan() {
        const w = win.clientWidth, h = win.clientHeight;
        const minX = Math.min(0, w - w * zoom);
        const minY = Math.min(0, h - h * zoom);
        pan.x = Math.max(minX, Math.min(0, pan.x));
        pan.y = Math.max(minY, Math.min(0, pan.y));
      }

      function applyPatternAndBackground(frame, pageData) {
        PATTERNS.forEach(p => frame.classList.remove('pattern-' + p.id));
        frame.classList.add('pattern-' + (pageData.pattern || 'dotted'));
        const bg = pageData.background;
        if (bg && bg.type === 'image') {
          // Cover templates layer a soft, semi-transparent tint (`wash`)
          // over their botanical photo so it reads as pale and dreamy
          // instead of a stark high-contrast picture, and stays legible
          // under the title text.
          const wash = bg.wash ? `linear-gradient(${bg.wash}, ${bg.wash}), ` : '';
          frame.style.backgroundImage = `${wash}url("${bg.value}")`;
          frame.style.backgroundSize = 'cover';
          frame.style.backgroundPosition = 'center';
          // A tinted fallback (used by cover templates) shows through if the
          // image is slow or fails to load, instead of leaving the page white.
          frame.style.backgroundColor = bg.color || '';
        } else if (bg && bg.type === 'color') {
          frame.style.backgroundImage = '';
          frame.style.backgroundColor = bg.value;
        } else {
          frame.style.backgroundImage = '';
          frame.style.backgroundColor = '';
        }
      }

      function renderActivePage() {
        const pageData = pages[activeIndex];
        if (!pageData) return;
        const frame = $('#page-frame');
        frame.innerHTML = '';
        applyPatternAndBackground(frame, pageData);
        pan = { x: 0, y: 0 };
        // Give the frame its real fixed A4 design size *before* JournalCanvas
        // mounts and creates the draw-layer <canvas> — that canvas reads the
        // frame's current box to size its own pixel buffer, so if it mounts
        // first (while the frame is still whatever ad-hoc size CSS gave it)
        // the buffer ends up smaller than the design canvas and every stroke
        // is drawn in the wrong place once the browser stretches it to fit.
        updateFitScale();
        activeCanvas = JournalCanvas.mount(
          frame,
          { elements: pageData.elements, drawing: pageData.drawing },
          {
            onElementsChange: (els) => { pushUndo(); pageData.elements = els; scheduleSave(); },
            onDrawingChange: (dataUrl) => { pushUndo(); pageData.drawing = dataUrl; scheduleSave(); },
            // Drag/resize/draw math converts screen-pixel movement into the
            // frame's native coordinate space, so it needs the *total*
            // visual scale (responsive fit + pinch zoom), not just zoom.
            getZoom: () => fitScale * zoom,
            onSelectionChange: (type) => {
              const show = type === 'shape' ? 'flex' : 'none';
              if (shapeFillChip) shapeFillChip.style.display = show;
              if (shapeBorderChip) shapeBorderChip.style.display = show;
            },
          }
        );
        activeCanvas.setDrawMode(drawModeOn);
        // Each fresh mount starts its draw tool back at 'pen' internally,
        // so keep the pen/highlighter/eraser buttons' active state in sync
        // instead of showing a stale selection from the previous page.
        const penBtn = $('#draw-tool-pen');
        if (penBtn) {
          $('#draw-tool-highlighter')?.classList.remove('active');
          $('#draw-tool-eraser')?.classList.remove('active');
          penBtn.classList.add('active');
        }
        updateFitScale();
        applyZoomUI();
        renderRail();
      }

      function renderRail() {
        railList.innerHTML = '';
        pages.forEach((p, i) => {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'page-chip' + (i === activeIndex ? ' active' : '');
          const bgStyle = pageBgStyle(p.background);
          chip.innerHTML = `
            <div class="page-chip-thumb pattern-${p.pattern || 'dotted'}" style="${bgStyle}"></div>
            <span class="page-chip-num">${i + 1}</span>
            ${pages.length > 1 ? `<button type="button" class="page-chip-del" title="Delete this page" aria-label="Delete this page">&#128465;</button>` : ''}
          `;
          chip.onclick = () => switchToPage(i);
          const delBtn = chip.querySelector('.page-chip-del');
          if (delBtn) {
            delBtn.onclick = (e) => {
              e.stopPropagation();
              if (!confirm('Delete this page?')) return;
              pushUndo();
              pages.splice(i, 1);
              activeIndex = Math.min(activeIndex, pages.length - 1);
              renderActivePage();
              scheduleSave();
            };
          }
          railList.appendChild(chip);
          renderMiniPage(chip.querySelector('.page-chip-thumb'), p);
        });
      }

      function switchToPage(i) {
        if (i === activeIndex) return;
        activeIndex = Math.max(0, Math.min(i, pages.length - 1));
        renderActivePage();
      }

      function addPage(pattern) {
        pushUndo();
        // Themed journals (Bloom, Tides, Terra, ...) keep using that theme's
        // quiet "content" art on every page added afterwards, not just the
        // one content page the template started with — so the paper-style
        // choice from the popover is skipped in favor of staying on-theme.
        const themeCat = note.themeId && CoverArt.categories[note.themeId];
        if (themeCat) {
          pages.push({ id: uid('p'), elements: [], drawing: null, background: themeCat.content, pattern: 'blank' });
        } else {
          pages.push({ id: uid('p'), elements: [], drawing: null, background: null, pattern: pattern || 'dotted' });
        }
        activeIndex = pages.length - 1;
        renderActivePage();
        scheduleSave();
      }

      // Single-finger / mouse panning, only once zoom > 1 and not drawing.
      let panning = false, panStartX = 0, panStartY = 0, panStartPX = 0, panStartPY = 0;
      win.addEventListener('pointerdown', (e) => {
        if (drawModeOn) return;
        if (zoom <= 1) return;
        if (e.target.closest('.canvas-box')) return;
        panning = true;
        panStartX = e.clientX; panStartY = e.clientY;
        panStartPX = pan.x; panStartPY = pan.y;
      });
      function onPanMove(e) {
        if (!panning) return;
        pan.x = panStartPX + (e.clientX - panStartX);
        pan.y = panStartPY + (e.clientY - panStartY);
        clampPan();
        applyFrameTransform();
      }
      function onPanEnd() { panning = false; }
      document.addEventListener('pointermove', onPanMove);
      document.addEventListener('pointerup', onPanEnd);
      document.addEventListener('pointercancel', onPanEnd);
      trackCleanup(() => {
        document.removeEventListener('pointermove', onPanMove);
        document.removeEventListener('pointerup', onPanEnd);
        document.removeEventListener('pointercancel', onPanEnd);
      });

      renderActivePage();

      // ---- tools (act on the currently displayed page) ----
      $('#add-text-btn').onclick = () => activeCanvas?.addText();
      $('#add-image-btn').onclick = () => document.getElementById('journal-image-input').click();
      $('#duplicate-btn').onclick = () => activeCanvas?.duplicateSelected();

      const imageInput = document.getElementById('journal-image-input');
      imageInput.value = '';
      imageInput.onchange = () => {
        const file = imageInput.files && imageInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => activeCanvas?.addImage(reader.result);
        reader.readAsDataURL(file);
        imageInput.value = '';
      };

      // ---- page background (this is what makes a page work as a fully
      // custom cover — a color or a full-bleed uploaded photo behind
      // everything else, which is still just text/shape/image boxes on top) ----
      const bgColorInput = $('#bg-color-input');
      const bgUploadItem = $('#bg-upload-item');
      const bgClearItem = $('#bg-clear-item');
      const bgFileInput = document.getElementById('journal-bg-input');
      function setPageBackground(bg) {
        pushUndo();
        pages[activeIndex].background = bg;
        applyPatternAndBackground($('#page-frame'), pages[activeIndex]);
        renderRail();
        scheduleSave();
      }
      bgColorInput.oninput = () => setPageBackground({ type: 'color', value: bgColorInput.value });
      bgUploadItem.onclick = () => { bgPop.classList.remove('open'); bgFileInput.click(); };
      bgClearItem.onclick = () => { bgPop.classList.remove('open'); setPageBackground(null); };
      // Swap this page's paper pattern (blank/dotted/lined/grid) — keeps
      // every box/text/decoration exactly where it is, same as Clear
      // background, but also picks which pattern shows once the photo/
      // color is gone, so a themed cover can become "the same template,
      // just on dotted paper" in one tap instead of two.
      bgPop.querySelectorAll('[data-bg-pattern]').forEach(btn => {
        btn.onclick = () => {
          bgPop.classList.remove('open');
          pushUndo();
          pages[activeIndex].pattern = btn.dataset.bgPattern;
          pages[activeIndex].background = null;
          applyPatternAndBackground($('#page-frame'), pages[activeIndex]);
          renderRail();
          scheduleSave();
        };
      });
      bgFileInput.value = '';
      bgFileInput.onchange = () => {
        const file = bgFileInput.files && bgFileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => setPageBackground({ type: 'image', value: reader.result });
        reader.readAsDataURL(file);
        bgFileInput.value = '';
      };

      // ---- draw mode ----
      const drawBtn = $('#draw-toggle-btn');
      const drawStyleChip = $('#draw-style-chip');
      const drawColorInput = $('#draw-color');
      const drawSizeInput = $('#draw-size');
      drawBtn.onclick = () => {
        drawModeOn = !drawModeOn;
        drawBtn.classList.toggle('active', drawModeOn);
        drawStyleChip.style.display = drawModeOn ? 'flex' : 'none';
        activeCanvas?.setDrawMode(drawModeOn);
        // The brush controls land in the same horizontally-scrolling strip
        // as the Draw button — bring them into view instead of leaving them
        // off-screen, which otherwise looks like clicking Draw did nothing.
        if (drawModeOn) drawStyleChip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      };
      drawColorInput.oninput = () => activeCanvas?.setDrawStyle(drawColorInput.value, null);
      drawSizeInput.oninput = () => activeCanvas?.setDrawStyle(null, +drawSizeInput.value);
      const drawToolBtns = { pen: $('#draw-tool-pen'), highlighter: $('#draw-tool-highlighter'), eraser: $('#draw-tool-eraser') };
      Object.entries(drawToolBtns).forEach(([tool, btn]) => {
        btn.onclick = () => {
          activeCanvas?.setDrawTool(tool);
          Object.values(drawToolBtns).forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        };
      });

      // ---- rich text: Bold/Italic/Underline/Align act on the current
      // selection inside whichever box is focused. preventDefault on
      // pointerdown keeps focus (and the live text selection) inside the
      // box instead of jumping to the toolbar button. ----
      const selectionSafeButtons = ['#rt-bold', '#rt-italic', '#rt-underline', '#rt-bullet', '#rt-numbered', '#rt-letter', '#rt-checklist', '#align-left', '#align-center', '#align-right']
        .map(sel => $(sel));
      selectionSafeButtons.forEach(btn => btn.addEventListener('pointerdown', (e) => e.preventDefault()));

      $('#rt-bold').onclick = () => activeCanvas?.boldSelected();
      $('#rt-italic').onclick = () => activeCanvas?.italicSelected();
      $('#rt-underline').onclick = () => activeCanvas?.underlineSelected();
      $('#rt-bullet').onclick = () => activeCanvas?.bulletListSelected();
      $('#rt-numbered').onclick = () => activeCanvas?.numberedListSelected();
      $('#rt-letter').onclick = () => activeCanvas?.letterListSelected();
      $('#rt-checklist').onclick = () => activeCanvas?.insertChecklistItem();
      $('#align-left').onclick = () => activeCanvas?.setAlignForSelected('left');
      $('#align-center').onclick = () => activeCanvas?.setAlignForSelected('center');
      $('#align-right').onclick = () => activeCanvas?.setAlignForSelected('right');

      const rtColor = $('#rt-color');
      const rtHighlight = $('#rt-highlight');
      rtColor.oninput = () => activeCanvas?.textColorSelected(rtColor.value);
      rtHighlight.oninput = () => activeCanvas?.highlightSelected(rtHighlight.value);
      const shapeFillChip = $('#shape-fill-chip');
      const shapeBorderChip = $('#shape-border-chip');
      const shapeFillInput = $('#shape-fill');
      const shapeBorderInput = $('#shape-border');
      shapeFillInput.oninput = () => activeCanvas?.setFillForSelected(shapeFillInput.value);
      shapeBorderInput.oninput = () => activeCanvas?.setBorderForSelected(shapeBorderInput.value);

      const fontSelect = $('#font-select');
      fontSelect.innerHTML = FONTS.map(f => `<option value="${f.id}">${f.label}</option>`).join('');
      fontSelect.onchange = () => activeCanvas?.setFontForSelected(fontSelect.value);
      $('#font-size-up').onclick = () => activeCanvas?.bumpFontSizeForSelected(2);
      $('#font-size-down').onclick = () => activeCanvas?.bumpFontSizeForSelected(-2);

      // ---- zoom: touch pinch (touchscreens) + trackpad pinch / Ctrl+scroll
      // (laptops). Trackpad pinch gestures and an actual held-Ctrl scroll
      // both arrive as a 'wheel' event with ctrlKey:true — there's no
      // separate touch event at all on a non-touchscreen laptop, so this
      // wheel listener is what makes zoom work on a trackpad. Plain
      // (non-Ctrl) wheel/scroll is left alone so normal page scrolling
      // still works. No on-screen +/- buttons by design. ----
      let pinchStartDist = null;
      let pinchStartZoom = zoom;
      function touchDist(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.hypot(dx, dy);
      }
      viewport.ontouchstart = (e) => {
        if (e.touches.length === 2) {
          pinchStartDist = touchDist(e.touches);
          pinchStartZoom = zoom;
        }
      };
      viewport.ontouchmove = (e) => {
        if (e.touches.length === 2 && pinchStartDist) {
          e.preventDefault();
          const ratio = touchDist(e.touches) / pinchStartDist;
          setZoom(pinchStartZoom * ratio);
        }
      };
      function endPinch() { pinchStartDist = null; }
      viewport.ontouchend = endPinch;
      viewport.ontouchcancel = endPinch;

      viewport.addEventListener('wheel', (e) => {
        if (!e.ctrlKey) return; // let ordinary scrolling through untouched
        e.preventDefault();
        setZoom(zoom - e.deltaY * 0.01);
      }, { passive: false });

      // ---- export PDF (every page, in order, always A4) ----
      $('#editor-pdf-btn').onclick = async () => {
        morePop.classList.remove('open');
        if (!window.html2canvas || typeof window.jspdf === 'undefined') {
          if (UI.showToast) UI.showToast('PDF export unavailable', 'Needs an internet connection to load the first time.');
          return;
        }
        const originalIndex = activeIndex;
        const frame = $('#page-frame');
        const { jsPDF } = window.jspdf;
        let pdf = null;
        for (let i = 0; i < pages.length; i++) {
          activeIndex = i;
          renderActivePage(); // mounts page i fresh so every page gets captured, even though only one is ever in the DOM at a time
          activeCanvas?.deselectAll();
          const prevTransform = frame.style.transform;
          frame.style.transform = 'translate(0px, 0px) scale(1)';
          await new Promise(r => setTimeout(r, 60));
          const shot = await window.html2canvas(frame, { scale: 2 });
          frame.style.transform = prevTransform;
          if (!pdf) pdf = new jsPDF({ unit: 'mm', format: [210, 297] });
          else pdf.addPage([210, 297]);
          pdf.addImage(shot.toDataURL('image/png'), 'PNG', 0, 0, 210, 297);
        }
        activeIndex = originalIndex;
        renderActivePage();
        if (!pdf) return;
        const filename = (titleInput.value.trim() || 'journal').replace(/[^\w\-]+/g, '_').toLowerCase() + '.pdf';
        pdf.save(filename);
      };
    }

    showGrid();
  }

  return { render };
})();
