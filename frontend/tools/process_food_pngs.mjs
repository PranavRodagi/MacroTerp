// Turn transparent food PNG cut-outs into the plate visualizer's WebP assets.
//
//   cd frontend/app && npm run food-images            # all PNGs in plate-visualizer/assets/food
//   cd frontend/app && npm run food-images -- a.png   # just these
//
// For each PNG: trim transparent edges, add 8px padding, fit within 900px, save as
// <generic-name>.webp (quality 88) next to it. Same output as process_food_images.py,
// for images that are already clean transparent cut-outs. Use the Python script for
// fake checkerboard backgrounds or sprite sheets.
//
// The output name is the generic_name from food_categories.toml in kebab-case, which
// is what food-assets.js keys on. Files named differently are mapped in RENAMES.
// After converting, add an entry to plate-visualizer/food-assets.js.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// sharp is a devDependency of frontend/app; resolve it from there.
const sharp = createRequire(path.join(HERE, "../app/package.json"))("sharp");
const DIR = path.resolve(HERE, "../plate-visualizer/assets/food");
const MAX_SIDE = 900;
const PAD = 8;

// PNG file name (without .png) → generic_name, when they differ.
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

const files = process.argv.length > 2 ? process.argv.slice(2).map((f) => path.basename(f)) : fs.readdirSync(DIR).filter((f) => f.endsWith(".png"));

for (const file of files.sort()) {
  const stem = file.replace(/\.png$/i, "");
  const name = kebab(RENAMES[stem] ?? stem);
  const out = path.join(DIR, `${name}.webp`);
  const trimmed = await sharp(path.join(DIR, file)).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 }).toBuffer();
  const info = await sharp(trimmed)
    .extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(MAX_SIDE - 2 * PAD, MAX_SIDE - 2 * PAD, { fit: "inside", withoutEnlargement: true }) // sharp resizes before extend
    .webp({ quality: 88, effort: 6 })
    .toFile(out);
  console.log(`${file.padEnd(24)} -> ${path.basename(out).padEnd(24)} ${info.width}x${info.height} ${(info.size / 1024).toFixed(0)} KB`);
}
