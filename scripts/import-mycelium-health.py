#!/usr/bin/env python3
"""One-time import of Mycelium's habits and sleep tables into Auxin's health.sqlite.

    python3 scripts/import-mycelium-health.py SOURCE.db TARGET.sqlite [--into-empty]

SOURCE is opened read-only (run it against a COPY of oneash-DB.db anyway).
TARGET must not exist; it is built as TARGET.partial and only renamed into
place after every check passes, so a failed run leaves nothing behind.

--into-empty fills a TARGET that already exists (the app creates an empty
health.sqlite on first launch, even while it is running). It refuses unless all
four tables are empty, copies in one transaction, and rolls back if any check fails.

Copied: habits, habit_logs, sleep_entries, sleep_targets (ids kept). Left out on
purpose: the v1 habit columns (type, times_per_week) and habits.source, and the
journal, which the habit grid reads but lives in its own, unmigrated plugin.
Sleep times are local wall-clock text in Mycelium and stay that way.
"""
import argparse
import re
import sqlite3
import sys
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path

MIGRATION = Path(__file__).resolve().parent.parent / "src/db/migrations/health/0001_init.sql"
UTC_SQL = re.compile(r"^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$")
LOCAL_DATETIME = re.compile(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$")
LOCAL_DATE = re.compile(r"^\d{4}-\d\d-\d\d$")
CLOCK = re.compile(r"^[0-2]\d:[0-5]\d$")
DEFAULT_HABIT_COLOR = "#4a8c6e"
NEXT_DAY_BEFORE_HOUR = 14  # a bedtime earlier than this is after midnight

stats = Counter()


def utc_iso(value):
    """Mycelium writes datetime('now') as 'YYYY-MM-DD HH:MM:SS' (UTC); normalise to ISO Z."""
    if value is None:
        return None
    if UTC_SQL.match(value):
        stats["timestamps 'YYYY-MM-DD HH:MM:SS' -> ISO Z"] += 1
        return value.replace(" ", "T") + ".000Z"
    if value.endswith("Z"):
        return value
    raise ValueError(f"unrecognised timestamp: {value!r}")


def text_or(default):
    return lambda value: value if value is not None else default


def number_or_none(value):
    return None if value is None else float(value)


def local_date(value):
    if not LOCAL_DATE.match(value):
        raise ValueError(f"unrecognised date: {value!r}")
    return value


def local_datetime(value):
    if not LOCAL_DATETIME.match(value):
        raise ValueError(f"unrecognised local datetime: {value!r}")
    return value


def clock(value):
    if not CLOCK.match(value):
        raise ValueError(f"unrecognised HH:MM: {value!r}")
    return value


# (table, columns, per-column transforms) in foreign-key order.
TABLES = [
    ("habits", ["id", "name", "color", "value_type", "goal_type", "goal_value", "sort_order", "created_at", "archived_at"],
     {"color": text_or(DEFAULT_HABIT_COLOR), "goal_value": number_or_none, "sort_order": lambda v: int(v or 0),
      "created_at": utc_iso, "archived_at": utc_iso}),
    ("habit_logs", ["id", "habit_id", "date", "value", "created_at"],
     {"date": local_date, "value": number_or_none, "created_at": utc_iso}),
    ("sleep_entries", ["id", "date", "sleep_start", "wake_time", "is_nap", "notes", "created_at"],
     {"date": local_date, "sleep_start": local_datetime, "wake_time": local_datetime, "is_nap": lambda v: int(v or 0),
      "notes": text_or(""), "created_at": utc_iso}),
    ("sleep_targets", ["id", "target_sleep_start", "target_duration", "set_at"],
     {"target_sleep_start": clock, "target_duration": float, "set_at": utc_iso}),
]


def copy_table(src, dst, table, columns, transforms):
    rows = src.execute(f"SELECT {', '.join(columns)} FROM {table} ORDER BY rowid").fetchall()
    marks = ", ".join("?" for _ in columns)
    for row in rows:
        values = [transforms.get(column, lambda v: v)(row[column]) for column in columns]
        dst.execute(f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({marks})", values)
    return len(rows)


def bedtime_date(sleep_start):
    """The evening a night began: a bedtime before 14:00 belongs to the previous calendar day."""
    start = datetime.strptime(sleep_start, "%Y-%m-%dT%H:%M:%S")
    return (start - timedelta(days=1) if start.hour < NEXT_DAY_BEFORE_HOUR else start).date().isoformat()


def verify(src, dst, counts):
    problems = []
    for table, (_, copied) in counts.items():
        actual = dst.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        if actual != copied:
            problems.append(f"{table}: copied {copied} but target has {actual}")
    if dst.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
        problems.append("integrity_check failed")
    violations = dst.execute("PRAGMA foreign_key_check").fetchall()
    if violations:
        problems.append(f"{len(violations)} foreign key violations, first: {tuple(violations[0])}")
    backwards = dst.execute("SELECT COUNT(*) FROM sleep_entries WHERE wake_time <= sleep_start").fetchone()[0]
    if backwards:
        problems.append(f"{backwards} sleep entries wake at or before bedtime")
    duplicates = dst.execute(
        "SELECT COUNT(*) FROM (SELECT date FROM sleep_entries WHERE is_nap = 0 GROUP BY date HAVING COUNT(*) > 1)"
    ).fetchone()[0]
    if duplicates:
        problems.append(f"{duplicates} dates have more than one main sleep entry")
    source_logs = {(r[0], r[1]): r[2] for r in src.execute("SELECT habit_id, date, value FROM habit_logs")}
    target_logs = {(r[0], r[1]): r[2] for r in dst.execute("SELECT habit_id, date, value FROM habit_logs")}
    if source_logs != target_logs:
        problems.append("habit_logs differ from source")
    return problems


def import_into_empty(args):
    if not args.target.exists():
        sys.exit(f"{args.target} does not exist; run without --into-empty to create it")
    src = sqlite3.connect(f"file:{args.source}?mode=ro", uri=True)
    src.row_factory = sqlite3.Row
    dst = sqlite3.connect(args.target, timeout=30, isolation_level=None)
    dst.execute("PRAGMA foreign_keys=ON")
    dst.execute("BEGIN IMMEDIATE")  # takes the write lock first, so the emptiness check can't go stale
    try:
        for table, _, _ in TABLES:
            rows = dst.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            if rows:
                raise SystemExit(f"refusing: {table} already has {rows} row(s) in {args.target}")
        counts = {}
        for table, columns, transforms in TABLES:
            source_rows = src.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            counts[table] = (source_rows, copy_table(src, dst, table, columns, transforms))
        problems = verify(src, dst, counts)
        if problems:
            raise SystemExit("VERIFICATION FAILED (nothing was written):\n  " + "\n  ".join(problems))
        dst.execute("COMMIT")
    except BaseException:
        if dst.in_transaction:
            dst.execute("ROLLBACK")
        raise
    finally:
        dst.close()
    print_report(counts)
    print(f"ok -> filled {args.target}")


def print_report(counts):
    print(f"{'table':<16}{'source':>8}{'copied':>8}")
    for table, (source_rows, copied) in counts.items():
        print(f"{table:<16}{source_rows:>8}{copied:>8}")
    for label, count in sorted(stats.items()):
        print(f"  {label}: {count}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", type=Path)
    parser.add_argument("target", type=Path)
    parser.add_argument("--into-empty", action="store_true", help="fill an existing, empty TARGET in one transaction")
    args = parser.parse_args()

    if args.into_empty:
        return import_into_empty(args)
    if args.target.exists():
        sys.exit(f"refusing to overwrite {args.target}")
    partial = args.target.with_name(args.target.name + ".partial")
    if partial.exists():
        sys.exit(f"{partial} exists from an earlier run; delete it first")

    src = sqlite3.connect(f"file:{args.source}?mode=ro", uri=True)
    src.row_factory = sqlite3.Row
    dst = sqlite3.connect(partial)
    try:
        dst.executescript(MIGRATION.read_text())
        dst.execute("PRAGMA foreign_keys=ON")
        counts = {}
        with dst:
            for table, columns, transforms in TABLES:
                source_rows = src.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                counts[table] = (source_rows, copy_table(src, dst, table, columns, transforms))
        problems = verify(src, dst, counts)
        mismatched = [
            row["id"] for row in src.execute("SELECT id, date, sleep_start FROM sleep_entries WHERE is_nap = 0")
            if bedtime_date(row["sleep_start"]) != row["date"]
        ]
    except Exception:
        dst.close()
        partial.unlink(missing_ok=True)
        raise
    dst.close()

    print_report(counts)
    if mismatched:
        print(f"  warning: {len(mismatched)} sleep entries whose date is not their bedtime's evening (kept as-is): {mismatched[:10]}")

    if problems:
        partial.unlink(missing_ok=True)
        sys.exit("VERIFICATION FAILED:\n  " + "\n  ".join(problems))
    partial.rename(args.target)
    print(f"ok -> {args.target}")


if __name__ == "__main__":
    main()
