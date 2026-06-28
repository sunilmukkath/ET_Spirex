from __future__ import annotations

import html
import re

_SCRIPT_BLOCK = re.compile(r"<script\b[^>]*>.*?</script>", re.IGNORECASE | re.DOTALL)
_STYLE_BLOCK = re.compile(r"<style\b[^>]*>.*?</style>", re.IGNORECASE | re.DOTALL)
_HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
_HTML_TAG = re.compile(r"<[^>]+>")
_LS_PLACEHOLDER = re.compile(r"\{[A-Z0-9_.]+\}")
_JS_START = re.compile(
    r"\$\(\s*document\s*\)|jQuery\s*\(\s*document\s*\)|\(function\s*\(\s*\$\s*\)",
    re.IGNORECASE,
)
_SURVEY_JS_MARKERS = (
    "{QID}",
    "pjax:scriptcomplete",
    "javatbd",
    ".answers-list",
    ".prop(",
    ".toggleClass(",
    "question{QID}",
)


def clean_survey_text(text: str) -> str:
    """Strip HTML, scripts, and embedded LimeSurvey jQuery from question copy."""
    if not text:
        return ""

    s = str(text)
    s = _SCRIPT_BLOCK.sub(" ", s)
    s = _STYLE_BLOCK.sub(" ", s)
    s = _HTML_COMMENT.sub(" ", s)
    s = _HTML_TAG.sub(" ", s)
    s = html.unescape(s)

    match = _JS_START.search(s)
    if match:
        s = s[: match.start()]
    elif _is_embedded_survey_js(s):
        s = ""

    s = _LS_PLACEHOLDER.sub("", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _is_embedded_survey_js(text: str) -> bool:
    if not text or len(text) < 40:
        return False
    hits = sum(1 for marker in _SURVEY_JS_MARKERS if marker in text)
    return hits >= 2 and ("function" in text or ".on(" in text or ".prop(" in text)
