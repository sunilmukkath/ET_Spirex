from __future__ import annotations

import re

import pandas as pd

from app.services.question_types import SurveyVariable

_GPS_HINTS = re.compile(r"\b(gps|location|geolocation|coordinates|loctrac|map|latitude|longitude)\b", re.I)
_GPS_LAT_SUFFIX = re.compile(r"(?P<base>.+?)(?P<suffix>gpslat|_lat|latitude)$", re.I)
_GPS_LNG_SUFFIX = re.compile(r"(?P<base>.+?)(?P<suffix>gpslng|gpslon|gpslong|_lng|_lon|longitude)$", re.I)
_SGQA_QID = re.compile(r"X(\d+)(?:GPS|_|$)", re.I)


def _normalize_base(base: str) -> str:
    return base.lower().rstrip("_")


def index_gps_column_pairs(df_columns: list[str]) -> list[tuple[str, str, str]]:
    """Return (base_key, lat_column, lng_column) for every GPS lat/lng pair in export columns."""
    lat_by_base: dict[str, str] = {}
    for col in df_columns:
        col_s = str(col)
        match = _GPS_LAT_SUFFIX.match(col_s)
        if match:
            lat_by_base[_normalize_base(match.group("base"))] = col_s

    pairs: list[tuple[str, str, str]] = []
    seen: set[tuple[str, str]] = set()
    for col in df_columns:
        col_s = str(col)
        match = _GPS_LNG_SUFFIX.match(col_s)
        if not match:
            continue
        base = _normalize_base(match.group("base"))
        lat_col = lat_by_base.get(base)
        if not lat_col:
            continue
        key = (lat_col, col_s)
        if key in seen:
            continue
        seen.add(key)
        pairs.append((base, lat_col, col_s))
    return pairs


def _qid_from_gps_base(base: str) -> int | None:
    matches = _SGQA_QID.findall(base)
    if not matches:
        return None
    return int(matches[-1])


def find_lat_lng_columns(
    code: str,
    df_columns: list[str],
    *,
    qid: int | None = None,
) -> tuple[str, str] | None:
    code = str(code or "")
    col_set = {str(c) for c in df_columns}
    candidates = [
        (f"{code}GPSLat", f"{code}GPSLng"),
        (f"{code}GPSLat", f"{code}GPSLong"),
        (f"{code}GPSLat", f"{code}GPSLon"),
        (f"{code}_lat", f"{code}_lng"),
        (f"{code}_latitude", f"{code}_longitude"),
        (f"{code}Lat", f"{code}Lng"),
        (f"{code}LAT", f"{code}LNG"),
        (f"{code}_LAT", f"{code}_LNG"),
    ]
    for lat, lng in candidates:
        if lat in col_set and lng in col_set:
            return lat, lng

    if qid is not None:
        for base, lat_col, lng_col in index_gps_column_pairs(df_columns):
            if _qid_from_gps_base(base) == qid:
                return lat_col, lng_col
            if f"X{qid}" in lat_col or f"X{qid}" in lng_col:
                return lat_col, lng_col

    lat_cols = [c for c in df_columns if str(c).startswith(code) and "lat" in str(c).lower()]
    lng_cols = [
        c
        for c in df_columns
        if str(c).startswith(code)
        and any(x in str(c).lower() for x in ("lng", "lon", "long"))
    ]
    if lat_cols and lng_cols:
        return str(lat_cols[0]), str(lng_cols[0])

    for lat in df_columns:
        lat_s = str(lat)
        if "gpslat" not in lat_s.lower() and not lat_s.lower().endswith("lat"):
            continue
        base = lat_s
        for suffix in ("GPSLat", "gpslat", "Lat", "lat", "_lat", "_latitude", "latitude"):
            if lat_s.lower().endswith(suffix.lower()):
                base = lat_s[: -len(suffix)]
                break
        for lng in df_columns:
            lng_s = str(lng)
            if lng_s == lat_s:
                continue
            if base and base in lng_s and any(x in lng_s.lower() for x in ("lng", "lon", "long")):
                return lat_s, lng_s
    return None


def find_combined_gps_column(
    code: str,
    text: str,
    df_columns: list[str],
    *,
    qid: int | None = None,
) -> str | None:
    if not _GPS_HINTS.search(f"{code} {text}"):
        return None
    col_set = {str(c) for c in df_columns}
    direct = [code, f"{code}_gps", f"{code}GPS"]
    if qid is not None:
        direct.extend(c for c in df_columns if f"X{qid}" in str(c))
    for candidate in direct:
        cand = str(candidate)
        if cand in col_set and "gpslat" not in cand.lower() and "gpslng" not in cand.lower():
            return cand
    for col in df_columns:
        col_s = str(col)
        lower = col_s.lower()
        if "gpslat" in lower or "gpslng" in lower or "gpslon" in lower:
            continue
        if code and (col_s == code or col_s.startswith(f"{code}_") or col_s.startswith(code)):
            return col_s
        if qid is not None and f"X{qid}" in col_s and "gps" not in lower:
            return col_s
    return None


