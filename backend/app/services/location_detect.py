from __future__ import annotations

import re

from app.services.question_types import SurveyVariable

_GPS_HINTS = re.compile(r"\b(gps|location|geolocation|coordinates|loctrac|map)\b", re.I)


def find_lat_lng_columns(code: str, df_columns: list[str]) -> tuple[str, str] | None:
    code = str(code)
    col_set = {str(c) for c in df_columns}
    candidates = [
        (f"{code}GPSLat", f"{code}GPSLng"),
        (f"{code}GPSLat", f"{code}GPSLong"),
        (f"{code}GPSLat", f"{code}GPSLon"),
        (f"{code}_lat", f"{code}_lng"),
        (f"{code}_latitude", f"{code}_longitude"),
        (f"{code}Lat", f"{code}Lng"),
        (f"{code}LAT", f"{code}LNG"),
    ]
    for lat, lng in candidates:
        if lat in col_set and lng in col_set:
            return lat, lng

    lat_cols = [c for c in df_columns if str(c).startswith(code) and "lat" in str(c).lower()]
    lng_cols = [
        c
        for c in df_columns
        if str(c).startswith(code)
        and any(x in str(c).lower() for x in ("lng", "lon", "long"))
    ]
    if lat_cols and lng_cols:
        return lat_cols[0], lng_cols[0]

    for lat in df_columns:
        lat_s = str(lat)
        if "gpslat" not in lat_s.lower() and not lat_s.lower().endswith("lat"):
            continue
        base = lat_s.replace("GPSLat", "").replace("Lat", "").replace("_lat", "")
        for lng in df_columns:
            lng_s = str(lng)
            if lng_s == lat_s:
                continue
            if base and base in lng_s and any(x in lng_s.lower() for x in ("lng", "lon", "long")):
                return lat, lng
    return None


def apply_location_kind(variables: list[SurveyVariable], df_columns: list[str]) -> None:
    if not df_columns:
        return
    for variable in variables:
        pair = find_lat_lng_columns(variable.code, df_columns)
        if not pair and _GPS_HINTS.search(f"{variable.code} {variable.text}"):
            for lat in df_columns:
                lat_s = str(lat)
                if "gpslat" in lat_s.lower() or lat_s.lower().endswith("lat"):
                    for lng in df_columns:
                        lng_s = str(lng)
                        if lng_s == lat_s:
                            continue
                        if any(x in lng_s.lower() for x in ("gpslng", "gpslon", "gpslong")):
                            if variable.code in lat or variable.code in lng or not variable.code:
                                pair = (lat, lng)
                                break
                if pair:
                    break
        if not pair:
            continue
        lat_col, lng_col = pair
        variable.kind = "location"
        variable.type_label = "GPS / Location"
        variable.metrics = []
        variable.can_banner = False
        variable.lat_column = lat_col
        variable.lng_column = lng_col
        variable.columns = [lat_col, lng_col]
