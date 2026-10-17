"""
UMD dining hall scraper for nutrition.umd.edu

Pulls each dining hall's menu for a given date (meals, stations, items, dietary
tags), then fetches each item's nutrition label (serving size, calories, macros,
ingredients). Everything is cached in SQLite so each label is only fetched once,
and each day can be exported as JSON for the app.

Setup:
    pip install requests beautifulsoup4

Usage:
    python scraper.py                         # scrape today's menus, write menu.json
    python scraper.py --date 2026-10-18       # same, for another date
    python scraper.py inspect                 # show halls + form fields the site uses
    python scraper.py scrape                  # today's menus, all halls
    python scraper.py scrape --date 2026-10-18 --days 3
    python scraper.py export --date 2026-10-18   # writes menu.json
    python scraper.py export --output other.json
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sqlite3
import time
from collections.abc import Iterable, Mapping
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from html import unescape
from itertools import repeat
from typing import Any, Literal, TypedDict
from urllib.parse import unquote

import requests
from requests.adapters import HTTPAdapter
from bs4 import BeautifulSoup, Tag

BASE_URL = "https://nutrition.umd.edu/"
LABEL_URL = BASE_URL + "label.aspx"
DB_PATH = "umd_dining.db"
OUTPUT_PATH = "menu.json"
# Requests run on MAX_WORKERS threads at once, each pausing REQUEST_DELAY_S after
# a request. Together they cap the load on UMD's server; lower MAX_WORKERS or
# raise the delay if the site starts erroring or throttling.
MAX_WORKERS = 8
REQUEST_DELAY_S = 0.1
REQUEST_TIMEOUT_S = 20

HEADING_TAGS = frozenset({"h1", "h2", "h3", "h4", "h5", "h6"})
MACRO_FIELDS: tuple[str, ...] = (
    "calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g",
    "fiber_g", "sugar_g", "sodium_mg", "cholesterol_mg",
)
GRAMS_PER_OZ = 28.35
HTML_TAG_PATTERN = re.compile(r"<[^>]+>")

session = requests.Session()
session.headers["User-Agent"] = "UMD-student-hackathon-project (menu planner)"
# One pooled connection per worker thread, so concurrent requests reuse connections.
session.mount("https://", HTTPAdapter(pool_connections=1, pool_maxsize=MAX_WORKERS))


class SiteConfig(TypedDict):
    """Query parameter names and dining halls discovered on the homepage."""

    hall_param: str
    date_param: str
    halls: dict[str, str]  # hall dropdown value -> hall name


class MenuEntry(TypedDict):
    """One item listed on a hall's menu page."""

    meal: str
    station: str | None
    name: str
    rec_id: str  # e.g. '080413*1'
    tags: list[str]


class NutritionLabel(TypedDict):
    """Values parsed from an item's nutrition label page; None when absent."""

    serving_size: str | None
    calories: float | None
    fat_g: float | None
    sat_fat_g: float | None
    carbs_g: float | None
    fiber_g: float | None
    sugar_g: float | None
    protein_g: float | None
    sodium_mg: float | None
    cholesterol_mg: float | None
    ingredients: str | None
    allergens: str | None


Macros = dict[str, float | None]
QualityStatus = Literal["ok", "missing", "suspect"]


# ---------------------------------------------------------------- HTTP

def fetch(url: str, params: Mapping[str, str] | None = None, retries: int = 3) -> str:
    """GET ``url`` and return the response body, retrying with backoff on errors."""
    for attempt in range(1, retries + 1):
        try:
            response = session.get(url, params=params, timeout=REQUEST_TIMEOUT_S)
            response.raise_for_status()
        except requests.RequestException as error:
            if attempt == retries:
                raise
            print(f"  retrying ({error})")
            time.sleep(2 * attempt)
        else:
            time.sleep(REQUEST_DELAY_S)
            return response.text
    raise ValueError("retries must be at least 1")


# ---------------------------------------------------------------- database

def open_database() -> sqlite3.Connection:
    """Open the SQLite cache, creating its tables if needed."""
    connection = sqlite3.connect(DB_PATH)
    connection.executescript("""
    CREATE TABLE IF NOT EXISTS halls (
        hall_value TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE IF NOT EXISTS items (
        rec_id TEXT PRIMARY KEY,          -- e.g. '080413*1'
        name TEXT, serving_size TEXT,
        calories REAL, protein_g REAL, carbs_g REAL, fat_g REAL,
        sat_fat_g REAL, fiber_g REAL, sugar_g REAL,
        sodium_mg REAL, cholesterol_mg REAL,
        ingredients TEXT, allergens TEXT, fetched_at TEXT);
    CREATE TABLE IF NOT EXISTS menu_entries (
        date TEXT, hall_value TEXT, meal TEXT, station TEXT,
        rec_id TEXT, tags TEXT,
        PRIMARY KEY (date, hall_value, meal, station, rec_id));
    """)
    return connection


