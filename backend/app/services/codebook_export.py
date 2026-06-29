from __future__ import annotations

import csv
import io
from typing import Any

from app.services.analysis_context import load_analysis_context
from app.services.question_schema import get_variable


def build_codebook_csv(survey_id: int, completion_status: str = "complete") -> str:
    schema, _df = load_analysis_context(survey_id, completion_status=completion_status)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["variable_id", "code", "question_text", "kind", "type_label", "answer_code", "answer_label"])

    for var in schema.get("variables") or []:
        vid = str(var.get("id") or "")
        code = str(var.get("code") or "")
        text = str(var.get("text") or "")
        kind = str(var.get("kind") or "")
        type_label = str(var.get("type_label") or "")
        options = var.get("answer_options") or []
        if options:
            for opt in options:
                writer.writerow([
                    vid,
                    code,
                    text,
                    kind,
                    type_label,
                    str(opt.get("code") or ""),
                    str(opt.get("label") or opt.get("code") or ""),
                ])
        else:
            writer.writerow([vid, code, text, kind, type_label, "", ""])

    return buf.getvalue()
