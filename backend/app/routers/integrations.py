from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from app.database import get_db
from app.models.integration_config import IntegrationConfig
from app.schemas.integration import IntegrationOut, IntegrationUpdate, TestConnectionRequest, TestConnectionResult
from app.integrations import config_resolver, jfrog, sonarqube, prisma, gitlab

router = APIRouter(prefix="/api/integrations", tags=["integrations"])

LABELS = {"jfrog": "JFrog Xray", "sonarqube": "SonarQube", "prisma": "Prisma Cloud", "gitlab": "GitLab"}
TEST_FUNCTIONS = {"jfrog": jfrog.test_connection, "sonarqube": sonarqube.test_connection,
                   "prisma": prisma.test_connection, "gitlab": gitlab.test_connection}
VALID_TOOLS = set(LABELS)


@router.get("", response_model=list[IntegrationOut])
def list_integrations(db: Session = Depends(get_db)):
    results = []
    for tool, label in LABELS.items():
        cfg = config_resolver.resolve(db, tool)
        row = db.query(IntegrationConfig).filter(IntegrationConfig.tool == tool).first()
        results.append(IntegrationOut(
            tool=tool,
            label=label,
            url=cfg["url"] or None,
            username=cfg["username"] or None,
            secret_set=bool(cfg["secret"]),
            extra=cfg["extra"] or None,
            source=cfg["source"],
            updated_at=row.updated_at if row else None,
        ))
    return results


@router.put("/{tool}", response_model=IntegrationOut)
def update_integration(tool: str, body: IntegrationUpdate, db: Session = Depends(get_db)):
    if tool not in VALID_TOOLS:
        raise HTTPException(status_code=400, detail=f"Unknown tool: {tool}")

    row = db.query(IntegrationConfig).filter(IntegrationConfig.tool == tool).first()
    if not row:
        row = IntegrationConfig(id=f"ic-{tool}", tool=tool)
        db.add(row)

    row.url = body.url
    row.username = body.username
    if body.secret:  # omitted/blank = keep existing saved secret
        row.secret = body.secret
    row.extra = body.extra
    row.updated_at = datetime.utcnow()
    db.commit()

    cfg = config_resolver.resolve(db, tool)
    return IntegrationOut(
        tool=tool, label=LABELS[tool], url=cfg["url"] or None, username=cfg["username"] or None,
        secret_set=bool(cfg["secret"]), extra=cfg["extra"] or None, source=cfg["source"], updated_at=row.updated_at,
    )


@router.post("/{tool}/test", response_model=TestConnectionResult)
async def test_integration(tool: str, body: TestConnectionRequest, db: Session = Depends(get_db)):
    if tool not in VALID_TOOLS:
        raise HTTPException(status_code=400, detail=f"Unknown tool: {tool}")

    base = config_resolver.resolve(db, tool)
    url = body.url if body.url is not None else base["url"]
    username = body.username if body.username is not None else base["username"]
    secret = body.secret if body.secret else base["secret"]

    fn = TEST_FUNCTIONS[tool]
    result = await fn(url, username, secret)
    return TestConnectionResult(**result)