# ---------------------------------------------------------------- HTML helpers

def attribute(tag: Tag, name: str) -> str:
    """Return a tag attribute as a string ('' if missing; multi-valued joined by spaces)."""
    value = tag.get(name)
    if value is None:
        return ""
    return value if isinstance(value, str) else " ".join(value)


def is_label_link(tag: Tag) -> bool:
    """Return True if ``tag`` links to an item's nutrition label."""
    return tag.name == "a" and "label.aspx" in attribute(tag, "href")


# ---------------------------------------------------------------- site discovery

def discover_site() -> SiteConfig:
    """Read the homepage's dropdowns to learn hall IDs and the query parameter names.
    Done dynamically so nothing breaks if UMD renumbers halls."""
    soup = BeautifulSoup(fetch(BASE_URL), "html.parser")
    hall_param: str | None = None
    date_param: str | None = None
    halls: dict[str, str] = {}

    for dropdown in soup.select("select"):
        options = [
            (attribute(option, "value").strip(), option.get_text(strip=True))
            for option in dropdown.select("option")
        ]
        option_text = " ".join(label for _, label in options).lower()
        option_values = " ".join(value for value, _ in options)
        field_name = attribute(dropdown, "name") or attribute(dropdown, "id")
        if "dining" in option_text or "campus" in option_text:
            hall_param = field_name
            halls = {value: label for value, label in options if value}
        elif re.search(r"\d{1,2}/\d{1,2}/\d{4}", option_values):
            date_param = field_name

    if date_param is None:
        for field in soup.select("input"):
            field_name = attribute(field, "name") or attribute(field, "id")
            if "date" in field_name.lower():
                date_param = field_name
                break

    # Fallbacks: names commonly used by this site
    return {
        "hall_param": hall_param or "locationNum",
        "date_param": date_param or "dtdate",
        "halls": halls,
    }


def format_site_date(day: dt.date) -> str:
    """Format a date as the site expects: M/D/YYYY with no zero padding."""
    return f"{day.month}/{day.day}/{day.year}"  # strftime's no-pad flag differs on Windows


# ---------------------------------------------------------------- menu page

def parse_menu(html: str) -> list[MenuEntry]:
    """Return every item on a hall's menu page with its meal, station, and tags."""
    soup = BeautifulSoup(html, "html.parser")

    # Meal tabs: <a href="#pane-1">Brunch</a> -> pane-1 = Brunch
    meal_by_pane = {
        attribute(tab, "href")[1:]: tab.get_text(strip=True)
        for tab in soup.select('a[href^="#pane-"]')
    }

    entries: list[MenuEntry] = []
    panes: list[Tag] = soup.select('[id^="pane-"]') or [soup]
    for pane in panes:
        meal = meal_by_pane.get(attribute(pane, "id"), "Unknown")
        station: str | None = None
        for element in pane.select("*"):
            if element.name in HEADING_TAGS or "card-title" in element.get_attribute_list("class"):
                station = element.get_text(strip=True)
            elif is_label_link(element):
                match = re.search(r"RecNumAndPort=([^&\"]+)", attribute(element, "href"))
                if not match:
                    continue
                entries.append({
                    "meal": meal,
                    "station": station,
                    "name": element.get_text(strip=True),
                    "rec_id": unquote(match.group(1)),
                    "tags": item_tags(element),
                })
    return entries


def item_tags(item_link: Tag) -> list[str]:
    """Collect the icon alt texts (vegan, Contains dairy, HalalFriendly...) that
    follow an item link, stopping at the next item or station heading."""
    tags: list[str] = []
    for element in item_link.next_elements:
        if not isinstance(element, Tag):
            continue
        if is_label_link(element) or element.name in HEADING_TAGS:
            break
        alt_text = attribute(element, "alt")
        if element.name == "img" and alt_text:
            tags.append(alt_text.strip())
    return tags


# ---------------------------------------------------------------- label page

def search_number(pattern: str, text: str) -> float | None:
    """Return the first captured group of ``pattern`` as a float, or None."""
    match = re.search(pattern, text, re.I)
    return float(match.group(1)) if match else None


