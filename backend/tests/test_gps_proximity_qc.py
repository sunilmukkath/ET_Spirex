import pandas as pd

from app.services.data_quality import _detect_interviewer_gps_proximity
from app.services.location_detect import enrich_schema_location


def _schema_with_gps():
    schema = {
        "variables": [
            {
                "id": "q_int",
                "qid": 100,
                "code": "INT",
                "text": "Interviewer name",
                "kind": "text",
                "columns": ["INT"],
            },
            {
                "id": "q_gps",
                "qid": 901,
                "code": "GPS",
                "text": "GPS location",
                "kind": "unknown",
                "columns": [],
            },
        ]
    }
    columns = ["id", "INT", "12345X78X901GPSLat", "12345X78X901GPSLng"]
    enrich_schema_location(schema, columns)
    return schema


def test_gps_proximity_flags_same_interviewer_close_interviews():
    schema = _schema_with_gps()
    df = pd.DataFrame(
        {
            "id": [1, 2, 3],
            "INT": ["Alice", "Alice", "Bob"],
            "12345X78X901GPSLat": [9.0100, 9.01001, 8.5],
            "12345X78X901GPSLng": [38.7500, 38.75001, 38.1],
        }
    )

    result = _detect_interviewer_gps_proximity(
        df,
        schema,
        interviewer_variable_id="q_int",
        proximity_meters=10.0,
        gps_variable_id="q_gps",
    )

    assert result["available"] is True
    assert result["sessions_with_gps"] == 3
    assert result["count"] == 1
    assert result["flags"][0]["interviewer"] == "Alice"


def test_gps_proximity_without_location_enrichment_still_resolves_columns():
    schema = {
        "variables": [
            {
                "id": "q_int",
                "qid": 100,
                "code": "INT",
                "text": "Interviewer",
                "kind": "text",
                "columns": ["INT"],
            },
            {
                "id": "q_gps",
                "qid": 901,
                "code": "GPS",
                "text": "GPS location",
                "kind": "unknown",
                "columns": [],
            },
        ]
    }
    df = pd.DataFrame(
        {
            "id": [1, 2],
            "INT": ["Alice", "Alice"],
            "12345X78X901GPSLat": [9.01, 9.01001],
            "12345X78X901GPSLng": [38.75, 38.75001],
        }
    )

    result = _detect_interviewer_gps_proximity(
        df,
        schema,
        interviewer_variable_id="q_int",
        proximity_meters=10.0,
        gps_variable_id="q_gps",
    )

    assert result["available"] is True
    assert result["count"] == 1
