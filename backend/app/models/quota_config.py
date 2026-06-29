from pydantic import BaseModel, Field


class QuotaCellTarget(BaseModel):
    code: str
    target: float = 0
    min_value: float | None = None
    max_value: float | None = None


class QuotaFieldConfig(BaseModel):
    variable_id: str
    quota_type: str = "count"  # count | percent
    cells: list[QuotaCellTarget] = Field(default_factory=list)


class QuotaLayerCellTarget(BaseModel):
    codes: dict[str, str] = Field(default_factory=dict)
    target: float = 0
    min_value: float | None = None
    max_value: float | None = None


class QuotaLayerConfig(BaseModel):
    id: str
    name: str = ""
    variable_ids: list[str] = Field(default_factory=list)
    quota_type: str = "count"  # count | percent
    cells: list[QuotaLayerCellTarget] = Field(default_factory=list)


class QuotaConfig(BaseModel):
    basis: str = "complete"  # complete | qc_approved
    tolerance_count: int = 0
    tolerance_pct: float = 2.0
    fields: list[QuotaFieldConfig] = Field(default_factory=list)
    layers: list[QuotaLayerConfig] = Field(default_factory=list)
