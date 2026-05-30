import csv
import json
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from backend.core.config import MISSION_CAPTURES_DIR
from backend.core.schemas import CaptureRequest
from backend.core.schemas import MissionCompleteRequest, MissionCreateRequest, MissionPlanRequest, MissionSectorScanRequest
from backend.services.capture_service import draw_hud_overlay, make_camera_capture, save_image
from backend.services.detection import run_yolo_detection
from backend.services.mission_service import complete_mission, create_mission, generate_sector_grid, scan_sector

router = APIRouter()
MISSION_CLASSES = ["airplane", "airport", "storage_tank"]


@router.post("/api/mission/plan")
def plan_mission(req: MissionPlanRequest) -> JSONResponse:
    try:
        return JSONResponse({"ok": True, "plan": generate_sector_grid(req)})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Mission planning failed: {exc}")


@router.post("/api/mission/create")
def create_mission_session(req: MissionCreateRequest) -> JSONResponse:
    try:
        return JSONResponse({"ok": True, "mission": create_mission(req)})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Mission creation failed: {exc}")


@router.post("/api/mission/scan-sector")
def scan_mission_sector(req: MissionSectorScanRequest) -> JSONResponse:
    try:
        return JSONResponse({"ok": True, "result": scan_sector(req)})
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Sector scan failed: {exc}")


@router.post("/api/mission/complete")
def complete_mission_session(req: MissionCompleteRequest) -> JSONResponse:
    try:
        return JSONResponse({"ok": True, "mission": complete_mission(req)})
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Mission completion failed: {exc}")


@router.post("/api/mission-scan-sector")
async def mission_scan_sector(request: Request) -> JSONResponse:
    try:
        payload = await request.json()
        mission_id = str(payload.get("mission_id") or datetime.now().strftime("mission_%Y%m%d_%H%M%S"))
        sector_id = str(payload.get("sector_id") or "A1")
        mission_dir = MISSION_CAPTURES_DIR / mission_id
        raw_dir = mission_dir / "raw"
        prediction_dir = mission_dir / "predictions"
        metadata_dir = mission_dir / "metadata"
        raw_dir.mkdir(parents=True, exist_ok=True)
        prediction_dir.mkdir(parents=True, exist_ok=True)
        metadata_dir.mkdir(parents=True, exist_ok=True)

        image_format = str(payload.get("image_format") or "jpg").lower()
        extension = "png" if image_format == "png" else "jpg"
        jpeg_quality = float(payload.get("jpeg_quality") or 0.98)
        raw_path = raw_dir / f"sector_{sector_id}.{extension}"
        prediction_path = prediction_dir / f"sector_{sector_id}_pred.{extension}"
        metadata_path = metadata_dir / f"sector_{sector_id}.json"

        req = CaptureRequest(
            lat=float(payload["lat"]),
            lon=float(payload["lon"]),
            zoom=int(round(float(payload.get("capture_tile_zoom") or 18))),
            camera_zoom=float(payload.get("camera_zoom") or payload.get("capture_tile_zoom") or 18),
            effective_zoom=float(payload.get("effective_zoom") or payload.get("capture_tile_zoom") or 18),
            capture_tile_zoom=int(payload.get("capture_tile_zoom") or 18),
            altitude=float(payload.get("altitude") or 500),
            heading=float(payload.get("heading") or 0),
            width=int(payload.get("width") or 900),
            height=int(payload.get("height") or 620),
            jpeg_quality=jpeg_quality,
            image_format=image_format,
            mime_type="image/png" if extension == "png" else "image/jpeg",
            draw_hud=bool(payload.get("draw_hud", True)),
            north=float(payload["north"]),
            south=float(payload["south"]),
            east=float(payload["east"]),
            west=float(payload["west"]),
        )

        image, geometry = make_camera_capture(req)
        quality_int = int(max(90, min(100, round(jpeg_quality * 100 if jpeg_quality <= 1 else jpeg_quality))))
        save_image(image, raw_path, extension, quality_int)
        output_img, detections = run_yolo_detection(image, raw_path, prediction_path, extension)
        if req.draw_hud:
            draw_hud_overlay(output_img, req, geometry, f"MISSION {sector_id}")
        save_image(output_img, prediction_path, extension, quality_int)

        class_counts = {name: 0 for name in MISSION_CLASSES}
        confidence_total = 0.0
        for detection in detections:
            class_name = detection.get("class_name")
            if class_name in class_counts:
                class_counts[class_name] += 1
            confidence_total += float(detection.get("confidence") or 0)
        detection_count = len(detections)
        average_confidence = round(confidence_total / detection_count, 4) if detection_count else 0

        raw_url = f"/captures/missions/{mission_id}/raw/{raw_path.name}"
        prediction_url = f"/captures/missions/{mission_id}/predictions/{prediction_path.name}"
        metadata = {
            "mission_id": mission_id,
            "sector_id": sector_id,
            "target_name": payload.get("target_name"),
            "mission_type": payload.get("mission_type"),
            "timestamp": datetime.now().isoformat(timespec="seconds"),
            "centre_lat": req.lat,
            "centre_lng": req.lon,
            "north": req.north,
            "south": req.south,
            "east": req.east,
            "west": req.west,
            "altitude": req.altitude,
            "heading": req.heading,
            "capture_tile_zoom": req.capture_tile_zoom,
            "width": req.width,
            "height": req.height,
            "image_format": extension,
            "jpeg_quality": jpeg_quality,
            "detections": detections,
            "detection_count": detection_count,
            "class_counts": class_counts,
            "average_confidence": average_confidence,
            "raw_image_path": str(raw_path),
            "prediction_image_path": str(prediction_path),
            "raw_image_url": raw_url,
            "prediction_image_url": prediction_url,
            "overlap_percent": payload.get("overlap_percent"),
            "scan_area_width_km": payload.get("scan_area_width_km"),
            "scan_area_height_km": payload.get("scan_area_height_km"),
            "grid_rows": payload.get("grid_rows"),
            "grid_columns": payload.get("grid_columns"),
            "scan_quality": payload.get("scan_quality"),
            "capture_format": payload.get("capture_format"),
        }
        metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        _write_mission_summaries(mission_dir, metadata)

        return JSONResponse({
            "ok": True,
            "mission_id": mission_id,
            "sector_id": sector_id,
            "raw_url": raw_url,
            "prediction_url": prediction_url,
            "detections": detections,
            "detection_count": detection_count,
            "class_counts": class_counts,
            "average_confidence": average_confidence,
            "metadata_path": str(metadata_path),
            "message": f"Sector {sector_id} scanned successfully.",
        })
    except Exception as exc:
        return JSONResponse({"ok": False, "message": f"Mission sector scan failed: {exc}"}, status_code=500)


