"""
UMD Dining Hall Meal Recommender
--------------------------------
Reads a scraped dining.umd.edu menu JSON and recommends one assembled meal
from each of the three dining halls for the user's current meal period.

Call `generate_meals(menu_data, settings)` with the parsed dining-menu JSON
object and a `UserSettings` describing the user's goals and restrictions.
Menu items are grouped into generic food names using the editable categories
in `food_categories.toml`; items that match no category are not used.

Example integration::

    import json
    import meal_recommender as recommender

    settings = recommender.UserSettings(
        daily_calorie_goal=2200,
        daily_protein_goal_g=120,
        calories_consumed=650,
        protein_consumed_g=35,
        current_meal="Lunch",
        dietary_restrictions={"vegetarian"},
    )

    with open("menu.json", encoding="utf-8") as menu_file:
        menu_data = json.load(menu_file)

    result = recommender.generate_meals(menu_data, settings)
    json_text = json.dumps(result, indent=2)

The function returns a JSON-serializable dictionary containing two alternative
meals per dining hall. This is a hackathon prototype, not medical advice or an
allergy-safety guarantee.
"""

from __future__ import annotations

import math
import re
import tomllib
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, TypedDict, cast

HALL_NAMES: tuple[str, ...] = ("251 North", "South Campus", "Yahentamitsi Dining Hall")
MEAL_PERIODS: tuple[str, ...] = ("Breakfast", "Lunch", "Dinner")
DIETARY_OPTIONS: frozenset[str] = frozenset({
    "vegetarian", "vegan", "lactose_intolerant", "gluten_free",
    "halal_friendly", "nut_allergy",
})

# Search tuning; these shape the optimizer, not the user's goals.
BEAM_WIDTH = 80
CANDIDATE_LIMIT_PER_HALL = 12
# Alternative meals generated per hall; each shares no food items with the others.
MEALS_PER_HALL = 2

MACRO_KEYS: tuple[str, ...] = (
    "calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g",
    "fiber_g", "sugar_g", "sodium_mg", "cholesterol_mg",
)

# A scraped menu item, e.g. {"id": 1, "name": ..., "macros": {...}, "tags": [...]}.
MenuItem = dict[str, Any]
# Nutrition values keyed by MACRO_KEYS; None means unknown.
Macros = dict[str, float | None]

# Text patterns used as conservative fallback when tags are incomplete.
ANIMAL_TERMS = re.compile(
    r"\b(beef|pork|ham|bacon|sausage|chicken|turkey|duck|lamb|"
    r"gelatin|lard|fish|anchov(?:y|ies)|shrimp|crab|lobster|shellfish)\b",
    re.I,
)
PORK_TERMS = re.compile(r"\b(pork|ham|bacon|prosciutto|pepperoni|lard)\b", re.I)
ALCOHOL_TERMS = re.compile(r"\b(alcohol|wine|beer|rum|brandy|bourbon|vodka|liqueur)\b", re.I)
DAIRY_TERMS = re.compile(
    r"\b(milk|cream|butter|cheese|whey|casein|yogurt|yoghurt|"
    r"lactalbumin|ghee|lactose)\b", re.I
)
GLUTEN_TERMS = re.compile(
    r"\b(wheat|barley|rye|malt|semolina|farro|spelt|triticale|"
    r"breadcrumbs|bread flour|wheat flour|vital wheat gluten)\b", re.I
)
NUT_TERMS = re.compile(
    r"\b(peanut|peanuts|tree nuts?|almond|walnut|pecan|cashew|pistachio|"
    r"hazelnut|macadamia|brazil nut|pine nut|nut butter|marzipan)\b", re.I
)


