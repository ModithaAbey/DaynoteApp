/* ============================================================
   DayNote — Journal cover & template artwork
   ------------------------------------------------------------
   Every journal "theme" has two matching pieces of art:
     - a `cover` — the ornate version, used on the theme picker
       tile and on the journal's own title page
     - a `content` — a quieter version of the same theme (one
       small corner accent instead of four), used on the pages
       *inside* the journal so it doesn't compete with writing

   Bloom / Verdant / Celestia are generated right here as inline
   SVG (turned into data URIs) — no network request, so they
   always load instantly. Tides / Autumn / Indigo / Terra /
   Wildwood are original illustrated PNG packs bundled in
   assets/covers/ (also fully local, no network needed).
   ============================================================ */

const CoverArt = (() => {
  const W = 350, H = 495;

  // ---------------------------------------------------------------
  // shared drawing helpers
  // ---------------------------------------------------------------
  function flower(cx, cy, scale, petal, petal2, center, rot = 0) {
    let out = '';
    for (let i = 0; i < 5; i++) {
      const a = rot + i * 72, rad = a * Math.PI / 180;
      const px = cx + Math.cos(rad) * 6.5 * scale, py = cy + Math.sin(rad) * 6.5 * scale;
      out += `<ellipse cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" rx="${(6.8*scale).toFixed(1)}" ry="${(4.8*scale).toFixed(1)}" transform="rotate(${a.toFixed(1)} ${px.toFixed(1)} ${py.toFixed(1)})" fill="${petal}" opacity="0.88"/>`;
    }
    for (let i = 0; i < 5; i++) {
      const a = rot + i * 72 + 12, rad = a * Math.PI / 180;
      const px = cx + Math.cos(rad) * 3.6 * scale, py = cy + Math.sin(rad) * 3.6 * scale;
      out += `<ellipse cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" rx="${(4.2*scale).toFixed(1)}" ry="${(3*scale).toFixed(1)}" transform="rotate(${a.toFixed(1)} ${px.toFixed(1)} ${py.toFixed(1)})" fill="${petal2}" opacity="0.92"/>`;
    }
    out += `<circle cx="${cx}" cy="${cy}" r="${(2.4*scale).toFixed(1)}" fill="${center}"/>`;
    return out;
  }

  function bud(cx, cy, scale, rot, petal, stemc) {
    return `<g transform="rotate(${rot} ${cx} ${cy})">
      <ellipse cx="${cx}" cy="${cy}" rx="${3.4*scale}" ry="${5.2*scale}" fill="${petal}" opacity="0.85"/>
      <path d="M${cx-3.2*scale},${cy+1*scale} Q${cx},${cy-2*scale} ${cx+3.2*scale},${cy+1*scale}" fill="none" stroke="${stemc}" stroke-width="0.6" opacity="0.6"/>
    </g>`;
  }

  function leaf(x1, y1, x2, y2, width, color, opacity = 0.75) {
    const mx = (x1+x2)/2, my = (y1+y2)/2, dx = x2-x1, dy = y2-y1;
    let nx = -dy, ny = dx; const ln = Math.hypot(nx, ny) || 1;
    nx = nx/ln*width; ny = ny/ln*width;
    const path = `M${x1.toFixed(1)},${y1.toFixed(1)} Q${(mx+nx).toFixed(1)},${(my+ny).toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} Q${(mx-nx).toFixed(1)},${(my-ny).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)} Z`;
    const vein = `M${x1.toFixed(1)},${y1.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
    return `<path d="${path}" fill="${color}" opacity="${opacity}"/><path d="${vein}" fill="none" stroke="${color}" stroke-width="0.5" opacity="0.4"/>`;
  }

  function stem(pts, color, width = 1.5, opacity = 0.7) {
    let d = `M${pts[0][0]},${pts[0][1]} `;
    for (let i = 1; i < pts.length - 1; i += 2) d += `Q${pts[i][0]},${pts[i][1]} ${pts[i+1][0]},${pts[i+1][1]} `;
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" opacity="${opacity}"/>`;
  }

  function fern(cx, cy, rot, length, color, opacity = 0.7) {
    let g = `<g transform="rotate(${rot} ${cx} ${cy})">`;
    g += `<path d="M${cx},${cy} q${length*0.15},${-length*0.5} ${length*0.05},${-length}" fill="none" stroke="${color}" stroke-width="1" opacity="${opacity}"/>`;
    const steps = 7;
    for (let i = 1; i < steps; i++) {
      const t = i/steps, px = cx + length*0.15*t, py = cy - length*t;
      const leafletLen = (1-t*0.6) * length*0.22;
      for (const side of [-1, 1]) {
        g += `<path d="M${px.toFixed(1)},${py.toFixed(1)} Q${(px+side*leafletLen*0.5).toFixed(1)},${(py-leafletLen*0.3).toFixed(1)} ${(px+side*leafletLen).toFixed(1)},${(py-leafletLen*0.55).toFixed(1)}" fill="none" stroke="${color}" stroke-width="0.8" opacity="${opacity}"/>`;
      }
    }
    return g + '</g>';
  }

  function sprayFloral(petal, petal2, center, leafc, stemc, quiet) {
    let g = '';
    g += stem([[0,0],[18,4],[34,18],[46,20],[58,42]], stemc, 1.5);
    g += leaf(20,8, 34,-4, 6.5, leafc, 0.7);
    g += leaf(30,20, 46,10, 6, leafc, 0.72);
    g += flower(58,42, 1.3, petal, petal2, center);
    if (!quiet) {
      g += stem([[0,0],[6,14],[10,26],[8,40],[14,58]], stemc, 1.2, 0.6);
      g += leaf(6,20, -6,30, 5.5, leafc, 0.65);
      g += leaf(10,34, -2,46, 5, leafc, 0.6);
      g += flower(34,18, 0.85, petal2, petal, center, 20);
      g += flower(12,54, 1.0, petal, petal2, center, -15);
      g += bud(4,4, 0.9, 30, petal2, stemc);
    } else {
      g += bud(30,14, 0.8, 20, petal2, stemc);
    }
    return `<g>${g}</g>`;
  }

  function sprayFern(petal, petal2, center, leafc, stemc, quiet) {
    let g = fern(6, 66, 8, 60, leafc, 0.75);
    if (!quiet) {
      g += fern(2, 50, -14, 46, stemc, 0.6);
      g += fern(18, 72, 26, 42, leafc, 0.65);
      g += flower(46, 30, 0.7, petal, petal2, center, 10);
    }
    return `<g>${g}</g>`;
  }

  // paper, frame, spray type, [petal, petal2, center, leaf, stem]
  const PALETTES = {
    bloom:   { paper: '#fdf3f2', frame: '#c98a8a', spray: 'floral', c: ['#e39aa2', '#f3d3d6', '#7a3f47', '#93a878', '#6f8a63'] },
    verdant: { paper: '#f3f6ee', frame: '#6f8a63', spray: 'fern',   c: ['#96b583', '#c9dcb9', '#3f5c32', '#6f8a63', '#4a6b3d'] },
    // Dusty mauve blooms + olive leaves on warm cream — inspired by a
    // pink/green watercolor floral reference. Reuses Bloom's spray
    // builder with a cooler, dustier palette so it reads as a distinct
    // "vintage botanical" mood rather than Bloom's warm blush pink.
    meadow:  { paper: '#f7f1ea', frame: '#a8788a', spray: 'floral', c: ['#b97e91', '#e3c9c6', '#5c3a42', '#8a9468', '#5f6b42'] },
  };

  // Soft edge-bleed filter used on the theme motifs below so flat vector
  // shapes read closer to a watercolor wash (irregular, slightly displaced
  // edges + gentle blur) instead of crisp geometric fills.
  const WC_FILTER = `<filter id="wc-bleed" x="-30%" y="-30%" width="160%" height="160%">
    <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="5" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="9"/>
    <feGaussianBlur stdDeviation="0.7"/>
  </filter>`;

  function buildFloralSvg(name, { quiet = false } = {}) {
    const p = PALETTES[name];
    const [petal, petal2, center, leafc, stemc] = p.c;
    const spray = p.spray === 'fern'
      ? sprayFern(petal, petal2, center, leafc, stemc, quiet)
      : sprayFloral(petal, petal2, center, leafc, stemc, quiet);
    const m = 14;
    let corners;
    if (quiet) {
      corners = `<g transform="translate(${W-10},${H-10}) scale(-1,-1)">${spray}</g>`;
    } else {
      corners = `
        <g transform="translate(10,10)">${spray}</g>
        <g transform="translate(${W-10},10) scale(-1,1)">${spray}</g>
        <g transform="translate(10,${H-10}) scale(1,-1)">${spray}</g>
        <g transform="translate(${W-10},${H-10}) scale(-1,-1)">${spray}</g>`;
    }
    const wash = quiet ? '' : `
      <radialGradient id="vg-${name}" cx="50%" cy="40%" r="78%">
        <stop offset="55%" stop-color="${p.paper}" stop-opacity="0"/>
        <stop offset="100%" stop-color="${leafc}" stop-opacity="0.14"/>
      </radialGradient>
      <rect width="${W}" height="${H}" fill="url(#vg-${name})"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>${WC_FILTER}</defs>
      <rect width="${W}" height="${H}" fill="${p.paper}"/>
      ${wash}
      <rect x="${m}" y="${m}" width="${W-2*m}" height="${H-2*m}" fill="none" stroke="${p.frame}" stroke-width="1" opacity="${quiet ? 0.28 : 0.35}"/>
      <g filter="url(#wc-bleed)">${corners}</g>
    </svg>`;
  }

  // ---- Celestia: deep night sky, soft aurora ribbons, scattered stars ----
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function buildCelestiaSvg({ quiet = false } = {}) {
    const rnd = mulberry32(7);
    const m = 14, frame = '#c9a24a';
    let stars = '';
    const n = quiet ? 14 : 32;
    for (let i = 0; i < n; i++) {
      const x = 20 + rnd() * (W - 40), y = 20 + rnd() * (H - 40);
      const r = 0.6 + rnd() * 1.2, op = 0.35 + rnd() * 0.6;
      stars += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="#f3e9c9" opacity="${op.toFixed(2)}"/>`;
    }
    const spots = quiet ? [[300, 440]] : [[40, 60], [300, 90], [60, 420]];
    let sparkles = '';
    for (const [x, y] of spots) {
      const s = 5;
      sparkles += `<path d="M${x},${y-s} L${x+s*0.28},${y-s*0.28} L${x+s},${y} L${x+s*0.28},${y+s*0.28} L${x},${y+s} L${x-s*0.28},${y+s*0.28} L${x-s},${y} L${x-s*0.28},${y-s*0.28} Z" fill="#f6efc9" opacity="0.9"/>`;
    }
    const aurora = quiet ? '' : `
      <path d="M0,120 Q90,60 180,110 T350,90 L350,220 Q260,170 180,210 T0,240 Z" fill="#6a5a9c" opacity="0.14"/>
      <path d="M0,180 Q100,140 200,190 T350,160 L350,280 Q250,230 150,270 T0,300 Z" fill="#3f7a8c" opacity="0.12"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="sky-${quiet?'q':'c'}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1b2340"/><stop offset="55%" stop-color="#221a3a"/><stop offset="100%" stop-color="#150f28"/>
      </linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#sky-${quiet?'q':'c'})"/>
      ${aurora}${stars}${sparkles}
      <rect x="${m}" y="${m}" width="${W-2*m}" height="${H-2*m}" fill="none" stroke="${frame}" stroke-width="1" opacity="0.4"/>
    </svg>`;
  }

  // ---- Azure: cream ground, two navy/dusty-blue floral bouquets, thin
  // gold diamond frame instead of the plain rect border — inspired by a
  // blue watercolor floral + gold geometric-frame reference. ----
  function buildAzureSvg({ quiet = false } = {}) {
    const paper = '#f8fafb', gold = '#b8965a';
    const petal = '#3d5470', petal2 = '#7a92a8', center = '#1f2e40', leafc = '#5c6b78', stemc = '#2c3d52';
    const bouquet = (cx, cy, scale, rot) => {
      let g = `<g transform="translate(${cx},${cy}) rotate(${rot}) scale(${scale})">`;
      g += leaf(0, 0, -18, -14, 5, leafc, 0.55);
      g += leaf(4, 2, -10, 22, 5, leafc, 0.5);
      g += leaf(-2, -4, 14, -18, 4.5, leafc, 0.5);
      g += flower(0, 0, 1.15, petal, petal2, center, 8);
      g += flower(-13, 9, 0.8, petal2, petal, center, -20);
      g += bud(11, -12, 0.75, 30, petal, stemc);
      g += '</g>';
      return g;
    };
    const bouquets = quiet
      ? bouquet(W - 34, H - 40, 0.75, -8)
      : bouquet(40, 46, 1, 6) + bouquet(W - 40, H - 46, 1, 186);
    // Thin gold octagon tracing just inside the page edge, echoing the
    // geometric-frame reference instead of a plain rectangle.
    const m = 22;
    const pts = [
      [m + 26, m], [W - m - 26, m], [W - m, m + 60], [W - m, H - m - 60],
      [W - m - 26, H - m], [m + 26, H - m], [m, H - m - 60], [m, m + 60],
    ];
    const octagon = quiet ? '' : `<polygon points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${gold}" stroke-width="1" opacity="0.55"/>`;
    const sparkle = quiet ? '' : [[60, 60], [W - 50, H - 200], [70, H - 90]].map(([x, y]) =>
      `<circle cx="${x}" cy="${y}" r="1" fill="${gold}" opacity="0.6"/>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>${WC_FILTER}</defs>
      <rect width="${W}" height="${H}" fill="${paper}"/>
      ${octagon}<g filter="url(#wc-bleed)">${bouquets}</g>${sparkle}
      ${quiet ? `<rect x="14" y="14" width="${W-28}" height="${H-28}" fill="none" stroke="${gold}" stroke-width="1" opacity="0.3"/>` : ''}
    </svg>`;
  }

  // ---- Palma: warm peach wash, bold pastel monstera-leaf silhouettes
  // with speckled dots in each corner — inspired by a tropical pastel
  // corner-leaf reference. Distinct from Terra's fine line-art fronds. ----
  function buildPalmaSvg({ quiet = false } = {}) {
    const paper = '#faf1e6', sage = '#a7b592', sand = '#d9a878';
    function monstera(cx, cy, scale, rot, color, shade) {
      // A single pointed leaf blade (almond outline) with a few
      // radiating slit-lines cut through it — a simplified monstera
      // read, cleaner than an all-over lobed silhouette at this size.
      const blade = `M0,-52 C24,-48 38,-20 34,6 C31,28 16,46 0,58
        C-16,46 -31,28 -34,6 C-38,-20 -24,-48 0,-52 Z`;
      const slits = [
        `M0,-40 L2,-6`, `M-10,-34 L-16,-2`, `M10,-34 L16,-2`,
        `M-4,4 L-14,30`, `M6,6 L18,32`,
      ];
      return `<g transform="translate(${cx},${cy}) rotate(${rot}) scale(${scale})">
        <path d="${blade}" fill="${shade}" opacity="0.55" transform="translate(6,4) scale(0.92)"/>
        <path d="${blade}" fill="${color}" opacity="0.9"/>
        ${slits.map(d => `<path d="${d}" fill="none" stroke="${paper}" stroke-width="2.2" stroke-linecap="round" opacity="0.75"/>`).join('')}
      </g>`;
    }
    function speckle(seed, cx, cy, r) {
      const rnd = mulberry32(seed);
      let dots = '';
      for (let i = 0; i < 14; i++) {
        const a = rnd() * Math.PI * 2, d = rnd() * r;
        dots += `<circle cx="${(cx + Math.cos(a) * d).toFixed(1)}" cy="${(cy + Math.sin(a) * d).toFixed(1)}" r="${(0.6 + rnd() * 0.9).toFixed(1)}" fill="#3a2a1a" opacity="${(0.3 + rnd() * 0.35).toFixed(2)}"/>`;
      }
      return dots;
    }
    const leaves = quiet
      ? monstera(W - 32, H - 30, 0.62, 200, sage, sand)
      : monstera(30, 28, 0.7, -12, sage, sand) + monstera(W - 30, 30, -0.7, 12, sand, sage) +
        monstera(32, H - 28, 0.65, 190, sand, sage) + monstera(W - 32, H - 30, 0.7, 168, sage, sand);
    const dots = quiet
      ? speckle(3, W - 74, H - 66, 40)
      : speckle(1, 62, 76, 44) + speckle(2, W - 66, H - 88, 44);
    const wash = quiet ? '' : `
      <radialGradient id="palma-wash" cx="45%" cy="55%" r="70%">
        <stop offset="55%" stop-color="${paper}" stop-opacity="0"/>
        <stop offset="100%" stop-color="${sand}" stop-opacity="0.22"/>
      </radialGradient>
      <rect width="${W}" height="${H}" fill="url(#palma-wash)"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>${WC_FILTER}</defs>
      <rect width="${W}" height="${H}" fill="${paper}"/>
      ${wash}
      <rect x="14" y="14" width="${W-28}" height="${H-28}" fill="none" stroke="${sand}" stroke-width="1" opacity="${quiet ? 0.25 : 0.35}"/>
      <g filter="url(#wc-bleed)">${leaves}</g>${dots}
    </svg>`;
  }

  function toDataUri(svg) {
    return `data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' '))}`;
  }

  // ---------------------------------------------------------------
  // public registry — one entry per journal theme. `cover` is used
  // for the theme-picker tile + the journal's own title page;
  // `content` is used on every page *inside* the journal.
  // ---------------------------------------------------------------
  const categories = {
    bloom: {
      label: 'Bloom',
      cover: { type: 'image', value: toDataUri(buildFloralSvg('bloom', { quiet: false })), color: PALETTES.bloom.paper },
      content: { type: 'image', value: toDataUri(buildFloralSvg('bloom', { quiet: true })), color: PALETTES.bloom.paper },
      textColor: '#4a2a30',
    },
    verdant: {
      label: 'Verdant',
      cover: { type: 'image', value: toDataUri(buildFloralSvg('verdant', { quiet: false })), color: PALETTES.verdant.paper },
      content: { type: 'image', value: toDataUri(buildFloralSvg('verdant', { quiet: true })), color: PALETTES.verdant.paper },
      textColor: '#34402e',
    },
    meadow: {
      label: 'Meadow',
      cover: { type: 'image', value: toDataUri(buildFloralSvg('meadow', { quiet: false })), color: PALETTES.meadow.paper },
      content: { type: 'image', value: toDataUri(buildFloralSvg('meadow', { quiet: true })), color: PALETTES.meadow.paper },
      textColor: '#4a2f38',
    },
    azure: {
      label: 'Azure',
      cover: { type: 'image', value: toDataUri(buildAzureSvg({ quiet: false })), color: '#f8fafb' },
      content: { type: 'image', value: toDataUri(buildAzureSvg({ quiet: true })), color: '#f8fafb' },
      textColor: '#1f2e40',
    },
    palma: {
      label: 'Palma',
      cover: { type: 'image', value: toDataUri(buildPalmaSvg({ quiet: false })), color: '#faf1e6' },
      content: { type: 'image', value: toDataUri(buildPalmaSvg({ quiet: true })), color: '#faf1e6' },
      textColor: '#4a3520',
    },
    celestia: {
      label: 'Celestia',
      cover: { type: 'image', value: toDataUri(buildCelestiaSvg({ quiet: false })), color: '#1b2340' },
      content: { type: 'image', value: toDataUri(buildCelestiaSvg({ quiet: true })), color: '#1b2340' },
      textColor: '#f3e9c9',
      dark: true,
    },
    // Original illustrated asset packs — bundled locally in assets/covers/,
    // no network request needed.
    tides: {
      label: 'Tides',
      cover: { type: 'image', value: 'assets/covers/tides_horizon.png', color: '#e7eff0' },
      content: { type: 'image', value: 'assets/covers/tides_content_wave.png', color: '#e7eff0' },
      textColor: '#3c5a63',
    },
    autumn: {
      label: 'Autumn',
      cover: { type: 'image', value: 'assets/covers/autumn_maple.png', color: '#f8ecd9' },
      content: { type: 'image', value: 'assets/covers/autumn_content_leaves.png', color: '#f8ecd9' },
      textColor: '#6e3c22',
    },
    indigo: {
      label: 'Indigo',
      cover: { type: 'image', value: 'assets/covers/indigo_wisteria.png', color: '#faf5ee' },
      content: { type: 'image', value: 'assets/covers/indigo_content_sprig.png', color: '#faf5ee' },
      textColor: '#4a3a5c',
    },
    terra: {
      label: 'Terra',
      cover: { type: 'image', value: 'assets/covers/terra_boho.png', color: '#f2d9bd' },
      content: { type: 'image', value: 'assets/covers/terra_content_frond.png', color: '#f2d9bd' },
      textColor: '#5c4527',
    },
    wildwood: {
      label: 'Wildwood',
      cover: { type: 'image', value: 'assets/covers/wildwood_jungle.png', color: '#12281a' },
      content: { type: 'image', value: 'assets/covers/wildwood_content_spray.png', color: '#12281a' },
      textColor: '#e8e6c8',
      dark: true,
    },
  };

  // ---- thin line-art icons for template tiles, in place of raw platform
  // emoji (which render inconsistently across OSes and don't match the
  // app's hand-illustrated feel). Ink-brown, 44x44 view.
  const INK = '#8a6a4a';
  const icons = {
    daily: `<svg width="26" height="26" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="6" width="24" height="32" rx="2.5" stroke="${INK}" stroke-width="1.6"/>
      <line x1="10" y1="13" x2="34" y2="13" stroke="${INK}" stroke-width="1.4"/>
      <line x1="15" y1="19" x2="29" y2="19" stroke="${INK}" stroke-width="1.1" opacity="0.7"/>
      <line x1="15" y1="24" x2="29" y2="24" stroke="${INK}" stroke-width="1.1" opacity="0.7"/>
      <line x1="15" y1="29" x2="24" y2="29" stroke="${INK}" stroke-width="1.1" opacity="0.7"/>
      <path d="M15 9.5c1.5-2 3.5-2 5 0" stroke="${INK}" stroke-width="1.1" opacity="0.6"/>
    </svg>`,
    gratitude: `<svg width="26" height="26" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g stroke="${INK}" stroke-width="1.4">
        <ellipse cx="22" cy="14" rx="5.6" ry="8" opacity="0.85"/>
        <ellipse cx="22" cy="14" rx="5.6" ry="8" transform="rotate(72 22 14)" opacity="0.85"/>
        <ellipse cx="22" cy="14" rx="5.6" ry="8" transform="rotate(144 22 14)" opacity="0.85"/>
        <ellipse cx="22" cy="14" rx="5.6" ry="8" transform="rotate(216 22 14)" opacity="0.85"/>
        <ellipse cx="22" cy="14" rx="5.6" ry="8" transform="rotate(288 22 14)" opacity="0.85"/>
      </g>
      <circle cx="22" cy="14" r="2.6" fill="${INK}"/>
      <path d="M22 20c0 8-3 12-3 16" stroke="${INK}" stroke-width="1.4"/>
      <path d="M19 30c-3-1-4-3-4-3M22 33c2-1 4-1 5-3" stroke="${INK}" stroke-width="1.1" opacity="0.7"/>
    </svg>`,
    weekly: `<svg width="26" height="26" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="9" width="28" height="26" rx="2.5" stroke="${INK}" stroke-width="1.6"/>
      <line x1="8" y1="16" x2="36" y2="16" stroke="${INK}" stroke-width="1.4"/>
      <line x1="14" y1="6" x2="14" y2="11" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>
      <line x1="30" y1="6" x2="30" y2="11" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>
      <g stroke="${INK}" stroke-width="1.1" opacity="0.7">
        <line x1="13" y1="22" x2="17" y2="22"/><line x1="20" y1="22" x2="24" y2="22"/><line x1="27" y1="22" x2="31" y2="22"/>
        <line x1="13" y1="28" x2="17" y2="28"/><line x1="20" y1="28" x2="24" y2="28"/>
      </g>
    </svg>`,
    study: `<svg width="26" height="26" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g stroke="${INK}" stroke-width="1.5" stroke-linejoin="round">
        <rect x="9" y="14" width="9" height="21" rx="1"/>
        <rect x="18.5" y="11" width="9" height="24" rx="1"/>
        <rect x="28" y="16" width="8" height="19" rx="1"/>
      </g>
      <line x1="12" y1="19" x2="15" y2="19" stroke="${INK}" stroke-width="0.9" opacity="0.6"/>
      <line x1="21.5" y1="16" x2="24.5" y2="16" stroke="${INK}" stroke-width="0.9" opacity="0.6"/>
    </svg>`,
    vision: `<svg width="26" height="26" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22 6 L25 18 L37 20 L25 22 L22 34 L19 22 L7 20 L19 18 Z" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>
      <circle cx="33" cy="10" r="2" stroke="${INK}" stroke-width="1.2"/>
      <circle cx="11" cy="32" r="1.6" stroke="${INK}" stroke-width="1.1"/>
    </svg>`,
    selfcare: `<svg width="26" height="26" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22 34c-9-6-13-11.5-13-17A7 7 0 0 1 22 12a7 7 0 0 1 13 5c0 5.5-4 11-13 17Z" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M22 14c-4 3-4 7-1 9" stroke="${INK}" stroke-width="1" opacity="0.5"/>
    </svg>`,
  };

  return { categories, icons };
})();
