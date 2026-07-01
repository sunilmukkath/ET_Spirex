"""Markdown questionnaire documenter with explicit logic annotations."""

from __future__ import annotations

from app.models.et_survey import EtSurveyDefinition


def _logic_note(expr: str | None, prefix: str = "ROUTE") -> str:
    if not expr or not expr.strip():
        return ""
    return f" `[{prefix}: {expr.strip()}]`"


def questionnaire_spec_markdown(defn: EtSurveyDefinition, *, title: str = "Questionnaire") -> str:
    lines: list[str] = [f"# {title}", "", f"*Schema version {defn.version}*", ""]
    blocks = sorted(defn.blocks, key=lambda b: b.sort_order)

    for bi, block in enumerate(blocks, 1):
        lines.append(f"## {bi}. {block.title}")
        if block.description:
            lines.append(block.description)
        lines.append(_logic_note(block.relevance_equation, "PAGE"))
        lines.append("")

        for qi, q in enumerate(sorted(block.questions, key=lambda x: x.sort_order), 1):
            if q.type == "equation":
                lines.append(f"### {q.code} (equation — hidden)")
                lines.append(f"```\n{q.equation or ''}\n```")
                lines.append("")
                continue
            req = " *(required)*" if q.required else ""
            lines.append(f"### {qi}. {q.code}{req}")
            lines.append(q.text)
            if q.help_text:
                lines.append(f"> {q.help_text}")
            lines.append(_logic_note(q.relevance_equation, "SHOW IF"))
            lines.append(_logic_note(q.validation_equation, "VALIDATE"))
            if q.show_if:
                lines.append(
                    f" `[LEGACY SHOW IF: {q.show_if.question_id} {q.show_if.operator} {', '.join(q.show_if.values)}]`"
                )

            if q.options:
                lines.append("")
                for opt in sorted(q.options, key=lambda o: o.sort_order):
                    lines.append(f"- **{opt.code}** — {opt.label}")
            if q.rows:
                lines.append("")
                lines.append("**Rows:**")
                for row in sorted(q.rows, key=lambda r: r.sort_order):
                    lines.append(f"- {row.code}: {row.label}")
            lines.append("")

    if defn.quotas:
        lines.append("## Quotas")
        for quota in defn.quotas:
            lines.append(f"- **{quota.label or quota.id}** — target {quota.target}{_logic_note(quota.expression, 'QUOTA')}")
        lines.append("")

    return "\n".join(lines)
