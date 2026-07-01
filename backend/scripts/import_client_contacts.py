#!/usr/bin/env python3
"""Import bundled client contact sheet into Postgres (requires DATABASE_URL)."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.session import database_enabled, ensure_database_ready, session_scope
from app.services.pm_client_import import bootstrap_clients_from_master


def main() -> int:
    if not database_enabled():
        print("ERROR: Set DATABASE_URL in backend/.env", file=sys.stderr)
        return 1
    ensure_database_ready()
    with session_scope() as session:
        result = bootstrap_clients_from_master(session)
    if result is None:
        print("No import run (missing bundled client contact sheet).", file=sys.stderr)
        return 1
    print(
        f"Done: created={result.created} updated={result.updated} skipped={result.skipped} "
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
