from __future__ import annotations

import json
from pathlib import Path

from app.models.quota_config import QuotaConfig

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "quota_config"


def _path(survey_id: int) -> Path:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    return _DATA_DIR / f"{survey_id}.json"


def get_quota_config(survey_id: int) -> QuotaConfig:
    path = _path(survey_id)
    if not path.is_file():
        return QuotaConfig()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return QuotaConfig.model_validate(data)
    except (json.JSONDecodeError, OSError, ValueError):
        return QuotaConfig()


def set_quota_config(survey_id: int, config: QuotaConfig) -> QuotaConfig:
    basis = config.basis if config.basis in ("complete", "qc_approved") else "complete"
    normalized = QuotaConfig(
        basis=basis,
        tolerance_count=max(0, int(config.tolerance_count)),
        tolerance_pct=max(0.0, float(config.tolerance_pct)),
        fields=config.fields,
        layers=config.layers,
    )
    _path(survey_id).write_text(json.dumps(normalized.model_dump(), indent=2), encoding="utf-8")
    return normalized
