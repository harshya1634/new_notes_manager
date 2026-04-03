from __future__ import annotations

import json
import os
import secrets
import sqlite3
from datetime import UTC, date, datetime, timedelta
from functools import wraps
from pathlib import Path

from flask import Flask, jsonify, render_template, request, session
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DATABASE_FILE = DATA_DIR / "student_manager.sqlite3"
LEGACY_STORE_FILE = DATA_DIR / "store.json"

DEMO_USERNAME = "demo"
DEMO_EMAIL = "demo@example.com"
DEMO_PASSWORD = "demo1234"

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-key-change-me")
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax")


def current_timestamp() -> str:
    return datetime.now(UTC).isoformat()


def connect_db() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_FILE)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def load_legacy_store() -> dict:
    if not LEGACY_STORE_FILE.exists():
        return {}
    try:
        with LEGACY_STORE_FILE.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (json.JSONDecodeError, OSError):
        return {}


def default_seed_data() -> tuple[list[dict], list[dict]]:
    today = date.today()
    tomorrow = today + timedelta(days=1)
    in_three_days = today + timedelta(days=3)
    tasks = [
        {
            "title": "Complete math assignment",
            "course": "Mathematics",
            "due_date": tomorrow.isoformat(),
            "priority": "high",
            "status": "pending",
            "notes": "Focus on formulas and final answers.",
            "link": "https://example.com/math",
        },
        {
            "title": "Review biology chapter",
            "course": "Biology",
            "due_date": in_three_days.isoformat(),
            "priority": "medium",
            "status": "in-progress",
            "notes": "Make flashcards for key terms.",
            "link": "https://example.com/biology",
        },
    ]
    notes = [
        {
            "title": "Exam strategy",
            "subject": "General",
            "content": "Use active recall, summarize chapters, and revise with short breaks.",
            "link": "https://example.com/study-guide",
            "pinned": True,
        }
    ]
    return tasks, notes


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with connect_db() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                email TEXT UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                course TEXT,
                due_date TEXT,
                priority TEXT NOT NULL DEFAULT 'medium',
                status TEXT NOT NULL DEFAULT 'pending',
                notes TEXT,
                link TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                subject TEXT,
                content TEXT NOT NULL,
                link TEXT,
                pinned INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                reset_code TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                used INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """
        )
        seed_demo_account(connection)


def parse_timestamp(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def generate_reset_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def seed_demo_account(connection: sqlite3.Connection) -> None:
    user_count = connection.execute("SELECT COUNT(*) AS total FROM users").fetchone()["total"]
    if user_count:
        return

    demo_user_id = create_user_record(
        connection,
        username=DEMO_USERNAME,
        email=DEMO_EMAIL,
        password=DEMO_PASSWORD,
    )

    legacy_store = load_legacy_store()
    legacy_tasks = legacy_store.get("tasks", []) if isinstance(legacy_store, dict) else []
    legacy_notes = legacy_store.get("notes", []) if isinstance(legacy_store, dict) else []

    if legacy_tasks or legacy_notes:
        for task in legacy_tasks:
            insert_task_record(
                connection,
                demo_user_id,
                {
                    "title": task.get("title", "Untitled task"),
                    "course": task.get("course", ""),
                    "due_date": task.get("dueDate", ""),
                    "priority": task.get("priority", "medium"),
                    "status": task.get("status", "pending"),
                    "notes": task.get("notes", ""),
                    "link": task.get("link", ""),
                    "created_at": task.get("createdAt", current_timestamp()),
                },
            )

        for note in legacy_notes:
            insert_note_record(
                connection,
                demo_user_id,
                {
                    "title": note.get("title", "Untitled note"),
                    "subject": note.get("subject", ""),
                    "content": note.get("content", ""),
                    "link": note.get("link", ""),
                    "pinned": bool(note.get("pinned", False)),
                    "created_at": note.get("createdAt", current_timestamp()),
                },
            )
        return

    default_tasks, default_notes = default_seed_data()
    for task in default_tasks:
        insert_task_record(connection, demo_user_id, {**task, "created_at": current_timestamp()})
    for note in default_notes:
        insert_note_record(connection, demo_user_id, {**note, "created_at": current_timestamp()})


def create_user_record(
    connection: sqlite3.Connection,
    *,
    username: str,
    email: str,
    password: str,
) -> int:
    cursor = connection.execute(
        """
        INSERT INTO users (username, email, password_hash, created_at)
        VALUES (?, ?, ?, ?)
        """,
        (username, email or None, generate_password_hash(password), current_timestamp()),
    )
    return int(cursor.lastrowid)


def insert_task_record(connection: sqlite3.Connection, user_id: int, task: dict) -> int:
    cursor = connection.execute(
        """
        INSERT INTO tasks (
            user_id, title, course, due_date, priority, status, notes, link, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            task.get("title", "").strip(),
            task.get("course", "").strip(),
            task.get("due_date", "").strip(),
            task.get("priority", "medium").strip(),
            task.get("status", "pending").strip(),
            task.get("notes", "").strip(),
            task.get("link", "").strip(),
            task.get("created_at", current_timestamp()),
            current_timestamp(),
        ),
    )
    return int(cursor.lastrowid)


