#!/usr/bin/env python3
"""Import bundled Project sheet into Postgres (requires DATABASE_URL)."""

from __future__ import annotations

import sys
from pathlib import Path

# Allow running from repo root or backend/
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.session import database_enabled, ensure_database_ready, session_scope
from app.services.pm_bootstrap import bootstrap_projects_from_master


def main() -> int:
    if not database_enabled():
        print("ERROR: Set DATABASE_URL in backend/.env", file=sys.stderr)
        return 1
    ensure_database_ready()
    force = "--force" in sys.argv
    with session_scope() as session:
        result = bootstrap_projects_from_master(session, only_if_empty=not force)
    if result is None:
        print("No import run (empty DB required unless --force, or missing master sheet).")
        return 0
    print(
        f"Done: created={result.created} skipped={result.skipped} "
        f"errors={result.errors} total={result.total_rows}"
    )
    if result.errors:
        for row in result.rows:
            if row.status == "error":
                print(f"  row {row.row_number}: {row.project_name} — {row.message}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
