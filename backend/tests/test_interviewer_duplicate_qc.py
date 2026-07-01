"""Tests for interviewer duplicate answer QC thresholds."""

from app.services.qc_config_store import _normalize_thresholds


def test_interviewer_duplicate_min_cluster_default():
    t = _normalize_thresholds({})
    assert t.interviewer_duplicate_min_cluster == 4


def test_interviewer_duplicate_min_cluster_clamped():
    t = _normalize_thresholds({"interviewer_duplicate_min_cluster": 1})
    assert t.interviewer_duplicate_min_cluster == 2
    t2 = _normalize_thresholds({"interviewer_duplicate_min_cluster": 99})
    assert t2.interviewer_duplicate_min_cluster == 20
