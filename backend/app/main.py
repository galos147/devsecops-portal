from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import init_db
from app.routers import dashboard, images, vulnerabilities, code_quality, pipelines, search, fix_suggestions, sync, integrations

app = FastAPI(title="DevSecOps Portal API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://frontend:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


app.include_router(dashboard.router)
app.include_router(images.router)
app.include_router(vulnerabilities.router)
app.include_router(code_quality.router)
app.include_router(pipelines.router)
app.include_router(search.router)
app.include_router(fix_suggestions.router)
app.include_router(sync.router)
app.include_router(integrations.router)


@app.get("/health")
def health():
    return {"status": "ok"}
