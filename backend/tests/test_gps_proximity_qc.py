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


def _alice_three_close_df():
    return pd.DataFrame(
        {
            "id": [1, 2, 3],
            "INT": ["Alice", "Alice", "Alice"],
            "12345X78X901GPSLat": [9.0100, 9.01001, 9.01002],
            "12345X78X901GPSLng": [38.7500, 38.75001, 38.75002],
        }
    )


def test_gps_proximity_flags_pair_by_default():
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
    assert result["min_cluster"] == 2
    assert result["count"] == 1
    assert result["flags"][0]["interviewer"] == "Alice"


def test_gps_proximity_three_interviews_later_only_flags_two():
    result = _detect_interviewer_gps_proximity(
        _alice_three_close_df(),
        _schema_with_gps(),
        interviewer_variable_id="q_int",
        proximity_meters=10.0,
        min_cluster=2,
        flag_all_in_cluster=False,
        gps_variable_id="q_gps",
    )

    assert result["count"] == 2
    flagged_ids = {str(f["response_id"]) for f in result["flags"]}
    assert flagged_ids == {"2", "3"}


def test_gps_proximity_min_cluster_three_requires_three_before_flagging():
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
        _schema_with_gps(),
        interviewer_variable_id="q_int",
        proximity_meters=10.0,
        min_cluster=3,
        gps_variable_id="q_gps",
    )

    assert result["count"] == 0


def test_gps_proximity_min_cluster_three_flags_all_when_enabled():
    result = _detect_interviewer_gps_proximity(
        _alice_three_close_df(),
        _schema_with_gps(),
        interviewer_variable_id="q_int",
        proximity_meters=10.0,
        min_cluster=3,
        flag_all_in_cluster=True,
        gps_variable_id="q_gps",
    )

    assert result["count"] == 3
    assert result["flag_all_in_cluster"] is True


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