@dataclass
class UserSettings:
    """User-specific goals and restrictions that drive meal generation.

    Daily goals and consumed-so-far values set the per-meal calorie/protein
    targets. The per-meal sodium/sugar/saturated-fat limits and carb/fiber
    ranges are soft ranking preferences, not medical prescriptions; adjust
    them after testing with a registered dietitian / campus nutrition staff.

    ``dietary_restrictions`` accepts any of ``DIETARY_OPTIONS`` either as a
    single string or an iterable of strings. The normalized set is exposed as
    ``dietary``.
    """

    daily_calorie_goal: float
    daily_protein_goal_g: float
    calories_consumed: float
    protein_consumed_g: float
    current_meal: str  # "Breakfast", "Lunch", or "Dinner"
    dietary_restrictions: str | Iterable[str] = ()
    sodium_limit_mg: float = 1000.0
    sugar_limit_g: float = 25.0
    sat_fat_limit_g: float = 8.0
    carb_min_g: float = 15.0
    carb_max_g: float = 100.0
    fiber_min_g: float = 3.0
    max_items_per_meal: int = 6
    dietary: frozenset[str] = field(init=False)

    def __post_init__(self) -> None:
        self.current_meal = self.current_meal.strip().title()
        if self.current_meal not in MEAL_PERIODS:
            raise ValueError("current_meal must be Breakfast, Lunch, or Dinner.")

        numeric_settings: dict[str, float] = {
            "daily_calorie_goal": self.daily_calorie_goal,
            "daily_protein_goal_g": self.daily_protein_goal_g,
            "calories_consumed": self.calories_consumed,
            "protein_consumed_g": self.protein_consumed_g,
            "sodium_limit_mg": self.sodium_limit_mg,
            "sugar_limit_g": self.sugar_limit_g,
            "sat_fat_limit_g": self.sat_fat_limit_g,
            "carb_min_g": self.carb_min_g,
            "carb_max_g": self.carb_max_g,
            "fiber_min_g": self.fiber_min_g,
        }
        for name, value in numeric_settings.items():
            if not math.isfinite(value) or value < 0:
                raise ValueError(f"{name} must be a non-negative number.")
        if self.carb_min_g > self.carb_max_g:
            raise ValueError("carb_min_g must not exceed carb_max_g.")
        if self.max_items_per_meal < 1:
            raise ValueError("max_items_per_meal must be at least 1.")

        # Accept a bare string (e.g. "vegetarian") as a single restriction rather
        # than iterating over its characters.
        raw = self.dietary_restrictions
        values: Iterable[str] = [raw] if isinstance(raw, str) else raw
        restrictions = {value.strip().lower() for value in values} - {""}
        unknown = restrictions - DIETARY_OPTIONS
        if unknown:
            raise ValueError(f"Unknown dietary restriction(s): {', '.join(sorted(unknown))}.")
        if "vegan" in restrictions:
            restrictions.discard("vegetarian")
        self.dietary = frozenset(restrictions)


class Candidate(TypedDict):
    """One scored plate produced by the beam search."""

    items: list[MenuItem]
    score: float
    macros: Macros


def _as_dict(value: Any) -> dict[str, Any]:
    """Return ``value`` as a JSON object, or an empty dict if it is not one."""
    return cast(dict[str, Any], value) if isinstance(value, dict) else {}


def _as_list(value: Any) -> list[Any]:
    """Return ``value`` as a JSON array, or an empty list if it is not one."""
    return cast(list[Any], value) if isinstance(value, list) else []


def number(value: Any) -> float | None:
    """Convert numeric JSON values to float, preserving null/missing as None."""
    if value is None or isinstance(value, bool):
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if result >= 0 else None


def macros_of(item: MenuItem) -> Macros:
    """Return the item's nutrition values keyed by ``MACRO_KEYS``."""
    raw = _as_dict(item.get("macros"))
    return {key: number(raw.get(key)) for key in MACRO_KEYS}


def rounded_macros(macros: Macros) -> Macros:
    """Round each known macro to one decimal place for output."""
    return {key: None if value is None else round(value, 1) for key, value in macros.items()}


def item_text(item: MenuItem) -> str:
    """Return the item's name, tags, ingredients, and allergens as lowercase text."""
    tags = " ".join(str(x) for x in _as_list(item.get("tags")))
    ingredients = str(item.get("ingredients") or "")
    allergens = str(item.get("allergens") or "")
    name = str(item.get("name") or "")
    return f"{name} {tags} {ingredients} {allergens}".lower()


def tag_set(item: MenuItem) -> set[str]:
    """Return the item's tags, stripped and lowercased."""
    return {str(tag).strip().lower() for tag in _as_list(item.get("tags"))}


