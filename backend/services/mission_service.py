import csv
import html
import json
from collections import Counter
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from backend.core.config import MISSION_CAPTURES_DIR, MISSION_REPORTS_DIR
from backend.core.schemas import CaptureRequest, MissionCompleteRequest, MissionCreateRequest, MissionPlanRequest, MissionSectorScanRequest
from backend.services.capture_service import draw_hud_overlay, make_camera_capture, save_image
from backend.services.inference_service import run_yolo_detection


def _model_data(model) -> dict:
    return model.model_dump() if hasattr(model, "model_dump") else model.dict()


def _mission_paths(mission_id: str) -> dict:
    capture_dir = MISSION_CAPTURES_DIR / mission_id
    report_dir = MISSION_REPORTS_DIR / mission_id
    capture_dir.mkdir(parents=True, exist_ok=True)
    report_dir.mkdir(parents=True, exist_ok=True)
    return {
        "capture_dir": capture_dir,
        "report_dir": report_dir,
        "json": report_dir / "mission.json",
        "csv": report_dir / "summary.csv",
        "html": report_dir / "report.html",
    }


def _normalise_bounds(bounds: dict) -> dict:
    north = max(float(bounds["north"]), float(bounds["south"]))
    south = min(float(bounds["north"]), float(bounds["south"]))
    east = max(float(bounds["east"]), float(bounds["west"]))
    west = min(float(bounds["east"]), float(bounds["west"]))
    return {"north": north, "south": south, "east": east, "west": west}


def generate_sector_grid(req: MissionPlanRequest) -> dict:
    bounds = _normalise_bounds(_model_data(req.bounds))
    rows = max(1, min(12, int(req.rows)))
    columns = max(1, min(12, int(req.columns)))
    overlap = max(0.0, min(0.45, float(req.overlap or 0.0)))
    lat_step = (bounds["north"] - bounds["south"]) / rows
    lon_step = (bounds["east"] - bounds["west"]) / columns
    lat_pad = lat_step * overlap / 2
    lon_pad = lon_step * overlap / 2
    sectors = []
    order = 1

    # Generate lawn-mower scan order
    for row in range(rows):
        columns_for_row = range(columns) if row % 2 == 0 else range(columns - 1, -1, -1)
        for column in columns_for_row:
            sector_north = bounds["north"] - row * lat_step
            sector_south = sector_north - lat_step
            sector_west = bounds["west"] + column * lon_step
            sector_east = sector_west + lon_step
            padded = {
                "north": min(bounds["north"], sector_north + lat_pad),
                "south": max(bounds["south"], sector_south - lat_pad),
                "east": min(bounds["east"], sector_east + lon_pad),
                "west": max(bounds["west"], sector_west - lon_pad),
            }
            sectors.append(
                {
                    "id": f"S{order:03d}",
                    "row": row + 1,
                    "column": column + 1,
                    "order": order,
                    "bounds": padded,
                    "center": {
                        "lat": (padded["north"] + padded["south"]) / 2,
                        "lon": (padded["east"] + padded["west"]) / 2,
                    },
                    "status": "pending",
                }
            )
            order += 1

    return {
        "bounds": bounds,
        "rows": rows,
        "columns": columns,
        "overlap": overlap,
        "sectors": sectors,
        "path": [sector["center"] for sector in sectors],
    }


def create_mission(req: MissionCreateRequest) -> dict:
    mission_id = datetime.now().strftime("mission_%Y%m%d_%H%M%S_") + uuid4().hex[:6]
    paths = _mission_paths(mission_id)
    plan = generate_sector_grid(req)
    mission = {
        "mission_id": mission_id,
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "completed_at": None,
        "duration_seconds": None,
        "status": "planned",
        "altitude": req.altitude,
        "camera_zoom": req.camera_zoom,
        "plan": plan,
        "sector_results": [],
        "detections": [],
        "summary": {
            "total_sectors": len(plan["sectors"]),
            "sectors_scanned": 0,
            "total_detections": 0,
            "detections_per_class": {},
        },
        "outputs": {
            "json": f"/reports/missions/{mission_id}/mission.json",
            "csv": f"/reports/missions/{mission_id}/summary.csv",
            "html": f"/reports/missions/{mission_id}/report.html",
        },
    }
    _write_json(paths["json"], mission)
    return mission


