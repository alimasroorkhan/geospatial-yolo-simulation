import io

import requests
from PIL import Image, ImageDraw

from backend.core.config import ESRI_TILE_URL, HEADERS, TILE_CACHE_DIR, TILE_SIZE


def blank_tile(message: str = "NO TILE") -> bytes:
    img = Image.new("RGB", (TILE_SIZE, TILE_SIZE), (8, 13, 28))
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, TILE_SIZE - 1, TILE_SIZE - 1), outline=(30, 220, 170))
    draw.text((20, 116), message, fill=(120, 255, 200))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80)
    return buf.getvalue()


def fetch_tile(z: int, x: int, y: int) -> bytes:
    max_tile = 2 ** z
    x = x % max_tile
    if y < 0 or y >= max_tile:
        return blank_tile("OUT OF RANGE")

    cache_path = TILE_CACHE_DIR / str(z) / str(x) / f"{y}.jpg"
    if cache_path.exists() and cache_path.stat().st_size > 0:
        return cache_path.read_bytes()

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    url = ESRI_TILE_URL.format(z=z, x=x, y=y)
    try:
        r = requests.get(url, timeout=12, headers=HEADERS)
        r.raise_for_status()
        data = r.content
        Image.open(io.BytesIO(data)).convert("RGB")
        cache_path.write_bytes(data)
        return data
    except Exception:
        return blank_tile("NO TILE")


def tile_image(z: int, x: int, y: int) -> Image.Image:
    data = fetch_tile(z, x, y)
    try:
        return Image.open(io.BytesIO(data)).convert("RGB")
    except Exception:
        return Image.open(io.BytesIO(blank_tile("BAD TILE"))).convert("RGB")
