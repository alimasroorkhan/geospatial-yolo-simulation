(function () {
  function boundsToPayload(bounds) {
    return {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
    };
  }

  function sectorLatLngBounds(sector) {
    return L.latLngBounds(
      [sector.bounds.south, sector.bounds.west],
      [sector.bounds.north, sector.bounds.east],
    );
  }

  function centerLatLng(center) {
    return [center.lat, center.lon];
  }

  window.UavMap = {
    boundsToPayload,
    sectorLatLngBounds,
    centerLatLng,
  };
}());
