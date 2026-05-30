import json
import math
from datetime import datetime
from pathlib import Path

import cv2
from PIL import Image, ImageDraw

from backend.core.config import (
    CAPTURE_MAX_HEIGHT,
    CAPTURE_MAX_WIDTH,
    CAPTURE_TILE_ZOOM,
    CV2_JPEG_QUALITY_HIGH,
    DEBUG_CAPTURE_PATH,
    DEBUG_CAPTURE_PNG_PATH,
    DEBUG_CAPTURE_SOURCE_INFO_PATH,
    DEBUG_PREDICTION_PATH,
    DEBUG_PREDICTION_PNG_PATH,
    FALLBACK_VISIBLE_HEIGHT,
    FALLBACK_VISIBLE_WIDTH,
    JPEG_QUALITY_STANDARD,
    PNG_COMPRESSION,
    TILE_SIZE,
)
from backend.core.schemas import CaptureRequest
from backend.services.tiles import tile_image
from backend.utils.geo import clamp_lat, lonlat_to_pixel, pixel_to_lonlat


def capture_geometry(req: CaptureRequest) -> dict:
    width = int(max(320, min(req.width, CAPTURE_MAX_WIDTH)))
    height = int(max(240, min(req.height, CAPTURE_MAX_HEIGHT)))
    visible_z = int(max(1, min(req.zoom, 20)))
    requested_capture_z = req.capture_tile_zoom if req.capture_tile_zoom is not None else CAPTURE_TILE_ZOOM
    z = int(max(1, min(requested_capture_z if req.draw_hud else visible_z, 20)))

    has_bounds = all(v is not None for v in [req.north, req.south, req.east, req.west])
    if has_bounds:
        north = clamp_lat(float(req.north))
        south = clamp_lat(float(req.south))
        east = float(req.east)
        west = float(req.west)
        left_px, top_px = lonlat_to_pixel(north, west, z)
        right_px, bottom_px = lonlat_to_pixel(south, east, z)
        if right_px < left_px:
            left_px, right_px = right_px, left_px
        if bottom_px < top_px:
            top_px, bottom_px = bottom_px, top_px
        center_x, center_y = lonlat_to_pixel(req.lat, req.lon, z)
    else:
        visible_center_x, visible_center_y = lonlat_to_pixel(req.lat, req.lon, visible_z)
        visible_width = min(width, FALLBACK_VISIBLE_WIDTH) if req.draw_hud else width
        visible_height = min(height, FALLBACK_VISIBLE_HEIGHT) if req.draw_hud else height
        visible_left_px = visible_center_x - visible_width / 2
        visible_top_px = visible_center_y - visible_height / 2
        visible_right_px = visible_center_x + visible_width / 2
        visible_bottom_px = visible_center_y + visible_height / 2
        north, west = pixel_to_lonlat(visible_left_px, visible_top_px, visible_z)
        _, east = pixel_to_lonlat(visible_right_px, visible_top_px, visible_z)
        south, _ = pixel_to_lonlat(visible_left_px, visible_bottom_px, visible_z)
        left_px, top_px = lonlat_to_pixel(north, west, z)
        right_px, bottom_px = lonlat_to_pixel(south, east, z)
        center_x, center_y = lonlat_to_pixel(req.lat, req.lon, z)

    latlon_polygon = [
        [north, west],
        [north, east],
        [south, east],
        [south, west],
        [north, west],
    ]

    return {
        "width": width,
        "height": height,
        "zoom": z,
        "visible_camera_zoom": visible_z,
        "capture_tile_zoom": z,
        "camera_zoom": req.camera_zoom if req.camera_zoom is not None else req.zoom,
        "effective_zoom": req.effective_zoom if req.effective_zoom is not None else req.zoom,
        "used_frontend_bounds": has_bounds,
        "center_pixel": [center_x, center_y],
        "pixel_bounds": {"left": left_px, "top": top_px, "right": right_px, "bottom": bottom_px},
        "map_bounds": {
            "north": north,
            "south": south,
            "east": east,
            "west": west,
            "north_west": [north, west],
            "north_east": [north, east],
            "south_east": [south, east],
            "south_west": [south, west],
        },
        "footprint_polygon": latlon_polygon,
        "geojson_polygon": [[lon, lat] for lat, lon in latlon_polygon],
    }


def make_camera_capture(req: CaptureRequest) -> tuple[Image.Image, dict]:
    geometry = capture_geometry(req)
    width = geometry["width"]
    height = geometry["height"]
    z = geometry["zoom"]
    left_px = geometry["pixel_bounds"]["left"]
    top_px = geometry["pixel_bounds"]["top"]
    right_px = geometry["pixel_bounds"]["right"]
    bottom_px = geometry["pixel_bounds"]["bottom"]

    start_tx = math.floor(left_px / TILE_SIZE)
    end_tx = math.floor((right_px - 1) / TILE_SIZE)
    start_ty = math.floor(top_px / TILE_SIZE)
    end_ty = math.floor((bottom_px - 1) / TILE_SIZE)

    stitched_w = (end_tx - start_tx + 1) * TILE_SIZE
    stitched_h = (end_ty - start_ty + 1) * TILE_SIZE
    stitched = Image.new("RGB", (stitched_w, stitched_h), (8, 13, 28))

    for tx in range(start_tx, end_tx + 1):
        for ty in range(start_ty, end_ty + 1):
            img = tile_image(z, tx, ty)
            ox = (tx - start_tx) * TILE_SIZE
            oy = (ty - start_ty) * TILE_SIZE
            stitched.paste(img, (ox, oy))

    crop_left = int(round(left_px - start_tx * TILE_SIZE))
    crop_top = int(round(top_px - start_ty * TILE_SIZE))
    crop_right = int(round(right_px - start_tx * TILE_SIZE))
    crop_bottom = int(round(bottom_px - start_ty * TILE_SIZE))
    crop = stitched.crop((crop_left, crop_top, crop_right, crop_bottom))
    if crop.size != (width, height):
        crop = crop.resize((width, height), Image.Resampling.LANCZOS)

    return crop, geometry


