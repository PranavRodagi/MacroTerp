"""
Temporary terminal client for testing MacroTerp accounts on Supabase.

Registers, logs in and out, and reads or updates a user's dietary restrictions,
calorie goal, and protein goal, using the same Supabase project, tables, and
rules as the frontend (frontend/app/src/lib/authConfig.ts). Nothing imports this
file; delete it once the login page exists.

Setup: fill in frontend/app/.env.local (copy .env.example), or set the
VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY environment variables.

Usage:
    python3 account_cli.py

Standard library only.
"""
from __future__ import annotations

import getpass
import json
import os
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from meal_recommender import DIETARY_OPTIONS

ENV_FILE = Path(__file__).with_name("frontend") / "app" / ".env.local"
REQUEST_TIMEOUT_S = 15

# Same rules as the frontend (lib/authConfig.ts); the database (supabase/migrations/) enforces them too.
USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_]{3,30}$")
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_BYTES = 72
CALORIE_GOAL_RANGE = (1, 10000)
PROTEIN_GOAL_RANGE = (1, 1000)
PROFILE_COLUMNS = "username,onboarded,calorie_goal,protein_goal_g,dietary_restrictions"


class ApiError(Exception):
    """A failed Supabase request, carrying a message fit to show the user."""


@dataclass
class Session:
    access_token: str
    user_id: str
    email: str


# ---------------------------------------------------------------- config + HTTP

def load_config() -> tuple[str, str]:
    """Return (project URL, publishable key) from the environment or .env.local."""
    values: dict[str, str] = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.partition("=")
            if sep and not key.strip().startswith("#"):
                values[key.strip()] = value.strip().strip("\"'")
    values.update({key: value for key, value in os.environ.items() if key.startswith("VITE_SUPABASE_")})

    url = values.get("VITE_SUPABASE_URL", "").rstrip("/")
    key = values.get("VITE_SUPABASE_PUBLISHABLE_KEY", "")
    if not url or not key or "your-project-ref" in url:
        raise SystemExit(
            "Supabase isn't configured. Copy frontend/app/.env.example to frontend/app/.env.local "
            "and fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY."
        )
    return url, key


