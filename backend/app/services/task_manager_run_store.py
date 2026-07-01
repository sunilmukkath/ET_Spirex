"""Persist task manager agent run history."""

from __future__ import annotations

import json
import time
from pathlib import Path

from app.models.task_manager import TaskManagerAgentResponse

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "agent_runs"
_LAST_RUN_PATH = _DATA_DIR / "task_manager.json"


def save_task_manager_run(result: TaskManagerAgentResponse) -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    _LAST_RUN_PATH.write_text(result.model_dump_json(indent=2), encoding="utf-8")


def get_last_task_manager_run() -> TaskManagerAgentResponse | None:
    if not _LAST_RUN_PATH.is_file():
        return None
    try:
        return TaskManagerAgentResponse.model_validate_json(_LAST_RUN_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def seconds_since_last_run() -> float | None:
    last = get_last_task_manager_run()
    if not last:
        return None
    return max(0.0, time.time() - last.ran_at)
