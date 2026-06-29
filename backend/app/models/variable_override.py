from pydantic import BaseModel, Field


class VariableKindOverride(BaseModel):
    variable_id: str
    treat_as_categorical: bool = True


class VariableKindOverrideSync(BaseModel):
    overrides: dict[str, bool] = Field(default_factory=dict)


class VariableKindOverrideBody(BaseModel):
    treat_as_categorical: bool = True