def dietary_compatible(item: MenuItem, restrictions: frozenset[str]) -> tuple[bool, str | None]:
    """
    Returns (allowed, reason_if_blocked).
    This intentionally errs on the side of exclusion where ingredient text
    suggests a conflict. Menu labels can be inconsistent, so this is not a
    substitute for confirming with dining staff, especially for allergies.
    """
    tags = tag_set(item)
    text = item_text(item)
    # Official dining-hall allergen icons that contradict a vegetarian label.
    meat_tagged = bool(tags & {"contains pork", "contains fish", "contains shellfish"})
    # The dining hall's vegan/vegetarian icons are trusted over ingredient text,
    # which names plant-based products like "Vegan Chicken Strip", "Soy Milk",
    # or "Vegan Cheddar Cheese" and allergen notes like "Free from ... Fish".
    is_vegan = "vegan" in tags
    is_vegetarian = is_vegan or "vegetarian" in tags

    if "vegan" in restrictions:
        if not is_vegan or meat_tagged or tags & {"contains dairy", "contains egg"}:
            return False, "not identified as vegan"
    elif "vegetarian" in restrictions:
        if not is_vegetarian or meat_tagged:
            return False, "not identified as vegetarian"

    if "lactose_intolerant" in restrictions:
        if "contains dairy" in tags or (not is_vegan and DAIRY_TERMS.search(text)):
            return False, "dairy/lactose ingredient indicated"

    if "gluten_free" in restrictions:
        if "contains gluten" in tags or GLUTEN_TERMS.search(text):
            return False, "gluten ingredient indicated"

    if "nut_allergy" in restrictions:
        if "contains nuts" in tags or NUT_TERMS.search(text):
            return False, "nut ingredient or warning indicated"
        # The provided file has null allergen fields, so absence of a match
        # cannot establish safety; candidates are still marked uncertain below.

    if "halal_friendly" in restrictions:
        if "contains pork" in tags or PORK_TERMS.search(text) or "contains alcohol" in tags or ALCOHOL_TERMS.search(text):
            return False, "pork or alcohol indicated"
        # Meat without a reliable halal label is excluded rather than assumed halal.
        if not is_vegetarian and ANIMAL_TERMS.search(text) and "halalfriendly" not in tags:
            return False, "meat/animal ingredient lacks an explicit halal-friendly tag"

    return True, None


def menu_items(menu: dict[str, Any], hall: str, meal: str) -> list[MenuItem]:
    """Flatten every station's items for ``meal`` (plus Brunch when relevant) at ``hall``."""
    hall_data = _as_dict(_as_dict(menu.get("halls")).get(hall))
    periods = [meal]
    if meal in ("Breakfast", "Lunch"):
        periods.append("Brunch")

    flattened: list[MenuItem] = []
    seen_ids: set[Any] = set()
    for period in periods:
        stations = _as_dict(hall_data.get(period))
        for station, items in stations.items():
            for original in _as_list(items):
                item: MenuItem = dict(_as_dict(original))
                item["_station"] = station
                item["_hall"] = hall
                item["_period"] = period
                key = item.get("id", (item.get("name"), station, period))
                # Don't duplicate brunch items when aliases ever overlap.
                if key in seen_ids:
                    continue
                seen_ids.add(key)
                flattened.append(item)
    return flattened


def meal_period_used(menu: dict[str, Any], hall: str, meal: str) -> str:
    """Return "Brunch" if the hall serves it in place of Breakfast/Lunch, else ``meal``."""
    hall_data = _as_dict(_as_dict(menu.get("halls")).get(hall))
    if meal in ("Breakfast", "Lunch") and "Brunch" in hall_data:
        return "Brunch"
    return meal


def meal_count_remaining(current_meal: str) -> int:
    """Return how many meals remain today, including ``current_meal``."""
    return {"Breakfast": 3, "Lunch": 2, "Dinner": 1}[current_meal]


def meal_targets(settings: UserSettings) -> tuple[float, float]:
    """Return the (calories, protein_g) target for the current meal."""
    remaining_cal = max(0.0, settings.daily_calorie_goal - settings.calories_consumed)
    remaining_protein = max(0.0, settings.daily_protein_goal_g - settings.protein_consumed_g)
    meals_left = meal_count_remaining(settings.current_meal)
    return remaining_cal / meals_left, remaining_protein / meals_left


def add_macros(items: list[MenuItem]) -> Macros:
    """Sum each macro across ``items``; a total is None if any item's value is unknown."""
    totals: Macros = {}
    for key in MACRO_KEYS:
        values = [macros_of(item)[key] for item in items]
        known = [v for v in values if v is not None]
        totals[key] = sum(known) if len(known) == len(values) else None
    return totals


