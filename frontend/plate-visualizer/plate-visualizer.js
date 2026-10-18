// Plate visualizer: draws a top-down plate with food cut-outs and callout labels.
//
//   const viz = PlateVisualizer.mount(element, { assetBase: "assets/food/" });
//   viz.render(meal);   // meal = one entry of the meals JSON
//
// Foods and labels slide in from their own side: slowly on the first render, quickly
// after that. Pass { firstEnter: "fast" } to skip the slow intro (e.g. a re-mount).
//
// Everything is laid out in a fixed coordinate space (STAGE units) and scaled
// to the container, so it looks the same at any size. Below COMPACT_BELOW px
// wide, side labels are swapped for numbered pins plus a legend.
(function () {
  const STAGE = { w: 1000, h: 680 };
  const PLATE = { cx: 500, cy: 350, r: 280 };
  const COMPACT_BELOW = 620;           // container px
  const ENTER_WAVE = { main: 0, starch: 1, veg: 1, other: 2 }; // entrance order (see .pv-enter)
  const COMPACT_CROP = { x: 150, w: 700 };
  const LABEL_GAP = 96;                // min vertical gap between labels (stage units)
  const LABEL_X = { left: 170, right: 830 };
  const ELBOW_X = { left: 200, right: 800 };
  const ROLE_ORDER = { main: 0, starch: 1, veg: 2, other: 3 };
  const MAX_COPIES = 4;

  // How on-plate items are arranged, by count. Items sit evenly around a ring (radius in
  // units of plate radius); with `center`, the main item sits in the middle and the rest ring
  // it. Rings are tight and `size` is generous so foods nestle and overlap a little, like real
  // plated food, instead of sitting as separate islands. Each meal also gets small seeded
  // nudges (angle, distance, rotation) so it doesn't look stamped.
  const ARRANGE = {
    1: { ring: 0, size: 1.6 },
    2: { ring: 0.38, size: 1.42 },
    3: { ring: 0.44, size: 1.32 },
    4: { ring: 0.48, size: 1.2 },
    5: { ring: 0.55, size: 1.1, center: true },
    6: { ring: 0.58, size: 1.02, center: true },
  };
  const ARRANGE_MORE = { ring: 0.6, size: 0.94, center: true }; // 7+ (the recommender caps at 6)
  const MAIN_PULL = 0.9; // without a centred main, the main sits this much closer in so others tuck around it
  const CENTER_SIZE = 0.88; // a centred main is a bit smaller so it doesn't bury the ring around it
  const EXTRA_MAIN_SIZE = 0.72; // second and later mains are drawn smaller so they don't swamp the plate
  const REPEAT_TWIST = 40; // extra rotation (deg) when a picture is already on the plate, so twins read as two items
  const WELL = 0.87; // inner edge of the plate's rim, as a fraction of its radius (narrow rim, big eating area)
  const JITTER = { angle: 0.3, ring: 0.08, center: 0.05, rotate: 12 }; // angle: fraction of the gap between items
  const RIM_LIMIT = 0.93; // keep items' centres + half-width inside this fraction of the plate radius
  // Copies of a repeated item: [along the rim, toward the rim] in copy widths.
  const COPY_OFFSETS = {
    1: [[0, 0]],
    2: [[-0.26, -0.04], [0.26, 0.06]],
    3: [[-0.30, -0.08], [0.28, -0.04], [0.0, 0.22]],
    4: [[-0.30, -0.14], [0.28, -0.16], [-0.16, 0.22], [0.24, 0.20]],
  };
  const COPY_TWIST = [0, 38, -27, 64];  // extra rotation per copy so repeats don't look stamped
  // Side bowls (only items whose picture includes a bowl) sit just off the rim.
  const SIDE_SLOTS = [[0.80, -0.86], [-0.80, -0.86], [0.84, 0.86]];
  // Labels are pushed away from the plate's horizontal midline so every
  // leader line gets a visible slant.
  const SLANT_SPREAD = 1.3;
  const SLANT_MIN = 46;

  const fmt = (n) => (n == null ? "–" : Math.round(n * 10) / 10);
  const keyOf = (name) => (name || "").trim().toLowerCase().replace(/\s+/g, "-");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const servingsOf = (item) => Math.max(1, Math.round(item.servings || 1));

  // Small seeded random generator (mulberry32 over an FNV-1a hash), so a meal always gets the
  // same nudges and doesn't jump around when re-rendered.
  function seededRandom(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return () => {
      h = (h + 0x6d2b79f5) | 0;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Turn one item into the images that draw it (one, or several copies).
  function sprites(p) {
    const n = servingsOf(p.item);
    const repeat = p.asset && p.asset.repeat;
    const minCopies = (p.asset && p.asset.copies) || 1; // some pictures always show as a pile of copies
    const copies = Math.min(MAX_COPIES, Math.max(repeat ? n : 1, minCopies));
    // Copies forced by `copies` (not extra servings) overlap more tightly so they blend into one pile.
    const spread = minCopies > 1 && copies <= minCopies ? 0.6 : 1;
    // Non-repeating items grow a little per extra serving instead.
    const w = p.baseW * (repeat ? 1 - 0.06 * (copies - 1) : Math.min(1.35, 1 + 0.15 * (n - 1)));
    // Orient the cluster so copies spread along the rim, not into the centre.
    const len = Math.hypot(p.x - PLATE.cx, p.y - PLATE.cy);
    const rad = len > 1 ? [(p.x - PLATE.cx) / len, (p.y - PLATE.cy) / len] : [0, 1];
    const tan = [-rad[1], rad[0]];
    const base = p.asset ? p.asset.rotate : 0;
    return COPY_OFFSETS[copies].map(([t, r], k) => ({
      x: p.x + (t * tan[0] + r * rad[0]) * w * spread,
      y: p.y + (t * tan[1] + r * rad[1]) * w * spread,
      w,
      rot: base + (p.twist || 0) + COPY_TWIST[k],
      flip: k % 2 === 1,
    }));
  }

  function layout(items) {
    const assets = window.FOOD_ASSETS || {};
    const placed = items.map((item) => {
      const asset = assets[keyOf(item.generic_name)] || null;
      return { item, asset, role: asset ? asset.role : "other", kind: asset ? asset.kind : "plate" };
    });
    // Only pictures that include their own bowl go beside the plate; everything else stays on it.
    let onPlate = placed.filter((p) => p.kind === "plate");
    let side = placed.filter((p) => p.kind !== "plate");
    if (onPlate.length === 0 && side.length) onPlate = [side.shift()]; // lone bowl goes in the middle
    if (side.length > SIDE_SLOTS.length) onPlate = onPlate.concat(side.splice(SIDE_SLOTS.length)); // more bowls than slots
    onPlate.sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);

    // Only the first main is full size; later mains and repeated pictures are toned down.
    const seenSrc = new Set();
    onPlate.forEach((p, i) => {
      p.sizeScale = p.role === "main" && i > 0 && onPlate[0].role === "main" ? EXTRA_MAIN_SIZE : 1;
      const src = p.asset && p.asset.src;
      p.repeatTwist = src && seenSrc.has(src) ? REPEAT_TWIST : 0;
      if (src) seenSrc.add(src);
    });

    const rand = seededRandom(items.map((it) => it.name || it.generic_name || "").join("|"));
    const jitter = (amount) => (rand() * 2 - 1) * amount;
    const n = onPlate.length;
    const arrange = ARRANGE[n] || ARRANGE_MORE;
    // Ring order alternates the front and back of the role-sorted list (main, veg, main, starch…)
    // so similar foods, like two mains, end up across from each other rather than side by side.
    const sorted = arrange.center && n > 1 ? onPlate.slice(1) : onPlate.slice();
    const ringItems = [];
    while (sorted.length) ringItems.push(ringItems.length % 2 ? sorted.pop() : sorted.shift());
    const k = ringItems.length;
    const gap = (2 * Math.PI) / Math.max(k, 1);
    // Start so items split evenly between the left and right label columns
    // (2 → left/right, 3 → two up, one down, 4 → a square).
    const start = -Math.PI / 2 + gap / 2 + jitter(JITTER.angle * gap * 0.5);
    const place = (p, x, y, sizeScale = 1) => {
      p.x = x;
      p.y = y;
      p.twist = jitter(JITTER.rotate) + (p.repeatTwist || 0);
      const w = (p.asset ? p.asset.scale : 0.3) * 2 * PLATE.r * arrange.size * sizeScale * (p.sizeScale || 1);
      const room = (RIM_LIMIT * PLATE.r - Math.hypot(x - PLATE.cx, y - PLATE.cy)) * 2;
      p.baseW = Math.min(w, Math.max(room, w * 0.6)); // shrink anything that would hang off the rim
    };
    if (arrange.center && n > 1) {
      onPlate[0].centred = true;
      place(onPlate[0], PLATE.cx + jitter(JITTER.center) * PLATE.r, PLATE.cy + jitter(JITTER.center) * PLATE.r, CENTER_SIZE);
    }
    ringItems.forEach((p, i) => {
      const angle = start + i * gap + jitter(JITTER.angle * gap * 0.5);
      const pull = !(arrange.center && n > 1) && i === 0 && n > 1 ? MAIN_PULL : 1;
      const r = arrange.ring * pull * (1 + jitter(JITTER.ring)) * PLATE.r;
      place(p, PLATE.cx + Math.cos(angle) * r, PLATE.cy + Math.sin(angle) * r);
    });
    side.forEach((p, i) => {
      const [sx, sy] = SIDE_SLOTS[i];
      p.x = PLATE.cx + sx * PLATE.r;
      p.y = PLATE.cy + sy * PLATE.r;
      p.baseW = (p.asset ? p.asset.scale : 0.3) * 2 * PLATE.r * 0.95;
    });
    const all = onPlate.concat(side);
    all.forEach((p) => (p.sprites = sprites(p)));

    // Callouts: each item labels on its own side; spread labels so they don't collide.
    // Items near the middle (like a centred main) label on whichever side has fewer labels.
    const nearMiddle = (p) => Math.abs(p.x - PLATE.cx) < PLATE.r * 0.15;
    all.filter((p) => !nearMiddle(p)).forEach((p) => (p.side = p.x < PLATE.cx ? "left" : "right"));
    all.filter(nearMiddle).forEach((p) => {
      const left = all.filter((q) => q.side === "left").length, right = all.filter((q) => q.side === "right").length;
      p.side = left < right || (left === right && p.x < PLATE.cx) ? "left" : "right";
    });
    all.forEach((p) => {
      const cx = p.sprites.reduce((s, q) => s + q.x, 0) / p.sprites.length;
      const cy = p.sprites.reduce((s, q) => s + q.y, 0) / p.sprites.length;
      p.ax = cx + (p.side === "left" ? -1 : 1) * p.baseW * 0.1;
      p.ay = cy;
    });
    for (const sideName of ["left", "right"]) {
      const group = all.filter((p) => p.side === sideName).sort((a, b) => a.ay - b.ay);
      let prev = -Infinity;
      group.forEach((p) => {
        const dy = p.ay - PLATE.cy;
        const target = PLATE.cy + dy * SLANT_SPREAD + (dy < 0 ? -SLANT_MIN : SLANT_MIN);
        p.ly = Math.max(target, prev + LABEL_GAP, 50);
        prev = p.ly;
      });
      const overflow = prev - (STAGE.h - 70);
      if (overflow > 0) group.forEach((p) => (p.ly -= overflow));
    }
    // Number pins in reading order for the compact legend.
    all.slice().sort((a, b) => a.ly - b.ly || a.x - b.x).forEach((p, i) => (p.num = i + 1));
    return all;
  }

  function plateSVG() {
    const { cx, cy, r } = PLATE;
    return `
      <defs>
        <radialGradient id="pv-plate" cx="50%" cy="48%" r="50%">
          <stop offset="0"     stop-color="#ffffff"/>
          <stop offset="0.83"  stop-color="#fefefe"/>
          <stop offset="0.86"  stop-color="#f2efed"/>
          <stop offset="0.885" stop-color="#fbfaf9"/>
          <stop offset="0.92"  stop-color="#ffffff"/>
          <stop offset="0.965" stop-color="#fcfbfa"/>
          <stop offset="0.99"  stop-color="#ebe7e4"/>
          <stop offset="1"     stop-color="#e0dbd7"/>
        </radialGradient>
        <filter id="pv-plate-shadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#6b4f45" flood-opacity="0.12"/>
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#3a2a24" flood-opacity="0.07"/>
        </filter>
      </defs>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#pv-plate)" filter="url(#pv-plate-shadow)"/>
      <circle cx="${cx}" cy="${cy}" r="${r * WELL}" fill="none" stroke="#ede8e5" stroke-width="1"/>`;
  }

  function labelBody(item) {
    const m = item.macros || {};
    const n = servingsOf(item);
    const tot = (v) => (v == null ? null : v * n);
    return `<div class="pv-name">${esc(item.name)}</div>
      <div class="pv-meta">
        <span class="pv-cal">${fmt(tot(m.calories))} cal</span>${n > 1 ? `<span class="pv-servings">${n} servings</span>` : ""}
        <span class="pv-macros">
          <span class="pv-macro pv-p">${fmt(tot(m.protein_g))}g P</span>
          <span class="pv-macro pv-c">${fmt(tot(m.carbs_g))}g C</span>
          <span class="pv-macro pv-f">${fmt(tot(m.fat_g))}g F</span>
        </span>
      </div>`;
  }

  function mount(el, opts = {}) {
    const assetBase = opts.assetBase ?? "assets/food/";
    el.classList.add("pv");
    el.innerHTML = `<div class="pv-stage"></div><ol class="pv-legend"></ol>`;
    const stage = el.querySelector(".pv-stage");
    const legend = el.querySelector(".pv-legend");
    let meal = null;
    let compact = null;
    let enter = opts.firstEnter ?? "slow"; // speed of the next render's entrance; null = none
    // SVG units per CSS px, so leader lines slide the same distance as the HTML labels.
    const setSvgScale = () => {
      const view = compact ? COMPACT_CROP : { x: 0, w: STAGE.w };
      if (el.clientWidth) stage.style.setProperty("--pv-svg-scale", view.w / el.clientWidth);
    };

    function draw() {
      if (!meal) return;
      const view = compact ? COMPACT_CROP : { x: 0, w: STAGE.w };
      const px = (x) => ((x - view.x) / view.w) * 100;
      const py = (y) => (y / STAGE.h) * 100;
      const pw = (w) => (w / view.w) * 100;
      const items = layout(meal.items || []);
      el.classList.toggle("pv--compact", compact);
      // Only render() animates; a redraw from resizing just swaps the layout in place.
      stage.className = "pv-stage" + (enter ? ` pv-enter pv-enter--${enter}` : "");
      enter = null;
      // Each item slides in from its label side, in waves: mains, then starches and veg
      // together, then everything else (other foods, side bowls). Empty waves are skipped.
      const waveOf = (p) => (p.kind !== "plate" ? 2 : ENTER_WAVE[p.role] ?? 2);
      const waves = [...new Set(items.map(waveOf))].sort((a, b) => a - b);
      const motion = (p) => `--from:${p.side === "left" ? -1 : 1};--i:${waves.indexOf(waveOf(p))}`;
      stage.style.aspectRatio = `${view.w} / ${STAGE.h}`;
      setSvgScale();

      const lines = compact ? "" : items.map((p) => {
        const ex = ELBOW_X[p.side], lx = LABEL_X[p.side];
        return `<g class="pv-callout" style="${motion(p)}"><path class="pv-leader" d="M${p.ax},${p.ay} L${ex},${p.ly} L${lx},${p.ly}"/>
                <circle class="pv-dot" cx="${p.ax}" cy="${p.ay}" r="4.2"/></g>`;
      }).join("");
      const pins = !compact ? "" : items.map((p) =>
        `<g class="pv-pin pv-callout" style="${motion(p)}"><circle cx="${p.ax}" cy="${p.ay}" r="15"/><text x="${p.ax}" y="${p.ay}">${p.num}</text></g>`).join("");

      // Layering: side bowls first; then on-plate foods from biggest to smallest, so nestled
      // sides sit on top of a ring main instead of disappearing under it; a centred main (5–6
      // items) goes last so it stays the focus. Within an item, back copies (higher on screen) first.
      const rank = (p) => (p.kind !== "plate" ? 0 : p.centred ? 2 : 1);
      const drawOrder = (a, b) => rank(a) - rank(b) || b.baseW - a.baseW;
      const foods = items.slice().sort(drawOrder).flatMap((p) =>
        p.sprites.slice().sort((a, b) => a.y - b.y).map((s) => {
          const style = `left:${px(s.x)}%;top:${py(s.y)}%;width:${pw(s.w)}%;--rot:${s.rot}deg;--flip:${s.flip ? -1 : 1};${motion(p)}`;
          return p.asset
            ? `<img class="pv-food pv-food--${p.kind}" src="${assetBase}${p.asset.src}" alt="" style="${style}" draggable="false">`
            : `<div class="pv-food pv-food--missing" style="${style}"><span>${esc(p.item.generic_name || p.item.name)}</span></div>`;
        })).join("");

      const labels = compact ? "" : items.map((p) => {
        const pos = p.side === "left" ? `right:${100 - px(LABEL_X.left)}%` : `left:${px(LABEL_X.right)}%`;
        return `<div class="pv-label pv-label--${p.side}" style="${pos};top:${py(p.ly)}%;${motion(p)}">${labelBody(p.item)}</div>`;
      }).join("");

      stage.innerHTML = `
        <svg class="pv-svg" viewBox="${view.x} 0 ${view.w} ${STAGE.h}" aria-hidden="true">${plateSVG()}</svg>
        <div role="img" aria-label="${esc(items.map((p) => p.item.name).join(", "))}">${foods}</div>
        <svg class="pv-svg pv-svg--over" viewBox="${view.x} 0 ${view.w} ${STAGE.h}" aria-hidden="true">${lines}${pins}</svg>
        ${labels}`;
      legend.innerHTML = !compact ? "" : items.slice().sort((a, b) => a.num - b.num)
        .map((p) => `<li><span class="pv-num">${p.num}</span><div>${labelBody(p.item)}</div></li>`).join("");
    }

    const ro = new ResizeObserver(([entry]) => {
      const next = entry.contentRect.width < COMPACT_BELOW;
      if (next !== compact) { compact = next; draw(); } else setSvgScale();
    });
    ro.observe(el);

    return {
      render(m) {
        if (meal) enter = "fast";
        meal = m;
        if (compact !== null) draw();
      },
      destroy() { ro.disconnect(); el.innerHTML = ""; },
    };
  }

  window.PlateVisualizer = { mount };
})();
