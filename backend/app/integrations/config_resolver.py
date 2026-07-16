"""
Resolves the effective connection config for a tool: a saved IntegrationConfig
row (from the Settings page) takes precedence, falling back to the static
env-var Settings when no row is saved yet.
"""

from sqlalchemy.orm import Session

from app.config import settings
from app.models.integration_config import IntegrationConfig

ENV_DEFAULTS = {
    "jfrog": lambda: {
        "url": settings.jfrog_url,
        "username": settings.jfrog_username,
        "secret": settings.jfrog_password or settings.jfrog_api_key,
        "extra": settings.jfrog_repo,
    },
    "sonarqube": lambda: {
        "url": settings.sonar_url,
        "username": "",
        "secret": settings.sonar_token,
        "extra": "",
    },
    "prisma": lambda: {
        "url": settings.prisma_url,
        "username": settings.prisma_access_key,
        "secret": settings.prisma_secret_key,
        "extra": "",
    },
    "gitlab": lambda: {
        "url": settings.gitlab_url,
        "username": "",
        "secret": settings.gitlab_token,
        "extra": "",
    },
}


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

    env = ENV_DEFAULTS.get(tool, lambda: {"url": "", "username": "", "secret": "", "extra": ""})()
    if env["url"] and env["secret"]:
        return {**env, "source": "env"}

    return {
        "url": (row.url if row else "") or "",
        "username": (row.username if row else "") or "",
        "secret": "",
        "extra": (row.extra if row else "") or "",
        "source": "none",
    }
