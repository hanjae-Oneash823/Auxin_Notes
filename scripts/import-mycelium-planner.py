#!/usr/bin/env python3
"""One-time import of Mycelium's planner tables into Auxin's planner.sqlite.

    python3 scripts/import-mycelium-planner.py SOURCE.db TARGET.sqlite --tz Asia/Seoul

SOURCE is opened read-only (run it against a COPY of oneash-DB.db anyway).
TARGET must not exist; it is built as TARGET.partial and only renamed into
place after every check passes, so a failed run leaves nothing behind.

Only planner tables are copied (see build_tables). Sleep, habits, journal, notes,
wardrobe, filmneg, pkm, academic and dispatch tables are deliberately left out.
"""
import argparse
import json
import re
import sqlite3
import sys
from collections import Counter
from datetime import datetime, time, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

MIGRATION = Path(__file__).resolve().parent.parent / "src/db/migrations/planner/0001_init.sql"
UTC_SQL = re.compile(r"^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$")
UTC_MIDNIGHT_SUFFIX = "T00:00:00.000Z"
CLOCK = re.compile(r"^\d\d:\d\d$")
DEFAULT_ARC_COLOR = "#00c4a7"
DEFAULT_GROUP_COLOR = "#64c8ff"

stats = Counter()


def utc_iso(value):
    """Mycelium mixes 'YYYY-MM-DD HH:MM:SS' (CURRENT_TIMESTAMP, UTC) with ISO 'Z'; normalise to ISO Z."""
    if value is None:
        return None
    if UTC_SQL.match(value):
        return value.replace(" ", "T") + ".000Z"
    if value.endswith("Z"):
        return value
    raise ValueError(f"unrecognised timestamp: {value!r}")


def make_planned_start(tz):
    """planned_start_at is local wall-clock text in three shapes (date, local datetime, UTC ISO)."""
    def convert(value):
        if value is None:
            return None
        if not value.endswith("Z") and len(value) in (10, 19):
            stats["planned_start_at kept as-is"] += 1
            return value
        if value.endswith(UTC_MIDNIGHT_SUFFIX):
            # new Date('YYYY-MM-DD') parses as UTC midnight: a date-only pick, so keep the date.
            stats["planned_start_at UTC midnight -> date only"] += 1
            return value[:10]
        if value.endswith("Z"):
            utc = datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)
            local = utc.astimezone(tz)
            if local.time() == time(0, 0):
                stats["planned_start_at local midnight -> date only"] += 1
                return local.date().isoformat()
            stats["planned_start_at UTC -> local datetime"] += 1
            return local.strftime("%Y-%m-%dT%H:%M:%S")
        raise ValueError(f"unrecognised planned_start_at: {value!r}")
    return convert


def clock_time(value):
    """Rule start times are stored as 'HHMM' or 'HH:MM'."""
    if value is None:
        return None
    if re.fullmatch(r"\d{4}", value):
        stats["routine_rules.start_time HHMM -> HH:MM"] += 1
        return f"{value[:2]}:{value[2:]}"
    if CLOCK.match(value):
        return value
    raise ValueError(f"unrecognised start_time: {value!r}")


def json_text(value):
    """days / exceptions are JSON arrays kept as text; refuse anything that does not parse."""
    if value is not None:
        json.loads(value)
    return value


def flag(value):
    return int(value or 0)


def text_or(default):
    return lambda value: value if value is not None else default


