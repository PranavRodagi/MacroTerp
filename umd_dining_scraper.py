"""
UMD dining hall scraper for nutrition.umd.edu

Pulls each dining hall's menu for a given date (meals, stations, items, dietary
tags), then fetches each item's nutrition label (serving size, calories, macros,
ingredients). Everything is cached in SQLite so each label is only fetched once,
and each day can be exported as JSON for the app.

Setup:
    pip install requests beautifulsoup4

Usage:
    python umd_dining_scraper.py inspect                 # show halls + form fields the site uses
    python umd_dining_scraper.py scrape                  # today's menus, all halls
    python umd_dining_scraper.py scrape --date 2026-10-18 --days 3
    python umd_dining_scraper.py export --date 2026-10-18   # writes menu_2026-10-18.json
"""
import argparse
import datetime as dt
import json
import re
import sqlite3
import time

import requests
from bs4 import BeautifulSoup

BASE = "https://nutrition.umd.edu/"
DB_PATH = "umd_dining.db"
DELAY = 0.4  # seconds between requests; be polite to UMD's server

session = requests.Session()
session.headers["User-Agent"] = "UMD-student-hackathon-project (menu planner)"


# ---------------------------------------------------------------- HTTP

def get(url, params=None, retries=3):
    for attempt in range(retries):
        try:
            r = session.get(url, params=params, timeout=20)
            r.raise_for_status()
            time.sleep(DELAY)
            return r.text
        except requests.RequestException as e:
            if attempt == retries - 1:
                raise
            print(f"  retrying ({e})")
            time.sleep(2 * (attempt + 1))


# ---------------------------------------------------------------- database

def db():
    con = sqlite3.connect(DB_PATH)
    con.executescript("""
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
    return con


# ---------------------------------------------------------------- site discovery

def discover():
    """Read the homepage's dropdowns to learn hall IDs and the query parameter names.
    Done dynamically so nothing breaks if UMD renumbers halls."""
    soup = BeautifulSoup(get(BASE), "html.parser")
    hall_param, halls, date_param = None, {}, None

    for sel in soup.find_all("select"):
        opts = [(o.get("value", "").strip(), o.get_text(strip=True)) for o in sel.find_all("option")]
        texts = " ".join(t for _, t in opts).lower()
        name = sel.get("name") or sel.get("id")
        if "dining" in texts or "campus" in texts:
            hall_param = name
            halls = {v: t for v, t in opts if v}
        elif re.search(r"\d{1,2}/\d{1,2}/\d{4}", " ".join(v for v, _ in opts)):
            date_param = name

    for inp in soup.find_all("input"):
        n = (inp.get("name") or inp.get("id") or "").lower()
        if date_param is None and "date" in n:
            date_param = inp.get("name") or inp.get("id")

    # Fallbacks: names commonly used by this site
    return {
        "hall_param": hall_param or "locationNum",
        "date_param": date_param or "dtdate",
        "halls": halls,
    }


def fmt_date(d):
    return f"{d.month}/{d.day}/{d.year}"  # M/D/YYYY, works on Windows too


# ---------------------------------------------------------------- menu page

def parse_menu(html):
    """Return list of {meal, station, name, rec_id, tags}."""
    soup = BeautifulSoup(html, "html.parser")

    # Meal tabs: <a href="#pane-1">Brunch</a> -> pane-1 = Brunch
    pane_names = {}
    for a in soup.select('a[href^="#pane-"]'):
        pane_names[a["href"][1:]] = a.get_text(strip=True)

    entries = []
    panes = soup.select('[id^="pane-"]') or [soup]
    for pane in panes:
        meal = pane_names.get(pane.get("id"), "Unknown")
        station = None
        for el in pane.find_all(True):
            if el.name in ("h1", "h2", "h3", "h4", "h5", "h6") or "card-title" in (el.get("class") or []):
                station = el.get_text(strip=True)
            elif el.name == "a" and "label.aspx" in (el.get("href") or ""):
                m = re.search(r"RecNumAndPort=([^&\"]+)", el["href"])
                if not m:
                    continue
                entries.append({
                    "meal": meal,
                    "station": station,
                    "name": el.get_text(strip=True),
                    "rec_id": requests.utils.unquote(m.group(1)),
                    "tags": item_tags(el),
                })
    return entries


def item_tags(anchor):
    """Collect the icon alt texts (vegan, Contains dairy, HalalFriendly...) that
    follow an item link, stopping at the next item or station heading."""
    tags = []
    for el in anchor.next_elements:
        if getattr(el, "name", None) == "a" and "label.aspx" in (el.get("href") or ""):
            break
        if getattr(el, "name", None) in ("h1", "h2", "h3", "h4", "h5", "h6"):
            break
        if getattr(el, "name", None) == "img" and el.get("alt"):
            tags.append(el["alt"].strip())
    return tags


# ---------------------------------------------------------------- label page

def num(pattern, text):
    m = re.search(pattern, text, re.I)
    return float(m.group(1)) if m else None


def parse_label(html):
    soup = BeautifulSoup(html, "html.parser")
    text = re.sub(r"\s+", " ", soup.get_text(" "))

    serving = re.search(r"Serving size\s*(.+?)\s*(?:-{3}|Calories)", text, re.I)
    ingredients = re.search(r"INGREDIENTS:\s*(.+?)\s*(?:\||ALLERGENS:)", text)
    allergens = re.search(r"ALLERGENS:\s*(.*?)\s*(?:\||\*The nutrient)", text)

    return {
        "serving_size": serving.group(1).strip() if serving else None,
        "calories": num(r"Calories per serving\s*([\d.]+)", text) or num(r"Calories\s*([\d.]+)\s*kcal", text),
        "fat_g": num(r"Total Fat\s*([\d.]+)\s*g", text),
        "sat_fat_g": num(r"Saturated Fat\s*([\d.]+)\s*g", text),
        "carbs_g": num(r"Total Carbohydrate\.?\s*([\d.]+)\s*g", text),
        "fiber_g": num(r"Dietary Fiber\s*([\d.]+)\s*g", text),
        "sugar_g": num(r"Total Sugars\s*([\d.]+)\s*g", text),
        "protein_g": num(r"Protein\s*([\d.]+)\s*g", text),
        "sodium_mg": num(r"Sodium\s*([\d.]+)\s*mg", text),
        "cholesterol_mg": num(r"Cholesterol\s*([\d.]+)\s*mg", text),
        "ingredients": ingredients.group(1).strip() if ingredients else None,
        "allergens": allergens.group(1).strip() if allergens else None,
    }


# ---------------------------------------------------------------- commands

def scrape(start, days):
    con = db()
    site = discover()
    if not site["halls"]:
        print("Couldn't find the dining hall dropdown. Run `inspect` and send me the output.")
        return
    for value, name in site["halls"].items():
        con.execute("INSERT OR REPLACE INTO halls VALUES (?, ?)", (value, name))

    for i in range(days):
        d = start + dt.timedelta(days=i)
        for value, hall in site["halls"].items():
            print(f"{d} | {hall}")
            html = get(BASE, {site["hall_param"]: value, site["date_param"]: fmt_date(d)})
            entries = parse_menu(html)
            if not entries:
                print("  no items (closed, or no menu posted yet)")
            for e in entries:
                con.execute("INSERT OR REPLACE INTO menu_entries VALUES (?,?,?,?,?,?)",
                            (d.isoformat(), value, e["meal"], e["station"], e["rec_id"], json.dumps(e["tags"])))
                cached = con.execute("SELECT 1 FROM items WHERE rec_id=?", (e["rec_id"],)).fetchone()
                if not cached:
                    lab = parse_label(get(BASE + "label.aspx", {"RecNumAndPort": e["rec_id"]}))
                    con.execute("""INSERT INTO items VALUES
                        (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                        (e["rec_id"], e["name"], lab["serving_size"], lab["calories"],
                         lab["protein_g"], lab["carbs_g"], lab["fat_g"], lab["sat_fat_g"],
                         lab["fiber_g"], lab["sugar_g"], lab["sodium_mg"], lab["cholesterol_mg"],
                         lab["ingredients"], lab["allergens"], dt.datetime.now().isoformat()))
            con.commit()
            print(f"  {len(entries)} entries")
    con.close()


MACRO_FIELDS = ("calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g",
                "fiber_g", "sugar_g", "sodium_mg", "cholesterol_mg")


def clean_name(name):
    """Drop parenthetical notes like '(purple)' or '(Breakfast)'."""
    return re.sub(r"\s*\([^)]*\)", "", name or "").strip()


def normalize_serving(ss):
    if not ss:
        return None
    ss = re.sub(r"[^\w\s./]", "", ss).strip().lower()   # drops stray characters like '1 `oz'
    ss = re.sub(r"\bea\b", "each", ss)
    return ss


def quality_check(item):
    """Flag items whose nutrition data is missing or clearly wrong on UMD's site.
    Returns (status, reason): status is 'ok', 'missing', or 'suspect'."""
    c, p, cb, f = (item.get(k) for k in ("calories", "protein_g", "carbs_g", "fat_g"))
    if c is None or p is None or cb is None or f is None:
        return "missing", "no nutrition label on UMD's site"
    ss = item.get("serving_size") or ""
    oz = re.match(r"([\d.]+)\s*oz", ss)
    if oz and c > 9 * 28.35 * float(oz.group(1)):
        return "suspect", "more calories than physically possible for the serving weight"
    est = 4 * p + 4 * cb + 9 * f
    if c > 30 and abs(est - c) / c > 0.35:
        return "suspect", f"macros add up to ~{round(est)} kcal but label says {round(c)}"
    if c == 0 and (cb > 1 or "syrup" in item["name"].lower()):
        return "suspect", "zero calories looks wrong for this item"
    return "ok", None


GRAMS_PER_OZ = 28.35

# For count-based servings ("1 each", "2 slices") UMD gives no weight, so we estimate
# grams from calories using typical energy density (kcal per gram) for that kind of food.
# First matching keyword wins; tweak these if an estimate looks off.
ENERGY_DENSITY = [
    (("cookie", "brownie"), 4.6), (("donut", "croissant"), 4.2), (("muffin", "biscuit"), 3.6),
    (("cheesecake",), 3.2), (("cheese sliced", "sliced gouda", "sliced provolone"), 3.6),
    (("bacon",), 4.5), (("sausage", "hot dog"), 3.0), (("tortilla", "naan", "pita", "lavash", "flat bread"), 3.0),
    (("pizza",), 2.7), (("bagel", "bread", "roll", "bun", "english muffin", "toast"), 2.7),
    (("pancake", "waffle"), 2.4), (("wrap", "sandwich", "sub", "quesadilla", "steak", "burger"), 2.4),
    (("chicken", "cutlet", "thigh", "breast", "brisket"), 2.0), (("egg roll",), 2.4), (("egg",), 1.6),
    (("avocado",), 1.6), (("banana",), 0.9), (("apple", "orange", "grapefruit", "watermelon",
     "lemon", "lime", "cherr", "tomato", "lettuce"), 0.4),
]


def parse_qty(text):
    """'4 1/2' -> 4.5, '1/2' -> 0.5, '2' -> 2.0"""
    total = 0.0
    for part in text.split():
        if "/" in part:
            a, b = part.split("/", 1)
            total += float(a) / float(b)
        else:
            total += float(part)
    return total


def serving_grams(serving, name, macros):
    """Return the serving weight in grams as an int."""
    m = re.match(r"([\d\s./]+?)\s*([a-z]+)", serving or "")
    if not m:
        return None
    qty, unit = parse_qty(m.group(1)), m.group(2)
    if unit == "oz":
        return round(qty * GRAMS_PER_OZ)

    lname = name.lower()
    density = next((d for keys, d in ENERGY_DENSITY if any(k in lname for k in keys)), 2.5)
    grams = (macros["calories"] or 0) / density
    # A serving can't weigh less than the protein + carbs + fat it contains
    floor = 1.1 * sum(macros[k] or 0 for k in ("protein_g", "carbs_g", "fat_g"))
    return max(round(max(grams, floor)), 5)


def export(d):
    con = db()
    con.row_factory = sqlite3.Row
    rows = con.execute("""
        SELECT h.name AS hall, m.meal, m.station, m.tags, i.*
        FROM menu_entries m
        JOIN items i ON i.rec_id = m.rec_id
        JOIN halls h ON h.hall_value = m.hall_value
        WHERE m.date = ?
        ORDER BY h.name, m.meal, m.station, i.name""", (d.isoformat(),)).fetchall()

    out, omitted, skipped = {}, {}, 0
    for r in rows:
        serving = normalize_serving(r["serving_size"])
        macros = {k: r[k] for k in MACRO_FIELDS}
        status, note = quality_check({"name": r["name"], "serving_size": serving, **macros})
        grams = serving_grams(serving, r["name"], macros) if status == "ok" else None
        item = {
            "id": int(r["rec_id"].split("*")[0]),
            "name": clean_name(r["name"]),
            "serving_g": grams,
            "macros": macros,
            "tags": json.loads(r["tags"]),
            "ingredients": r["ingredients"],
            "allergens": r["allergens"],
        }
        if status != "ok":
            omitted[item["name"]] = f"{status}: {note}"
            skipped += 1
            continue
        out.setdefault(r["hall"], {}).setdefault(r["meal"], {}).setdefault(r["station"] or "Other", []).append(item)

    path = f"menu_{d.isoformat()}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"date": d.isoformat(), "halls": out}, f, indent=2)

    print(f"Wrote {path} ({len(rows) - skipped} entries)")
    if omitted:
        print(f"Omitted {skipped} entries for {len(omitted)} items with missing or bad nutrition data:")
        for name, why in sorted(omitted.items()):
            print(f"  {name} -> {why}")


def inspect():
    site = discover()
    print("hall parameter:", site["hall_param"])
    print("date parameter:", site["date_param"])
    print("halls:")
    for v, n in site["halls"].items():
        print(f"  {v!r}: {n}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("command", choices=["inspect", "scrape", "export"])
    ap.add_argument("--date", default=dt.date.today().isoformat(), help="YYYY-MM-DD")
    ap.add_argument("--days", type=int, default=1)
    args = ap.parse_args()
    d = dt.date.fromisoformat(args.date)

    if args.command == "inspect":
        inspect()
    elif args.command == "scrape":
        scrape(d, args.days)
    else:
        export(d)


if __name__ == "__main__":
    main()