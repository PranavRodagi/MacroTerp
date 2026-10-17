// Plate visualizer: draws a top-down plate with food cut-outs and callout labels.
//
//   const viz = PlateVisualizer.mount(element, { assetBase: "assets/food/" });
//   viz.render(meal);   // meal = one entry of the meals JSON
//
// Everything is laid out in a fixed coordinate space (STAGE units) and scaled
// to the container, so it looks the same at any size. Below COMPACT_BELOW px
// wide, side labels are swapped for numbered pins plus a legend.
(function () {
  const STAGE = { w: 1000, h: 680 };
  const PLATE = { cx: 500, cy: 350, r: 280 };
  const COMPACT_BELOW = 620;           // container px
  const COMPACT_CROP = { x: 150, w: 700 };
  const LABEL_GAP = 96;                // min vertical gap between labels (stage units)
  const LABEL_X = { left: 170, right: 830 };
  const ELBOW_X = { left: 200, right: 800 };
  const ROLE_ORDER = { main: 0, starch: 1, veg: 2, other: 3 };
  const MAX_COPIES = 4;

  // Where each item's cluster sits, in units of plate radius (y points down).
  // Index 0 is the biggest spot, for the main item.
  const ZONES = {
    1: [[0, 0]],
    2: [[-0.20, 0.10], [0.32, -0.12]],
    3: [[-0.22, 0.24], [0.26, -0.26], [0.38, 0.34]],
    4: [[-0.16, 0.30], [0.26, -0.24], [0.44, 0.30], [-0.32, -0.26]],
    5: [[-0.20, 0.26], [0.26, -0.30], [0.44, 0.24], [-0.36, -0.26], [0.10, 0.56]],
  };
  const SIZE_FACTOR = { 1: 1.2, 2: 1.08, 3: 1, 4: 0.95, 5: 0.86 };
  // Copies of a repeated item: [along the rim, toward the rim] in copy widths.
  const COPY_OFFSETS = {
    1: [[0, 0]],
    2: [[-0.26, -0.04], [0.26, 0.06]],
    3: [[-0.30, -0.08], [0.28, -0.04], [0.0, 0.22]],
    4: [[-0.30, -0.14], [0.28, -0.16], [-0.16, 0.22], [0.24, 0.20]],
  };
  const COPY_TWIST = [0, 38, -27, 64];  // extra rotation per copy so repeats don't look stamped
  // Side bowls sit just off the rim.
  const SIDE_SLOTS = [[0.80, -0.86], [-0.80, -0.86], [0.84, 0.86]];
  // Labels are pushed away from the plate's horizontal midline so every
  // leader line gets a visible slant.
  const SLANT_SPREAD = 1.3;
  const SLANT_MIN = 46;

  const fmt = (n) => (n == null ? "–" : Math.round(n * 10) / 10);
  const keyOf = (name) => (name || "").trim().toLowerCase().replace(/\s+/g, "-");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const servingsOf = (item) => Math.max(1, Math.round(item.servings || 1));

  // Turn one item into the images that draw it (one, or several copies).
  function sprites(p) {
    const n = servingsOf(p.item);
    const repeat = p.asset && p.asset.repeat;
    const copies = repeat ? Math.min(n, MAX_COPIES) : 1;
    // Non-repeating items grow a little per extra serving instead.
    const w = p.baseW * (repeat ? 1 - 0.06 * (copies - 1) : Math.min(1.35, 1 + 0.15 * (n - 1)));
    // Orient the cluster so copies spread along the rim, not into the centre.
    const len = Math.hypot(p.x - PLATE.cx, p.y - PLATE.cy);
    const rad = len > 1 ? [(p.x - PLATE.cx) / len, (p.y - PLATE.cy) / len] : [0, 1];
    const tan = [-rad[1], rad[0]];
    const base = p.asset ? p.asset.rotate : 0;
    return COPY_OFFSETS[copies].map(([t, r], k) => ({
      x: p.x + (t * tan[0] + r * rad[0]) * w,
      y: p.y + (t * tan[1] + r * rad[1]) * w,
      w,
      rot: base + COPY_TWIST[k],
      flip: k % 2 === 1,
    }));
  }

  function layout(items) {
    const assets = window.FOOD_ASSETS || {};
    const placed = items.map((item) => {
      const asset = assets[keyOf(item.generic_name)] || null;
      return { item, asset, role: asset ? asset.role : "other", kind: asset ? asset.kind : "plate" };
    });
    let onPlate = placed.filter((p) => p.kind === "plate");
    let side = placed.filter((p) => p.kind !== "plate");
    if (onPlate.length === 0 && side.length) onPlate = [side.shift()]; // lone bowl goes in the middle
    if (onPlate.length > 5) { side = side.concat(onPlate.slice(5)); onPlate = onPlate.slice(0, 5); }
    onPlate.sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
    side = side.slice(0, SIDE_SLOTS.length);

    const n = onPlate.length;
    const factor = SIZE_FACTOR[n] || 0.86;
    onPlate.forEach((p, i) => {
      const [zx, zy] = ZONES[n][i];
      p.x = PLATE.cx + zx * PLATE.r;
      p.y = PLATE.cy + zy * PLATE.r;
      p.baseW = (p.asset ? p.asset.scale : 0.3) * 2 * PLATE.r * factor;
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
    all.forEach((p) => {
      p.side = p.x < PLATE.cx ? "left" : "right";
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
          <stop offset="0.68"  stop-color="#fefefe"/>
          <stop offset="0.715" stop-color="#f2efed"/>
          <stop offset="0.745" stop-color="#fbfaf9"/>
          <stop offset="0.80"  stop-color="#ffffff"/>
          <stop offset="0.955" stop-color="#fcfbfa"/>
          <stop offset="0.99"  stop-color="#ebe7e4"/>
          <stop offset="1"     stop-color="#e0dbd7"/>
        </radialGradient>
        <filter id="pv-plate-shadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#6b4f45" flood-opacity="0.12"/>
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#3a2a24" flood-opacity="0.07"/>
        </filter>
      </defs>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#pv-plate)" filter="url(#pv-plate-shadow)"/>
      <circle cx="${cx}" cy="${cy}" r="${r * 0.73}" fill="none" stroke="#ede8e5" stroke-width="1"/>`;
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
    const assetBase = opts.assetBase || "assets/food/";
    el.classList.add("pv");
    el.innerHTML = `<div class="pv-stage"></div><ol class="pv-legend"></ol>`;
    const stage = el.querySelector(".pv-stage");
    const legend = el.querySelector(".pv-legend");
    let meal = null;
    let compact = null;

    function draw() {
      if (!meal) return;
      const view = compact ? COMPACT_CROP : { x: 0, w: STAGE.w };
      const px = (x) => ((x - view.x) / view.w) * 100;
      const py = (y) => (y / STAGE.h) * 100;
      const pw = (w) => (w / view.w) * 100;
      const items = layout(meal.items || []);
      el.classList.toggle("pv--compact", compact);
      stage.style.aspectRatio = `${view.w} / ${STAGE.h}`;

      const lines = compact ? "" : items.map((p) => {
        const ex = ELBOW_X[p.side], lx = LABEL_X[p.side];
        return `<path class="pv-leader" d="M${p.ax},${p.ay} L${ex},${p.ly} L${lx},${p.ly}"/>
                <circle class="pv-dot" cx="${p.ax}" cy="${p.ay}" r="4.2"/>`;
      }).join("");
      const pins = !compact ? "" : items.map((p) =>
        `<g class="pv-pin"><circle cx="${p.ax}" cy="${p.ay}" r="15"/><text x="${p.ax}" y="${p.ay}">${p.num}</text></g>`).join("");

      // Layering: side bowls, then starch, veg, and the main on top; within an
      // item, back copies (higher on screen) first.
      const layer = (p) => (p.kind !== "plate" ? 0 : p.role === "main" ? 3 : p.role === "starch" ? 1 : 2);
      const foods = items.slice().sort((a, b) => layer(a) - layer(b)).flatMap((p) =>
        p.sprites.slice().sort((a, b) => a.y - b.y).map((s) => {
          const style = `left:${px(s.x)}%;top:${py(s.y)}%;width:${pw(s.w)}%;--rot:${s.rot}deg;--flip:${s.flip ? -1 : 1}`;
          return p.asset
            ? `<img class="pv-food pv-food--${p.kind}" src="${assetBase}${p.asset.src}" alt="" style="${style}" draggable="false">`
            : `<div class="pv-food pv-food--missing" style="${style}"><span>${esc(p.item.generic_name || p.item.name)}</span></div>`;
        })).join("");

      const labels = compact ? "" : items.map((p) => {
        const pos = p.side === "left" ? `right:${100 - px(LABEL_X.left)}%` : `left:${px(LABEL_X.right)}%`;
        return `<div class="pv-label pv-label--${p.side}" style="${pos};top:${py(p.ly)}%">${labelBody(p.item)}</div>`;
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
      if (next !== compact) { compact = next; draw(); }
    });
    ro.observe(el);

    return {
      render(m) { meal = m; if (compact !== null) draw(); },
      destroy() { ro.disconnect(); el.innerHTML = ""; },
    };
  }

  window.PlateVisualizer = { mount };
})();