def insert_note_record(connection: sqlite3.Connection, user_id: int, note: dict) -> int:
    cursor = connection.execute(
        """
        INSERT INTO notes (
            user_id, title, subject, content, link, pinned, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            note.get("title", "").strip(),
            note.get("subject", "").strip(),
            note.get("content", "").strip(),
            note.get("link", "").strip(),
            1 if note.get("pinned", False) else 0,
            note.get("created_at", current_timestamp()),
            current_timestamp(),
        ),
    )
    return int(cursor.lastrowid)


def get_session_user_id() -> int | None:
    raw_user_id = session.get("user_id")
    if raw_user_id is None:
        return None
    try:
        return int(raw_user_id)
    except (TypeError, ValueError):
        session.pop("user_id", None)
        return None


def fetch_current_user() -> dict | None:
    user_id = get_session_user_id()
    if user_id is None:
        return None
    with connect_db() as connection:
        row = connection.execute(
            "SELECT id, username, email, created_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    if row is None:
        session.pop("user_id", None)
        return None
    return dict(row)


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if fetch_current_user() is None:
            return jsonify({"error": "Login required."}), 401
        return view(*args, **kwargs)

    return wrapped


def task_row_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "course": row["course"] or "",
        "dueDate": row["due_date"] or "",
        "priority": row["priority"],
        "status": row["status"],
        "notes": row["notes"] or "",
        "link": row["link"] or "",
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def note_row_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "subject": row["subject"] or "",
        "content": row["content"],
        "link": row["link"] or "",
        "pinned": bool(row["pinned"]),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def sort_tasks(tasks: list[dict]) -> list[dict]:
    def sort_key(task: dict):
        due_value = task.get("dueDate") or "9999-12-31"
        status_rank = {"pending": 0, "in-progress": 1, "completed": 2}.get(task.get("status"), 3)
        priority_rank = {"high": 0, "medium": 1, "low": 2}.get(task.get("priority"), 3)
        return (status_rank, due_value, priority_rank, task.get("title", ""))

    return sorted(tasks, key=sort_key)


def sort_notes(notes: list[dict]) -> list[dict]:
    return sorted(notes, key=lambda note: (not note.get("pinned", False), note.get("createdAt", "")))


def fetch_user_tasks(connection: sqlite3.Connection, user_id: int) -> list[dict]:
    rows = connection.execute("SELECT * FROM tasks WHERE user_id = ?", (user_id,)).fetchall()
    return [task_row_to_dict(row) for row in rows]


def fetch_user_notes(connection: sqlite3.Connection, user_id: int) -> list[dict]:
    rows = connection.execute("SELECT * FROM notes WHERE user_id = ?", (user_id,)).fetchall()
    return [note_row_to_dict(row) for row in rows]


def build_reminders(tasks: list[dict]) -> list[dict]:
    reminders: list[dict] = []
    today = date.today()
    for task in tasks:
        if task.get("status") == "completed":
            continue
        due_date = task.get("dueDate") or ""
        if not due_date:
            continue
        try:
            due = date.fromisoformat(due_date)
        except ValueError:
            continue
        days_left = (due - today).days
        if days_left <= 7:
            reminders.append({**task, "daysLeft": days_left, "dueLabel": due.isoformat()})

    def reminder_key(item: dict):
        priority_rank = {"high": 0, "medium": 1, "low": 2}.get(item.get("priority"), 3)
        return (item.get("daysLeft", 999), priority_rank, item.get("title", ""))

    return sorted(reminders, key=reminder_key)


def locate_task(connection: sqlite3.Connection, task_id: int, user_id: int) -> sqlite3.Row | None:
    return connection.execute(
        "SELECT * FROM tasks WHERE id = ? AND user_id = ?",
        (task_id, user_id),
    ).fetchone()


def locate_note(connection: sqlite3.Connection, note_id: int, user_id: int) -> sqlite3.Row | None:
    return connection.execute(
        "SELECT * FROM notes WHERE id = ? AND user_id = ?",
        (note_id, user_id),
    ).fetchone()


@app.get("/")
def index():
    return render_template(
        "index.html",
        demo_username=DEMO_USERNAME,
        demo_password=DEMO_PASSWORD,
    )


@app.get("/api/me")
def api_me():
    user = fetch_current_user()
    if user is None:
        return jsonify({"authenticated": False})
    return jsonify({"authenticated": True, "user": user})


@app.post("/api/auth/register")
def register():
    payload = request.get_json(force=True, silent=True) or {}
    username = payload.get("username", "").strip()
    email = payload.get("email", "").strip()
    password = payload.get("password", "")

    if len(username) < 3:
        return jsonify({"error": "Username must be at least 3 characters."}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters."}), 400

    with connect_db() as connection:
        existing_username = connection.execute(
            "SELECT id FROM users WHERE username = ?",
            (username,),
        ).fetchone()
        if existing_username is not None:
            return jsonify({"error": "Username already exists."}), 409

        if email:
            existing_email = connection.execute(
                "SELECT id FROM users WHERE email = ?",
                (email,),
            ).fetchone()
            if existing_email is not None:
                return jsonify({"error": "Email already exists."}), 409

        user_id = create_user_record(
            connection,
            username=username,
            email=email,
            password=password,
        )

    session["user_id"] = user_id
    return jsonify({"authenticated": True, "user": {"id": user_id, "username": username, "email": email}}), 201


@app.post("/api/auth/login")
def login():
    payload = request.get_json(force=True, silent=True) or {}
    identifier = payload.get("identifier", "").strip()
    password = payload.get("password", "")

    if not identifier or not password:
        return jsonify({"error": "Username/email and password are required."}), 400

    with connect_db() as connection:
        row = connection.execute(
            """
            SELECT * FROM users
            WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE
            """,
            (identifier, identifier),
        ).fetchone()

    if row is None or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "Invalid credentials."}), 401

    session["user_id"] = int(row["id"])
    return jsonify(
        {
            "authenticated": True,
            "user": {"id": row["id"], "username": row["username"], "email": row["email"]},
        }
    )


@app.post("/api/auth/logout")
def logout():
    session.pop("user_id", None)
    return jsonify({"ok": True})


@app.post("/api/auth/forgot-password")
def forgot_password():
    payload = request.get_json(force=True, silent=True) or {}
    identifier = payload.get("identifier", "").strip()

    if not identifier:
        return jsonify({"error": "Username or email is required."}), 400

    with connect_db() as connection:
        user = connection.execute(
            """
            SELECT id FROM users
            WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE
            """,
            (identifier, identifier),
        ).fetchone()

        if user is None:
            return jsonify({"error": "Account not found for this username/email."}), 404

        reset_code = generate_reset_code()
        expires_at = (datetime.now(UTC) + timedelta(minutes=15)).isoformat()

        # Keep only one active code per user.
        connection.execute(
            "UPDATE password_reset_tokens SET used = 1 WHERE user_id = ? AND used = 0",
            (user["id"],),
        )
        connection.execute(
            """
            INSERT INTO password_reset_tokens (user_id, reset_code, expires_at, used, created_at)
            VALUES (?, ?, ?, 0, ?)
            """,
            (user["id"], reset_code, expires_at, current_timestamp()),
        )

    return jsonify(
        {
            "ok": True,
            "message": "Reset code generated. It is valid for 15 minutes.",
            "resetCode": reset_code,
            "expiresInMinutes": 15,
        }
    )


@app.post("/api/auth/reset-password")
def reset_password():
    payload = request.get_json(force=True, silent=True) or {}
    identifier = payload.get("identifier", "").strip()
    reset_code = payload.get("resetCode", "").strip()
    new_password = payload.get("newPassword", "")

    if not identifier or not reset_code or not new_password:
        return jsonify({"error": "Identifier, reset code, and new password are required."}), 400
    if len(new_password) < 6:
        return jsonify({"error": "New password must be at least 6 characters."}), 400

    with connect_db() as connection:
        user = connection.execute(
            """
            SELECT id FROM users
            WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE
            """,
            (identifier, identifier),
        ).fetchone()
        if user is None:
            return jsonify({"error": "Account not found for this username/email."}), 404

        token = connection.execute(
            """
            SELECT id, expires_at, used
            FROM password_reset_tokens
            WHERE user_id = ? AND reset_code = ?
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (user["id"], reset_code),
        ).fetchone()

        if token is None or int(token["used"]) == 1:
            return jsonify({"error": "Invalid reset code."}), 400

        expiry = parse_timestamp(token["expires_at"])
        if expiry is None or expiry <= datetime.now(UTC):
            connection.execute("UPDATE password_reset_tokens SET used = 1 WHERE id = ?", (token["id"],))
            return jsonify({"error": "Reset code expired. Generate a new one."}), 400

        connection.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (generate_password_hash(new_password), user["id"]),
        )
        connection.execute("UPDATE password_reset_tokens SET used = 1 WHERE id = ?", (token["id"],))

    return jsonify({"ok": True, "message": "Password reset successful. Please log in."})


