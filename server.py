"""Small JSON API that serves meal recommendations to the frontend.

Usage:
    python server.py            # http://localhost:8000 (or $PORT, which hosts like Render set)

GET /api/health
→ {"ok": true, "menu_date": "..."}; used as the host's health check.

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
from __future__ import annotations

import json
import math
import os
import threading
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, cast

import meal_recommender as recommender

PORT = int(os.environ.get("PORT", "8000"))
MENU_PATH = Path(__file__).with_name("menu.json")
MEALS_ENDPOINT = "/api/meals"
HEALTH_ENDPOINT = "/api/health"
MAX_ITEMS_PER_MEAL = 6
CARB_MIN_G = 15.0
MAX_CACHED_RESPONSES = 200

# Daily goals used when the request leaves one out.
DEFAULT_GOALS: dict[str, float] = {
    "calories": 2000, "protein_g": 100, "carbs_g": 240,
    "sodium_mg": 2300, "sugar_g": 50, "fiber_g": 28,
}

JSONObject = dict[str, Any]


@dataclass
class LoadedMenu:
    """menu.json's parsed contents and the modification time they were read at."""

    mtime: float | None = None
    data: JSONObject | None = None


_menu = LoadedMenu()
_responses: dict[str, JSONObject] = {}  # request body (canonical JSON) -> response
_lock = threading.Lock()  # requests run on separate threads; guards _menu and _responses


def load_menu() -> JSONObject:
    """Return menu.json's contents, rereading it (and clearing cached responses) when it changes.

    Raises OSError if the file is missing, or ValueError if it isn't a valid menu.
    """
    mtime = MENU_PATH.stat().st_mtime
    if mtime != _menu.mtime or _menu.data is None:
        _menu.data = as_object(json.loads(MENU_PATH.read_text(encoding="utf-8")), "menu.json")
        _menu.mtime = mtime
        _responses.clear()
    return _menu.data


# ---------------------------------------------------------------- request parsing

def as_object(value: Any, name: str) -> JSONObject:
    """Return ``value`` as a JSON object, raising ValueError if it is something else."""
    if not isinstance(value, dict):
        raise ValueError(f"{name} must be a JSON object")
    return cast(JSONObject, value)


def non_negative(values: JSONObject, key: str, default: float = 0.0) -> float:
    """Return ``values[key]`` as a finite, non-negative float (``default`` if absent)."""
    try:
        value = float(values.get(key, default))
    except (TypeError, ValueError):
        raise ValueError(f"{key} must be a non-negative number") from None
    if not math.isfinite(value) or value < 0:
        raise ValueError(f"{key} must be a non-negative number")
    return value


def restrictions_of(body: JSONObject) -> list[str]:
    """Return the request's dietary restrictions as a list of strings."""
    restrictions: Any = body.get("restrictions") or []
    if isinstance(restrictions, str):
        restrictions = [restrictions]
    if not isinstance(restrictions, list) or not all(isinstance(r, str) for r in cast(list[Any], restrictions)):
        raise ValueError("restrictions must be a list of strings")
    return cast(list[str], restrictions)


def settings_from(body: JSONObject) -> recommender.UserSettings:
    """Build the recommender's settings from a request body, raising ValueError if it's invalid."""
    period = str(body.get("period", "Lunch")).strip().title()
    goals = as_object(body.get("goals") or {}, "goals")
    consumed = as_object(body.get("consumed") or {}, "consumed")
    meals_left = recommender.meal_count_remaining(period) if period in recommender.MEAL_PERIODS else 1

    def daily_goal(key: str) -> float:
        return non_negative(goals, key, DEFAULT_GOALS[key])

    def per_meal(key: str) -> float:
        """What's left of today's goal for ``key``, split across the remaining meals."""
        return max(0.0, daily_goal(key) - non_negative(consumed, key)) / meals_left

    carb_max = per_meal("carbs_g")
    return recommender.UserSettings(
        daily_calorie_goal=daily_goal("calories"),
        daily_protein_goal_g=daily_goal("protein_g"),
        calories_consumed=non_negative(consumed, "calories"),
        protein_consumed_g=non_negative(consumed, "protein_g"),
        current_meal=period,
        dietary_restrictions=restrictions_of(body),
        sodium_limit_mg=per_meal("sodium_mg"),
        sugar_limit_g=per_meal("sugar_g"),
        carb_max_g=carb_max,
        carb_min_g=min(CARB_MIN_G, carb_max),
        fiber_min_g=per_meal("fiber_g"),
        max_items_per_meal=MAX_ITEMS_PER_MEAL,
    )


def recommend(body: JSONObject, settings: recommender.UserSettings) -> JSONObject:
    """Return generated meals for a request, reusing the response for identical requests."""
    key = json.dumps(body, sort_keys=True)
    with _lock:
        menu = load_menu()
        if key in _responses:
            return _responses[key]
    meals = recommender.generate_meals(menu, settings)
    with _lock:
        if len(_responses) >= MAX_CACHED_RESPONSES:
            _responses.clear()
        _responses[key] = meals
    return meals


# ---------------------------------------------------------------- HTTP

class Handler(BaseHTTPRequestHandler):
    """Serves POST /api/meals and GET /api/health."""

    def send_json(self, status: HTTPStatus, payload: object) -> None:
        """Send ``payload`` as a JSON response with ``status``."""
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        if self.path != HEALTH_ENDPOINT:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})
            return
        try:
            with _lock:
                menu_date = load_menu().get("date")
        except (OSError, ValueError):
            self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"ok": False, "error": f"{MENU_PATH.name} is missing or invalid"})
            return
        self.send_json(HTTPStatus.OK, {"ok": True, "menu_date": menu_date})

    def do_POST(self) -> None:
        if self.path != MEALS_ENDPOINT:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            body = as_object(json.loads(self.rfile.read(length) or b"{}"), "request body")
            settings = settings_from(body)
        except ValueError as error:  # includes malformed JSON (json.JSONDecodeError)
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
            return

        try:
            meals = recommend(body, settings)
        except (OSError, ValueError):
            self.send_json(
                HTTPStatus.SERVICE_UNAVAILABLE,
                {"error": f"{MENU_PATH.name} is missing or invalid; run scraper.py to create it"},
            )
            return
        self.send_json(HTTPStatus.OK, meals)


if __name__ == "__main__":
    print(f"Meal API on http://localhost:{PORT}  (menu: {MENU_PATH.name})")
    ThreadingHTTPServer(("", PORT), Handler).serve_forever()