def load_mission(mission_id: str) -> dict:
    path = _mission_paths(mission_id)["json"]
    if not path.exists():
        raise FileNotFoundError(f"Mission not found: {mission_id}")
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _heading_to_next(mission: dict, sector: dict) -> float:
    sectors = mission["plan"]["sectors"]
    idx = max(0, int(sector["order"]) - 1)
    if idx == 0:
        return 0.0
    prev = sectors[idx - 1]["center"]
    cur = sector["center"]
    dy = cur["lat"] - prev["lat"]
    dx = cur["lon"] - prev["lon"]
    if dx == 0 and dy == 0:
        return 0.0
    import math

    return (math.degrees(math.atan2(dx, dy)) + 360) % 360


def scan_sector(req: MissionSectorScanRequest) -> dict:
    mission = load_mission(req.mission_id)
    paths = _mission_paths(req.mission_id)
    sector = _model_data(req.sector)
    heading = _heading_to_next(mission, sector)
    bounds = sector["bounds"]
    center = sector["center"]

    capture_req = CaptureRequest(
        lat=center["lat"],
        lon=center["lon"],
        zoom=round(req.effective_zoom),
        camera_zoom=req.camera_zoom,
        effective_zoom=req.effective_zoom,
        capture_tile_zoom=req.capture_tile_zoom,
        altitude=req.altitude,
        heading=heading,
        width=req.width,
        height=req.height,
        jpeg_quality=0.98,
        image_format="jpg",
        mime_type="image/jpeg",
        draw_hud=True,
        north=bounds["north"],
        south=bounds["south"],
        east=bounds["east"],
        west=bounds["west"],
    )

    image, geometry = make_camera_capture(capture_req)
    raw_name = f"{sector['id']}_raw.jpg"
    annotated_name = f"{sector['id']}_annotated.jpg"
    prediction_name = f"{sector['id']}_prediction.jpg"
    raw_path = paths["capture_dir"] / raw_name
    annotated_path = paths["capture_dir"] / annotated_name
    prediction_path = paths["capture_dir"] / prediction_name
    save_image(image, raw_path, "jpg", 98)
    output_img, detections = run_yolo_detection(image, raw_path, prediction_path, "jpg")
    draw_hud_overlay(output_img, capture_req, geometry, f"MISSION {sector['id']}")
    save_image(output_img, annotated_path, "jpg", 98)

    enriched_detections = []
    for detection in detections:
        enriched = {
            **detection,
            "sector_id": sector["id"],
            "sector_order": sector["order"],
            "sector_center": center,
            "sector_bounds": bounds,
        }
        enriched_detections.append(enriched)

    sector_result = {
        "sector_id": sector["id"],
        "order": sector["order"],
        "row": sector["row"],
        "column": sector["column"],
        "status": "detection-positive" if detections else "complete",
        "center": center,
        "bounds": bounds,
        "heading": heading,
        "capture_url": f"/captures/missions/{req.mission_id}/{annotated_name}",
        "raw_capture_url": f"/captures/missions/{req.mission_id}/{raw_name}",
        "prediction_url": f"/captures/missions/{req.mission_id}/{prediction_name}",
        "detection_count": len(detections),
        "detections": enriched_detections,
    }

    mission["status"] = "scanning"
    mission["sector_results"] = [
        result for result in mission["sector_results"] if result["sector_id"] != sector["id"]
    ]
    mission["sector_results"].append(sector_result)
    mission["sector_results"].sort(key=lambda item: item["order"])
    mission["detections"] = [
        detection
        for result in mission["sector_results"]
        for detection in result["detections"]
    ]
    _refresh_summary(mission)
    _write_json(paths["json"], mission)
    return sector_result