@app.get("/api/state")
@login_required
def api_state():
    user = fetch_current_user()
    if user is None:
        return jsonify({"error": "Login required."}), 401

    with connect_db() as connection:
        tasks = sort_tasks(fetch_user_tasks(connection, user["id"]))
        notes = sort_notes(fetch_user_notes(connection, user["id"]))

    return jsonify({"user": user, "tasks": tasks, "notes": notes, "reminders": build_reminders(tasks)})


@app.get("/api/reminders")
@login_required
def api_reminders():
    user = fetch_current_user()
    if user is None:
        return jsonify({"error": "Login required."}), 401

    with connect_db() as connection:
        tasks = sort_tasks(fetch_user_tasks(connection, user["id"]))

    return jsonify({"reminders": build_reminders(tasks)})


@app.post("/api/tasks")
@login_required
def create_task():
    user = fetch_current_user()
    if user is None:
        return jsonify({"error": "Login required."}), 401

    payload = request.get_json(force=True, silent=True) or {}
    title = payload.get("title", "").strip()
    course = payload.get("course", "").strip()
    due_date = payload.get("dueDate", "").strip()
    priority = payload.get("priority", "medium").strip()
    status = payload.get("status", "pending").strip()

    if not title:
        return jsonify({"error": "Task title is required."}), 400

    with connect_db() as connection:
        task_id = insert_task_record(
            connection,
            user["id"],
            {
                "title": title,
                "course": course,
                "due_date": due_date,
                "priority": priority,
                "status": status,
                "notes": payload.get("notes", ""),
                "link": payload.get("link", ""),
                "created_at": current_timestamp(),
            },
        )
        task = locate_task(connection, task_id, user["id"])

    return jsonify(task_row_to_dict(task)), 201


