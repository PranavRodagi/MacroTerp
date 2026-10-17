"""Clean up raw food photos into consistent transparent cut-outs for the plate visualizer.

Usage:
    python process_food_images.py <raw_dir> <out_dir>

Needs: pillow, numpy, scipy.

Handles three kinds of input:
  - real transparent PNGs: despeckle, trim, resize
  - JPGs with a fake checkerboard "transparent" background: key out the
    grey/white checker, keep the food
  - a sprite sheet of several foods: split into one file per food
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

MAX_SIDE = 900  # final long side in px; plenty for an on-plate element

# Raw file -> output name. Sheets map to a row-major list of names.
SINGLES = {
    "grilled-chicken.png": "chicken",
    "tofu.png": "tofu",
    "eggs.jpg": "eggs",
    "salmon.jpg": "salmon",
}
SHEETS = {
    "upscalemedia-transformed.png": [
        "mashed-potatoes", "roasted-potatoes", "green-beans",
        "broccoli", "fruit", "burger",
        "sandwich", "spaghetti", "rice",
    ],
}


def keep_big_parts(mask, min_frac=0.02):
    """Drop specks: keep connected parts at least min_frac of the largest."""
    lab, n = ndimage.label(mask)
    if n == 0:
        return mask
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    keep = np.isin(lab, 1 + np.flatnonzero(sizes >= sizes.max() * min_frac))
    return keep


def checker_to_alpha(rgb):
    """Fake transparency: checker squares are bright and colourless; food isn't."""
    f = rgb.astype(np.float32)
    mx, mn = f.max(axis=2), f.min(axis=2)
    sat = (mx - mn) / np.maximum(mx, 1)
    background = (sat < 0.10) & (mx > 150)
    fg = ~background
    # Fill pinholes (pepper flecks, highlights) and smooth the outline.
    fg = ndimage.binary_opening(fg, iterations=2)
    fg = ndimage.binary_closing(fg, iterations=4)
    fg = ndimage.binary_fill_holes(fg)
    fg = keep_big_parts(fg, min_frac=0.5)
    fg = ndimage.binary_erosion(fg, iterations=1)  # pull in off the grey fringe
    alpha = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    return np.array(alpha)


def clean_alpha(a):
    """Real alpha: remove floating specks, keep soft edges."""
    solid = keep_big_parts(a > 40, min_frac=0.01)
    solid = ndimage.binary_dilation(solid, iterations=3)  # keep the soft edge around kept parts
    return np.where(solid, a, 0).astype(np.uint8)


def finish(rgba, name, out_dir):
    im = Image.fromarray(rgba, "RGBA")
    # Zero the colour under transparent pixels so stray fringe colours can't leak.
    arr = np.array(im)
    arr[arr[..., 3] == 0, :3] = 255
    im = Image.fromarray(arr, "RGBA")
    bbox = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    im = im.crop(bbox)
    pad = 8
    canvas = Image.new("RGBA", (im.width + 2 * pad, im.height + 2 * pad), (255, 255, 255, 0))
    canvas.paste(im, (pad, pad))
    canvas.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    path = out_dir / f"{name}.webp"
    canvas.save(path, "WEBP", quality=88, method=6)
    print(f"{name:18s} {canvas.size}  -> {path.name}")


def split_sheet(rgba, names):
    a = rgba[..., 3]
    blobs = ndimage.binary_dilation(a > 40, iterations=25)  # merge each food's pieces
    lab, n = ndimage.label(blobs)
    sizes = ndimage.sum(blobs, lab, range(1, n + 1))
    ids = [i + 1 for i in np.argsort(sizes)[::-1][: len(names)]]
    boxes = [ndimage.find_objects((lab == i).astype(int))[0] for i in ids]
    # Row-major order: bucket by row (centre y), then sort by x.
    h = rgba.shape[0]
    items = sorted(zip(ids, boxes), key=lambda t: (
        int(((t[1][0].start + t[1][0].stop) / 2) / (h / 3)), t[1][1].start))
    for (i, (ys, xs)), name in zip(items, names):
        piece = rgba[ys, xs].copy()
        piece[..., 3] = np.where(lab[ys, xs] == i, piece[..., 3], 0)
        yield name, piece


def main(raw_dir, out_dir):
    raw_dir, out_dir = Path(raw_dir), Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for fname, name in SINGLES.items():
        im = Image.open(raw_dir / fname)
        if "A" in im.getbands():
            rgba = np.array(im.convert("RGBA"))
            rgba[..., 3] = clean_alpha(rgba[..., 3])
        else:
            rgb = np.array(im.convert("RGB"))
            rgba = np.dstack([rgb, checker_to_alpha(rgb)])
        finish(rgba, name, out_dir)
    for fname, names in SHEETS.items():
        rgba = np.array(Image.open(raw_dir / fname).convert("RGBA"))
        for name, piece in split_sheet(rgba, names):
            piece[..., 3] = clean_alpha(piece[..., 3])
            finish(piece, name, out_dir)


if __name__ == "__main__":
    main(*sys.argv[1:3])
