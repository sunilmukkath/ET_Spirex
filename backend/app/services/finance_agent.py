"""Finance agent — budget review, invoicing prompts, margin alerts."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.models.pm import AgentBriefResponse, FinanceSummary
from app.services.ai_narrative import ai_status, complete_custom
from app.services.pm_ops_store import finance_summary

FINANCE_SYSTEM = """You are Elastic Tree's finance operations agent for market research projects.
Rules:
- Use ONLY figures in the JSON context. Never invent amounts.
- British English, concise bullet actions.
- Return plain text sections: SUMMARY (2-3 sentences), ACTIONS (bullets starting with •), RISKS (bullets starting with ⚠).
- Focus on budget vs actual, invoicing gaps, and margin."""


def run_finance_agent(session: Session, project_id) -> AgentBriefResponse:
    summary_data = finance_summary(session, project_id)
    if not summary_data:
        return AgentBriefResponse(
            agent="finance",
            configured=False,
            summary="Project not found.",
            actions=[],
            risks=[],
        )

    status = ai_status()
    ctx = _finance_context(summary_data)
    if status.get("configured"):
        text = complete_custom(
            f"Review this project finance snapshot:\n\n```json\n{json.dumps(ctx, default=str, indent=2)}\n```",
            system=FINANCE_SYSTEM,
            max_tokens=600,
        )
        if text:
            return _parse_agent_text("finance", True, text)

    return _heuristic_finance(summary_data)


def _finance_context(data: FinanceSummary) -> dict[str, Any]:
    return {
        "project_name": data.project_name,
        "budget_estimate": float(data.budget_estimate) if data.budget_estimate else None,
        "budget_actual": float(data.budget_actual) if data.budget_actual else None,
        "total_estimated_lines": float(data.total_estimated_lines) if data.total_estimated_lines else None,
        "total_actual_lines": float(data.total_actual_lines) if data.total_actual_lines else None,
        "total_invoiced": float(data.total_invoiced) if data.total_invoiced else None,
        "total_paid": float(data.total_paid) if data.total_paid else None,
        "total_outstanding": float(data.total_outstanding) if data.total_outstanding else None,
        "margin_pct": data.margin_pct,
        "invoice_count": len(data.invoices),
        "pending_invoices": sum(1 for i in data.invoices if i.paid_status != "paid"),
    }


def _heuristic_finance(data: FinanceSummary) -> AgentBriefResponse:
    actions: list[str] = []
    risks: list[str] = []
    est = float(data.budget_estimate or 0)
    act = float(data.budget_actual or 0)
    outstanding = float(data.total_outstanding or 0)

    if est and act and act > est * 1.1:
        risks.append(f"Actual spend ({act:,.0f}) exceeds estimate ({est:,.0f}) by more than 10%.")
    if data.invoices and outstanding > 0:
        actions.append(f"Chase {outstanding:,.0f} outstanding across pending invoices.")
    if not data.invoices and est > 0:
        actions.append("No invoices logged yet — create first milestone invoice from approved proposal.")
    if not data.budget_lines:
        actions.append("Add budget line items (field, recruitment, analysis, PM) for tracking.")
    if data.margin_pct is not None and data.margin_pct < 15:
        risks.append(f"Margin at {data.margin_pct:.1f}% — review vendor rates and scope.")

    summary = f"{data.project_name}: budget estimate {est:,.0f}, actual {act:,.0f}."
    if not actions and not risks:
        summary += " Finance records look balanced."

    return AgentBriefResponse(
        agent="finance",
        configured=bool(ai_status().get("configured")),
        summary=summary,
        actions=actions,
        risks=risks,
    )


def _parse_agent_text(agent: str, configured: bool, text: str) -> AgentBriefResponse:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    summary_parts: list[str] = []
    actions: list[str] = []
    risks: list[str] = []
    mode = "summary"
    for ln in lines:
        upper = ln.upper()
        if upper.startswith("ACTIONS"):
            mode = "actions"
            continue
        if upper.startswith("RISKS"):
            mode = "risks"
            continue
        if upper.startswith("SUMMARY"):
            mode = "summary"
            continue
        if ln.startswith("•"):
            actions.append(ln.lstrip("• ").strip())
        elif ln.startswith("⚠"):
            risks.append(ln.lstrip("⚠ ").strip())
        elif mode == "summary":
            summary_parts.append(ln)
        elif mode == "actions":
            actions.append(ln.lstrip("-• ").strip())
        elif mode == "risks":
            risks.append(ln.lstrip("-⚠• ").strip())
    return AgentBriefResponse(
        agent=agent,
        configured=configured,
        summary=" ".join(summary_parts) or text[:400],
        actions=actions,
        risks=risks,
    )
