"""App-level module visibility (ET Scout navigation areas)."""

from typing import Literal

AppModule = Literal[
    "home",
    "quantitative",
    "my_work",
    "operations",
    "accounting",
    "team",
    "settings",
]

APP_MODULES: tuple[AppModule, ...] = (
    "home",
    "quantitative",
    "my_work",
    "operations",
    "accounting",
    "team",
    "settings",
)

DEFAULT_MODULES_BY_ROLE: dict[str, tuple[AppModule, ...]] = {
    "admin": APP_MODULES,
    "manager": (
        "home",
        "quantitative",
        "my_work",
        "operations",
        "team",
        "settings",
    ),
    "member": ("home", "quantitative", "my_work", "settings"),
}
