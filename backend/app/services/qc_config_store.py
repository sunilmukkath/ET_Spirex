from __future__ import annotations

import json
from pathlib import Path

from app.models.qc_config import QcConfig, QcCustomRule, QcThresholds

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "qc_config"

ALL_CHECK_IDS = frozenset({
    "speeders",
    "test_responses",
    "duplicate_phones",
    "straight_liners",
    "gibberish",
    "interviewer_duplicates",
    "custom_rules",
})


def _path(survey_id: int) -> Path:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    return _DATA_DIR / f"{survey_id}.json"


def _normalize_thresholds(raw: dict | None) -> QcThresholds:
    if not raw:
        return QcThresholds()
    basis = str(raw.get("speeder_time_basis", "average") or "average").lower()
    if basis not in ("average", "median"):
        basis = "average"
    custom_raw = raw.get("speeder_custom_reference_seconds")
    custom_ref = None
    if custom_raw is not None and str(custom_raw).strip() != "":
        custom_val = float(custom_raw or 0)
        custom_ref = custom_val if custom_val > 0 else None
    return QcThresholds(
        speeder_time_basis=basis,  # type: ignore[arg-type]
        speeder_custom_reference_seconds=custom_ref,
        speeder_min_seconds=max(0.0, float(raw.get("speeder_min_seconds", 0) or 0)),
        speeder_median_fraction=min(1.0, max(0.05, float(raw.get("speeder_median_fraction", 0.25) or 0.25))),
        min_array_items_straight_line=max(2, int(raw.get("min_array_items_straight_line", 4) or 4)),
        min_text_length_gibberish=max(1, int(raw.get("min_text_length_gibberish", 3) or 3)),
        interviewer_duplicate_similarity_pct=min(
            100.0,
            max(50.0, float(raw.get("interviewer_duplicate_similarity_pct", 85) or 85)),
        ),
    )


def _normalize_custom_rules(raw: list | None) -> list[QcCustomRule]:
    if not raw:
        return []
    rules: list[QcCustomRule] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        variable_id = str(item.get("variable_id", "")).strip()
        if not variable_id:
            continue
        operator = str(item.get("operator", "in")).lower()
        if operator not in ("in", "not_in", "is_empty", "not_empty"):
            operator = "in"
        values = [str(v) for v in item.get("values", []) if str(v).strip()]
        rules.append(
            QcCustomRule(
                variable_id=variable_id,
                operator=operator,
                values=values,
                name=str(item.get("name", "")).strip(),
            )
        )
    return rules


def get_qc_config(survey_id: int) -> QcConfig:
    path = _path(survey_id)
    if not path.is_file():
        return QcConfig()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        disabled = [c for c in data.get("disabled_checks", []) if c in ALL_CHECK_IDS]
        kept = [str(x) for x in data.get("kept_response_ids", []) if str(x).strip()]
        excluded = [str(x) for x in data.get("excluded_response_ids", []) if str(x).strip()]
        raw_straight_ids = data.get("straight_line_variable_ids")
        if raw_straight_ids is None:
            straight_line_variable_ids = None
        else:
            straight_line_variable_ids = [
                str(x).strip() for x in raw_straight_ids if str(x).strip()
            ]
        return QcConfig(
            disabled_checks=disabled,
            kept_response_ids=kept,
            excluded_response_ids=excluded,
            thresholds=_normalize_thresholds(data.get("thresholds")),
            custom_rules=_normalize_custom_rules(data.get("custom_rules")),
            interviewer_variable_id=(str(data["interviewer_variable_id"]).strip() or None)
            if data.get("interviewer_variable_id")
            else None,
            straight_line_variable_ids=straight_line_variable_ids,
        )
    except (json.JSONDecodeError, OSError, ValueError):
        return QcConfig()


def set_qc_config(survey_id: int, config: QcConfig) -> QcConfig:
    disabled = [c for c in config.disabled_checks if c in ALL_CHECK_IDS]
    kept = [str(x) for x in config.kept_response_ids if str(x).strip()]
    excluded = [str(x) for x in config.excluded_response_ids if str(x).strip()]
    normalized = QcConfig(
        disabled_checks=disabled,
        kept_response_ids=kept,
        excluded_response_ids=excluded,
        thresholds=_normalize_thresholds(config.thresholds.model_dump()),
        custom_rules=_normalize_custom_rules([r.model_dump() for r in config.custom_rules]),
        interviewer_variable_id=(config.interviewer_variable_id or None),
        straight_line_variable_ids=(
            None
            if config.straight_line_variable_ids is None
            else [str(x).strip() for x in config.straight_line_variable_ids if str(x).strip()]
        ),
    )
    _path(survey_id).write_text(json.dumps(normalized.model_dump(), indent=2), encoding="utf-8")
    from app.services.qc_filter import invalidate_flagged_cache
    from app.services.data_quality import invalidate_quality_cache
    from app.services.response_store import invalidate_survey_cache

    invalidate_flagged_cache(survey_id)
    invalidate_quality_cache(survey_id)
    invalidate_survey_cache(survey_id)
    return normalized


def enabled_check_ids(survey_id: int) -> frozenset[str]:
    disabled = set(get_qc_config(survey_id).disabled_checks)
    return ALL_CHECK_IDS - disabled