def search_text(pattern: str, text: str, flags: int = 0) -> str | None:
    """Return the first captured group of ``pattern`` stripped, or None."""
    match = re.search(pattern, text, flags)
    return match.group(1).strip() if match else None


def parse_label(html: str) -> NutritionLabel:
    """Parse serving size, macros, ingredients, and allergens from a label page."""
    # Only the page's visible text is needed, so strip tags with a regex rather than
    # building a BeautifulSoup tree; this is ~14x faster and yields the same text.
    text = re.sub(r"\s+", " ", unescape(HTML_TAG_PATTERN.sub(" ", html)))

    calories = search_number(r"Calories per serving\s*([\d.]+)", text)
    if not calories:
        # Missing or rounded to 0: prefer the precise kcal figure (e.g. 0.3) if present.
        precise_calories = search_number(r"Calories\s*([\d.]+)\s*kcal", text)
        if precise_calories is not None:
            calories = precise_calories

    return {
        "serving_size": search_text(r"Serving size\s*(.+?)\s*(?:-{3}|Calories)", text, re.I),
        "calories": calories,
        "fat_g": search_number(r"Total Fat\s*([\d.]+)\s*g", text),
        "sat_fat_g": search_number(r"Saturated Fat\s*([\d.]+)\s*g", text),
        "carbs_g": search_number(r"Total Carbohydrate\.?\s*([\d.]+)\s*g", text),
        "fiber_g": search_number(r"Dietary Fiber\s*([\d.]+)\s*g", text),
        "sugar_g": search_number(r"Total Sugars\s*([\d.]+)\s*g", text),
        "protein_g": search_number(r"Protein\s*([\d.]+)\s*g", text),
        "sodium_mg": search_number(r"Sodium\s*([\d.]+)\s*mg", text),
        "cholesterol_mg": search_number(r"Cholesterol\s*([\d.]+)\s*mg", text),
        "ingredients": search_text(r"INGREDIENTS:\s*(.+?)\s*(?:\||ALLERGENS:)", text),
        "allergens": search_text(r"ALLERGENS:\s*(.*?)\s*(?:\||\*The nutrient)", text),
    }


# ---------------------------------------------------------------- scraping

def fetch_menu(hall_value: str, site: SiteConfig, day: dt.date) -> str:
    """Fetch one hall's menu page for ``day``."""
    return fetch(BASE_URL, {site["hall_param"]: hall_value, site["date_param"]: format_site_date(day)})


def fetch_label(rec_id: str) -> NutritionLabel:
    """Fetch and parse one item's nutrition label."""
    return parse_label(fetch(LABEL_URL, {"RecNumAndPort": rec_id}))


def save_labels(connection: sqlite3.Connection, entries: Iterable[MenuEntry], pool: ThreadPoolExecutor) -> None:
    """Fetch and cache the nutrition labels of ``entries`` not already cached.

    Labels are fetched concurrently on ``pool``; database writes stay on this thread.
    """
    cached = {rec_id for (rec_id,) in connection.execute("SELECT rec_id FROM items")}
    names: dict[str, str] = {}  # rec_id -> item name, for each item not yet cached
    for entry in entries:
        if entry["rec_id"] not in cached:
            names.setdefault(entry["rec_id"], entry["name"])
    if not names:
        return

    print(f"  fetching {len(names)} new nutrition labels")
    labels = pool.map(fetch_label, names)
    fetched_at = dt.datetime.now().isoformat()
    connection.executemany(
        "INSERT INTO items VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            (
                rec_id, name, label["serving_size"], label["calories"],
                label["protein_g"], label["carbs_g"], label["fat_g"], label["sat_fat_g"],
                label["fiber_g"], label["sugar_g"], label["sodium_mg"], label["cholesterol_mg"],
                label["ingredients"], label["allergens"], fetched_at,
            )
            for (rec_id, name), label in zip(names.items(), labels)
        ),
    )


