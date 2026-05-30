from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from backend.services.tiles import fetch_tile

router = APIRouter()


@router.get("/api/tile/{z}/{x}/{y}.jpg")
def tile(z: int, x: int, y: int) -> Response:
    if z < 0 or z > 21:
        raise HTTPException(status_code=400, detail="Invalid zoom level")
    data = fetch_tile(z, x, y)
    return Response(
        content=data,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )
