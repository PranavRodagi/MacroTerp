"""Small JSON API that serves meal recommendations to the frontend.

Usage:
    python server.py            # http://localhost:8000

POST /api/meals
    {
      "period": "Lunch",                                  # Breakfast | Lunch | Dinner
      "restrictions": ["halal_friendly"],                 # any of meal_recommender.DIETARY_OPTIONS
      "goals":    {"calories": 1900, "protein_g": 115, "carbs_g": 240, "fat_g": 65,
                   "fiber_g": 28, "sodium_mg": 2300, "sugar_g": 50},
      "consumed": {"calories": 720,  "protein_g": 42,  "carbs_g": 96,  "fat_g": 31,
                   "fiber_g": 14, "sodium_mg": 980,  "sugar_g": 28}
    }
→ the output of meal_recommender.generate_meals().

What's left of each daily goal is split evenly across the meals remaining today
and passed to the recommender's per-meal limits. Fat has no matching setting in
the recommender, so it only shows in the frontend's progress bars.

Uses only the standard library. Reads menu.json (reloaded when the file changes).
"""
import json
import math
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import meal_recommender as recommender

PORT = 8000
MENU_PATH = Path(__file__).with_name("menu.json")
MAX_ITEMS_PER_MEAL = 6
CARB_MIN_G = 15.0

_menu = {"mtime": None, "data": None}
_cache: dict[str, dict] = {}


def load_menu():
    mtime = MENU_PATH.stat().st_mtime
    if mtime != _menu["mtime"]:
        _menu.update(mtime=mtime, data=json.loads(MENU_PATH.read_text(encoding="utf-8")))
        _cache.clear()
    return _menu["data"]


def num(obj, key, default=0.0):
    value = float((obj or {}).get(key, default))
    if not math.isfinite(value) or value < 0:
        raise ValueError(f"{key} must be a non-negative number")
    return value


def settings_from(body):
    period = str(body.get("period", "Lunch")).strip().title()
    goals, consumed = body.get("goals") or {}, body.get("consumed") or {}
    meals_left = recommender.meal_count_remaining(period) if period in recommender.MEAL_PERIODS else 1

    def per_meal(key, default_goal):
        return max(0.0, num(goals, key, default_goal) - num(consumed, key)) / meals_left

    carb_max = per_meal("carbs_g", 240)
    return recommender.UserSettings(
        daily_calorie_goal=num(goals, "calories", 2000),
        daily_protein_goal_g=num(goals, "protein_g", 100),
        calories_consumed=num(consumed, "calories"),
        protein_consumed_g=num(consumed, "protein_g"),
        current_meal=period,
        dietary_restrictions=list(body.get("restrictions") or []),
        sodium_limit_mg=per_meal("sodium_mg", 2300),
        sugar_limit_g=per_meal("sugar_g", 50),
        carb_max_g=carb_max,
        carb_min_g=min(CARB_MIN_G, carb_max),
        fiber_min_g=per_meal("fiber_g", 28),
        max_items_per_meal=MAX_ITEMS_PER_MEAL,
    )


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path != "/api/meals":
            return self.send_json(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(length) or b"{}")
            settings = settings_from(body)
        except (ValueError, TypeError, AttributeError) as e:
            return self.send_json(400, {"error": str(e)})

        menu = load_menu()
        key = json.dumps(body, sort_keys=True)
        if key not in _cache:
            if len(_cache) > 200:
                _cache.clear()
            _cache[key] =recommender.generate_meals(menu, settings)
        self.send_json(200, _cache[key])


if __name__ == "__main__":
    print(f"Meal API on http://localhost:{PORT}  (menu: {MENU_PATH.name})")
    ThreadingHTTPServer(("", PORT), Handler).serve_forever()
