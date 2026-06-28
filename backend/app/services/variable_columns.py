from __future__ import annotations

from typing import Any

import pandas as pd


def find_variable_column(var: dict[str, Any], df: pd.DataFrame) -> str | None:
    code = var.get("code", "")
    for col in var.get("columns") or []:
        if col in df.columns:
            return col
    if code in df.columns:
        return code
    for c in df.columns:
        if c == code or c.startswith(f"{code}_") or (code and c.startswith(code)):
            return c
    return None
