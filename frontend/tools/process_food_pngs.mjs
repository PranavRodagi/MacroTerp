// Turn food cut-outs into the plate visualizer's WebP assets.
//
//   cd frontend/app
//   npm run food-images                                   # every PNG in plate-visualizer/assets/food
//   npm run food-images -- path/to/a.png path/to/b.png    # just these (any folder)
//   npm run food-images -- --checker --name noodles x.jpg # fake checkerboard background
//
// Options:
//   --checker     the image has a fake "transparent" checkerboard (or plain white/grey)
//                 background baked in: key it out (same method as process_food_images.py)
//   --name <n>    generic_name to save as (one input file only); default: from the file name
//   --out <dir>   where to write; default: plate-visualizer/assets/food
//
// For each image: trim transparent edges, add 8px padding, fit to 900px (smaller images are
// upscaled with Lanczos resampling), save as <generic-name>.webp (quality 88).
//
// The output name is the generic_name from food_categories.toml in kebab-case, which is what
// food-assets.js keys on. File names that differ are mapped in RENAMES (or use --name).
// After converting, add an entry to plate-visualizer/food-assets.js.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// sharp is a devDependency of frontend/app; resolve it from there.
const sharp = createRequire(path.join(HERE, "../app/package.json"))("sharp");
const ASSETS = path.resolve(HERE, "../plate-visualizer/assets/food");
const MAX_SIDE = 900;
const PAD = 8;

// Source file name (without extension) → generic_name, when they differ.
const RENAMES = {
  brussels_sprouts: "brussels sprouts",
  deli_pork: "pork",
  french_toast: "french toast",
  "ground beef": "beef",
  hot_dawg: "hot dog",
  ice_cream: "ice cream",
  macncheese: "mac and cheese",
  mixed_veggies: "mixed vegetables",
  pancake: "pancakes",
  spaghetti: "pasta",
  waffle: "waffles",
  yoghurt: "yogurt",
};

const kebab = (s) => s.trim().toLowerCase().replace(/[\s_]+/g, "-");

// ---- Fake-checkerboard removal (based on checker_to_alpha in process_food_images.py) ----
// Checker squares are bright and colourless; food isn't. Clean the mask with morphology
// (4-connected cross element, like scipy's default), then soften the edge. Unlike the Python
// version it keeps background pockets inside loose foods (noodles, beans) transparent.

function erode(mask, w, h, times) {
  for (let t = 0; t < times; t++) {
    const next = new Uint8Array(mask.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        next[i] = mask[i] && x > 0 && mask[i - 1] && x < w - 1 && mask[i + 1] && y > 0 && mask[i - w] && y < h - 1 && mask[i + w] ? 1 : 0;
      }
    mask = next;
  }
  return mask;
}

function dilate(mask, w, h, times) {
  for (let t = 0; t < times; t++) {
    const next = new Uint8Array(mask.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        next[i] = mask[i] || (x > 0 && mask[i - 1]) || (x < w - 1 && mask[i + 1]) || (y > 0 && mask[i - w]) || (y < h - 1 && mask[i + w]) ? 1 : 0;
      }
    mask = next;
  }
  return mask;
}

// Label 4-connected regions where mask[i] === value; returns [labels, sizes].
function label(mask, w, h, value) {
  const labels = new Int32Array(mask.length);
  const sizes = [0];
  const stack = [];
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== value || labels[start]) continue;
    const id = sizes.length;
    let size = 0;
    labels[start] = id;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop();
      size++;
      const x = i % w, y = (i - x) / w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1])
        if (j >= 0 && mask[j] === value && !labels[j]) {
          labels[j] = id;
          stack.push(j);
        }
    }
    sizes.push(size);
  }
  return [labels, sizes];
}

