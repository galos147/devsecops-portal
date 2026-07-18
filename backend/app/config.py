from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://devsecops:devsecops@localhost:5432/devsecops"
    jfrog_url: str = ""
    jfrog_username: str = "admin"
    jfrog_password: str = ""
    jfrog_api_key: str = ""
    jfrog_repo: str = "docker-local"
    sonar_url: str = ""
    sonar_public_url: str = ""
    sonar_token: str = ""
    prisma_url: str = ""
    prisma_access_key: str = ""
    prisma_secret_key: str = ""
    gitlab_url: str = ""
    gitlab_token: str = ""
    sync_interval_minutes: int = 30
    cookie_secure: bool = False  # flip to true once TLS terminates in front of the ingress (none exists yet)

    class Config:
        env_file = ".env"


settings = Settings()