@app.put("/api/tasks/<int:task_id>")
@login_required
def update_task(task_id: int):
    user = fetch_current_user()
    if user is None:
        return jsonify({"error": "Login required."}), 401

    payload = request.get_json(force=True, silent=True) or {}
    with connect_db() as connection:
        task = locate_task(connection, task_id, user["id"])
        if task is None:
            return jsonify({"error": "Task not found."}), 404

        updated = {
            "title": task["title"],
            "course": task["course"] or "",
            "due_date": task["due_date"] or "",
            "priority": task["priority"],
            "status": task["status"],
            "notes": task["notes"] or "",
            "link": task["link"] or "",
        }

        field_map = {
            "title": "title",
            "course": "course",
            "dueDate": "due_date",
            "priority": "priority",
            "status": "status",
            "notes": "notes",
            "link": "link",
        }

        for payload_key, target_key in field_map.items():
            if payload_key in payload:
                value = payload.get(payload_key, "")
                updated[target_key] = value.strip() if isinstance(value, str) else value

        if not updated["title"].strip():
            return jsonify({"error": "Task title is required."}), 400

        connection.execute(
            """
            UPDATE tasks
            SET title = ?, course = ?, due_date = ?, priority = ?, status = ?, notes = ?, link = ?, updated_at = ?
            WHERE id = ? AND user_id = ?
            """,
            (
                updated["title"].strip(),
                updated["course"].strip(),
                updated["due_date"].strip(),
                updated["priority"].strip(),
                updated["status"].strip(),
                updated["notes"].strip(),
                updated["link"].strip(),
                current_timestamp(),
                task_id,
                user["id"],
            ),
        )
        updated_task = locate_task(connection, task_id, user["id"])

    return jsonify(task_row_to_dict(updated_task))


