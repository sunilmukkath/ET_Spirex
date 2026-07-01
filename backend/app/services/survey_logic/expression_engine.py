"""ExpressionScript evaluator for server-side survey logic."""

from __future__ import annotations

import math
import random
import re
from dataclasses import dataclass
from typing import Any


class ExpressionError(Exception):
    pass


@dataclass
class EvaluationContext:
    participant_responses: dict[str, Any]
    panel_metadata: dict[str, Any]
    system_variables: dict[str, Any]


_RESERVED = frozenset(
    {"if", "sum", "count", "rand", "array_filter", "and", "or", "not", "true", "false"}
)


def _to_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None or value == "":
        return False
    if isinstance(value, (list, tuple)):
        return len(value) > 0
    if isinstance(value, (int, float)):
        return value != 0
    return True


def _to_number(value: Any) -> float:
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _resolve(name: str, ctx: EvaluationContext) -> Any:
    if name in ctx.participant_responses:
        return ctx.participant_responses[name]
    if name in ctx.panel_metadata:
        return ctx.panel_metadata[name]
    if name in ctx.system_variables:
        return ctx.system_variables[name]
    return None


def _tokenize(expr: str) -> list[tuple[str, str]]:
    tokens: list[tuple[str, str]] = []
    i = 0
    s = expr.strip()
    while i < len(s):
        if s[i].isspace():
            i += 1
            continue
        matched = False
        for kw in ("==", "!=", ">=", "<=", "&&", "||"):
            if s.startswith(kw, i):
                tokens.append(("op", kw))
                i += len(kw)
                matched = True
                break
        if matched:
            continue
        if s[i] in "+-*/<>=!(),":
            tokens.append(("op", s[i]))
            i += 1
            continue
        if s[i] in "\"'":
            q = s[i]
            j = i + 1
            buf: list[str] = []
            while j < len(s) and s[j] != q:
                buf.append(s[j])
                j += 1
            if j >= len(s):
                raise ExpressionError("Unterminated string")
            tokens.append(("str", "".join(buf)))
            i = j + 1
            continue
        if s[i].isdigit() or (s[i] == "." and i + 1 < len(s) and s[i + 1].isdigit()):
            j = i
            while j < len(s) and (s[j].isdigit() or s[j] == "."):
                j += 1
            tokens.append(("num", s[i:j]))
            i = j
            continue
        if s[i].isalpha() or s[i] == "_":
            j = i
            while j < len(s) and (s[j].isalnum() or s[j] == "_"):
                j += 1
            tokens.append(("id", s[i:j]))
            i = j
            continue
        raise ExpressionError(f"Unexpected character '{s[i]}' at {i}")
    tokens.append(("eof", ""))
    return tokens


