from pathlib import Path

from PIL import Image, ImageDraw

from backend.core.config import DEBUG_PREDICTION_PATH, YOLO_CONFIDENCE, YOLO_IMAGE_SIZE, YOLO_MODEL_PATH
from backend.services.capture_service import cv2_write_image

try:
    from ultralytics import YOLO
except Exception:
    YOLO = None

_yolo_model = None


def get_yolo_model():
    global _yolo_model

    if not YOLO_MODEL_PATH.exists():
        return None

    if YOLO is None:
        raise RuntimeError(
            "YOLO model found, but the ultralytics package is not installed. "
            "Run: .\\.venv\\Scripts\\python.exe -m pip install ultralytics"
        )

    if _yolo_model is None:
        _yolo_model = YOLO(str(YOLO_MODEL_PATH))
    return _yolo_model


def _tensor_to_list(value) -> list:
    if value is None:
        return []
    if hasattr(value, "detach"):
        value = value.detach()
    if hasattr(value, "cpu"):
        value = value.cpu()
    if hasattr(value, "tolist"):
        return value.tolist()
    return list(value)


def _normalise_obb_polygon(points) -> list[list[float]]:
    if len(points) == 4 and all(isinstance(point, (list, tuple)) for point in points):
        return [[float(point[0]), float(point[1])] for point in points]
    flat = [float(value) for value in points]
    return [[flat[i], flat[i + 1]] for i in range(0, min(len(flat), 8), 2)]


def run_yolo_detection(
    img: Image.Image,
    image_path: Path,
    debug_prediction_path: Path = DEBUG_PREDICTION_PATH,
    image_format: str = "jpg",
) -> tuple[Image.Image, list[dict]]:
    model = get_yolo_model()
    detections: list[dict] = []

    if model is None:
        print(f"[YOLO OBB] Model not found: {YOLO_MODEL_PATH}")
        return img, detections

    results = model.predict(
        source=str(image_path),
        conf=YOLO_CONFIDENCE,
        imgsz=YOLO_IMAGE_SIZE,
        save=False,
    )

    if not results:
        print(f"[YOLO OBB] No prediction results returned for {image_path}")
        return img, detections

    result = results[0]
    names = result.names if hasattr(result, "names") else {}
    draw = ImageDraw.Draw(img)
    obb = getattr(result, "obb", None)

    try:
        annotated = result.plot()
        cv2_write_image(debug_prediction_path, annotated, image_format)
    except Exception as exc:
        print(f"[YOLO OBB] Failed to save annotated prediction: {exc}")

    if obb is None or obb.cls is None or len(obb.cls) == 0:
        print(f"[YOLO OBB] captured image path: {image_path}")
        print(f"[YOLO OBB] captured image size: {img.width}x{img.height}")
        print(f"[YOLO OBB] model path: {YOLO_MODEL_PATH}")
        print("[YOLO OBB] number of OBB detections: 0")
        return img, detections

    class_ids = [int(cls_id) for cls_id in _tensor_to_list(obb.cls)]
    confidences = [float(conf) for conf in _tensor_to_list(obb.conf)]
    polygons = [_normalise_obb_polygon(points) for points in _tensor_to_list(obb.xyxyxyxy)]

    print(f"[YOLO OBB] captured image path: {image_path}")
    print(f"[YOLO OBB] captured image size: {img.width}x{img.height}")
    print(f"[YOLO OBB] model path: {YOLO_MODEL_PATH}")
    print(f"[YOLO OBB] number of OBB detections: {len(polygons)}")

    for cls_id, conf, polygon in zip(class_ids, confidences, polygons):
        class_name = names.get(cls_id, str(cls_id)) if isinstance(names, dict) else str(cls_id)
        print(f"[YOLO OBB] detection: {class_name} {conf:.4f}")

        detections.append(
            {
                "class_name": class_name,
                "confidence": round(conf, 4),
                "polygon": [[round(x, 2), round(y, 2)] for x, y in polygon],
            }
        )

        closed_polygon = [(x, y) for x, y in polygon]
        if len(closed_polygon) >= 3:
            draw.line(closed_polygon + [closed_polygon[0]], fill=(80, 255, 170), width=3)

        text = f"{class_name} {conf:.2f}"
        label_x = min(x for x, _ in polygon)
        label_y = max(0, min(y for _, y in polygon) - 18)
        text_box = draw.textbbox((label_x, label_y), text)
        draw.rectangle(text_box, fill=(0, 30, 22))
        draw.text((label_x, label_y), text, fill=(130, 255, 200))

    return img, detections