def nutrition_complete(item: MenuItem) -> bool:
    """Return True if the item has every macro needed for scoring."""
    m = macros_of(item)
    # These fields are essential to scoring; other optional values may be null.
    return all(m[k] is not None for k in ("calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g", "sodium_mg", "sat_fat_g"))


def score_plate(
    items: list[MenuItem], target_cal: float, target_protein: float, settings: UserSettings,
) -> tuple[float, Macros]:
    """Return (score, macro_totals) for a plate; lower scores are better."""
    m = add_macros(items)
    if m["calories"] is None or m["protein_g"] is None:
        return float("inf"), m

    # Relative error keeps calorie and protein goals meaningful at different scales.
    cal_error = abs(m["calories"] - target_cal) / max(target_cal, 150)
    protein_error = abs(m["protein_g"] - target_protein) / max(target_protein, 10)
    score = 2.2 * cal_error + 2.8 * protein_error

    sodium = m["sodium_mg"] or 0
    sugar = m["sugar_g"] or 0
    sat_fat = m["sat_fat_g"] or 0
    carbs = m["carbs_g"] or 0
    fiber = m["fiber_g"] or 0

    # Soft penalties: the engine prefers moderation but does not call these
    # medical limits. Limits can be tuned for a particular product.
    score += max(0, sodium - settings.sodium_limit_mg) / 1000 * 0.9
    score += max(0, sugar - settings.sugar_limit_g) / 25 * 0.7
    score += max(0, sat_fat - settings.sat_fat_limit_g) / 8 * 0.7
    score += max(0, settings.carb_min_g - carbs) / 30 * 0.35
    score += max(0, carbs - settings.carb_max_g) / 100 * 0.45
    score += max(0, settings.fiber_min_g - fiber) / 5 * 0.25

    # Slight preference for a plate with more than one item, capped to prevent
    # a large number of sides from winning simply by adding food.
    if len(items) == 1:
        score += 0.08
    if len(items) > 3:
        score += (len(items) - 3) * 0.04

    return score, m


def _has_green(items: list[MenuItem]) -> bool:
    """Return True if any item on the plate is from a green food category."""
    return any(item.get("_green") for item in items)


def make_candidates(
    items: list[MenuItem], target_cal: float, target_protein: float, settings: UserSettings,
) -> list[Candidate]:
    """Return up to ``CANDIDATE_LIMIT_PER_HALL`` distinct plates, best-scoring first.

    Every plate has at least one green item and at most one item per food
    category (``_category``, set by ``compatible_items``).
    """
    # Drop malformed/unknown nutrition records from numerical optimization.
    pool = [item for item in items if nutrition_complete(item)]
    if not pool:
        return []

    # Keep a useful but bounded pool: protein-bearing foods, carb/fiber foods,
    # and low-sugar produce can all contribute to combinations.
    pool.sort(key=lambda item: (
        -((macros_of(item)["protein_g"] or 0) / max((macros_of(item)["calories"] or 0), 40)),
        (macros_of(item)["sodium_mg"] or 0),
    ))
    # Every plate needs a green item, so keep green foods even if they rank low.
    pool = pool[:90] + [item for item in pool[90:] if item.get("_green")]

    # Beam search builds small combinations without enumerating every subset.
    beam: list[tuple[list[MenuItem], float]] = [([], 0.0)]
    completed: dict[tuple[int, ...], Candidate] = {}
    for _ in range(settings.max_items_per_meal):
        next_beam: list[tuple[list[MenuItem], float]] = []
        for chosen, _ in beam:
            start_idx = 0
            if chosen:
                # Force increasing indices to avoid permutations of same plate.
                chosen_ids = [pool.index(x) for x in chosen]
                start_idx = chosen_ids[-1] + 1
            for idx in range(start_idx, len(pool)):
                item = pool[idx]
                if any(x.get("id") == item.get("id") for x in chosen):
                    continue
                # One item per food category, so the plate shows distinct foods.
                if any(x.get("_category") == item.get("_category") for x in chosen):
                    continue
                plate = chosen + [item]
                score, macros = score_plate(plate, target_cal, target_protein, settings)
                # Only plates with a green item are finished meals; others may
                # still gain one in a later round.
                if _has_green(plate):
                    ids = tuple(sorted(int(x.get("id", id(x))) for x in plate))
                    completed[ids] = {
                        "items": plate,
                        "score": score,
                        "macros": macros,
                    }
                next_beam.append((plate, score))
        next_beam.sort(key=lambda pair: pair[1])
        # Deduplicate beam by item IDs and preserve best-scoring combinations.
        # Half the beam is kept for plates that already have a green item, so
        # plates without one can't crowd out every valid meal.
        seen: set[tuple[str, ...]] = set()
        beam = []
        green_slots = BEAM_WIDTH // 2
        other_slots = BEAM_WIDTH - green_slots
        for plate, score in next_beam:
            key = tuple(sorted(str(x.get("id", x.get("name"))) for x in plate))
            if key in seen:
                continue
            seen.add(key)
            if _has_green(plate):
                if green_slots == 0:
                    continue
                green_slots -= 1
            else:
                if other_slots == 0:
                    continue
                other_slots -= 1
            beam.append((plate, score))
            if green_slots == 0 and other_slots == 0:
                break

    ranked = sorted(completed.values(), key=lambda x: x["score"])
    # Diversity: don't return near-identical plates sharing the same main item set.
    result: list[Candidate] = []
    signatures: set[frozenset[str]] = set()
    for candidate in ranked:
        signature = frozenset(str(x.get("id", x.get("name"))) for x in candidate["items"])
        if signature in signatures:
            continue
        signatures.add(signature)
        result.append(candidate)
        if len(result) >= CANDIDATE_LIMIT_PER_HALL:
            break
    return result


