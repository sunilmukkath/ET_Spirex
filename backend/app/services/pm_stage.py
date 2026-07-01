"""Normalize project stage labels from import sheets."""

from __future__ import annotations

import re

VALID_STAGES: tuple[str, ...] = (
    "Proposal",
    "Budgeting",
    "Vendor Setup",
    "Deployment Prep",
    "Fieldwork/Data Collection",
    "QC",
    "Analysis",
    "Reporting",
    "Close-out",
    "Delivered",
)

_STAGE_ALIASES: dict[str, str] = {
    "delivered": "Delivered",
    "complete": "Delivered",
    "completed": "Delivered",
    "closed": "Close-out",
    "closeout": "Close-out",
    "close": "Close-out",
    "fieldwork": "Fieldwork/Data Collection",
    "fieldworkdatacollection": "Fieldwork/Data Collection",
    "datacollection": "Fieldwork/Data Collection",
    "field": "Fieldwork/Data Collection",
    "fw": "Fieldwork/Data Collection",
    "qc": "QC",
    "quality": "QC",
    "analysis": "Analysis",
    "analysing": "Analysis",
    "reporting": "Reporting",
    "report": "Reporting",
    "proposal": "Proposal",
    "budgeting": "Budgeting",
    "budget": "Budgeting",
    "vendorsetup": "Vendor Setup",
    "vendor": "Vendor Setup",
    "deploymentprep": "Deployment Prep",
    "deployment": "Deployment Prep",
    "live": "Fieldwork/Data Collection",
}


def normalize_stage(raw: str | None, *, default: str = "Proposal") -> str:
    if not raw:
        return default
    text = str(raw).strip()
    if not text or text.lower() == "nan":
        return default
    if text in VALID_STAGES:
        return text
    norm = re.sub(r"[^a-z0-9]", "", text.lower())
    if norm in _STAGE_ALIASES:
        return _STAGE_ALIASES[norm]
    lower = text.lower()
    for stage in VALID_STAGES:
        if stage.lower() == lower:
            return stage
        if stage.lower() in lower or lower in stage.lower():
            return stage
    return default