def scrape(start_date: dt.date, day_count: int) -> bool:
    """Scrape every hall's menu and item labels for ``day_count`` days into SQLite.

    Returns False if the site's dining hall list couldn't be found.
    """
    site = discover_site()
    if not site["halls"]:
        print("Couldn't find the dining hall dropdown. Run `inspect` and send me the output.")
        return False

    with closing(open_database()) as connection, ThreadPoolExecutor(MAX_WORKERS) as pool:
        connection.executemany("INSERT OR REPLACE INTO halls VALUES (?, ?)", site["halls"].items())

        for offset in range(day_count):
            day = start_date + dt.timedelta(days=offset)
            # Fetch every hall's menu page at once; parse and store them in order.
            pages = pool.map(fetch_menu, site["halls"], repeat(site), repeat(day))
            day_entries: list[MenuEntry] = []
            for (hall_value, hall_name), html in zip(site["halls"].items(), pages):
                print(f"{day} | {hall_name}")
                entries = parse_menu(html)
                if not entries:
                    print("  no items (closed, or no menu posted yet)")
                connection.executemany(
                    "INSERT OR REPLACE INTO menu_entries VALUES (?,?,?,?,?,?)",
                    (
                        (day.isoformat(), hall_value, entry["meal"], entry["station"],
                         entry["rec_id"], json.dumps(entry["tags"]))
                        for entry in entries
                    ),
                )
                day_entries += entries
                print(f"  {len(entries)} entries")

            save_labels(connection, day_entries, pool)
            connection.commit()
    return True


# ---------------------------------------------------------------- export

def clean_name(name: str | None) -> str:
    """Drop parenthetical notes like '(purple)' or '(Breakfast)'."""
    return re.sub(r"\s*\([^)]*\)", "", name or "").strip()


def normalize_serving(serving_size: str | None) -> str | None:
    """Lowercase a serving size and strip stray characters ('1 `oz' -> '1 oz')."""
    if not serving_size:
        return None
    serving = re.sub(r"[^\w\s./]", "", serving_size).strip().lower()
    return re.sub(r"\bea\b", "each", serving)


def quality_check(name: str, serving: str | None, macros: Macros) -> tuple[QualityStatus, str | None]:
    """Flag items whose nutrition data is missing or clearly wrong on UMD's site.
    Returns (status, reason): status is 'ok', 'missing', or 'suspect'."""
    calories, protein, carbs, fat = (macros[key] for key in ("calories", "protein_g", "carbs_g", "fat_g"))
    if calories is None or protein is None or carbs is None or fat is None:
        return "missing", "no nutrition label on UMD's site"

    ounces = re.match(r"([\d.]+)\s*oz", serving or "")
    if ounces and calories > 9 * GRAMS_PER_OZ * float(ounces.group(1)):
        return "suspect", "more calories than physically possible for the serving weight"
    estimated_calories = 4 * protein + 4 * carbs + 9 * fat
    if calories > 30 and abs(estimated_calories - calories) / calories > 0.35:
        return "suspect", f"macros add up to ~{round(estimated_calories)} kcal but label says {round(calories)}"
    if calories == 0 and (carbs > 1 or "syrup" in name.lower()):
        return "suspect", "zero calories looks wrong for this item"
    return "ok", None


# For count-based servings ("1 each", "2 slices") UMD gives no weight, so we estimate
# grams from calories using typical energy density (kcal per gram) for that kind of food.
# First matching keyword wins; tweak these if an estimate looks off.
ENERGY_DENSITY_KCAL_PER_G: tuple[tuple[tuple[str, ...], float], ...] = (
    (("cookie", "brownie"), 4.6),
    (("donut", "croissant"), 4.2),
    (("muffin", "biscuit"), 3.6),
    (("cheesecake",), 3.2),
    (("cheese sliced", "sliced gouda", "sliced provolone"), 3.6),
    (("bacon",), 4.5),
    (("sausage", "hot dog"), 3.0),
    (("tortilla", "naan", "pita", "lavash", "flat bread"), 3.0),
    (("pizza",), 2.7),
    (("bagel", "bread", "roll", "bun", "english muffin", "toast"), 2.7),
    (("pancake", "waffle"), 2.4),
    (("wrap", "sandwich", "sub", "quesadilla", "steak", "burger"), 2.4),
    (("chicken", "cutlet", "thigh", "breast", "brisket"), 2.0),
    (("egg roll",), 2.4),
    (("egg",), 1.6),
    (("avocado",), 1.6),
    (("banana",), 0.9),
    (("apple", "orange", "grapefruit", "watermelon", "lemon", "lime", "cherr", "tomato", "lettuce"), 0.4),
)
DEFAULT_ENERGY_DENSITY_KCAL_PER_G = 2.5


def parse_quantity(text: str) -> float:
    """'4 1/2' -> 4.5, '1/2' -> 0.5, '2' -> 2.0"""
    total = 0.0
    for part in text.split():
        numerator, slash, denominator = part.partition("/")
        total += float(numerator) / float(denominator) if slash else float(part)
    return total


