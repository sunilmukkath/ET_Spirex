#!/usr/bin/env python3
"""Generate elastic_tree_report.pptx template asset."""

from pathlib import Path

from app.services.report_template import TEMPLATE_PATH, build_template_bytes


def main() -> None:
    TEMPLATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    TEMPLATE_PATH.write_bytes(build_template_bytes())
    print(f"Wrote {TEMPLATE_PATH}")


if __name__ == "__main__":
    main()