def _food_key(item: MenuItem) -> str:
    """Return a normalized item name, so the same food at two stations counts once."""
    return re.sub(r"\s+", " ", str(item.get("name") or "")).strip().lower()


def disjoint_meals(
    items: list[MenuItem], target_cal: float, target_protein: float, settings: UserSettings, count: int,
) -> list[Candidate]:
    """Return up to ``count`` best plates that share no food items with each other.

    Each plate is the best-scoring plate built from the items not used by the
    plates before it, so every alternative is held to the same targets and
    restrictions. Fewer than ``count`` plates are returned if the pool runs out.
    """
    plates: list[Candidate] = []
    remaining = items
    for _ in range(count):
        candidates = make_candidates(remaining, target_cal, target_protein, settings)
        if not candidates:
            break
        best = candidates[0]
        plates.append(best)
        used_ids = {x.get("id") for x in best["items"] if x.get("id") is not None}
        used_names = {_food_key(x) for x in best["items"]}
        remaining = [
            x for x in remaining
            if x.get("id") not in used_ids and _food_key(x) not in used_names
        ]
    return plates


def compatible_items(
    menu: dict[str, Any], hall: str, settings: UserSettings, categories: Sequence[FoodCategory],
) -> tuple[list[MenuItem], int]:
    """Return (usable items, count of excluded items) for ``hall``.

    Usable items pass the user's dietary restrictions and map to a known
    generic food category; each gets its generic name stored as
    ``_generic_name``, its base category name (shared by "chicken" and
    "plant-based chicken") as ``_category``, and whether that category is
    green as ``_green``. Items failing either check are counted as excluded.
    """
    compatible: list[MenuItem] = []
    excluded = 0
    for item in menu_items(menu, hall, settings.current_meal):
        allowed, _reason = dietary_compatible(item, settings.dietary)
        generic_name, category = food_category(item, categories)
        if allowed and category is not None:
            item["_generic_name"] = generic_name
            item["_category"] = category.name
            item["_green"] = category.green
            compatible.append(item)
        else:
            excluded += 1
    return compatible, excluded


def item_summary(item: MenuItem) -> dict[str, Any]:
    """Return one menu item in the detailed recommendation output schema."""
    return {
        "id": item.get("id"),
        "name": item.get("name"),
        "station": item.get("_station"),
        "serving_g": item.get("serving_g"),
        "macros": rounded_macros(macros_of(item)),
        "tags": _as_list(item.get("tags")),
    }