def build_tables(tz):
    planned = make_planned_start(tz)
    ts = utc_iso
    # (table, columns, per-column transforms) in foreign-key order.
    return [
        ("arcs", ["id", "name", "color_hex", "description", "status", "created_at"],
         {"color_hex": text_or(DEFAULT_ARC_COLOR), "description": text_or(""), "created_at": ts}),
        ("projects", ["id", "arc_id", "name", "description", "status", "start_date", "end_date", "created_at"],
         {"description": text_or(""), "created_at": ts}),
        ("planner_groups", ["id", "name", "color_hex", "sort_order", "is_ungrouped", "created_at"],
         {"color_hex": text_or(DEFAULT_GROUP_COLOR), "sort_order": flag, "is_ungrouped": flag, "created_at": ts}),
        ("routines", ["id", "title", "node_type", "arc_id", "project_id", "importance_level", "created_at", "updated_at"],
         {"created_at": ts, "updated_at": ts}),
        ("nodes", ["id", "project_id", "arc_id", "title", "node_type", "planned_start_at", "due_at", "actual_completed_at",
                   "estimated_duration_minutes", "importance_level", "is_completed", "is_locked", "is_pinned",
                   "is_frog_pinned", "is_routine", "routine_id", "created_at", "updated_at"],
         {"planned_start_at": planned, "actual_completed_at": ts, "is_completed": flag, "is_locked": flag,
          "is_pinned": flag, "is_frog_pinned": flag, "is_routine": flag, "created_at": ts, "updated_at": ts}),
        ("node_groups", ["node_id", "group_id"], {}),
        ("routine_rules", ["id", "routine_id", "sort_order", "freq", "repeat_interval", "days", "start_date", "end_mode",
                           "end_count", "end_date", "start_time", "duration_minutes", "exceptions"],
         {"sort_order": flag, "days": json_text, "start_time": clock_time, "exceptions": json_text}),
        ("routine_groups", ["routine_id", "group_id"], {}),
        ("sub_tasks", ["id", "node_id", "title", "is_completed", "sort_order", "created_at"],
         {"is_completed": flag, "sort_order": flag, "created_at": ts}),
        ("tendril_edges", ["id", "project_id", "source_id", "target_id", "created_at"], {"created_at": ts}),
        ("work_locations", ["id", "name", "created_at"], {"created_at": ts}),
        ("work_sessions", ["id", "title", "location_id", "planned_date", "actual_start", "actual_end", "status", "created_at"],
         {"actual_start": ts, "actual_end": ts, "created_at": ts}),
        ("session_nodes", ["session_id", "node_id", "sort_order", "status", "time_started", "time_finished", "total_minutes"],
         {"sort_order": flag, "time_started": ts, "time_finished": ts}),
        ("session_pauses", ["id", "session_id", "paused_at", "resumed_at", "pause_type"],
         {"paused_at": ts, "resumed_at": ts}),
        ("productivity_logs", ["id", "node_id", "completed_at", "duration_actual"], {"completed_at": ts}),
        ("user_capacity", ["id", "daily_minutes", "peak_start", "peak_end", "updated_at"], {"updated_at": ts}),
    ]


def copy_table(src, dst, table, columns, transforms, skipped):
    rows = src.execute(f"SELECT {', '.join(columns)} FROM {table}").fetchall()
    kept = []
    for row in rows:
        # Mycelium has no FK on session_nodes.node_id, so a deleted node can leave a dangling row.
        if table == "session_nodes" and row["node_id"] not in skipped["node_ids"]:
            skipped["session_nodes"].append(row["node_id"])
            continue
        kept.append(tuple(transforms.get(col, lambda v: v)(row[col]) for col in columns))
    placeholders = ", ".join("?" for _ in columns)
    dst.executemany(f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({placeholders})", kept)
    return len(rows), len(kept)


def group_sets(db, table, owner):
    sets = {}
    for row in db.execute(f"SELECT {owner}, group_id FROM {table}"):
        sets.setdefault(row[0], set()).add(row[1])
    return sets


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
    if dst.execute("SELECT COUNT(*) FROM nodes WHERE planned_start_at LIKE '%Z'").fetchone()[0]:
        problems.append("planned_start_at still holds UTC values")
    bad_times = dst.execute(
        "SELECT COUNT(*) FROM routine_rules WHERE start_time IS NOT NULL AND start_time NOT GLOB '[0-2][0-9]:[0-5][0-9]'"
    ).fetchone()[0]
    if bad_times:
        problems.append(f"{bad_times} routine_rules.start_time values are not HH:MM")
    for table, owner in (("node_groups", "node_id"), ("routine_groups", "routine_id")):
        if group_sets(src, table, owner) != group_sets(dst, table, owner):
            problems.append(f"{table} differs from source")
    return problems


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", type=Path)
    parser.add_argument("target", type=Path)
    parser.add_argument("--tz", required=True, help="IANA timezone the planner was used in, e.g. Asia/Seoul")
    args = parser.parse_args()

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
        skipped = {"node_ids": {r[0] for r in src.execute("SELECT id FROM nodes")}, "session_nodes": []}
        counts = {}
        with dst:
            for table, columns, transforms in build_tables(ZoneInfo(args.tz)):
                counts[table] = copy_table(src, dst, table, columns, transforms, skipped)
        problems = verify(src, dst, counts)
    except Exception:
        dst.close()
        partial.unlink(missing_ok=True)
        raise
    dst.close()

    print(f"{'table':<20}{'source':>8}{'copied':>8}")
    for table, (source_rows, copied) in counts.items():
        print(f"{table:<20}{source_rows:>8}{copied:>8}")
    for label, count in sorted(stats.items()):
        print(f"  {label}: {count}")
    if skipped["session_nodes"]:
        print(f"  skipped {len(skipped['session_nodes'])} session_nodes row(s) pointing at deleted nodes: {skipped['session_nodes']}")

    if problems:
        partial.unlink(missing_ok=True)
        sys.exit("VERIFICATION FAILED:\n  " + "\n  ".join(problems))
    partial.rename(args.target)
    print(f"ok -> {args.target}")


if __name__ == "__main__":
    main()
