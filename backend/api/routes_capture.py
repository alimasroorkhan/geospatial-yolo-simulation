from datetime import datetime

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from backend.core.config import (
    CAPTURES_DIR,
    DEBUG_LIVE_FRAME_PATH,
    DEBUG_LIVE_PREDICTION_PATH,
    LIVE_CAPTURES_DIR,
    LIVE_JPEG_QUALITY,
)
from backend.core.schemas import CaptureRequest
from backend.services.capture_service import (
    debug_prediction_path_for_format,
    draw_hud_overlay,
    format_label,
    jpeg_quality_from_request,
    make_camera_capture,
    normalise_image_format,
    save_capture_source_info,
    save_debug_capture,
    save_image,
)
from backend.services.detection import run_yolo_detection
from backend.services.survey import classify_land_use_placeholder

router = APIRouter()


@router.post("/api/capture")
def capture(req: CaptureRequest, request: Request) -> JSONResponse:
    _ = request
    try:
        img, geometry = make_camera_capture(req)
        image_format = normalise_image_format(req.image_format)
        jpeg_quality = jpeg_quality_from_request(req)
        extension = "png" if image_format == "png" else "jpg"
        media_type = "image/png" if image_format == "png" else "image/jpeg"
        label = format_label(image_format, jpeg_quality)
        debug_prediction_path = debug_prediction_path_for_format(image_format)
        ts_dt = datetime.now()
        timestamp = ts_dt.isoformat(timespec="milliseconds")
        ts = ts_dt.strftime("%Y%m%d_%H%M%S_%f")[:-3]

        filename = f"uav_camera_{ts}.{extension}"
        path = CAPTURES_DIR / filename

        debug_capture_path = save_debug_capture(img, image_format, jpeg_quality)
        source_info_path = save_capture_source_info(req, geometry, image_format, jpeg_quality)
        print(f"[YOLO OBB] saved captured image before detection: {debug_capture_path}")

        output_img, detections = run_yolo_detection(
            img,
            debug_capture_path,
            debug_prediction_path,
            image_format,
        )
        if req.draw_hud:
            draw_hud_overlay(output_img, req, geometry, label)

        classify_land_use_placeholder(output_img)
        save_image(output_img, path, image_format, jpeg_quality)
        url = f"/captures/{filename}"
        return JSONResponse(
            {
                "ok": True,
                "timestamp": timestamp,
                "filename": filename,
                "url": url,
                "saved_path": str(path),
                "output_filename": filename,
                "output_url": url,
                "cameraZoom": geometry["camera_zoom"],
                "effective_zoom": geometry["effective_zoom"],
                "tile_zoom_level": geometry["zoom"],
                "width": geometry["width"],
                "height": geometry["height"],
                "image_format": image_format,
                "media_type": media_type,
                "jpeg_quality": jpeg_quality if image_format == "jpg" else None,
                "format_label": label,
                "detections": detections,
                "detection_count": len(detections),
                "debug_capture_path": str(debug_capture_path),
                "debug_prediction_path": str(debug_prediction_path),
                "debug_source_info_path": str(source_info_path),
                "message": f"Camera {label} saved successfully.",
            }
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Capture failed: {exc}")


@router.post("/api/live-detect")
def live_detect(req: CaptureRequest, request: Request) -> JSONResponse:
    _ = request
    try:
        img, _geometry = make_camera_capture(req)
        save_image(img, DEBUG_LIVE_FRAME_PATH, "jpg", LIVE_JPEG_QUALITY)
        debug_capture_path = DEBUG_LIVE_FRAME_PATH
        print(f"[YOLO OBB] saved live-detect image before detection: {debug_capture_path}")
        print(f"[LIVE DETECT] latest live frame: {DEBUG_LIVE_FRAME_PATH}")

        img, detections = run_yolo_detection(img, debug_capture_path, DEBUG_LIVE_PREDICTION_PATH, "jpg")
        save_image(img, DEBUG_LIVE_PREDICTION_PATH, "jpg", LIVE_JPEG_QUALITY)
        print(f"[LIVE DETECT] latest live prediction: {DEBUG_LIVE_PREDICTION_PATH}")

        filename = "latest_live_detection.jpg"
        path = LIVE_CAPTURES_DIR / filename
        save_image(img, path, "jpg", LIVE_JPEG_QUALITY)
        url = f"/captures/live/{filename}"

        return JSONResponse(
            {
                "ok": True,
                "preview_url": url,
                "detections": detections,
                "detection_count": len(detections),
                "debug_capture_path": str(DEBUG_LIVE_FRAME_PATH),
                "debug_prediction_path": str(DEBUG_LIVE_PREDICTION_PATH),
                "debug_live_frame_path": str(DEBUG_LIVE_FRAME_PATH),
                "debug_live_prediction_path": str(DEBUG_LIVE_PREDICTION_PATH),
                "message": "Live detection preview updated.",
            }
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Live detection failed: {exc}")
