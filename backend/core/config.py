from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[2]
STATIC_DIR = BASE_DIR / "frontend" / "static"
CAPTURES_DIR = BASE_DIR / "captures"
RAW_CAPTURES_DIR = CAPTURES_DIR / "raw"
OUTPUT_CAPTURES_DIR = CAPTURES_DIR / "outputs"
METADATA_CAPTURES_DIR = CAPTURES_DIR / "metadata"
LIVE_CAPTURES_DIR = CAPTURES_DIR / "live"
MISSION_CAPTURES_DIR = CAPTURES_DIR / "missions"
DEBUG_CAPTURES_DIR = BASE_DIR / "debug" / "captures"
TILE_CACHE_DIR = BASE_DIR / "cache" / "tile_cache"
MODELS_DIR = BASE_DIR / "models"
REPORTS_DIR = BASE_DIR / "reports"
MISSION_REPORTS_DIR = REPORTS_DIR / "missions"

CAPTURES_DIR.mkdir(exist_ok=True)
RAW_CAPTURES_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_CAPTURES_DIR.mkdir(parents=True, exist_ok=True)
METADATA_CAPTURES_DIR.mkdir(parents=True, exist_ok=True)
LIVE_CAPTURES_DIR.mkdir(parents=True, exist_ok=True)
MISSION_CAPTURES_DIR.mkdir(parents=True, exist_ok=True)
DEBUG_CAPTURES_DIR.mkdir(parents=True, exist_ok=True)
TILE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
MODELS_DIR.mkdir(exist_ok=True)
REPORTS_DIR.mkdir(exist_ok=True)
MISSION_REPORTS_DIR.mkdir(parents=True, exist_ok=True)

TILE_SIZE = 256
CAPTURE_MAX_WIDTH = 2048
CAPTURE_MAX_HEIGHT = 2048
CAPTURE_TILE_ZOOM = 18
FALLBACK_VISIBLE_WIDTH = 420
FALLBACK_VISIBLE_HEIGHT = 420
JPEG_QUALITY_STANDARD = 90
JPEG_QUALITY_HIGH = 98
LIVE_JPEG_QUALITY = 95
CV2_JPEG_QUALITY_HIGH = 97
PNG_COMPRESSION = 1
ESRI_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (DroneOpsTerminal/1.0; local educational prototype)"
}

YOLO_MODEL_PATH = MODELS_DIR / "best1.pt" if (MODELS_DIR / "best1.pt").exists() else MODELS_DIR / "best.pt"
YOLO_CONFIDENCE = 0.25
YOLO_IMAGE_SIZE = 640
DEBUG_CAPTURE_PATH = DEBUG_CAPTURES_DIR / "latest_capture.jpg"
DEBUG_PREDICTION_PATH = DEBUG_CAPTURES_DIR / "latest_prediction.jpg"
DEBUG_CAPTURE_PNG_PATH = DEBUG_CAPTURES_DIR / "latest_capture.png"
DEBUG_PREDICTION_PNG_PATH = DEBUG_CAPTURES_DIR / "latest_prediction.png"
DEBUG_CAPTURE_SOURCE_INFO_PATH = DEBUG_CAPTURES_DIR / "latest_capture_source_info.json"
DEBUG_LIVE_FRAME_PATH = DEBUG_CAPTURES_DIR / "latest_live_frame.jpg"
DEBUG_LIVE_PREDICTION_PATH = DEBUG_CAPTURES_DIR / "latest_live_prediction.jpg"

SURVEY_GEOJSON_PATH = CAPTURES_DIR / "survey.geojson"
LAND_USE_CLASSES = [
    "vegetation",
    "water",
    "road_or_built_up",
    "solar_panel",
    "unknown",
]
