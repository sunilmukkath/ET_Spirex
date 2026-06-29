from app.services.location_detect import (
    extract_gps_points,
    find_combined_gps_column,
    find_lat_lng_columns,
    index_gps_column_pairs,
    parse_coordinate_value,
)


def test_sgqa_gps_pair_detection():
    cols = ["id", "12345X78X901GPSLat", "12345X78X901GPSLng", "Q1"]
    pairs = index_gps_column_pairs(cols)
    assert pairs == [("12345x78x901", "12345X78X901GPSLat", "12345X78X901GPSLng")]

    found = find_lat_lng_columns("GPS", cols, qid=901)
    assert found == ("12345X78X901GPSLat", "12345X78X901GPSLng")


def test_question_code_gps_pair():
    cols = ["LocationGPSLat", "LocationGPSLng"]
    assert find_lat_lng_columns("Location", cols) == ("LocationGPSLat", "LocationGPSLng")


def test_combined_coordinate_parsing():
    assert parse_coordinate_value("51.5074, -0.1278") == (51.5074, -0.1278)
    assert parse_coordinate_value('{"latitude": -33.86, "longitude": 151.20}') == (-33.86, 151.2)


def test_combined_column_points():
    import pandas as pd

    df = pd.DataFrame({"gps": ["51.5, -0.12", "bad", "52.1;0.15"]})
    points = extract_gps_points(df, combined_column="gps")
    assert len(points) == 2
    assert points[0]["lat"] == 51.5


def test_combined_gps_column_by_hint():
    cols = ["12345X78X901", "Q2"]
    assert (
        find_combined_gps_column("GPS", "Please share your GPS location", cols, qid=901)
        == "12345X78X901"
    )