@app.delete("/api/tasks/<int:task_id>")
@login_required
def delete_task(task_id: int):
    user = fetch_current_user()
    if user is None:
        return jsonify({"error": "Login required."}), 401

    with connect_db() as connection:
        result = connection.execute(
            "DELETE FROM tasks WHERE id = ? AND user_id = ?",
            (task_id, user["id"]),
        )
        if result.rowcount == 0:
            return jsonify({"error": "Task not found."}), 404

    return jsonify({"ok": True})


@app.post("/api/notes")
@login_required
def create_note():
    user = fetch_current_user()
    if user is None:
        return jsonify({"error": "Login required."}), 401

    payload = request.get_json(force=True, silent=True) or {}
    title = payload.get("title", "").strip()
    content = payload.get("content", "").strip()
    subject = payload.get("subject", "").strip()

    if not title or not content:
        return jsonify({"error": "Note title and content are required."}), 400

    with connect_db() as connection:
        note_id = insert_note_record(
            connection,
            user["id"],
            {
                "title": title,
                "subject": subject,
                "content": content,
                "link": payload.get("link", ""),
                "pinned": bool(payload.get("pinned", False)),
                "created_at": current_timestamp(),
            },
        )
        note = locate_note(connection, note_id, user["id"])

    return jsonify(note_row_to_dict(note)), 201


@app.put("/api/notes/<int:note_id>")
@login_required
def update_note(note_id: int):
    user = fetch_current_user()
    if user is None:
        return jsonify({"error": "Login required."}), 401

    payload = request.get_json(force=True, silent=True) or {}
    with connect_db() as connection:
        note = locate_note(connection, note_id, user["id"])
        if note is None:
            return jsonify({"error": "Note not found."}), 404

        updated = {
            "title": note["title"],
            "subject": note["subject"] or "",
            "content": note["content"],
            "link": note["link"] or "",
            "pinned": bool(note["pinned"]),
        }

        field_map = {
            "title": "title",
            "subject": "subject",
            "content": "content",
            "link": "link",
            "pinned": "pinned",
        }

        for payload_key, target_key in field_map.items():
            if payload_key in payload:
                value = payload.get(payload_key, "")
                updated[target_key] = value.strip() if isinstance(value, str) else value

        if not updated["title"].strip() or not updated["content"].strip():
            return jsonify({"error": "Note title and content are required."}), 400

        connection.execute(
            """
            UPDATE notes
            SET title = ?, subject = ?, content = ?, link = ?, pinned = ?, updated_at = ?
            WHERE id = ? AND user_id = ?
            """,
            (
                updated["title"].strip(),
                updated["subject"].strip(),
                updated["content"].strip(),
                updated["link"].strip(),
                1 if updated["pinned"] else 0,
                current_timestamp(),
                note_id,
                user["id"],
            ),
        )
        updated_note = locate_note(connection, note_id, user["id"])

    return jsonify(note_row_to_dict(updated_note))


@app.delete("/api/notes/<int:note_id>")
@login_required
def delete_note(note_id: int):
    user = fetch_current_user()
    if user is None:
        return jsonify({"error": "Login required."}), 401

    with connect_db() as connection:
        result = connection.execute(
            "DELETE FROM notes WHERE id = ? AND user_id = ?",
            (note_id, user["id"]),
        )
        if result.rowcount == 0:
            return jsonify({"error": "Note not found."}), 404

    return jsonify({"ok": True})


init_db()


if __name__ == "__main__":
    app.run(debug=True)
