from __future__ import annotations

import hashlib
import json
import threading
import time
from typing import Any

import pandas as pd

from app.services.custom_variables import apply_custom_variables
from app.services.question_schema import build_survey_schema
from app.services.response_store import get_responses

_CONTEXT_CACHE: dict[tuple[int, str], tuple[float, dict[str, Any], pd.DataFrame]] = {}
_FILTER_CACHE: dict[tuple[int, str, str], tuple[float, pd.DataFrame]] = {}
_CONTEXT_TTL = 120
_FILTER_TTL = 60
_META_LOCK = threading.Lock()
_KEY_LOCKS: dict[tuple[int, str], threading.Lock] = {}


def _context_key(survey_id: int, completion_status: str) -> tuple[int, str]:
    return (survey_id, completion_status)


def _key_lock(key: tuple[int, str]) -> threading.Lock:
    with _META_LOCK:
        if key not in _KEY_LOCKS:
            _KEY_LOCKS[key] = threading.Lock()
        return _KEY_LOCKS[key]


def _filters_digest(filters: list[dict[str, Any]] | None) -> str:
    if not filters:
        return ""
    normalized = sorted(
        (
            f.get("variable_id", ""),
            tuple(sorted(str(v) for v in (f.get("values") or []) if str(v).strip())),
        )
        for f in filters
    )
    payload = json.dumps(normalized, sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()[:24]


def _filter_tree_digest(tree: dict[str, Any] | None) -> str:
    if not tree:
        return ""
    payload = json.dumps(tree, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode()).hexdigest()[:24]


def invalidate_analysis_context(survey_id: int | None = None) -> None:
    with _META_LOCK:
        if survey_id is None:
            _CONTEXT_CACHE.clear()
            _FILTER_CACHE.clear()
            return
        ctx_keys = [k for k in _CONTEXT_CACHE if k[0] == survey_id]
        for key in ctx_keys:
            del _CONTEXT_CACHE[key]
        filter_keys = [k for k in _FILTER_CACHE if k[0] == survey_id]
        for key in filter_keys:
            del _FILTER_CACHE[key]


def load_analysis_context(
    survey_id: int,
    *,
    completion_status: str = "complete",
) -> tuple[dict[str, Any], pd.DataFrame]:
    """Load schema + response dataframe with custom variables applied (cached)."""
    key = _context_key(survey_id, completion_status)
    now = time.time()

    cached = _CONTEXT_CACHE.get(key)
    if cached and now - cached[0] < _CONTEXT_TTL:
        return cached[1], cached[2]

    lock = _key_lock(key)
    with lock:
        cached = _CONTEXT_CACHE.get(key)
        if cached and now - cached[0] < _CONTEXT_TTL:
            return cached[1], cached[2]

        schema = build_survey_schema(survey_id, completion_status=completion_status)
        df = get_responses(survey_id, completion_status=completion_status).dataframe
        schema, df = apply_custom_variables(survey_id, schema, df)
        from app.services.variable_kind_overrides import apply_kind_overrides
        from app.services.weighting import attach_weights

        schema = apply_kind_overrides(survey_id, schema, df)
        df = attach_weights(survey_id, schema, df)
        _CONTEXT_CACHE[key] = (time.time(), schema, df)
        return schema, df


def load_filtered_context(
    survey_id: int,
    *,
    completion_status: str = "complete",
    filters: list[dict[str, Any]] | None = None,
    filter_tree: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], pd.DataFrame]:
    """Load analysis context and apply filters (filtered result cached)."""
    from app.services.filter_engine import apply_filter_tree, legacy_filters_to_tree

    schema, df = load_analysis_context(survey_id, completion_status=completion_status)
    tree = filter_tree or legacy_filters_to_tree(filters)
    if not tree or not tree.get("children"):
        return schema, df

    digest = _filter_tree_digest(tree)
    cache_key = (survey_id, completion_status, digest)
    now = time.time()
    hit = _FILTER_CACHE.get(cache_key)
    if hit and now - hit[0] < _FILTER_TTL:
        return schema, hit[1]

    filtered = apply_filter_tree(df, schema, tree)
    _FILTER_CACHE[cache_key] = (time.time(), filtered)
    return schema, filtered


def warmup_analysis_context(
    survey_id: int,
    *,
    completion_status: str = "complete",
) -> None:
    """Preload full schema, responses, and analysis context for faster first analysis."""
    build_survey_schema(survey_id, completion_status=completion_status, light=False)
    load_analysis_context(survey_id, completion_status=completion_status)