def _valid_point(lat: float, lng: float) -> bool:
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return False
    return not (lat == 0 and lng == 0)


def parse_coordinate_value(value: object) -> tuple[float, float] | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, (list, tuple)) and len(value) >= 2:
        lat = pd.to_numeric(value[0], errors="coerce")
        lng = pd.to_numeric(value[1], errors="coerce")
        if pd.notna(lat) and pd.notna(lng):
            lat_f, lng_f = float(lat), float(lng)
            if _valid_point(lat_f, lng_f):
                return lat_f, lng_f
        return None

    text = str(value).strip()
    if not text or text.lower() in {"nan", "none", "null"}:
        return None

    if text.startswith("{") and "lat" in text.lower():
        lat_match = re.search(r'"?lat(?:itude)?"?\s*[:=]\s*([-\d.]+)', text, re.I)
        lng_match = re.search(r'"?l(?:on|ng)(?:gitude)?"?\s*[:=]\s*([-\d.]+)', text, re.I)
        if lat_match and lng_match:
            lat_f = float(lat_match.group(1))
            lng_f = float(lng_match.group(1))
            if _valid_point(lat_f, lng_f):
                return lat_f, lng_f

    parts = re.split(r"[,;\s|]+", text)
    if len(parts) >= 2:
        first = pd.to_numeric(parts[0], errors="coerce")
        second = pd.to_numeric(parts[1], errors="coerce")
        if pd.notna(first) and pd.notna(second):
            a, b = float(first), float(second)
            if abs(a) <= 90 and abs(b) <= 180 and _valid_point(a, b):
                return a, b
            if abs(b) <= 90 and abs(a) <= 180 and _valid_point(b, a):
                return b, a
    return None


def extract_gps_points(
    df: pd.DataFrame,
    *,
    lat_column: str = "",
    lng_column: str = "",
    combined_column: str = "",
) -> list[dict[str, float]]:
    points: list[dict[str, float]] = []

    if lat_column and lng_column and lat_column in df.columns and lng_column in df.columns:
        for _, row in df.iterrows():
            lat = pd.to_numeric(row.get(lat_column), errors="coerce")
            lng = pd.to_numeric(row.get(lng_column), errors="coerce")
            if pd.isna(lat) or pd.isna(lng):
                continue
            lat_f, lng_f = float(lat), float(lng)
            if _valid_point(lat_f, lng_f):
                points.append({"lat": lat_f, "lng": lng_f})
        return points

    if combined_column and combined_column in df.columns:
        for value in df[combined_column]:
            parsed = parse_coordinate_value(value)
            if parsed:
                lat_f, lng_f = parsed
                points.append({"lat": lat_f, "lng": lng_f})
    return points


def _apply_location_pair(
    variable: SurveyVariable,
    lat_col: str,
    lng_col: str,
    *,
    combined_col: str = "",
) -> None:
    variable.kind = "location"
    variable.type_label = "GPS / Location"
    variable.metrics = []
    variable.can_banner = False
    if combined_col:
        variable.lat_column = combined_col
        variable.lng_column = ""
        variable.columns = [combined_col]
    else:
        variable.lat_column = lat_col
        variable.lng_column = lng_col
        variable.columns = [lat_col, lng_col]


def apply_location_kind(variables: list[SurveyVariable], df_columns: list[str]) -> None:
    if not df_columns:
        return

    assigned_qids: set[int] = set()
    gps_pairs = index_gps_column_pairs(df_columns)

    for variable in variables:
        pair = find_lat_lng_columns(variable.code, df_columns, qid=variable.qid)
        if not pair and _GPS_HINTS.search(f"{variable.code} {variable.text}"):
            for base, lat_col, lng_col in gps_pairs:
                if variable.qid and _qid_from_gps_base(base) == variable.qid:
                    pair = (lat_col, lng_col)
                    break
                if variable.code and (
                    variable.code in lat_col
                    or variable.code in lng_col
                    or base.endswith(variable.code.lower())
                ):
                    pair = (lat_col, lng_col)
                    break
            if not pair:
                for lat_col, lng_col in ((p[1], p[2]) for p in gps_pairs):
                    if variable.code and variable.code in f"{lat_col}{lng_col}":
                        pair = (lat_col, lng_col)
                        break

        if pair:
            _apply_location_pair(variable, pair[0], pair[1])
            assigned_qids.add(variable.qid)
            continue

        combined = find_combined_gps_column(
            variable.code,
            variable.text,
            df_columns,
            qid=variable.qid,
        )
        if combined:
            _apply_location_pair(variable, "", "", combined_col=combined)
            assigned_qids.add(variable.qid)

    for base, lat_col, lng_col in gps_pairs:
        qid = _qid_from_gps_base(base)
        if qid is None or qid in assigned_qids:
            continue
        variable = next((v for v in variables if v.qid == qid), None)
        if variable:
            _apply_location_pair(variable, lat_col, lng_col)
            assigned_qids.add(qid)
