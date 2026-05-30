import math

from backend.core.config import TILE_SIZE


def clamp_lat(lat: float) -> float:
    return max(min(lat, 85.05112878), -85.05112878)


def lonlat_to_pixel(lat: float, lon: float, z: int) -> tuple[float, float]:
    lat = clamp_lat(lat)
    sin_lat = math.sin(math.radians(lat))
    world_size = TILE_SIZE * (2 ** z)
    x = (lon + 180.0) / 360.0 * world_size
    y = (0.5 - math.log((1 + sin_lat) / (1 - sin_lat)) / (4 * math.pi)) * world_size
    return x, y


def pixel_to_lonlat(x: float, y: float, z: int) -> tuple[float, float]:
    world_size = TILE_SIZE * (2 ** z)
    lon = x / world_size * 360.0 - 180.0
    n = math.pi - 2.0 * math.pi * y / world_size
    lat = math.degrees(math.atan(math.sinh(n)))
    return clamp_lat(lat), lon
