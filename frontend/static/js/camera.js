(function () {
  function missionPayloadForSector(app, sector) {
    const payload = app.getCameraRequestPayload(true);
    payload.lat = sector.center.lat;
    payload.lon = sector.center.lon;
    payload.north = sector.bounds.north;
    payload.south = sector.bounds.south;
    payload.east = sector.bounds.east;
    payload.west = sector.bounds.west;
    return payload;
  }

  window.UavCamera = {
    missionPayloadForSector,
  };
}());
