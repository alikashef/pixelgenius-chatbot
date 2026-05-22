from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import create_tables
from routers import chat, payment, orders, auth, customer_auth, customer, settings, freelancer_auth

UPLOAD_DIR = Path("/app/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    yield


app = FastAPI(title="Freelance Intake API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

app.include_router(chat.router, prefix="/api")
app.include_router(payment.router, prefix="/api")
app.include_router(orders.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(customer_auth.router, prefix="/api")
app.include_router(customer.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
app.include_router(freelancer_auth.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}
