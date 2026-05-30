from pydantic import BaseModel


class CaptureRequest(BaseModel):
    lat: float
    lon: float
    zoom: int = 18
    camera_zoom: float | None = None
    effective_zoom: float | None = None
    capture_tile_zoom: int | None = None
    map_zoom: int = 15
    altitude: float = 500.0
    heading: float = 0.0
    width: int = 900
    height: int = 620
    jpeg_quality: float = 0.95
    image_format: str = "jpg"
    mime_type: str = "image/jpeg"
    draw_hud: bool = True
    north: float | None = None
    south: float | None = None
    east: float | None = None
    west: float | None = None


class MissionBounds(BaseModel):
    north: float
    south: float
    east: float
    west: float


class MissionPlanRequest(BaseModel):
    bounds: MissionBounds
    rows: int = 3
    columns: int = 4
    overlap: float = 0.0


class MissionSector(BaseModel):
    id: str
    row: int
    column: int
    order: int
    bounds: MissionBounds
    center: dict
    status: str = "pending"


class MissionCreateRequest(MissionPlanRequest):
    altitude: float = 500.0
    camera_zoom: float = 18.0


class MissionSectorScanRequest(BaseModel):
    mission_id: str
    sector: MissionSector
    altitude: float = 500.0
    heading: float = 0.0
    camera_zoom: float = 18.0
    effective_zoom: float = 18.0
    capture_tile_zoom: int = 18
    width: int = 900
    height: int = 620


class MissionCompleteRequest(BaseModel):
    mission_id: str
