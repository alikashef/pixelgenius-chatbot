from contextlib import asynccontextmanager
import asyncio
import os
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import create_tables
from services import liara
from routers import chat, payment, orders, auth, customer_auth, customer, settings, freelancer_auth, site_mcp

UPLOAD_DIR = Path("/app/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    site_mcp.cleanup_expired_sites()
    cleanup_task = asyncio.create_task(liara.cleanup_loop())
    yield
    cleanup_task.cancel()


app = FastAPI(title="Freelance Intake API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PREVIEW_BASE_DOMAIN = (os.getenv("PREVIEW_BASE_DOMAIN") or "localhost").lower()


@app.middleware("http")
async def serve_preview_sites(request: Request, call_next):
    host = request.headers.get("host", "").split(":")[0].lower()
    suffix = "." + PREVIEW_BASE_DOMAIN
    if host.endswith(suffix) and host != PREVIEW_BASE_DOMAIN:
        return site_mcp.serve_site(host[: -len(suffix)], request.url.path)
    return await call_next(request)


app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

app.include_router(chat.router, prefix="/api")
app.include_router(payment.router, prefix="/api")
app.include_router(orders.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(customer_auth.router, prefix="/api")
app.include_router(customer.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
app.include_router(freelancer_auth.router, prefix="/api")
app.include_router(site_mcp.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
