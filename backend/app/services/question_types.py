from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

AnalysisKind = Literal[
    "single",
    "multi",
    "array",
    "numeric",
    "text",
    "rank",
    "date",
    "location",
    "display",
    "unknown",
]

MetricKind = Literal[
    "distribution",
    "mean",
    "top2box",
    "bottom2box",
    "net_score",
    "checkbox_rate",
    "rank_avg",
]


@dataclass(frozen=True)
class QuestionTypeInfo:
    ls_type: str
    kind: AnalysisKind
    label: str
    metrics: tuple[MetricKind, ...]
    can_banner: bool
    can_filter: bool


LS_TYPE_MAP: dict[str, QuestionTypeInfo] = {
    "L": QuestionTypeInfo("L", "single", "List (radio)", ("distribution",), True, True),
    "!": QuestionTypeInfo("!", "single", "Dropdown", ("distribution",), True, True),
    "O": QuestionTypeInfo("O", "single", "List with comment", ("distribution",), True, True),
    "5": QuestionTypeInfo("5", "single", "5-point choice", ("distribution", "mean", "top2box", "bottom2box"), True, True),
    "Y": QuestionTypeInfo("Y", "single", "Yes/No", ("distribution",), True, True),
    "G": QuestionTypeInfo("G", "single", "Gender", ("distribution",), True, True),
    "M": QuestionTypeInfo("M", "multi", "Multiple choice", ("checkbox_rate",), True, True),
    "P": QuestionTypeInfo("P", "multi", "Multiple choice + comments", ("checkbox_rate",), True, True),
    "F": QuestionTypeInfo("F", "array", "Array (flexible)", ("distribution", "mean", "top2box", "bottom2box"), True, True),
    "A": QuestionTypeInfo("A", "array", "Array (5-point)", ("distribution", "mean", "top2box", "bottom2box"), True, True),
    "B": QuestionTypeInfo("B", "array", "Array (10-point)", ("distribution", "mean", "top2box", "bottom2box"), True, True),
    "C": QuestionTypeInfo("C", "array", "Array (Y/N/Uncertain)", ("distribution",), True, True),
    "E": QuestionTypeInfo("E", "array", "Array (Inc/Same/Dec)", ("distribution",), True, True),
    "H": QuestionTypeInfo("H", "array", "Array (by column)", ("distribution",), True, True),
    "1": QuestionTypeInfo("1", "array", "Array (dual scale)", ("distribution",), True, True),
    "N": QuestionTypeInfo("N", "numeric", "Numerical input", ("mean", "top2box", "bottom2box"), True, True),
    "K": QuestionTypeInfo("K", "numeric", "Multiple numeric", ("mean",), True, True),
    "R": QuestionTypeInfo("R", "rank", "Ranking", ("rank_avg",), True, True),
    "S": QuestionTypeInfo("S", "text", "Short text", (), False, True),
    "T": QuestionTypeInfo("T", "text", "Long text", (), False, True),
    "U": QuestionTypeInfo("U", "text", "Huge text", (), False, True),
    "Q": QuestionTypeInfo("Q", "text", "Multiple short text", (), False, True),
    "D": QuestionTypeInfo("D", "date", "Date", (), False, True),
    "X": QuestionTypeInfo("X", "display", "Text display", (), False, False),
    "*": QuestionTypeInfo("*", "display", "Equation", (), False, False),
    "|": QuestionTypeInfo("|", "display", "File upload", (), False, False),
}


def get_type_info(ls_type: str) -> QuestionTypeInfo:
    return LS_TYPE_MAP.get(
        ls_type,
        QuestionTypeInfo(ls_type, "unknown", f"Type {ls_type}", ("distribution",), True, True),
    )


@dataclass
class AnswerOption:
    code: str
    label: str
    sort_order: int = 0


@dataclass
class SubQuestion:
    code: str
    label: str
    column: str
    sort_order: int = 0


@dataclass
class SurveyVariable:
    id: str
    qid: int
    code: str
    text: str
    ls_type: str
    kind: AnalysisKind
    type_label: str
    group_id: int
    group_title: str
    group_order: int
    question_order: int
    columns: list[str] = field(default_factory=list)
    answer_options: list[AnswerOption] = field(default_factory=list)
    subquestions: list[SubQuestion] = field(default_factory=list)
    metrics: list[MetricKind] = field(default_factory=list)
    can_banner: bool = True
    can_filter: bool = True
    parent_qid: int = 0
    lat_column: str = ""
    lng_column: str = ""