def recommend(
    menu: dict[str, Any], settings: UserSettings, food_categories: Sequence[FoodCategory] | None = None,
) -> dict[str, Any]:
    """Return a detailed, JSON-ready recommendation report with scores and warnings.

    ``food_categories`` defaults to those in ``DEFAULT_FOOD_CATEGORIES_PATH``.
    """
    categories = load_food_categories() if food_categories is None else food_categories
    remaining_cal = max(0.0, settings.daily_calorie_goal - settings.calories_consumed)
    remaining_protein = max(0.0, settings.daily_protein_goal_g - settings.protein_consumed_g)
    meals_left = meal_count_remaining(settings.current_meal)
    target_cal, target_protein = meal_targets(settings)

    recommendations: list[dict[str, Any]] = []
    warnings: list[str] = []
    for hall in HALL_NAMES:
        compatible, excluded = compatible_items(menu, hall, settings, categories)
        plates = disjoint_meals(compatible, target_cal, target_protein, settings, MEALS_PER_HALL)
        period_used = meal_period_used(menu, hall, settings.current_meal)
        for option in range(1, MEALS_PER_HALL + 1):
            if option > len(plates):
                recommendations.append({
                    "dining_hall": hall,
                    "meal_option": option,
                    "meal_period_used": period_used,
                    "items": [],
                    "nutrition_totals": None,
                    "status": "No suitable combination found with available, compatible, complete nutrition data.",
                    "excluded_item_count": excluded,
                })
                continue

            best = plates[option - 1]
            item_names = [str(x.get("name", "Unnamed item")) for x in best["items"]]
            recommendations.append({
                "dining_hall": hall,
                "meal_option": option,
                "meal_period_used": period_used,
                "items": [item_summary(x) for x in best["items"]],
                "nutrition_totals": rounded_macros(best["macros"]),
                "target_for_this_meal": {
                    "calories_kcal": round(target_cal, 1),
                    "protein_g": round(target_protein, 1),
                },
                "score": round(best["score"], 3),
                "status": "Recommendation generated",
                "excluded_item_count": excluded,
                "why_this_meal": (
                    f"Selected {', '.join(item_names)} to balance calories and protein "
                    "while favoring moderate sodium, sugar, saturated fat, and carbohydrates."
                ),
            })

    if "nut_allergy" in settings.dietary:
        warnings.append(
            "Nut allergy selected: the source file's allergens fields are null. "
            "Ingredient/tag filtering cannot verify cross-contact or guarantee safety. "
            "Confirm ingredients and preparation with dining staff before eating."
        )
    if "halal_friendly" in settings.dietary:
        warnings.append(
            "Halal-friendly filtering excludes obvious pork/alcohol and animal foods without "
            "an explicit halal-friendly tag, but the menu data cannot certify halal preparation."
        )
    if settings.calories_consumed > settings.daily_calorie_goal:
        warnings.append("Reported calories consumed already exceed the daily calorie goal.")
    if settings.protein_consumed_g > settings.daily_protein_goal_g:
        warnings.append("Reported protein consumed already exceeds the daily protein goal.")
    if not any(r["items"] for r in recommendations):
        warnings.append("No recommendations were found. Try relaxing preferences or check the menu data.")

    return {
        "menu_date": menu.get("date"),
        "current_meal": settings.current_meal,
        "daily_goals": {
            "calories_kcal": settings.daily_calorie_goal,
            "protein_g": settings.daily_protein_goal_g,
        },
        "consumed_so_far": {
            "calories_kcal": settings.calories_consumed,
            "protein_g": settings.protein_consumed_g,
        },
        "remaining_daily_targets": {
            "calories_kcal": round(remaining_cal, 1),
            "protein_g": round(remaining_protein, 1),
        },
        "meals_assumed_remaining_including_current": meals_left,
        "per_meal_target_used_for_ranking": {
            "calories_kcal": round(target_cal, 1),
            "protein_g": round(target_protein, 1),
        },
        "dietary_preferences": sorted(settings.dietary),
        "recommendations_are_alternatives": True,
        "recommendations": recommendations,
        "warnings": warnings,
        "nutrition_note": (
            "Sodium, sugar, saturated-fat, fiber, and carbohydrate values are soft ranking "
            "preferences, not individualized medical limits. The three hall recommendations "
            "are alternatives; do not add their totals together unless you intend to eat all three."
        ),
    }


DEFAULT_FOOD_CATEGORIES_PATH = Path(__file__).with_name("food_categories.toml")
UNKNOWN_FOOD = "unknown"
_CATEGORY_KEYS = frozenset({"name", "keywords", "patterns", "exclude", "meat", "green"})


