// Maps a meal item's `generic_name` to its cut-out image and how it sits on the plate.
// Keys are the generic names from food_categories.toml in kebab-case ("mac and cheese"
// → "mac-and-cheese"). Names with no entry show a placeholder disc.
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
//
// New images: drop a transparent PNG in assets/food and run `npm run food-images`
// in frontend/app (see frontend/tools/process_food_pngs.mjs), then add an entry here.
window.FOOD_ASSETS = {
  // Mains
  chicken:            { src: "chicken.webp",          scale: 0.44, role: "main",   kind: "plate", repeat: false, rotate: -8 },
  turkey:             { src: "turkey.webp",           scale: 0.40, role: "main",   kind: "plate", repeat: false, rotate: -6 },
  beef:               { src: "beef.webp",             scale: 0.34, role: "main",   kind: "plate", repeat: false, rotate: 0 },
  pork:               { src: "pork.webp",             scale: 0.38, role: "main",   kind: "plate", repeat: false, rotate: 0 },
  sausage:            { src: "sausage.webp",          scale: 0.40, role: "main",   kind: "plate", repeat: true,  rotate: -10 },
  bacon:              { src: "bacon.webp",            scale: 0.40, role: "main",   kind: "plate", repeat: false, rotate: -8 },
  fish:               { src: "fish.webp",             scale: 0.42, role: "main",   kind: "plate", repeat: true,  rotate: -14 },
  shrimp:             { src: "shrimp.webp",           scale: 0.34, role: "main",   kind: "plate", repeat: false, rotate: 0 },
  tofu:               { src: "tofu.webp",             scale: 0.38, role: "main",   kind: "plate", repeat: false, rotate: 0 },
  eggs:               { src: "eggs.webp",             scale: 0.44, role: "main",   kind: "plate", repeat: false, rotate: 0 },
  burger:             { src: "burger.webp",           scale: 0.46, role: "main",   kind: "plate", repeat: false, rotate: 0 },
  sandwich:           { src: "sandwich.webp",         scale: 0.48, role: "main",   kind: "plate", repeat: false, rotate: 6 },
  wrap:               { src: "wrap.webp",             scale: 0.46, role: "main",   kind: "plate", repeat: true,  rotate: -14 },
  "hot-dog":          { src: "hot-dog.webp",          scale: 0.44, role: "main",   kind: "plate", repeat: true,  rotate: -10 },
  pizza:              { src: "pizza.webp",            scale: 0.34, role: "main",   kind: "plate", repeat: true,  rotate: 12 },
  quesadilla:         { src: "quesadilla.webp",       scale: 0.36, role: "main",   kind: "plate", repeat: true,  rotate: 0 },
  "mac-and-cheese":   { src: "mac-and-cheese.webp",   scale: 0.34, role: "main",   kind: "plate", repeat: false, rotate: 0 },
  pasta:              { src: "pasta.webp",            scale: 0.40, role: "main",   kind: "plate", repeat: false, rotate: 0 },
  pancakes:           { src: "pancakes.webp",         scale: 0.38, role: "main",   kind: "plate", repeat: true,  rotate: 0 },
  waffles:            { src: "waffles.webp",          scale: 0.38, role: "main",   kind: "plate", repeat: true,  rotate: 8 },
  "french-toast":     { src: "french-toast.webp",     scale: 0.40, role: "main",   kind: "plate", repeat: false, rotate: -6 },

  // Starches and protein sides
  rice:               { src: "rice.webp",             scale: 0.30, role: "starch", kind: "plate", repeat: true,  rotate: 0 },
  "mashed-potatoes":  { src: "mashed-potatoes.webp",  scale: 0.29, role: "starch", kind: "plate", repeat: true,  rotate: 0 },
  "roasted-potatoes": { src: "roasted-potatoes.webp", scale: 0.30, role: "starch", kind: "plate", repeat: true,  rotate: 0 },
  fries:              { src: "fries.webp",            scale: 0.34, role: "starch", kind: "plate", repeat: false, rotate: 0 },
  chickpeas:          { src: "chickpeas.webp",        scale: 0.28, role: "starch", kind: "plate", repeat: true,  rotate: 0 },

  // Vegetables
  broccoli:           { src: "broccoli.webp",         scale: 0.28, role: "veg",    kind: "plate", repeat: true,  rotate: 10 },
  "green-beans":      { src: "green-beans.webp",      scale: 0.32, role: "veg",    kind: "plate", repeat: true,  rotate: -25 },
  "brussels-sprouts": { src: "brussels-sprouts.webp", scale: 0.28, role: "veg",    kind: "plate", repeat: true,  rotate: 0 },
  carrots:            { src: "carrots.webp",          scale: 0.28, role: "veg",    kind: "plate", repeat: true,  rotate: 0 },
  cauliflower:        { src: "cauliflower.webp",      scale: 0.30, role: "veg",    kind: "plate", repeat: true,  rotate: 0 },
  corn:               { src: "corn.webp",             scale: 0.28, role: "veg",    kind: "plate", repeat: true,  rotate: 20 },
  "mixed-vegetables": { src: "mixed-vegetables.webp", scale: 0.30, role: "veg",    kind: "plate", repeat: true,  rotate: 0 },
  salad:              { src: "salad.webp",            scale: 0.36, role: "veg",    kind: "plate", repeat: false, rotate: 0 },

  // Sides, desserts, bowls
  muffin:             { src: "muffin.webp",           scale: 0.24, role: "other",  kind: "plate", repeat: true,  rotate: 0 },
  cookie:             { src: "cookie.webp",           scale: 0.22, role: "other",  kind: "plate", repeat: true,  rotate: 0 },
  yogurt:             { src: "yogurt.webp",           scale: 0.24, role: "other",  kind: "plate", repeat: true,  rotate: 0 },
  fruit:              { src: "fruit.webp",            scale: 0.34, role: "other",  kind: "bowl",  repeat: false, rotate: 0 },
  cereal:             { src: "cereal.webp",           scale: 0.36, role: "other",  kind: "bowl",  repeat: false, rotate: 0 },
  "ice-cream":        { src: "ice-cream.webp",        scale: 0.32, role: "other",  kind: "bowl",  repeat: false, rotate: 0 },
  soup:               { src: "soup.webp",             scale: 0.38, role: "other",  kind: "bowl",  repeat: false, rotate: 0 },
};

// The recommender renames vegan/vegetarian versions of meat categories "plant-based <meat>"
// (see `meat = true` in food_categories.toml); show them with the same image.
for (const meat of ["chicken", "turkey", "beef", "pork", "sausage", "bacon", "fish", "shrimp"]) {
  window.FOOD_ASSETS["plant-based-" + meat] = { ...window.FOOD_ASSETS[meat] };
}

// Older names used by the standalone demo's sample meals.
window.FOOD_ASSETS.spaghetti = { ...window.FOOD_ASSETS.pasta };
window.FOOD_ASSETS.salmon = { ...window.FOOD_ASSETS.fish };