def draw_hud_overlay(img: Image.Image, req: CaptureRequest, geometry: dict, format_name: str) -> None:
    draw = ImageDraw.Draw(img)
    w, h = img.size
    green = (110, 255, 190)
    dark = (0, 20, 25)

    draw.rectangle((0, 0, w - 1, h - 1), outline=green, width=2)
    bracket = 60
    for x0, y0, dx, dy in [
        (12, 12, bracket, 0),
        (12, 12, 0, bracket),
        (w - 12, 12, -bracket, 0),
        (w - 12, 12, 0, bracket),
        (12, h - 12, bracket, 0),
        (12, h - 12, 0, -bracket),
        (w - 12, h - 12, -bracket, 0),
        (w - 12, h - 12, 0, -bracket),
    ]:
        draw.line((x0, y0, x0 + dx, y0 + dy), fill=green, width=3)

    cx, cy = w // 2, h // 2
    draw.line((cx - 55, cy, cx - 12, cy), fill=green, width=2)
    draw.line((cx + 12, cy, cx + 55, cy), fill=green, width=2)
    draw.line((cx, cy - 55, cx, cy - 12), fill=green, width=2)
    draw.line((cx, cy + 12, cx, cy + 55), fill=green, width=2)
    draw.ellipse((cx - 8, cy - 8, cx + 8, cy + 8), outline=green, width=2)

    draw.rectangle((12, 12, 450, 132), fill=dark, outline=green, width=1)
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    lines = [
        "UAV CAMERA CAPTURE",
        f"LAT {req.lat:.6f}   LON {req.lon:.6f}",
        f"ALT {req.altitude:.0f} m   HDG {req.heading:.0f}Â°   ZOOM {req.zoom}",
        f"CAMERA ZOOM {geometry['effective_zoom']:.2f}   CAPTURE TILE ZOOM {geometry['capture_tile_zoom']}",
        f"FORMAT {format_name}",
        timestamp,
    ]
    y = 20
    for line in lines:
        draw.text((22, y), line, fill=green)
        y += 22


def normalise_image_format(value: str) -> str:
    image_format = str(value or "jpg").lower().strip()
    if image_format in {"png", "image/png"}:
        return "png"
    return "jpg"


def jpeg_quality_from_request(req: CaptureRequest) -> int:
    quality = float(req.jpeg_quality or 0.95)
    if quality <= 1:
        quality *= 100
    return int(max(JPEG_QUALITY_STANDARD, min(100, round(quality))))


def format_label(image_format: str, jpeg_quality: int) -> str:
    if image_format == "png":
        return "PNG Lossless"
    if jpeg_quality >= 96:
        return "High Quality JPG"
    return "Standard JPG"


def debug_capture_path_for_format(image_format: str) -> Path:
    return DEBUG_CAPTURE_PNG_PATH if image_format == "png" else DEBUG_CAPTURE_PATH


def debug_prediction_path_for_format(image_format: str) -> Path:
    return DEBUG_PREDICTION_PNG_PATH if image_format == "png" else DEBUG_PREDICTION_PATH


def save_image(img: Image.Image, path: Path, image_format: str, jpeg_quality: int) -> None:
    if image_format == "png":
        img.save(path, format="PNG", compress_level=PNG_COMPRESSION)
    else:
        img.save(path, format="JPEG", quality=jpeg_quality, subsampling=0)


def cv2_write_image(path: Path, image, image_format: str) -> None:
    if image_format == "png":
        cv2.imwrite(str(path), image, [cv2.IMWRITE_PNG_COMPRESSION, PNG_COMPRESSION])
    else:
        cv2.imwrite(str(path), image, [cv2.IMWRITE_JPEG_QUALITY, CV2_JPEG_QUALITY_HIGH])


def save_debug_capture(img: Image.Image, image_format: str, jpeg_quality: int) -> Path:
    path = debug_capture_path_for_format(image_format)
    save_image(img, path, image_format, jpeg_quality)
    return path


def save_capture_source_info(req: CaptureRequest, geometry: dict, image_format: str, jpeg_quality: int) -> Path:
    source_info = {
        "capture_width": geometry["width"],
        "capture_height": geometry["height"],
        "capture_tile_zoom": geometry["capture_tile_zoom"],
        "visible_camera_zoom": geometry["visible_camera_zoom"],
        "effective_zoom": geometry["effective_zoom"],
        "altitude": req.altitude,
        "centre_lat": req.lat,
        "centre_lng": req.lon,
        "image_format": image_format,
        "jpeg_quality": jpeg_quality if image_format == "jpg" else None,
        "used_frontend_bounds": geometry["used_frontend_bounds"],
        "map_bounds": geometry["map_bounds"],
        "pixel_bounds_used_for_capture": geometry["pixel_bounds"],
    }
    with DEBUG_CAPTURE_SOURCE_INFO_PATH.open("w", encoding="utf-8") as f:
        json.dump(source_info, f, indent=2)
    return DEBUG_CAPTURE_SOURCE_INFO_PATH
