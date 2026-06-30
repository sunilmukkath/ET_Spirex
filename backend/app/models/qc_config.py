from typing import Literal

from pydantic import BaseModel, Field


class QcThresholds(BaseModel):
    speeder_time_basis: Literal["average", "median"] = "average"
    speeder_custom_reference_seconds: float | None = None  # if set > 0, overrides survey avg/median
    speeder_min_seconds: float = 0.0  # optional absolute floor; 0 = reference × fraction only
    speeder_median_fraction: float = 0.25  # fraction of reference completion time
    min_array_items_straight_line: int = 4
    min_text_length_gibberish: int = 3
    interviewer_duplicate_similarity_pct: float = 85.0
    interviewer_gps_proximity_meters: float = 10.0
    interviewer_gps_proximity_min_cluster: int = 2
    interviewer_gps_proximity_flag_all_in_cluster: bool = False
    interviewer_min_gap_seconds: float = 300.0


class QcCustomRule(BaseModel):
    variable_id: str
    operator: str = "in"  # in | not_in | is_empty | not_empty
    values: list[str] = Field(default_factory=list)
    name: str = ""


class QcConfig(BaseModel):
    disabled_checks: list[str] = Field(default_factory=list)
    kept_response_ids: list[str] = Field(default_factory=list)
    excluded_response_ids: list[str] = Field(default_factory=list)
    thresholds: QcThresholds = Field(default_factory=QcThresholds)
    custom_rules: list[QcCustomRule] = Field(default_factory=list)
    interviewer_variable_id: str | None = None
    gps_variable_id: str | None = None
    straight_line_variable_ids: list[str] | None = None
