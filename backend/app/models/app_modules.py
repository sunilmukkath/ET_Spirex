"""App-level module visibility (ET Scout navigation areas)."""

from typing import Literal

AppModule = Literal[
    "home",
    "quantitative",
    "qualitative",
    "my_work",
    "operations",
    "crm_marketing",
    "accounting",
    "team",
    "settings",
]

APP_MODULES: tuple[AppModule, ...] = (
    "home",
    "quantitative",
    "qualitative",
    "my_work",
    "operations",
    "crm_marketing",
    "accounting",
    "team",
    "settings",
)

DEFAULT_MODULES_BY_ROLE: dict[str, tuple[AppModule, ...]] = {
    "admin": APP_MODULES,
    "manager": (
        "home",
        "quantitative",
        "qualitative",
        "my_work",
        "operations",
        "crm_marketing",
        "team",
        "settings",
    ),
    "member": ("home", "quantitative", "qualitative", "my_work", "settings"),
}
