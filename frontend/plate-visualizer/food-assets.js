// Maps a meal item's `generic_name` to its cut-out image and how it sits on the plate.
//
// scale  – width of ONE serving as a fraction of the plate's diameter. Tuned by
//          eye per image, since the photos aren't shot at a common scale.
// role   – placement priority: main > starch > veg > other. Main gets the
//          biggest spot and is drawn on top.
// kind   – "plate" sits on the plate; "bowl" already includes its own bowl, so
//          it goes beside the plate as a side dish.
// repeat – true: extra servings show as extra overlapping copies (scoops of
//          rice, florets). false: extra servings make the one image bigger.
// rotate – base rotation in degrees.
window.FOOD_ASSETS = {
  chicken:            { src: "chicken.webp",          scale: 0.44, role: "main",   kind: "plate", repeat: false, rotate: -8 },
  tofu:               { src: "tofu.webp",             scale: 0.38, role: "main",   kind: "plate", repeat: false, rotate: 0 },
  salmon:             { src: "salmon.webp",           scale: 0.42, role: "main",   kind: "plate", repeat: true,  rotate: -14 },
  eggs:               { src: "eggs.webp",             scale: 0.44, role: "main",   kind: "plate", repeat: false, rotate: 0 },
  burger:             { src: "burger.webp",           scale: 0.46, role: "main",   kind: "plate", repeat: false, rotate: 0 },
  sandwich:           { src: "sandwich.webp",         scale: 0.48, role: "main",   kind: "plate", repeat: false, rotate: 6 },
  spaghetti:          { src: "spaghetti.webp",        scale: 0.44, role: "main",   kind: "bowl",  repeat: false, rotate: 0 },
  rice:               { src: "rice.webp",             scale: 0.30, role: "starch", kind: "plate", repeat: true,  rotate: 0 },
  "mashed-potatoes":  { src: "mashed-potatoes.webp",  scale: 0.29, role: "starch", kind: "plate", repeat: true,  rotate: 0 },
  "roasted-potatoes": { src: "roasted-potatoes.webp", scale: 0.30, role: "starch", kind: "plate", repeat: true,  rotate: 0 },
  broccoli:           { src: "broccoli.webp",         scale: 0.28, role: "veg",    kind: "plate", repeat: true,  rotate: 10 },
  "green-beans":      { src: "green-beans.webp",      scale: 0.32, role: "veg",    kind: "plate", repeat: true,  rotate: -25 },
  fruit:              { src: "fruit.webp",            scale: 0.34, role: "other",  kind: "bowl",  repeat: false, rotate: 0 },
};