def _refresh_summary(mission: dict) -> None:
    classes = Counter(detection["class_name"] for detection in mission["detections"])
    mission["summary"] = {
        "total_sectors": len(mission["plan"]["sectors"]),
        "sectors_scanned": len(mission["sector_results"]),
        "total_detections": len(mission["detections"]),
        "detections_per_class": dict(classes),
    }


def complete_mission(req: MissionCompleteRequest) -> dict:
    mission = load_mission(req.mission_id)
    paths = _mission_paths(req.mission_id)
    created_at = datetime.fromisoformat(mission["created_at"])
    completed_at = datetime.now()
    mission["completed_at"] = completed_at.isoformat(timespec="seconds")
    mission["duration_seconds"] = round((completed_at - created_at).total_seconds(), 2)
    mission["status"] = "complete"
    _refresh_summary(mission)
    _write_csv(paths["csv"], mission)
    _write_html_report(paths["html"], mission)
    _write_json(paths["json"], mission)
    return mission


def _write_csv(path: Path, mission: dict) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["sector_id", "order", "row", "column", "status", "detections", "classes", "capture_url"])
        for result in mission["sector_results"]:
            classes = Counter(d["class_name"] for d in result["detections"])
            writer.writerow([
                result["sector_id"],
                result["order"],
                result["row"],
                result["column"],
                result["status"],
                result["detection_count"],
                "; ".join(f"{name}:{count}" for name, count in classes.items()),
                result["capture_url"],
            ])


def _write_html_report(path: Path, mission: dict) -> None:
    rows = []
    for result in mission["sector_results"]:
        classes = Counter(d["class_name"] for d in result["detections"])
        class_text = ", ".join(f"{html.escape(name)}: {count}" for name, count in classes.items()) or "None"
        rows.append(
            "<tr>"
            f"<td>{html.escape(result['sector_id'])}</td>"
            f"<td>{result['order']}</td>"
            f"<td>{html.escape(result['status'])}</td>"
            f"<td>{result['detection_count']}</td>"
            f"<td>{class_text}</td>"
            f"<td><a href='{html.escape(result['capture_url'])}'>Annotated capture</a></td>"
            "</tr>"
        )
    summary = mission["summary"]
    class_summary = ", ".join(f"{html.escape(name)}: {count}" for name, count in summary["detections_per_class"].items()) or "None"
    document = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Mission Report {html.escape(mission['mission_id'])}</title>
  <style>
    body {{ font-family: Arial, sans-serif; margin: 32px; color: #10231f; }}
    table {{ border-collapse: collapse; width: 100%; }}
    th, td {{ border: 1px solid #b8ccc6; padding: 8px; text-align: left; }}
    th {{ background: #eaf6f2; }}
  </style>
</head>
<body>
  <h1>Mission Report</h1>
  <p><strong>Mission ID:</strong> {html.escape(mission['mission_id'])}</p>
  <p><strong>Status:</strong> {html.escape(mission['status'])}</p>
  <p><strong>Duration:</strong> {mission['duration_seconds']} seconds</p>
  <p><strong>Sectors scanned:</strong> {summary['sectors_scanned']} / {summary['total_sectors']}</p>
  <p><strong>Total detections:</strong> {summary['total_detections']}</p>
  <p><strong>Detections per class:</strong> {class_summary}</p>
  <h2>Sector Results</h2>
  <table>
    <thead><tr><th>Sector</th><th>Order</th><th>Status</th><th>Detections</th><th>Classes</th><th>Capture</th></tr></thead>
    <tbody>{''.join(rows)}</tbody>
  </table>
</body>
</html>"""
    path.write_text(document, encoding="utf-8")