def _write_mission_summaries(mission_dir: Path, latest_metadata: dict) -> None:
    metadata_dir = mission_dir / "metadata"
    records = []
    for path in sorted(metadata_dir.glob("sector_*.json")):
        try:
            records.append(json.loads(path.read_text(encoding="utf-8")))
        except Exception:
            continue
    summary_path = mission_dir / "mission_summary.json"
    csv_path = mission_dir / "mission_summary.csv"
    totals = {name: sum(int(record.get("class_counts", {}).get(name, 0) or 0) for record in records) for name in MISSION_CLASSES}
    total_detections = sum(int(record.get("detection_count", 0) or 0) for record in records)
    summary_path.write_text(json.dumps({
        "mission_id": latest_metadata["mission_id"],
        "target_name": latest_metadata.get("target_name"),
        "mission_type": latest_metadata.get("mission_type"),
        "scan_area_width_km": latest_metadata.get("scan_area_width_km"),
        "scan_area_height_km": latest_metadata.get("scan_area_height_km"),
        "grid_rows": latest_metadata.get("grid_rows"),
        "grid_columns": latest_metadata.get("grid_columns"),
        "overlap_percent": latest_metadata.get("overlap_percent"),
        "scan_quality": latest_metadata.get("scan_quality"),
        "capture_format": latest_metadata.get("capture_format"),
        "summary": {
            "total_detections": total_detections,
            "airplane_count": totals["airplane"],
            "airport_count": totals["airport"],
            "storage_tank_count": totals["storage_tank"],
        },
        "sectors": records,
    }, indent=2), encoding="utf-8")
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "mission_id", "sector_id", "status", "centre_lat", "centre_lng", "north", "south",
            "east", "west", "aircraft_count", "airport_count", "storage_tank_count",
            "total_detections", "average_confidence", "prediction_url",
        ])
        for record in records:
            counts = record.get("class_counts", {})
            writer.writerow([
                record.get("mission_id"),
                record.get("sector_id"),
                "Complete" if int(record.get("detection_count", 0) or 0) >= 0 else "Failed",
                record.get("centre_lat"),
                record.get("centre_lng"),
                record.get("north"),
                record.get("south"),
                record.get("east"),
                record.get("west"),
                counts.get("airplane", 0),
                counts.get("airport", 0),
                counts.get("storage_tank", 0),
                record.get("detection_count"),
                record.get("average_confidence"),
                record.get("prediction_image_url"),
            ])
