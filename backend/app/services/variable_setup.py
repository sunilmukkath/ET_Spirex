from __future__ import annotations

from typing import Any

from app.models.variable_setup import VariableSetupEntry
from app.services.question_types import get_type_info

METRICS_BY_KIND: dict[str, list[str]] = {
    "single": ["distribution"],
    "numeric": ["mean", "top2box", "bottom2box"],
    "multi": ["checkbox_rate"],
    "array": ["distribution", "mean", "top2box", "bottom2box"],
    "rank": ["rank_avg"],
    "text": [],
    "date": [],
    "location": [],
    "unknown": ["distribution"],
}

CAN_BANNER_BY_KIND: dict[str, bool] = {
    "single": True,
    "numeric": True,
    "multi": True,
    "array": True,
    "rank": True,
    "text": False,
    "date": False,
    "location": False,
    "unknown": True,
}


def apply_setup_to_variable_dict(
    var: dict[str, Any],
    entry: VariableSetupEntry | None,
) -> dict[str, Any]:
    if not entry:
        return var

    out = dict(var)
    default_kind = var.get("kind")
    out["default_kind"] = default_kind

    if entry.kind_override:
        kind = entry.kind_override
        out["kind"] = kind
        out["kind_override"] = kind
        out["metrics"] = list(METRICS_BY_KIND.get(kind, ["distribution"]))
        out["can_banner"] = CAN_BANNER_BY_KIND.get(kind, True)
        if entry.value_weights:
            metrics = list(out["metrics"])
            if "mean" not in metrics and kind in ("single", "array"):
                metrics.append("mean")
            if "top2box" not in metrics and kind in ("single", "numeric", "array"):
                metrics.extend(["top2box", "bottom2box"])
            out["metrics"] = list(dict.fromkeys(metrics))

    if entry.value_weights:
        out["value_weights"] = {str(k): float(v) for k, v in entry.value_weights.items()}
        metrics = list(out.get("metrics") or [])
        for metric in ("mean", "top2box", "bottom2box"):
            if metric not in metrics:
                metrics.append(metric)
        out["metrics"] = list(dict.fromkeys(metrics))

    return out


def default_value_weights(var: dict[str, Any]) -> dict[str, float]:
    weights: dict[str, float] = {}
    for opt in var.get("answer_options") or []:
        code = str(opt.get("code") or "").strip()
        if not code:
            continue
        if code.replace(".", "", 1).isdigit():
            weights[code] = float(code)
        elif code.isalpha() and len(code) == 1:
            weights[code] = float(ord(code.upper()) - ord("A") + 1)
    if weights:
        return weights

    info = get_type_info(str(var.get("ls_type") or ""))
    if info.kind == "single" and var.get("answer_options"):
        for i, opt in enumerate(var["answer_options"], start=1):
            code = str(opt.get("code") or "").strip()
            if code:
                weights[code] = float(i)
    return weights