class Supabase:
    """Minimal client for the Supabase Auth and database REST endpoints."""

    def __init__(self, url: str, key: str) -> None:
        self.url = url
        self.key = key

    def request(
        self, method: str, path: str, body: Any = None,
        token: str | None = None, headers: dict[str, str] | None = None,
    ) -> Any:
        """Send a JSON request and return the parsed response, raising ApiError on failure."""
        request = urllib.request.Request(
            self.url + path,
            method=method,
            data=None if body is None else json.dumps(body).encode("utf-8"),
            headers={
                "apikey": self.key,
                "Authorization": f"Bearer {token or self.key}",
                "Content-Type": "application/json",
                **(headers or {}),
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_S) as response:
                text = response.read().decode("utf-8")
        except urllib.error.HTTPError as error:
            raise ApiError(error_message(error.code, error.read().decode("utf-8", "replace"))) from None
        except urllib.error.URLError as error:
            if "CERTIFICATE_VERIFY_FAILED" in str(error.reason):
                raise ApiError(
                    "Python can't verify HTTPS certificates. On macOS with Python from python.org, "
                    "run '/Applications/Python 3.x/Install Certificates.command' (matching your version)."
                ) from None
            raise ApiError(f"Couldn't reach Supabase ({error.reason}). Check VITE_SUPABASE_URL.") from None
        return json.loads(text) if text else None


def error_message(status: int, text: str) -> str:
    """Turn a Supabase error response into the same messages the frontend shows."""
    try:
        body: dict[str, Any] = json.loads(text)
    except json.JSONDecodeError:
        body = {}
    code = str(body.get("error_code") or body.get("code") or body.get("error") or "")
    detail = str(body.get("msg") or body.get("message") or body.get("error_description") or text or status)

    messages = {
        # Deliberately doesn't say which was wrong, so accounts can't be discovered.
        "invalid_credentials": "Incorrect email or password.",
        "invalid_grant": "Incorrect email or password.",
        "user_already_exists": "An account with this email already exists.",
        "email_exists": "An account with this email already exists.",
        "email_not_confirmed": "Confirm your email address using the link we sent, then log in.",
        "email_address_invalid": "Enter a valid email address.",
        "over_request_rate_limit": "Too many attempts. Wait a minute and try again.",
        "over_email_send_rate_limit": "Too many attempts. Wait a minute and try again.",
        "unexpected_failure": "Couldn't create the account. The username may have just been taken; try another.",
        "23505": "That username is taken.",
        "23514": "One of the values is outside the allowed range.",
        "PGRST301": "Your session expired. Log in again.",
        # Function / table / column not found: migrations haven't been run in this project.
        "PGRST202": "The database isn't set up yet. Run the files in supabase/migrations/ in Supabase's SQL Editor, in order.",
        "PGRST205": "The database isn't set up yet. Run the files in supabase/migrations/ in Supabase's SQL Editor, in order.",
        "42703": "The database isn't set up yet. Run the files in supabase/migrations/ in Supabase's SQL Editor, in order.",  # a column is missing: a later migration hasn't been run
    }
    if code == "weak_password":
        return detail  # Supabase explains what the password is missing
    return messages.get(code, f"Request failed ({status}): {detail}")


# ---------------------------------------------------------------- validation

def validate_email(email: str) -> str | None:
    return None if len(email) <= 254 and EMAIL_PATTERN.match(email) else "Enter a valid email address."


def validate_username(username: str) -> str | None:
    if USERNAME_PATTERN.match(username):
        return None
    return "Usernames are 3–30 characters: letters, numbers, and underscores only."


def validate_password(password: str) -> str | None:
    if len(password) < PASSWORD_MIN_LENGTH:
        return f"Passwords must be at least {PASSWORD_MIN_LENGTH} characters."
    if len(password.encode("utf-8")) > PASSWORD_MAX_BYTES:
        return "That password is too long."
    return None


def parse_goal(text: str, label: str, value_range: tuple[int, int]) -> int:
    """Parse a whole-number goal within ``value_range``, raising ValueError with a message."""
    low, high = value_range
    if not re.fullmatch(r"\d+", text) or not low <= int(text) <= high:
        raise ValueError(f"{label} must be a whole number from {low} to {high}.")
    return int(text)


def parse_restrictions(text: str) -> list[str]:
    """Parse a comma-separated restriction list ('none' clears it), raising ValueError."""
    if text.lower() == "none":
        return []
    chosen = list(dict.fromkeys(part.strip().lower() for part in text.split(",") if part.strip()))
    unknown = [value for value in chosen if value not in DIETARY_OPTIONS]
    if unknown:
        raise ValueError(f"Unknown restriction(s): {', '.join(unknown)}.")
    return chosen


# ---------------------------------------------------------------- account actions

def register(client: Supabase) -> Session | None:
    """Create an account; returns a session if Supabase logs the user straight in."""
    email = input("Email: ").strip()
    username = input("Username: ").strip()
    invalid = validate_email(email) or validate_username(username)
    if invalid:
        raise ApiError(invalid)
    # Check before asking for a password, so a taken username is flagged right away.
    if not client.request("POST", "/rest/v1/rpc/username_available", {"candidate": username}):
        raise ApiError("That username is taken.")

    password = getpass.getpass("Password: ")
    if invalid := validate_password(password):
        raise ApiError(invalid)
    if getpass.getpass("Confirm password: ") != password:
        raise ApiError("Passwords don't match.")

    # The username travels as metadata; a database trigger creates the profile row.
    result = client.request("POST", "/auth/v1/signup", {"email": email, "password": password, "data": {"username": username}})
    user: dict[str, Any] = result.get("user") or result
    # With "Confirm email" on, Supabase hides whether an email is registered: a
    # repeat sign-up "succeeds" but returns a user with no identities.
    if user.get("identities") == []:
        raise ApiError("An account with this email already exists.")
    if not result.get("access_token"):
        print("Account created. Confirm your email using the link Supabase sent, then log in.")
        return None
    print(f"Account created. Logged in as {username}.")
    return Session(result["access_token"], user["id"], email)


def log_in(client: Supabase) -> Session:
    email = input("Email: ").strip()
    password = getpass.getpass("Password: ")
    if validate_email(email) or not password:
        raise ApiError("Incorrect email or password.")
    result = client.request("POST", "/auth/v1/token?grant_type=password", {"email": email, "password": password})
    session = Session(result["access_token"], result["user"]["id"], email)
    profile = fetch_profile(client, session)
    print(f"Logged in as {profile['username']}.")
    return session


def log_out(client: Supabase, session: Session) -> None:
    try:
        client.request("POST", "/auth/v1/logout", token=session.access_token)
    except ApiError:
        pass  # an expired session is already logged out
    print("Logged out.")


def fetch_profile(client: Supabase, session: Session) -> dict[str, Any]:
    return client.request(
        "GET", f"/rest/v1/profiles?select={PROFILE_COLUMNS}&id=eq.{session.user_id}",
        token=session.access_token,
        headers={"Accept": "application/vnd.pgrst.object+json"},  # a single object, not a list
    )


def show_profile(client: Supabase, session: Session) -> None:
    profile = fetch_profile(client, session)
    restrictions = ", ".join(profile["dietary_restrictions"]) or "none"
    print(f"  Username:     {profile['username']}")
    print(f"  Onboarded:    {'yes' if profile['onboarded'] else 'no (the app will show the goals step)'}")
    print(f"  Email:        {session.email}")
    print(f"  Calorie goal: {profile['calorie_goal'] or 'not set'}")
    print(f"  Protein goal: {str(profile['protein_goal_g']) + ' g' if profile['protein_goal_g'] is not None else 'not set'}")
    print(f"  Restrictions: {restrictions}")


def set_preferences(client: Supabase, session: Session) -> None:
    """Prompt for new preferences (blank keeps the current value) and save them."""
    print("Leave a field blank to keep its current value.")
    changes: dict[str, Any] = {}
    try:
        if calories := input(f"Calorie goal ({CALORIE_GOAL_RANGE[0]}–{CALORIE_GOAL_RANGE[1]}): ").strip():
            changes["calorie_goal"] = parse_goal(calories, "Calorie goal", CALORIE_GOAL_RANGE)
        if protein := input(f"Protein goal in g ({PROTEIN_GOAL_RANGE[0]}–{PROTEIN_GOAL_RANGE[1]}): ").strip():
            changes["protein_goal_g"] = parse_goal(protein, "Protein goal", PROTEIN_GOAL_RANGE)
        print(f"Restrictions: {', '.join(sorted(DIETARY_OPTIONS))}")
        if restrictions := input("Restrictions (comma-separated, or 'none'): ").strip():
            changes["dietary_restrictions"] = parse_restrictions(restrictions)
    except ValueError as error:
        raise ApiError(str(error)) from None

    if not changes:
        print("Nothing changed.")
        return
    client.request(
        "PATCH", f"/rest/v1/profiles?id=eq.{session.user_id}", changes,
        token=session.access_token, headers={"Prefer": "return=minimal"},
    )
    print("Preferences saved.")
    show_profile(client, session)


# ---------------------------------------------------------------- menu

def main() -> None:
    client = Supabase(*load_config())
    session: Session | None = None
    print(f"MacroTerp account tester — {client.url}")

    while True:
        if session:
            print(f"\n[{session.email}]  1) Show profile  2) Set preferences  3) Log out  q) Quit")
        else:
            print("\n[not logged in]  1) Register  2) Log in  q) Quit")
        choice = input("> ").strip().lower()
        try:
            if choice == "q":
                return
            if session is None and choice == "1":
                session = register(client)
            elif session is None and choice == "2":
                session = log_in(client)
            elif session and choice == "1":
                show_profile(client, session)
            elif session and choice == "2":
                set_preferences(client, session)
            elif session and choice == "3":
                log_out(client, session)
                session = None
            else:
                print("Choose one of the listed options.")
        except ApiError as error:
            print(f"Error: {error}")
            if "session expired" in str(error).lower():
                session = None


if __name__ == "__main__":
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        print()