class _Parser:
    def __init__(self, tokens: list[tuple[str, str]], ctx: EvaluationContext):
        self.tokens = tokens
        self.pos = 0
        self._ctx = ctx

    def _peek(self) -> tuple[str, str]:
        if self.pos >= len(self.tokens):
            return ("eof", "")
        return self.tokens[self.pos]

    def _eat(self) -> tuple[str, str]:
        t = self.tokens[self.pos]
        self.pos += 1
        return t

    def _at_eof(self) -> bool:
        return self._peek()[0] == "eof"

    def parse(self) -> Any:
        return self._or()

    def _or(self) -> Any:
        left = self._and()
        while not self._at_eof() and self._peek()[1] in ("or", "||"):
            self._eat()
            left = _to_bool(left) or _to_bool(self._and())
        return left

    def _and(self) -> Any:
        left = self._not()
        while not self._at_eof() and self._peek()[1] in ("and", "&&"):
            self._eat()
            left = _to_bool(left) and _to_bool(self._not())
        return left

    def _not(self) -> Any:
        if not self._at_eof() and self._peek()[1] in ("not", "!"):
            self._eat()
            return not _to_bool(self._not())
        return self._compare()

    def _compare(self) -> Any:
        left = self._add()
        ops = {"==", "!=", ">", "<", ">=", "<="}
        while not self._at_eof() and self._peek()[1] in ops:
            op = self._eat()[1]
            right = self._add()
            if op == "==":
                left = str(left) == str(right)
            elif op == "!=":
                left = str(left) != str(right)
            elif op == ">":
                left = _to_number(left) > _to_number(right)
            elif op == "<":
                left = _to_number(left) < _to_number(right)
            elif op == ">=":
                left = _to_number(left) >= _to_number(right)
            elif op == "<=":
                left = _to_number(left) <= _to_number(right)
        return left

    def _add(self) -> Any:
        left = self._mul()
        while not self._at_eof() and self._peek()[1] in "+-":
            op = self._eat()[1]
            right = self._mul()
            left = _to_number(left) + _to_number(right) if op == "+" else _to_number(left) - _to_number(right)
        return left

    def _mul(self) -> Any:
        left = self._unary()
        while not self._at_eof() and self._peek()[1] in "*/":
            op = self._eat()[1]
            right = self._unary()
            left = _to_number(left) * _to_number(right) if op == "*" else _to_number(left) / _to_number(right)
        return left

    def _unary(self) -> Any:
        if not self._at_eof() and self._peek()[1] == "-":
            self._eat()
            return -_to_number(self._unary())
        return self._primary()

    def _primary(self) -> Any:
        kind, val = self._peek()
        if kind == "num":
            self._eat()
            return float(val) if "." in val else int(val)
        if kind == "str":
            self._eat()
            return val
        if kind == "id":
            self._eat()
            if val == "true":
                return True
            if val == "false":
                return False
            if self._peek()[1] == "(":
                self._eat()
                args: list[Any] = []
                if self._peek()[1] != ")":
                    args.append(self._or())
                    while self._peek()[1] == ",":
                        self._eat()
                        args.append(self._or())
                if self._peek()[1] != ")":
                    raise ExpressionError("Expected )")
                self._eat()
                return _call(val, args)
            return _resolve(val, self._ctx)
        if val == "(":
            self._eat()
            inner = self._or()
            if self._peek()[1] != ")":
                raise ExpressionError("Expected )")
            self._eat()
            return inner
        raise ExpressionError(f"Unexpected token {val}")

    @property
    def ctx(self) -> EvaluationContext:
        return self._ctx


def _call(name: str, args: list[Any]) -> Any:
    if name == "if":
        return args[1] if _to_bool(args[0]) else args[2]
    if name == "sum":
        return sum(_to_number(a) for a in args)
    if name == "count":
        return sum(1 for a in args if _to_bool(a))
    if name == "rand":
        return random.randint(int(_to_number(args[0])), int(_to_number(args[1])))
    if name == "array_filter":
        arr = args[0] if isinstance(args[0], list) else []
        pred = args[1] if len(args) > 1 else None
        return [x for x in arr if str(x) == str(pred)]
    raise ExpressionError(f"Unknown function {name}")


def evaluate_expression(expression: str, context: EvaluationContext | dict[str, Any]) -> Any:
    trimmed = (expression or "").strip()
    if not trimmed:
        return True
    if isinstance(context, dict) and "participant_responses" not in context:
        ctx = EvaluationContext(
            participant_responses=context,
            panel_metadata={},
            system_variables={},
        )
    else:
        ctx = context  # type: ignore[assignment]
    parser = _Parser(_tokenize(trimmed), ctx)
    return parser.parse()


def interpolate_text(template: str, context: EvaluationContext) -> str:
    def repl(match: re.Match[str]) -> str:
        try:
            result = evaluate_expression(match.group(1).strip(), context)
            return "" if result is None else str(result)
        except ExpressionError:
            return match.group(0)

    return re.sub(r"\{([^{}]+)\}", repl, template)


def is_relevant(expression: str | None, context: EvaluationContext) -> bool:
    if not (expression or "").strip():
        return True
    try:
        return _to_bool(evaluate_expression(expression, context))
    except ExpressionError:
        return False
