"""
Resolves the effective connection config for a tool: only a saved
IntegrationConfig row (from the Settings page) counts as configured.
There is no environment-variable fallback — a tool is either connected
through the UI or it isn't, so add/remove always behaves predictably.
"""

from sqlalchemy.orm import Session

from app.models.integration_config import IntegrationConfig


def resolve(db: Session, tool: str) -> dict:
    row = db.query(IntegrationConfig).filter(IntegrationConfig.tool == tool).first()

    if row and row.url and row.secret:
        return {
            "url": row.url,
            "username": row.username or "",
            "secret": row.secret,
            "extra": row.extra or "",
            "source": "database",
        }

    return {
        "url": (row.url if row else "") or "",
        "username": (row.username if row else "") or "",
        "secret": "",
        "extra": (row.extra if row else "") or "",
        "source": "none",
    }
