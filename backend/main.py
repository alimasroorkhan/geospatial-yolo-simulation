from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.api.routes_capture import router as capture_router
from backend.api.routes_mission import router as mission_router
from backend.api.routes_status import router as status_router
from backend.api.routes_tiles import router as tiles_router
from backend.core.config import CAPTURES_DIR, REPORTS_DIR, STATIC_DIR


app = FastAPI(title="Leaflet Satellite Drone Ops Terminal")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
app.mount("/captures", StaticFiles(directory=str(CAPTURES_DIR)), name="captures")
app.mount("/reports", StaticFiles(directory=str(REPORTS_DIR)), name="reports")
app.include_router(status_router)
app.include_router(tiles_router)
app.include_router(capture_router)
app.include_router(mission_router)


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")