@dataclass(frozen=True)
class FoodCategory:
    """One generic food category loaded from the food-categories TOML file."""

    name: str
    include: tuple[re.Pattern[str], ...]
    exclude: tuple[re.Pattern[str], ...] = ()
    meat: bool = False
    green: bool = False

    def matches(self, item_name: str) -> bool:
        """Return True if ``item_name`` hits an include pattern and no exclude pattern."""
        return (
            any(pattern.search(item_name) for pattern in self.include)
            and not any(pattern.search(item_name) for pattern in self.exclude)
        )


def _keyword_pattern(keyword: str) -> re.Pattern[str]:
    """Compile a whole-word, case-insensitive keyword with an optional plural ending."""
    words = r"\s+".join(re.escape(word) for word in keyword.split())
    return re.compile(rf"(?<!\w){words}(?:s|es)?(?!\w)", re.I)


def _string_list(entry: dict[str, Any], key: str, label: str) -> list[str]:
    """Return ``entry[key]`` as a list of non-blank strings, or raise ValueError."""
    value = entry.get(key, [])
    if not isinstance(value, list) or not all(isinstance(v, str) for v in cast(list[Any], value)):
        raise ValueError(f"{label}: '{key}' must be a list of strings.")
    return [v for v in cast(list[str], value) if v.strip()]


def load_food_categories(path: str | Path = DEFAULT_FOOD_CATEGORIES_PATH) -> tuple[FoodCategory, ...]:
    """Load the ordered generic food categories from a TOML file.

    See ``food_categories.toml`` for the format. Raises ValueError if the file
    is malformed, so a typo fails loudly instead of silently unmapping food.
    """
    with open(path, "rb") as categories_file:
        data = tomllib.load(categories_file)

    categories: list[FoodCategory] = []
    seen: set[str] = set()
    for index, raw in enumerate(_as_list(data.get("category")), start=1):
        entry = _as_dict(raw)
        name = entry.get("name")
        if not isinstance(name, str) or not name.strip():
            raise ValueError(f"{path}: category #{index} needs a non-empty 'name'.")
        name = name.strip().lower()
        label = f"{path}: category {name!r}"
        if name == UNKNOWN_FOOD or name in seen:
            raise ValueError(f"{label}: name is reserved or already used.")
        unknown_keys = set(entry) - _CATEGORY_KEYS
        if unknown_keys:
            raise ValueError(f"{label}: unknown field(s) {', '.join(sorted(unknown_keys))}.")

        keywords = _string_list(entry, "keywords", label)
        patterns = _string_list(entry, "patterns", label)
        excludes = _string_list(entry, "exclude", label)
        meat = entry.get("meat", False)
        green = entry.get("green", False)
        if not isinstance(meat, bool):
            raise ValueError(f"{label}: 'meat' must be true or false.")
        if not isinstance(green, bool):
            raise ValueError(f"{label}: 'green' must be true or false.")
        if not keywords and not patterns:
            raise ValueError(f"{label}: needs at least one keyword or pattern.")
        try:
            include = (
                tuple(_keyword_pattern(keyword) for keyword in keywords)
                + tuple(re.compile(pattern, re.I) for pattern in patterns)
            )
        except re.error as error:
            raise ValueError(f"{label}: invalid pattern ({error}).") from error

        seen.add(name)
        categories.append(FoodCategory(
            name=name,
            include=include,
            exclude=tuple(_keyword_pattern(keyword) for keyword in excludes),
            meat=meat,
            green=green,
        ))

    if not categories:
        raise ValueError(f"{path}: no [[category]] entries found.")
    return tuple(categories)


def food_category(item: MenuItem, categories: Sequence[FoodCategory]) -> tuple[str, FoodCategory | None]:
    """Return (generic name, matched category) for a dining-menu item.

    Matches the item name (never ingredients, which are too noisy; pizza
    dough lists eggs) against ``categories`` in order. Meat categories on
    items the dining hall tags vegan/vegetarian (e.g. "Vegan Chicken Slider")
    become "plant-based <category>". Items matching no category are
    ``(UNKNOWN_FOOD, None)``.
    """
    name = re.sub(r"\s+", " ", str(item.get("name") or "").lower()).strip()

    if tag_set(item) & {"vegan", "vegetarian"}:
        # Meat names on tagged items are plant-based substitutes; name them first
        # so "Vegan Chicken Slider" isn't just a burger.
        for category in categories:
            if category.meat and category.matches(name):
                return f"plant-based {category.name}", category

    for category in categories:
        if category.matches(name):
            return category.name, category
    return UNKNOWN_FOOD, None