def serving_grams(serving: str | None, name: str, macros: Macros) -> int | None:
    """Return the serving weight in grams, estimating it for count-based servings."""
    match = re.match(r"([\d\s./]+?)\s*([a-z]+)", serving or "")
    if not match:
        return None
    quantity, unit = parse_quantity(match.group(1)), match.group(2)
    if unit == "oz":
        return round(quantity * GRAMS_PER_OZ)

    lowered_name = name.lower()
    density = next(
        (density for keywords, density in ENERGY_DENSITY_KCAL_PER_G
         if any(keyword in lowered_name for keyword in keywords)),
        DEFAULT_ENERGY_DENSITY_KCAL_PER_G,
    )
    estimated_grams = (macros["calories"] or 0) / density
    # A serving can't weigh less than the protein + carbs + fat it contains
    minimum_grams = 1.1 * sum(macros[key] or 0 for key in ("protein_g", "carbs_g", "fat_g"))
    return max(round(max(estimated_grams, minimum_grams)), 5)


def export(day: dt.date, output_path: str = OUTPUT_PATH) -> None:
    """Write ``day``'s menus with nutrition data to ``output_path`` as JSON."""
    with closing(open_database()) as connection:
        connection.row_factory = sqlite3.Row
        rows: list[sqlite3.Row] = connection.execute("""
            SELECT h.name AS hall, m.meal, m.station, m.tags, i.*
            FROM menu_entries m
            JOIN items i ON i.rec_id = m.rec_id
            JOIN halls h ON h.hall_value = m.hall_value
            WHERE m.date = ?
            ORDER BY h.name, m.meal, m.station, i.name""", (day.isoformat(),)).fetchall()

    # hall -> meal -> station -> items
    halls: dict[str, dict[str, dict[str, list[dict[str, Any]]]]] = {}
    omitted_reasons: dict[str, str] = {}
    omitted_count = 0
    for row in rows:
        name: str = row["name"]
        serving = normalize_serving(row["serving_size"])
        macros: Macros = {field: row[field] for field in MACRO_FIELDS}
        status, reason = quality_check(name, serving, macros)
        if status != "ok":
            omitted_reasons[clean_name(name)] = f"{status}: {reason}"
            omitted_count += 1
            continue

        item: dict[str, Any] = {
            "id": int(row["rec_id"].split("*")[0]),
            "name": clean_name(name),
            "serving_g": serving_grams(serving, name, macros),
            "macros": macros,
            "tags": json.loads(row["tags"]),
            "ingredients": row["ingredients"],
            "allergens": row["allergens"],
        }
        station = row["station"] or "Other"
        halls.setdefault(row["hall"], {}).setdefault(row["meal"], {}).setdefault(station, []).append(item)

    with open(output_path, "w", encoding="utf-8") as output_file:
        json.dump({"date": day.isoformat(), "halls": halls}, output_file, indent=2)

    print(f"Wrote {output_path} ({len(rows) - omitted_count} entries)")
    if omitted_reasons:
        print(f"Omitted {omitted_count} entries for {len(omitted_reasons)} items with missing or bad nutrition data:")
        for item_name, reason in sorted(omitted_reasons.items()):
            print(f"  {item_name} -> {reason}")


# ---------------------------------------------------------------- commands

def inspect_site() -> None:
    """Print the hall and date parameter names and every hall the site lists."""
    site = discover_site()
    print("hall parameter:", site["hall_param"])
    print("date parameter:", site["date_param"])
    print("halls:")
    for hall_value, hall_name in site["halls"].items():
        print(f"  {hall_value!r}: {hall_name}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "command", nargs="?", default="run", choices=["run", "inspect", "scrape", "export"],
        help="run (default) scrapes the date's menus, then exports them",
    )
    parser.add_argument("--date", default=dt.date.today().isoformat(), help="YYYY-MM-DD")
    parser.add_argument("--days", type=int, default=1, help="number of days to scrape")
    parser.add_argument("--output", default=OUTPUT_PATH, help=f"export file (default: {OUTPUT_PATH})")
    args = parser.parse_args()
    day = dt.date.fromisoformat(args.date)

    if args.command == "inspect":
        inspect_site()
    elif args.command == "scrape":
        scrape(day, args.days)
    elif args.command == "export":
        export(day, args.output)
    elif scrape(day, args.days):
        export(day, args.output)


if __name__ == "__main__":
    main()
