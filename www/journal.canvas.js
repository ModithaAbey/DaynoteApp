/* ============================================================
   DayNote — Journal canvas engine
   ------------------------------------------------------------
   Mounts free-form "boxes" onto a page frame: text, image, or a
   shape (rect/round/note/callout/circle, each directly typable).
   Every box can be dragged, resized, rotated, duplicated, and
   deleted. Bold/italic/underline/color/highlight apply to just
   the selected text inside a box (via the browser's own
   contentEditable selection) — the rest (font family, size,
   alignment) apply to the whole box. A simple freehand drawing
   layer sits on top of each page, toggled on/off as a whole.
   Dependency-free — plain pointer events + document.execCommand
   for the parts of rich text that need real text selection.
   ============================================================ */

const JournalCanvas = (() => {
  function uid() { return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  const SHAPE_PRESETS = {
    rect: { label: 'Box', fill: '#f5eee8', border: '#8d7565', radius: '8px' },
    round: { label: 'Round', fill: '#efe6de', border: '#8d7565', radius: '22px' },
    note: { label: 'Note', fill: '#fff2b8', border: '#b79a45', radius: '4px', clip: 'polygon(0 0,100% 0,100% 88%,88% 100%,0 100%)' },
    callout: { label: 'Callout', fill: '#e8eefc', border: '#6f84ad', radius: '14px' },
    circle: { label: 'Circle', fill: '#eadff5', border: '#876aa2', radius: '50%' },
  };

  function mount(frameEl, initialState, callbacks) {
    const { elements: initialElements, drawing: initialDrawing } = initialState || {};
    const { onElementsChange, onDrawingChange, getZoom, onSelectionChange } = callbacks || {};
    let selectedId = null;
    let activeEditableEl = null; // the contentEditable currently focused, for rich-text commands
    let savedRange = null;       // last known selection Range inside activeEditableEl, so a toolbar
                                  // click (e.g. a native color picker) doesn't lose the highlighted text
    const boxes = new Map(); // id -> { el, data }
    const zoomOf = typeof getZoom === 'function' ? getZoom : () => 1;

    function emitChange() { onElementsChange && onElementsChange(getElements()); }
    function getElements() { return [...boxes.values()].map(b => ({ ...b.data })); }

    function applyTransform(el, data) {
      el.style.transform = `translate(${data.x}px, ${data.y}px) rotate(${data.rot || 0}deg)`;
    }

    function deselectAll() {
      selectedId = null;
      frameEl.querySelectorAll('.canvas-box.selected').forEach(el => el.classList.remove('selected'));
      onSelectionChange && onSelectionChange(null);
    }

    function select(id) {
      deselectAll();
      selectedId = id;
      const b = boxes.get(id);
      if (b) b.el.classList.add('selected');
      // If focus is moving to a different box (not just a toolbar click),
      // the old box's rich-text selection is no longer meaningful.
      if (activeEditableEl) {
        const owner = [...boxes.values()].find(bx => bx.el.querySelector('.canvas-box-content') === activeEditableEl);
        if (!owner || owner.data.id !== id) { activeEditableEl = null; savedRange = null; }
      }
      onSelectionChange && onSelectionChange(b ? b.data.type : null);
    }

    function removeBox(id) {
      const b = boxes.get(id);
      if (!b) return;
      b.el.remove();
      boxes.delete(id);
      if (selectedId === id) selectedId = null;
      if (activeEditableEl && !frameEl.contains(activeEditableEl)) { activeEditableEl = null; savedRange = null; }
      emitChange();
    }

    function startDrag(e, data, el) {
      e.stopPropagation(); e.preventDefault();
      select(data.id);
      const startX = e.clientX, startY = e.clientY;
      const origX = data.x, origY = data.y;
      function move(ev) {
        const z = zoomOf() || 1;
        data.x = origX + (ev.clientX - startX) / z;
        data.y = origY + (ev.clientY - startY) / z;
        applyTransform(el, data);
      }
      function up() {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        emitChange();
      }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    }

    function startResize(e, data, el) {
      e.stopPropagation(); e.preventDefault();
      select(data.id);
      const startX = e.clientX, startY = e.clientY;
      const origW = data.w, origH = data.h;
      function move(ev) {
        const z = zoomOf() || 1;
        data.w = Math.max(48, origW + (ev.clientX - startX) / z);
        data.h = Math.max(36, origH + (ev.clientY - startY) / z);
        el.style.width = data.w + 'px';
        el.style.height = data.h + 'px';
      }
      function up() {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        emitChange();
      }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    }

    function startRotate(e, data, el) {
      e.stopPropagation(); e.preventDefault();
      select(data.id);
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const angleFor = (ev) => Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI;
      const startAngle = angleFor(e);
      const origRot = data.rot || 0;
      function move(ev) {
        data.rot = Math.round(origRot + (angleFor(ev) - startAngle));
        applyTransform(el, data);
      }
      function up() {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        emitChange();
      }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    }

    function selectAllText(el) {
      if (!el) return;
      const r = document.createRange();
      r.selectNodeContents(el);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    }

    function createBoxEl(data) {
      const el = document.createElement('div');
      const kindClass = data.type === 'image' ? 'canvas-box-image'
        : data.type === 'shape' ? 'canvas-box-shape shape-' + data.shape
        : data.type === 'deco' ? 'canvas-box-deco deco-' + (data.variant || 'sticker')
        : 'canvas-box-text';
      el.className = 'canvas-box ' + kindClass;
      el.style.width = data.w + 'px';
      el.style.height = data.h + 'px';
      applyTransform(el, data);

      if (data.type === 'shape') {
        const preset = SHAPE_PRESETS[data.shape] || SHAPE_PRESETS.rect;
        el.style.background = data.fill || preset.fill;
        el.style.borderColor = data.border || preset.border;
        el.style.borderRadius = preset.radius;
        if (preset.clip) el.style.clipPath = preset.clip;
      }

      if (data.type === 'text' || data.type === 'shape') {
        const content = document.createElement('div');
        content.className = 'canvas-box-content';
        content.contentEditable = 'true';
        content.style.fontFamily = data.font || "'Patrick Hand', cursive";
        content.style.fontSize = (data.fontSize || 16) + 'px';
        content.style.textAlign = data.align || (data.type === 'shape' ? 'center' : 'left');
        content.innerHTML = data.content || '';
        content.addEventListener('pointerdown', e => {
          // An empty shape is just a decorative box with nothing typed
          // into it yet, so let a press-and-drag anywhere on it move the
          // whole shape — much easier to grab than the small handle.
          // Once it has label text, a tap needs to place a cursor
          // instead, so dragging goes back to requiring the handle.
          if (data.type === 'shape' && !data.content) { startDrag(e, data, el); return; }
          e.stopPropagation();
        });
        content.addEventListener('click', e => handleChecklistClick(e, content, data));
        content.addEventListener('input', () => { data.content = content.innerHTML; emitChange(); });
        content.addEventListener('focus', () => { select(data.id); activeEditableEl = content; savedRange = null; });
        content.addEventListener('mouseup', () => captureSelectionIfInside(content));
        content.addEventListener('keyup', () => captureSelectionIfInside(content));
        content.addEventListener('touchend', () => captureSelectionIfInside(content));
        el.appendChild(content);
      } else if (data.type === 'deco') {
        el.style.opacity = data.opacity != null ? data.opacity : 1;
        if (data.variant === 'tape') {
          el.style.background = data.fill || '#e8c9bd';
        } else {
          el.style.color = data.color || '#b98d83';
          el.style.fontSize = (data.fontSize || 40) + 'px';
          el.textContent = data.glyph || '\u273F';
        }
      } else {
        const img = document.createElement('img');
        img.src = data.src;
        img.draggable = false;
        img.alt = '';
        el.appendChild(img);
      }

      const dragHandle = document.createElement('div');
      dragHandle.className = 'box-handle box-drag-handle';
      dragHandle.innerHTML = '&#9776;';
      dragHandle.title = 'Drag to move';

      const rotateHandle = document.createElement('div');
      rotateHandle.className = 'box-handle box-rotate-handle';
      rotateHandle.innerHTML = '&#8635;';
      rotateHandle.title = 'Drag to rotate';

      const resizeHandle = document.createElement('div');
      resizeHandle.className = 'box-handle box-resize-handle';
      resizeHandle.title = 'Drag to resize';

      const dupHandle = document.createElement('div');
      dupHandle.className = 'box-handle box-dup-handle';
      dupHandle.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
      dupHandle.title = 'Duplicate';

      const deleteHandle = document.createElement('div');
      deleteHandle.className = 'box-handle box-delete-handle';
      deleteHandle.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
      deleteHandle.title = 'Delete';

      el.appendChild(dragHandle);
      el.appendChild(rotateHandle);
      el.appendChild(resizeHandle);
      el.appendChild(dupHandle);
      el.appendChild(deleteHandle);

      const allHandles = [dragHandle, rotateHandle, resizeHandle, dupHandle, deleteHandle];
      el.addEventListener('pointerdown', (e) => {
        if (allHandles.includes(e.target)) return;
        select(data.id);
        // Text boxes need the tap to place a text cursor / start a
        // selection, so they only move via the dedicated drag handle.
        // Everything else (image, shape, decoration) has no such
        // conflict, so the whole box is draggable, not just the handle
        // — a lot easier to grab, especially on a phone screen.
        if (data.type !== 'text') startDrag(e, data, el);
      });
      dragHandle.addEventListener('pointerdown', (e) => startDrag(e, data, el));
      rotateHandle.addEventListener('pointerdown', (e) => startRotate(e, data, el));
      resizeHandle.addEventListener('pointerdown', (e) => startResize(e, data, el));
      dupHandle.addEventListener('click', (e) => { e.stopPropagation(); duplicateBox(data.id); });
      deleteHandle.addEventListener('click', (e) => { e.stopPropagation(); removeBox(data.id); });

      return el;
    }

    function addBox(data) {
      const el = createBoxEl(data);
      frameEl.appendChild(el);
      boxes.set(data.id, { el, data });
      return { el, data };
    }

    function addText() {
      const data = { id: uid(), type: 'text', x: 20, y: 20, w: 160, h: 90, rot: 0, font: "'Patrick Hand', cursive", fontSize: 16, align: 'left', content: '' };
      const { el } = addBox(data);
      select(data.id);
      emitChange();
      const contentEl = el.querySelector('.canvas-box-content');
      if (contentEl) setTimeout(() => contentEl.focus(), 0);
      return data;
    }

    function addShape(shape) {
      const preset = SHAPE_PRESETS[shape] || SHAPE_PRESETS.rect;
      const isCircle = shape === 'circle';
      const data = {
        id: uid(), type: 'shape', shape, x: 30, y: 30,
        w: isCircle ? 140 : 200, h: isCircle ? 140 : 110, rot: 0,
        font: "'Inter', sans-serif", fontSize: 15, align: 'center',
        content: preset.label === 'Note' ? 'Write a note' : 'Type here',
        fill: preset.fill, border: preset.border,
      };
      const { el } = addBox(data);
      select(data.id);
      emitChange();
      const contentEl = el.querySelector('.canvas-box-content');
      if (contentEl) setTimeout(() => { contentEl.focus(); selectAllText(contentEl); }, 0);
      return data;
    }

    function addImage(src) {
      const data = { id: uid(), type: 'image', x: 20, y: 20, w: 150, h: 150, rot: 0, src };
      addBox(data);
      select(data.id);
      emitChange();
      return data;
    }

    function addDeco(opts) {
      const o = opts || {};
      const data = {
        id: uid(), type: 'deco', variant: 'sticker', x: 30, y: 30, w: o.w || 70, h: o.h || 70,
        rot: Math.round(Math.random() * 16 - 8),
        glyph: o.glyph || '\u273F', color: o.color || '#b98d83',
        fontSize: o.fontSize || 40, opacity: o.opacity != null ? o.opacity : 0.92,
      };
      addBox(data);
      select(data.id);
      emitChange();
      return data;
    }

    function addTape(opts) {
      const o = opts || {};
      const data = {
        id: uid(), type: 'deco', variant: 'tape', x: 40, y: 20, w: 130, h: 32,
        rot: Math.round(Math.random() * 12 - 6),
        fill: o.fill || '#e8c9bd', opacity: o.opacity != null ? o.opacity : 0.78,
      };
      addBox(data);
      select(data.id);
      emitChange();
      return data;
    }

    function duplicateBox(id) {
      const b = boxes.get(id || selectedId);
      if (!b) return;
      const copy = { ...b.data, id: uid(), x: b.data.x + 18, y: b.data.y + 18 };
      addBox(copy);
      select(copy.id);
      emitChange();
    }

    // ---- whole-box formatting: font family / size / alignment ----
    function setFontForSelected(font) {
      const b = boxes.get(selectedId);
      if (b && (b.data.type === 'text' || b.data.type === 'shape')) {
        b.data.font = font;
        const c = b.el.querySelector('.canvas-box-content');
        if (c) c.style.fontFamily = font;
        emitChange();
      }
    }

    function bumpFontSizeForSelected(delta) {
      const b = boxes.get(selectedId);
      if (b && (b.data.type === 'text' || b.data.type === 'shape')) {
        b.data.fontSize = Math.max(8, Math.min(72, (b.data.fontSize || 16) + delta));
        const c = b.el.querySelector('.canvas-box-content');
        if (c) c.style.fontSize = b.data.fontSize + 'px';
        emitChange();
      }
    }

    function setAlignForSelected(align) {
      const b = boxes.get(selectedId);
      if (b && (b.data.type === 'text' || b.data.type === 'shape')) {
        b.data.align = align;
        const c = b.el.querySelector('.canvas-box-content');
        if (c) c.style.textAlign = align;
        emitChange();
      }
    }

    // ---- per-selection rich text: acts on whatever text is highlighted
    // inside the focused box, via the browser's own selection + execCommand.
    // If nothing is actively focused, these quietly no-op (nothing to apply to). ----
    function syncActiveContent() {
      if (!activeEditableEl) return;
      const entry = [...boxes.values()].find(bx => bx.el.querySelector('.canvas-box-content') === activeEditableEl);
      if (entry) { entry.data.content = activeEditableEl.innerHTML; emitChange(); }
    }
    function captureSelectionIfInside(el) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
        savedRange = sel.getRangeAt(0).cloneRange();
      }
    }
    function withSelection(cmd, value) {
      if (!activeEditableEl) return;
      activeEditableEl.focus();
      // Restore the highlighted range in case focus just moved away and
      // back (e.g. picking a color from the native color-picker button).
      if (savedRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }
      document.execCommand(cmd, false, value);
      syncActiveContent();
    }
    function boldSelected() { withSelection('bold'); }
    function italicSelected() { withSelection('italic'); }
    function underlineSelected() { withSelection('underline'); }
    function textColorSelected(color) { withSelection('foreColor', color); }
    function highlightSelected(color) { withSelection('hiliteColor', color); }
    function hasActiveSelection() { return !!activeEditableEl; }
    function setFillForSelected(color) {
      const b = boxes.get(selectedId);
      if (!b || b.data.type !== 'shape') return;
      b.data.fill = color;
      b.el.style.background = color;
      emitChange();
    }
    function setBorderForSelected(color) {
      const b = boxes.get(selectedId);
      if (!b || b.data.type !== 'shape') return;
      b.data.border = color;
      b.el.style.borderColor = color;
      emitChange();
    }
    function hasSelectedShape() {
      const b = boxes.get(selectedId);
      return !!b && b.data.type === 'shape';
    }
    function bulletListSelected() { withSelection('insertUnorderedList'); }
    function numberedListSelected() { withSelection('insertOrderedList'); }
    function letterListSelected() {
      withSelection('insertOrderedList');
      // execCommand only gives us a plain 1/2/3 <ol> — walk up from the
      // selection to the list it just created/toggled and switch its
      // marker style to a/b/c instead.
      const sel = window.getSelection();
      if (sel.rangeCount) {
        let node = sel.getRangeAt(0).startContainer;
        while (node && node.nodeName !== 'OL') node = node.parentNode;
        if (node) node.style.listStyleType = 'lower-alpha';
      }
      syncActiveContent();
    }
    function insertChecklistItem() {
      if (!activeEditableEl) return;
      const sel = window.getSelection();
      if (savedRange && activeEditableEl.contains(savedRange.startContainer)) {
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }
      document.execCommand('insertHTML', false, '<div class="cl-item">\u2610&nbsp;</div>');
      syncActiveContent();
    }
    // A checklist "box" is just a plain \u2610/\u2611 character typed into the
    // text — tapping it toggles the glyph in place, no separate widget/state
    // to keep in sync with the saved HTML.
    function handleChecklistClick(e, content, data) {
      if (!document.caretRangeFromPoint) return;
      const range = document.caretRangeFromPoint(e.clientX, e.clientY);
      if (!range || range.startContainer.nodeType !== 3) return;
      const node = range.startContainer;
      const offset = range.startOffset;
      const text = node.textContent;
      let idx = -1;
      if (text[offset] === '\u2610' || text[offset] === '\u2611') idx = offset;
      else if (text[offset - 1] === '\u2610' || text[offset - 1] === '\u2611') idx = offset - 1;
      if (idx === -1) return;
      const ch = text[idx];
      node.textContent = text.slice(0, idx) + (ch === '\u2610' ? '\u2611' : '\u2610') + text.slice(idx + 1);
      data.content = content.innerHTML;
      emitChange();
    }

    // ---- freehand drawing layer (one canvas per page, toggled on/off) ----
    let drawCanvas = null, drawCtx = null, drawing = false, drawOn = false;
    let drawColor = '#49372d', drawSize = 4, drawTool = 'pen'; // 'pen' | 'highlighter' | 'eraser'

    function strokeStyleFor(tool) {
      if (tool === 'eraser') return { composite: 'destination-out', alpha: 1, width: Math.max(drawSize * 4, 22) };
      if (tool === 'highlighter') return { composite: 'source-over', alpha: 0.35, width: Math.max(drawSize * 3, 16) };
      return { composite: 'source-over', alpha: 1, width: drawSize };
    }

    function ensureDrawCanvas() {
      if (drawCanvas) return drawCanvas;
      drawCanvas = document.createElement('canvas');
      drawCanvas.className = 'draw-canvas';
      drawCanvas.style.display = 'none';
      frameEl.appendChild(drawCanvas);
      const w = frameEl.offsetWidth || 340, h = frameEl.offsetHeight || 480;
      drawCanvas.width = w;
      drawCanvas.height = h;
      drawCtx = drawCanvas.getContext('2d');

      drawCanvas.addEventListener('pointerdown', (e) => {
        if (!drawOn) return;
        e.stopPropagation();
        drawing = true;
        drawCanvas.setPointerCapture(e.pointerId);
        const s = strokeStyleFor(drawTool);
        drawCtx.globalCompositeOperation = s.composite;
        drawCtx.globalAlpha = s.alpha;
        drawCtx.strokeStyle = drawColor;
        drawCtx.lineWidth = s.width;
        drawCtx.lineCap = 'round';
        drawCtx.lineJoin = 'round';
        const r = drawCanvas.getBoundingClientRect();
        const z = zoomOf() || 1;
        drawCtx.beginPath();
        drawCtx.moveTo((e.clientX - r.left) / z, (e.clientY - r.top) / z);
      });
      drawCanvas.addEventListener('pointermove', (e) => {
        if (!drawing) return;
        const r = drawCanvas.getBoundingClientRect();
        const z = zoomOf() || 1;
        drawCtx.lineTo((e.clientX - r.left) / z, (e.clientY - r.top) / z);
        drawCtx.stroke();
      });
      function endStroke() {
        if (!drawing) return;
        drawing = false;
        drawCtx.globalCompositeOperation = 'source-over';
        drawCtx.globalAlpha = 1;
        onDrawingChange && onDrawingChange(drawCanvas.toDataURL('image/png'));
      }
      drawCanvas.addEventListener('pointerup', endStroke);
      drawCanvas.addEventListener('pointercancel', endStroke);
      return drawCanvas;
    }

    function loadDrawing(dataUrl) {
      ensureDrawCanvas();
      drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => drawCtx.drawImage(img, 0, 0, drawCanvas.width, drawCanvas.height);
      img.src = dataUrl;
    }

    function setDrawMode(on) {
      ensureDrawCanvas();
      drawOn = !!on;
      drawCanvas.style.display = 'block'; // stays visible so existing strokes always show
      drawCanvas.style.pointerEvents = drawOn ? 'auto' : 'none';
      frameEl.classList.toggle('drawing', drawOn);
      if (drawOn) deselectAll();
    }

    function setDrawStyle(color, size) {
      if (color) drawColor = color;
      if (size) drawSize = size;
    }
    function setDrawTool(tool) {
      if (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') drawTool = tool;
    }
    function getDrawTool() { return drawTool; }

    // ---- init from saved data ----
    (initialElements || []).forEach(data => addBox(data));
    ensureDrawCanvas();
    if (initialDrawing) loadDrawing(initialDrawing);

    // The caller (pages.notes.js) remounts a fresh canvas onto the SAME
    // frame element every time the active page changes, rather than a new
    // element each time — so a plain addEventListener here would pile up
    // one stale listener (with a dead closure) per remount. Track and
    // remove the previous one first so there's only ever one at a time.
    if (frameEl._journalCanvasBgHandler) {
      frameEl.removeEventListener('pointerdown', frameEl._journalCanvasBgHandler);
    }
    const bgPointerDown = (e) => {
      if (e.target === frameEl) deselectAll();
    };
    frameEl._journalCanvasBgHandler = bgPointerDown;
    frameEl.addEventListener('pointerdown', bgPointerDown);

    return {
      addText, addImage, addShape, addDeco, addTape,
      duplicateSelected: () => duplicateBox(selectedId),
      removeSelected: () => selectedId && removeBox(selectedId),
      setFontForSelected, bumpFontSizeForSelected, setAlignForSelected,
      boldSelected, italicSelected, underlineSelected, textColorSelected, highlightSelected, hasActiveSelection,
      setFillForSelected, setBorderForSelected, hasSelectedShape,
      bulletListSelected, numberedListSelected, letterListSelected, insertChecklistItem,
      setDrawMode, setDrawStyle, setDrawTool, getDrawTool,
      getElements, deselectAll,
    };
  }

  return { mount };
})();
