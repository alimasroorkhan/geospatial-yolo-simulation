from fastapi import APIRouter

from backend.core.config import (
    CAPTURES_DIR,
    DEBUG_CAPTURES_DIR,
    LIVE_CAPTURES_DIR,
    METADATA_CAPTURES_DIR,
    OUTPUT_CAPTURES_DIR,
    RAW_CAPTURES_DIR,
    SURVEY_GEOJSON_PATH,
    YOLO_MODEL_PATH,
)
from backend.services.detection import YOLO

router = APIRouter()


@router.get("/api/status")
def status() -> dict:
    return {
        "server": "online",
        "engine": "Leaflet + FastAPI",
        "imagery": "satellite",
        "capture_folder": str(CAPTURES_DIR),
        "raw_capture_folder": str(RAW_CAPTURES_DIR),
        "output_capture_folder": str(OUTPUT_CAPTURES_DIR),
        "metadata_folder": str(METADATA_CAPTURES_DIR),
        "live_capture_folder": str(LIVE_CAPTURES_DIR),
        "debug_capture_folder": str(DEBUG_CAPTURES_DIR),
        "survey_geojson": str(SURVEY_GEOJSON_PATH),
        "model_present": YOLO_MODEL_PATH.exists(),
        "yolo_package_installed": YOLO is not None,
        "model_path": str(YOLO_MODEL_PATH),
    }
