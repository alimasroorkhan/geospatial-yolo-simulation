import json

from PIL import Image

from backend.core.config import SURVEY_GEOJSON_PATH


def classify_land_use_placeholder(img: Image.Image) -> list[dict]:
    _ = img
    return []


def read_survey_geojson() -> dict:
    if not SURVEY_GEOJSON_PATH.exists():
        return {"type": "FeatureCollection", "features": []}

    try:
        with SURVEY_GEOJSON_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return {"type": "FeatureCollection", "features": []}

    if data.get("type") != "FeatureCollection" or not isinstance(data.get("features"), list):
        return {"type": "FeatureCollection", "features": []}
    return data


def append_survey_feature(metadata: dict) -> None:
    survey = read_survey_geojson()
    feature = {
        "type": "Feature",
        "properties": {
            "timestamp": metadata["timestamp"],
            "raw_image": metadata["raw_image"],
            "output_image": metadata["output_image"],
            "class": "captured_area",
            "altitude": metadata["altitude"],
            "heading": metadata["heading"],
            "detection_count": metadata["detection_count"],
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [metadata["geojson_footprint_coordinates"]],
        },
    }
    survey["features"].append(feature)
    with SURVEY_GEOJSON_PATH.open("w", encoding="utf-8") as f:
        json.dump(survey, f, indent=2)