// Fill enclosed holes (shine, highlights, specks) but keep gaps that are really background,
// e.g. checkerboard showing between noodles or beans. A hole stays transparent only if it's
// at least `minHole` px, mostly background-coloured, and either contains both checker shades
// (white and light grey, each ≥15%) or is one flat shade (a single checker square showing).
// A highlight on the food is a soft gradient, so it gets filled back in.
// `shade` per pixel: 0 = not background-coloured, 1 = white-ish, 2 = light grey.
// `bright` per pixel: max(r, g, b).
function fillHoles(mask, w, h, shade, bright, minHole) {
  const [labels, sizes] = label(mask, w, h, 0);
  const outside = new Set();
  for (let x = 0; x < w; x++) outside.add(labels[x]).add(labels[(h - 1) * w + x]);
  for (let y = 0; y < h; y++) outside.add(labels[y * w]).add(labels[y * w + w - 1]);
  const n = sizes.length;
  const white = new Int32Array(n), grey = new Int32Array(n), bgN = new Int32Array(n);
  const sum = new Float64Array(n), sumSq = new Float64Array(n);
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] || !shade[i]) continue;
    const id = labels[i];
    if (shade[i] === 1) white[id]++;
    else grey[id]++;
    bgN[id]++;
    sum[id] += bright[i];
    sumSq[id] += bright[i] * bright[i];
  }
  const isChecker = (id) => {
    if (sizes[id] < minHole || bgN[id] / sizes[id] < 0.5) return false;
    const twoShades = white[id] / sizes[id] >= 0.15 && grey[id] / sizes[id] >= 0.15;
    const mean = sum[id] / bgN[id];
    const flat = Math.sqrt(Math.max(0, sumSq[id] / bgN[id] - mean * mean)) < 6;
    return twoShades || flat;
  };
  return mask.map((v, i) => (v || !(outside.has(labels[i]) || isChecker(labels[i])) ? 1 : 0));
}

function keepBigParts(mask, w, h, minFrac) {
  const [labels, sizes] = label(mask, w, h, 1);
  const biggest = Math.max(0, ...sizes.slice(1));
  return mask.map((v, i) => (v && sizes[labels[i]] >= biggest * minFrac ? 1 : 0));
}

async function checkerToAlpha(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let fg = new Uint8Array(w * h);
  const shade = new Uint8Array(w * h);
  const bright = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = (mx - mn) / Math.max(mx, 1);
    const bg = sat < 0.1 && mx > 150;
    fg[i] = bg ? 0 : 1;
    shade[i] = !bg ? 0 : mx >= 230 ? 1 : 2;
    bright[i] = mx;
  }
  fg = dilate(erode(fg, w, h, 1), w, h, 1); // opening: drop specks
  fg = erode(dilate(fg, w, h, 2), w, h, 2); // light closing: smooth edges without bridging gaps between strands
  fg = fillHoles(fg, w, h, shade, bright, 40);
  fg = keepBigParts(fg, w, h, 0.02); // keep loose strands, drop specks
  fg = erode(fg, w, h, 1); // pull in off the grey fringe
  const alpha = await sharp(Buffer.from(fg.map((v) => v * 255)), { raw: { width: w, height: h, channels: 1 } })
    .blur(1.2)
    .extractChannel(0) // sharp may expand to RGB; keep one channel so alpha[i] lines up
    .raw()
    .toBuffer();
  if (info.channels !== 3 || alpha.length !== w * h) throw new Error(`unexpected buffer layout in ${file}`);
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = alpha[i];
    rgba[i * 4] = a ? data[i * 3] : 255; // white under fully transparent pixels so no fringe colour leaks
    rgba[i * 4 + 1] = a ? data[i * 3 + 1] : 255;
    rgba[i * 4 + 2] = a ? data[i * 3 + 2] : 255;
    rgba[i * 4 + 3] = a;
  }
  return sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

// ---- Main ----

const args = process.argv.slice(2);
const flag = (f) => {
  const i = args.indexOf(f);
  return i >= 0 ? args.splice(i, 1) && true : false;
};
const option = (f) => {
  const i = args.indexOf(f);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const checker = flag("--checker");
const forcedName = option("--name");
const outDir = path.resolve(option("--out") ?? ASSETS);
const files = args.length ? args.map((f) => path.resolve(f)) : fs.readdirSync(ASSETS).filter((f) => f.endsWith(".png")).map((f) => path.join(ASSETS, f));
if (forcedName && files.length !== 1) throw new Error("--name needs exactly one input file");

for (const file of files.sort()) {
  const stem = path.basename(file).replace(/\.(png|jpe?g|webp)$/i, "");
  const name = kebab(forcedName ?? RENAMES[stem] ?? stem);
  const out = path.join(outDir, `${name}.webp`);
  const source = checker ? await checkerToAlpha(file) : file;
  const trimmed = await sharp(source).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 }).toBuffer();
  const info = await sharp(trimmed)
    .resize(MAX_SIDE - 2 * PAD, MAX_SIDE - 2 * PAD, { fit: "inside", kernel: "lanczos3" }) // upscales small images too
    .extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 88, effort: 6 })
    .toFile(out);
  console.log(`${path.basename(file).padEnd(24)} -> ${path.relative(process.cwd(), out).padEnd(24)} ${info.width}x${info.height} ${(info.size / 1024).toFixed(0)} KB`);
}