def generic_food_name(item: MenuItem, categories: Sequence[FoodCategory]) -> str:
    """Map a specific dining-menu item to a broad food category name (see ``food_category``)."""
    return food_category(item, categories)[0]


def _example_item(item: MenuItem) -> dict[str, Any]:
    """Return one menu item in the compact example-meal output schema."""
    return {
        "name": item.get("name") or "Unnamed item",
        "generic_name": item.get("_generic_name", UNKNOWN_FOOD),
        "serving_g": item.get("serving_g"),
        "macros": rounded_macros(macros_of(item)),
    }


def _meal_name(items: list[MenuItem]) -> str:
    """Create a short display name from the meal's generalized food categories."""
    labels: list[str] = []
    for item in items:
        label = str(item.get("_generic_name", UNKNOWN_FOOD))
        if label not in labels:
            labels.append(label)
    if not labels:
        return "No meal available"
    return " & ".join(label.title() for label in labels[:3]) + (" Meal" if len(labels) == 1 else "")


def generate_meals(
    menu_data: dict[str, Any], settings: UserSettings, food_categories: Sequence[FoodCategory] | None = None,
) -> dict[str, Any]:
    """Generate ``MEALS_PER_HALL`` meals for each UMD dining hall and return JSON-ready data.

    Parameters
    ----------
    menu_data:
        Parsed contents of the scraped dining menu JSON file. The expected
        structure has a top-level ``date`` and ``halls`` mapping, with menu
        periods, stations, and food items beneath each hall. An ``allergens``
        field is not required.
    settings:
        The user's calorie/protein goals, intake so far, current meal,
        dietary restrictions, and per-meal macro preferences.
    food_categories:
        Generic food categories from ``load_food_categories``. Defaults to
        the categories in ``food_categories.toml`` next to this module. Menu
        items matching no category are left out of the generated meals.

    Returns
    -------
    dict[str, Any]
        A JSON-serializable object with ``source_menu_date`` and a ``meals``
        list holding ``MEALS_PER_HALL`` entries per hall, numbered by
        ``meal_option`` (1 is the best match). A hall's options share no food
        items, every meal has at least one green item, and no meal has two
        items from the same food category. Each meal includes its dining hall, generated name, item names,
        generic categories, serving sizes, item macros, total serving weight,
        and combined macros. Convert to a JSON string with ``json.dumps`` or
        write it to a file in the calling application if needed.

    Notes
    -----
    This function does not read command-line arguments, prompt for input,
    or write files. All meals are alternatives to one another.
    """
    if not isinstance(menu_data.get("halls"), dict):
        raise ValueError("menu_data must be a parsed menu JSON object with a 'halls' mapping.")

    categories = load_food_categories() if food_categories is None else food_categories
    target_cal, target_protein = meal_targets(settings)

    meals: list[dict[str, Any]] = []
    for hall in HALL_NAMES:
        compatible, _excluded = compatible_items(menu_data, hall, settings, categories)
        plates = disjoint_meals(compatible, target_cal, target_protein, settings, MEALS_PER_HALL)

        for option in range(1, MEALS_PER_HALL + 1):
            if option > len(plates):
                meals.append({
                    "dining_hall": hall,
                    "meal_option": option,
                    "meal_name": "No suitable meal found",
                    "items": [],
                    "total_serving_g": 0,
                    "meal_macros_total": {key: None for key in MACRO_KEYS},
                })
                continue

            selected = plates[option - 1]["items"]
            servings = [number(item.get("serving_g")) for item in selected]
            known_servings = [value for value in servings if value is not None]
            total_serving_g = (
                round(sum(known_servings), 1)
                if len(known_servings) == len(servings)
                else None
            )

            meals.append({
                "dining_hall": hall,
                "meal_option": option,
                "meal_name": _meal_name(selected),
                "items": [_example_item(item) for item in selected],
                "total_serving_g": total_serving_g,
                "meal_macros_total": rounded_macros(add_macros(selected)),
            })

    return {
        "source_menu_date": menu_data.get("date"),
        "meals": meals,
    }
