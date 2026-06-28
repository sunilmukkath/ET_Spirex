from __future__ import annotations

from typing import Any

# Fallback when LimeSurvey has no custom scale text (type 5 / array 5-point)
_LIKERT_5: list[tuple[str, str]] = [
    ("1", "Strongly disagree"),
    ("2", "Disagree"),
    ("3", "Neither agree nor disagree"),
    ("4", "Agree"),
    ("5", "Strongly agree"),
]

_LIKERT_10: list[tuple[str, str]] = [
    ("1", "1 — Not at all"),
    ("2", "2"),
    ("3", "3"),
    ("4", "4"),
    ("5", "5 — Neutral"),
    ("6", "6"),
    ("7", "7"),
    ("8", "8"),
    ("9", "9"),
    ("10", "10 — Extremely"),
]


def normalize_answer_code(value: str | int | float | None) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if not text or text.lower() in ("nan", "none", "null"):
        return ""
    if text.endswith(".0"):
        head = text[:-2]
        if head.lstrip("-").isdigit():
            return head
    try:
        num = float(text)
        if num == int(num):
            return str(int(num))
    except ValueError:
        pass
    return text


def builtin_scale_options(ls_type: str) -> list[tuple[str, str]]:
    if ls_type in ("5", "A"):
        return list(_LIKERT_5)
    if ls_type == "B":
        return list(_LIKERT_10)
    return []


def build_answer_maps(var: dict[str, Any]) -> tuple[dict[str, str], dict[str, str]]:
    """Return (code -> label, normalized lookup -> canonical code)."""
    code_to_label: dict[str, str] = {}
    lookup_to_code: dict[str, str] = {}

    def _register(code: str, label: str) -> None:
        canonical = normalize_answer_code(code)
        if not canonical:
            return
        clean_label = str(label or canonical).strip()
        code_to_label[canonical] = clean_label
        lookup_to_code[canonical] = canonical
        lookup_to_code[canonical.lower()] = canonical
        if clean_label:
            lookup_to_code[clean_label.lower()] = canonical
            lookup_to_code[normalize_answer_code(clean_label)] = canonical

    for opt in var.get("answer_options") or []:
        _register(str(opt.get("code", "")), str(opt.get("label") or opt.get("code") or ""))

    # Use readable scale labels when API only returned numeric labels
    ls_type = str(var.get("ls_type") or "")
    for code, fallback_label in builtin_scale_options(ls_type):
        canonical = normalize_answer_code(code)
        existing = code_to_label.get(canonical, "")
        if not existing or existing == canonical or existing.isdigit():
            _register(code, fallback_label)

    for sq in var.get("subquestions") or []:
        sq_code = str(sq.get("code") or "")
        sq_label = str(sq.get("label") or sq_code)
        canonical = normalize_answer_code(sq_code)
        if canonical and canonical not in code_to_label:
            code_to_label[canonical] = sq_label
            lookup_to_code[canonical] = canonical
            lookup_to_code[canonical.lower()] = canonical

    return code_to_label, lookup_to_code


def canonical_answer_code(var: dict[str, Any], raw_value: str | int | float | None) -> str:
    text = str(raw_value).strip() if raw_value is not None else ""
    if not text:
        return ""
    norm = normalize_answer_code(text)
    _, lookup_to_code = build_answer_maps(var)
    if norm in lookup_to_code:
        return lookup_to_code[norm]
    lower = text.lower()
    if lower in lookup_to_code:
        return lookup_to_code[lower]
    return norm


def label_for_answer(var: dict[str, Any], raw_value: str | int | float | None) -> str:
    text = str(raw_value).strip() if raw_value is not None else ""
    if not text or text.lower() in ("nan", "none"):
        return text

    code_to_label, lookup_to_code = build_answer_maps(var)
    canonical = canonical_answer_code(var, text)

    if canonical in code_to_label:
        label = code_to_label[canonical]
        if label and label != canonical:
            return label
        if label:
            return label

    # Raw export may already contain the answer text
    lower = text.lower()
    for code, label in code_to_label.items():
        if label.lower() == lower:
            return label

    if canonical in code_to_label:
        return code_to_label[canonical]

    return text
