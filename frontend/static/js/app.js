const DEFAULT_LAT = 33.5607;
const DEFAULT_LNG = 72.8516;
const DEFAULT_ZOOM = 15;
const DEFAULT_ALTITUDE = 500;
const DEFAULT_CAMERA_ZOOM = 18;
const NORMAL_SPEED = 35; // m/s
const BOOST_MULTIPLIER = 4;
const ALTITUDE_STEP = 50;
const FOLLOW_PAN_INTERVAL_MS = 220;
const FOLLOW_DISTANCE_THRESHOLD_M = 35;
const UI_UPDATE_INTERVAL_MS = 120;
const CAMERA_UPDATE_INTERVAL_MS = 120;

const TELEPORT_TARGETS = [
  { name: 'Islamabad International Airport', lat: 33.554250, lng: 72.830417 },
  { name: 'Fateh Jhang Airfield', lat: 33.548361, lng: 72.631722 },
  { name: 'Attock Fuel Storage Site', lat: 33.551139, lng: 73.073389 },
  { name: 'Nur Khan Base', lat: 33.609861, lng: 73.101667 },
];

const state = {
  lat: DEFAULT_LAT,
  lon: DEFAULT_LNG,
  altitude: DEFAULT_ALTITUDE,
  heading: 30,
  speed: 0,
  hold: true,
  cameraZoom: DEFAULT_CAMERA_ZOOM,
  path: [],
  keys: new Set(),
  lastTime: performance.now(),
  lastPathLat: DEFAULT_LAT,
  lastPathLon: DEFAULT_LNG,
  capturing: false,
  liveDetection: false,
  liveDetecting: false,
  livePreviewOpen: false,
  latestLivePreviewUrl: '',
  followDrone: true,
  lastFollowPanTime: 0,
  lastUiUpdateTime: 0,
  lastCameraUpdateTime: 0,
  activeSection: 'missionSection',
  mapTilesLoading: 0,
  liveDetectionTimer: null,
  liveDetectionCount: 0,
};

const CAPTURE_WIDTH = 1280;
const CAPTURE_HEIGHT = 1280;
const CAPTURE_TILE_ZOOM = 18;
const JPEG_QUALITY_STANDARD = 0.90;
const JPEG_QUALITY_HIGH = 0.98;
const LIVE_CAPTURE_WIDTH = 900;
const LIVE_CAPTURE_HEIGHT = 620;
const LIVE_JPEG_QUALITY = 0.95;
const LIVE_DETECTION_INTERVAL_MS = 2000;

const CAPTURE_QUALITY_OPTIONS = {
  'standard-jpg': {
    label: 'Standard JPG',
    buttonLabel: 'CAPTURE JPG',
    openLabel: 'Open latest JPG',
    format: 'jpg',
    mimeType: 'image/jpeg',
    quality: JPEG_QUALITY_STANDARD,
  },
  'high-jpg': {
    label: 'High Quality JPG',
    buttonLabel: 'CAPTURE JPG',
    openLabel: 'Open latest JPG',
    format: 'jpg',
    mimeType: 'image/jpeg',
    quality: JPEG_QUALITY_HIGH,
  },
  'png-lossless': {
    label: 'PNG Lossless',
    buttonLabel: 'CAPTURE PNG',
    openLabel: 'Open latest PNG',
    format: 'png',
    mimeType: 'image/png',
    quality: 1,
  },
};

const els = {
  lat: document.getElementById('latVal'),
  lon: document.getElementById('lonVal'),
  alt: document.getElementById('altVal'),
  hdg: document.getElementById('hdgVal'),
  spd: document.getElementById('spdVal'),
  liveLat: document.getElementById('liveLatVal'),
  liveLon: document.getElementById('liveLonVal'),
  liveAlt: document.getElementById('liveAltVal'),
  liveSpd: document.getElementById('liveSpdVal'),
  mode: document.getElementById('modeVal'),
  serverStatus: document.getElementById('serverStatus'),
  statusLog: document.getElementById('statusLog'),
  resetBtn: document.getElementById('resetBtn'),
  holdBtn: document.getElementById('holdBtn'),
  followBtn: document.getElementById('followBtn'),
  captureBtn: document.getElementById('captureBtn'),
  captureQuality: document.getElementById('captureQuality'),
  captureQualityStatus: document.getElementById('captureQualityStatus'),
  captureStatus: document.getElementById('captureStatus'),
  captureLink: document.getElementById('captureLink'),
  latestCapture: document.getElementById('latestCapture'),
  recenterBtn: document.getElementById('recenterBtn'),
  altitudeControl: document.getElementById('altitudeControl'),
  altitudeControlVal: document.getElementById('altitudeControlVal'),
  liveDetectBtn: document.getElementById('liveDetectBtn'),
  liveDetectStatus: document.getElementById('liveDetectStatus'),
  cameraZoom: document.getElementById('cameraZoom'),
  cameraZoomVal: document.getElementById('cameraZoomVal'),
  mapZoomIn: document.getElementById('mapZoomIn'),
  mapZoomOut: document.getElementById('mapZoomOut'),
  mapAltUp: document.getElementById('mapAltUp'),
  mapAltDown: document.getElementById('mapAltDown'),
  openLivePreviewBtn: document.getElementById('openLivePreviewBtn'),
  closeLivePreviewBtn: document.getElementById('closeLivePreviewBtn'),
  livePreviewModal: document.getElementById('livePreviewModal'),
  largeLivePreview: document.getElementById('largeLivePreview'),
  liveModePreview: document.getElementById('liveModePreview'),
  livePreviewHint: document.getElementById('livePreviewHint'),
  livePredictionFrame: document.getElementById('livePredictionFrame'),
  liveModelBadge: document.getElementById('liveModelBadge'),
  liveStateBadge: document.getElementById('liveStateBadge'),
  liveAltBadge: document.getElementById('liveAltBadge'),
  liveZoomBadge: document.getElementById('liveZoomBadge'),
  liveDetectionsBadge: document.getElementById('liveDetectionsBadge'),
  headerMenu: document.getElementById('headerMenu'),
  navTabs: document.querySelectorAll('.nav-tab'),
  sections: document.querySelectorAll('.workspace-section'),
  sharedMapDeck: document.getElementById('sharedMapDeck'),
  captureMapMount: document.getElementById('captureMapMount'),
  liveMapMount: document.getElementById('liveMapMount'),
  missionMapMount: document.getElementById('missionMapMount'),
  cameraDeck: document.getElementById('cameraDeck'),
  captureCameraMount: document.getElementById('captureCameraMount'),
  liveCameraMount: document.getElementById('liveCameraMount'),
  missionCameraMount: document.getElementById('missionCameraMount'),
  liveFollowBtn: document.getElementById('liveFollowBtn'),
  liveRecenterBtn: document.getElementById('liveRecenterBtn'),
  liveTeleportSelect: document.getElementById('liveTeleportSelect'),
  teleportSelect: document.getElementById('teleportSelect'),
  customLat: document.getElementById('customLat'),
  customLng: document.getElementById('customLng'),
  customTeleportBtn: document.getElementById('customTeleportBtn'),
  mapLoading: document.getElementById('mapLoading'),
  modelBar: document.getElementById('modelBar'),
};

function mountDecksForSection(sectionId) {
  const mapMount = sectionId === 'liveSection'
    ? els.liveMapMount
    : sectionId === 'missionSection'
      ? els.missionMapMount
      : els.captureMapMount;
  const cameraMount = sectionId === 'missionSection'
    ? null
    : sectionId === 'liveSection'
    ? els.liveCameraMount
      : els.captureCameraMount;
  if (mapMount && els.sharedMapDeck.parentElement !== mapMount) {
    mapMount.appendChild(els.sharedMapDeck);
  }

  if (cameraMount && els.cameraDeck.parentElement !== cameraMount) {
    cameraMount.appendChild(els.cameraDeck);
  }
  if (els.cameraDeck) {
    els.cameraDeck.hidden = sectionId === 'missionSection';
    els.cameraDeck.setAttribute('aria-hidden', sectionId === 'missionSection' ? 'true' : 'false');
  }
}

mountDecksForSection(state.activeSection);
document.body.classList.add(`section-${state.activeSection}`);

function log(message) {
  const p = document.createElement('p');
  const ts = new Date().toLocaleTimeString();
  p.textContent = `[${ts}] ${message}`;
  els.statusLog.prepend(p);
  while (els.statusLog.children.length > 7) {
    els.statusLog.removeChild(els.statusLog.lastChild);
  }
}

function updateMapLoadingIndicator() {
  if (!els.mapLoading) return;
  els.mapLoading.hidden = state.mapTilesLoading <= 0;
}

function bindTileLoading(layer) {
  layer.on('loading', () => {
    state.mapTilesLoading += 1;
    updateMapLoadingIndicator();
  });
  layer.on('load', () => {
    state.mapTilesLoading = Math.max(0, state.mapTilesLoading - 1);
    updateMapLoadingIndicator();
  });
  layer.on('tileerror', () => {
    state.mapTilesLoading = Math.max(0, state.mapTilesLoading - 1);
    updateMapLoadingIndicator();
  });
}

function tileUrl() {
  return '/api/tile/{z}/{x}/{y}.jpg';
}

function getEffectiveCameraZoom() {
  const altitudeScale = Math.log2(Math.max(20, state.altitude) / DEFAULT_ALTITUDE);
  const rawZoom = Number(state.cameraZoom) - altitudeScale;
  return Math.max(15, Math.min(20, Math.round(rawZoom * 4) / 4));
}

function getCaptureQualityOption() {
  const key = els.captureQuality ? els.captureQuality.value : 'high-jpg';
  return CAPTURE_QUALITY_OPTIONS[key] || CAPTURE_QUALITY_OPTIONS['high-jpg'];
}

function updateCaptureQualityStatus() {
  const option = getCaptureQualityOption();
  const effectiveZoom = getEffectiveCameraZoom();
  if (els.captureQualityStatus) {
    els.captureQualityStatus.textContent = `Effective zoom: ${effectiveZoom.toFixed(2)} | Capture tiles: z${CAPTURE_TILE_ZOOM} | Capture size: ${CAPTURE_WIDTH} x ${CAPTURE_HEIGHT} | Format: ${option.label}`;
  }
  if (els.captureBtn && !state.capturing) {
    els.captureBtn.textContent = option.buttonLabel;
  }
}

function getTileZoomForRequest(drawHud) {
  const effectiveCameraZoom = getEffectiveCameraZoom();
  const tileZoom = drawHud ? Math.round(effectiveCameraZoom) : Math.round(effectiveCameraZoom);
  return Math.max(15, Math.min(20, tileZoom));
}

function getCameraRequestPayload(drawHud) {
  const effectiveCameraZoom = getEffectiveCameraZoom();
  const qualityOption = drawHud
    ? getCaptureQualityOption()
    : { format: 'jpg', mimeType: 'image/jpeg', quality: LIVE_JPEG_QUALITY };
  const maxCaptureWidth = drawHud ? CAPTURE_WIDTH : LIVE_CAPTURE_WIDTH;
  const maxCaptureHeight = drawHud ? CAPTURE_HEIGHT : LIVE_CAPTURE_HEIGHT;
  const payload = {
    lat: state.lat,
    lon: state.lon,
    altitude: Number(state.altitude),
    heading: state.heading,
    camera_zoom: Number(state.cameraZoom),
    effective_zoom: effectiveCameraZoom,
    capture_tile_zoom: drawHud ? CAPTURE_TILE_ZOOM : null,
    zoom: getTileZoomForRequest(drawHud),
    map_zoom: mainMap.getZoom(),
    width: maxCaptureWidth,
    height: maxCaptureHeight,
    image_format: qualityOption.format,
    mime_type: qualityOption.mimeType,
    jpeg_quality: qualityOption.quality,
    draw_hud: drawHud,
  };

  const size = cameraMap.getSize();
  if (size.x > 40 && size.y > 40) {
    const bounds = cameraMap.getBounds();
    const aspect = size.x / size.y;
    let width = maxCaptureWidth;
    let height = Math.round(width / aspect);
    if (height > maxCaptureHeight) {
      height = maxCaptureHeight;
      width = Math.round(height * aspect);
    }

    payload.width = Math.max(320, width);
    payload.height = Math.max(240, height);
    payload.north = bounds.getNorth();
    payload.south = bounds.getSouth();
    payload.east = bounds.getEast();
    payload.west = bounds.getWest();
  }

  return payload;
}

const tileOptions = {
  minZoom: 3,
  maxZoom: 20,
  tileSize: 256,
  updateWhenIdle: true,
  updateWhenZooming: false,
  keepBuffer: 4,
  attribution: 'Imagery: Esri World Imagery via local proxy',
};

const mainMap = L.map('mainMap', {
  zoomControl: false,
  attributionControl: true,
  keyboard: false,
  preferCanvas: true,
}).setView([state.lat, state.lon], DEFAULT_ZOOM);

const mainTileLayer = L.tileLayer(tileUrl(), tileOptions).addTo(mainMap);
bindTileLoading(mainTileLayer);

const cameraMap = L.map('cameraMap', {
  zoomControl: false,
  attributionControl: false,
  zoomSnap: 0.25,
  zoomDelta: 0.25,
  dragging: false,
  touchZoom: false,
  scrollWheelZoom: false,
  doubleClickZoom: false,
  boxZoom: false,
  keyboard: false,
  tap: false,
  preferCanvas: true,
}).setView([state.lat, state.lon], getEffectiveCameraZoom());

const cameraTileLayer = L.tileLayer(tileUrl(), tileOptions).addTo(cameraMap);
bindTileLoading(cameraTileLayer);

const arrowIcon = L.divIcon({
  className: 'uav-icon-wrap',
  html: '<div class="uav-arrow"></div>',
  iconSize: [32, 42],
  iconAnchor: [16, 21],
});

const droneMarker = L.marker([state.lat, state.lon], { icon: arrowIcon, interactive: false }).addTo(mainMap);
const pathLine = L.polyline([[state.lat, state.lon]], {
  color: '#6dffd2',
  weight: 2,
  opacity: 0.85,
}).addTo(mainMap);

const cameraCentre = L.circleMarker([state.lat, state.lon], {
  radius: 4,
  color: '#6dffd2',
  fillColor: '#6dffd2',
  fillOpacity: 1,
  weight: 1,
  interactive: false,
}).addTo(cameraMap);

const rendered = {
  lat: state.lat,
  lon: state.lon,
  heading: state.heading,
  cameraZoom: getEffectiveCameraZoom(),
};

function degToRad(deg) { return deg * Math.PI / 180; }
function radToDeg(rad) { return rad * 180 / Math.PI; }
function wrap360(deg) { return ((deg % 360) + 360) % 360; }

function moveByMeters(lat, lon, northM, eastM) {
  const dLat = northM / 111320;
  const dLon = eastM / (111320 * Math.cos(degToRad(lat)) || 1);
  return { lat: lat + dLat, lon: lon + dLon };
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const r = 6371000;
  const p1 = degToRad(lat1);
  const p2 = degToRad(lat2);
  const dp = degToRad(lat2 - lat1);
  const dl = degToRad(lon2 - lon1);
  const a = Math.sin(dp/2)**2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2)**2;
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function setAltitude(value) {
  const newAltitude = Number(value);
  if (!Number.isFinite(newAltitude)) return;
  state.altitude = Math.max(20, Math.min(2500, newAltitude));
  updateMaps();
  updateUI();
}

function adjustAltitude(delta) {
  setAltitude(state.altitude + Number(delta));
}

function switchSection(sectionId) {
  state.activeSection = sectionId;
  document.body.classList.remove('section-aboutSection', 'section-controlsSection', 'section-captureSection', 'section-missionSection', 'section-liveSection');
  document.body.classList.add(`section-${sectionId}`);
  mountDecksForSection(sectionId);
  els.sections.forEach((section) => {
    section.classList.toggle('active', section.id === sectionId);
  });
  els.navTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.section === sectionId);
  });

  requestAnimationFrame(() => {
    mainMap.invalidateSize();
    cameraMap.invalidateSize();
    updateMaps();
    requestAnimationFrame(() => {
      mainMap.invalidateSize();
      cameraMap.invalidateSize();
      updateMaps();
    });
  });
}

function teleportTo(lat, lng, label = 'custom target') {
  const nextLat = Number(lat);
  const nextLng = Number(lng);
  if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) {
    log('Teleport failed: invalid coordinates.');
    return;
  }

  state.lat = Math.max(-85, Math.min(85, nextLat));
  state.lon = ((nextLng + 180) % 360 + 360) % 360 - 180;
  state.path = [[state.lat, state.lon]];
  state.lastPathLat = state.lat;
  state.lastPathLon = state.lon;
  state.lastFollowPanTime = 0;
  pathLine.setLatLngs(state.path);
  rendered.lat = state.lat;
  rendered.lon = state.lon;
  droneMarker.setLatLng([state.lat, state.lon]);
  cameraCentre.setLatLng([state.lat, state.lon]);
  cameraMap.panTo([state.lat, state.lon], { animate: false });
  mainMap.panTo([state.lat, state.lon], { animate: true, duration: 0.35 });
  updateUI();
  log(`Teleported to ${label}.`);
}

function populateTeleportTargets() {
  [els.teleportSelect, els.liveTeleportSelect].forEach((select) => {
    if (!select) return;
    TELEPORT_TARGETS.forEach((target, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = target.name;
      select.appendChild(option);
    });
  });
}

function updateArrowRotation() {
  const el = droneMarker.getElement();
  if (!el) return;
  const arrow = el.querySelector('.uav-arrow');
  if (arrow) {
    // CSS triangle points up after rotation correction.
    arrow.style.transform = `rotate(${state.heading}deg)`;
  }
}

function updateUI() {
  els.lat.textContent = state.lat.toFixed(6);
  els.lon.textContent = state.lon.toFixed(6);
  els.alt.textContent = `${Math.round(state.altitude)} m`;
  if (els.liveLat) els.liveLat.textContent = state.lat.toFixed(6);
  if (els.liveLon) els.liveLon.textContent = state.lon.toFixed(6);
  if (els.liveAlt) els.liveAlt.textContent = `${Math.round(state.altitude)} m`;
  if (els.liveSpd) els.liveSpd.textContent = `${state.speed.toFixed(1)} m/s`;
  if (els.altitudeControlVal) {
    els.altitudeControlVal.textContent = `${Math.round(state.altitude)} m`;
  }
  if (els.altitudeControl && document.activeElement !== els.altitudeControl) {
    els.altitudeControl.value = String(Math.round(state.altitude));
  }
  if (els.cameraZoomVal) {
    els.cameraZoomVal.textContent = `${Number(state.cameraZoom).toFixed(1)} / eff ${getEffectiveCameraZoom().toFixed(2)}`;
  }
  els.hdg.textContent = `${Math.round(state.heading)}°`;
  els.spd.textContent = `${state.speed.toFixed(1)} m/s`;
  els.mode.textContent = state.hold ? 'HOLD' : 'MANUAL';
  els.holdBtn.textContent = state.hold ? 'HOLD ON' : 'HOLD OFF';
  if (els.followBtn) {
    els.followBtn.textContent = state.followDrone ? 'FOLLOW DRONE: ON' : 'FOLLOW DRONE: OFF';
  }
  if (els.liveFollowBtn) {
    els.liveFollowBtn.textContent = state.followDrone ? 'FOLLOW DRONE: ON' : 'FOLLOW DRONE: OFF';
  }
  updateCaptureQualityStatus();
  updateLiveBadges();
}

function updateLiveBadges() {
  const effectiveZoom = getEffectiveCameraZoom();
  if (els.liveModelBadge) els.liveModelBadge.textContent = 'MODEL: OBB ACTIVE';
  if (els.liveStateBadge) els.liveStateBadge.textContent = state.liveDetection ? 'LIVE: ON' : 'LIVE: OFF';
  if (els.liveAltBadge) els.liveAltBadge.textContent = `ALT: ${Math.round(state.altitude)} m`;
  if (els.liveZoomBadge) els.liveZoomBadge.textContent = `ZOOM: ${effectiveZoom.toFixed(2)}`;
  if (els.liveDetectionsBadge) els.liveDetectionsBadge.textContent = `DETECTIONS: ${state.liveDetectionCount}`;
}

function updateMaps() {
  const pos = [state.lat, state.lon];
  const effectiveCameraZoom = getEffectiveCameraZoom();
  const positionChanged = distanceMeters(rendered.lat, rendered.lon, state.lat, state.lon) > 0.15;
  const headingChanged = Math.abs(rendered.heading - state.heading) > 0.05;
  const cameraZoomChanged = rendered.cameraZoom !== effectiveCameraZoom;
  const now = performance.now();

  if (positionChanged) {
    droneMarker.setLatLng(pos);
    rendered.lat = state.lat;
    rendered.lon = state.lon;

    if (
      state.followDrone &&
      now - state.lastFollowPanTime >= FOLLOW_PAN_INTERVAL_MS &&
      mainMap.distance(mainMap.getCenter(), pos) > FOLLOW_DISTANCE_THRESHOLD_M
    ) {
      mainMap.panTo(pos, { animate: true, duration: 0.25 });
      state.lastFollowPanTime = now;
    }
  }

  if (headingChanged) {
    updateArrowRotation();
    rendered.heading = state.heading;
  }

  if (cameraZoomChanged) {
    cameraMap.setZoom(effectiveCameraZoom, { animate: false });
    rendered.cameraZoom = effectiveCameraZoom;
  }

  if ((positionChanged || cameraZoomChanged) && now - state.lastCameraUpdateTime >= CAMERA_UPDATE_INTERVAL_MS) {
    cameraCentre.setLatLng(pos);
    cameraMap.panTo(pos, { animate: false });
    state.lastCameraUpdateTime = now;
  }
}

function recenterToIslamabadAirport() {
  mainMap.setView([DEFAULT_LAT, DEFAULT_LNG], DEFAULT_ZOOM, { animate: true });
  cameraMap.setView([state.lat, state.lon], getEffectiveCameraZoom(), { animate: false });
  rendered.cameraZoom = getEffectiveCameraZoom();
  log('Map recentered to Islamabad International Airport.');
}

function updateLivePreviewImage(url) {
  state.latestLivePreviewUrl = url;
  if (els.largeLivePreview) {
    els.largeLivePreview.src = url;
  }
  if (els.liveModePreview) {
    els.liveModePreview.src = url;
  }
  if (els.livePredictionFrame) {
    els.livePredictionFrame.classList.add('has-frame');
  }
  if (els.livePreviewHint) {
    els.livePreviewHint.textContent = state.liveDetection ? 'Live detection stream active.' : 'Latest live detection frame.';
  }
}

function openLivePreview() {
  state.livePreviewOpen = true;
  if (els.livePreviewModal) {
    els.livePreviewModal.hidden = false;
  }
  if (state.latestLivePreviewUrl) {
    updateLivePreviewImage(state.latestLivePreviewUrl);
  } else if (els.livePreviewHint) {
    els.livePreviewHint.textContent = 'Turn live detection on to populate the preview.';
  }
}

function closeLivePreview() {
  state.livePreviewOpen = false;
  if (els.livePreviewModal) {
    els.livePreviewModal.hidden = true;
  }
}

function addPathPointIfNeeded() {
  const d = distanceMeters(state.lastPathLat, state.lastPathLon, state.lat, state.lon);
  if (d > 8 || state.path.length === 0) {
    state.path.push([state.lat, state.lon]);
    state.lastPathLat = state.lat;
    state.lastPathLon = state.lon;
    if (state.path.length > 900) state.path.shift();
    pathLine.setLatLngs(state.path);
  }
}

function step(now) {
  const dt = Math.min(0.08, (now - state.lastTime) / 1000);
  state.lastTime = now;

  const boost = state.keys.has('ShiftLeft') || state.keys.has('ShiftRight') ? BOOST_MULTIPLIER : 1;
  const baseSpeed = NORMAL_SPEED * boost; // m/s
  const yawRate = 95 * boost; // deg/s
  const climbRate = 32 * boost; // m/s

  if (state.keys.has('KeyQ')) state.heading = wrap360(state.heading - yawRate * dt);
  if (state.keys.has('KeyE')) state.heading = wrap360(state.heading + yawRate * dt);

  let forward = 0;
  let strafe = 0;
  if (state.keys.has('KeyW')) forward += 1;
  if (state.keys.has('KeyS')) forward -= 1;
  if (state.keys.has('KeyD')) strafe += 1;
  if (state.keys.has('KeyA')) strafe -= 1;

  if (state.keys.has('KeyR')) state.altitude += climbRate * dt;
  if (state.keys.has('KeyF')) state.altitude -= climbRate * dt;
  state.altitude = Math.max(20, Math.min(2500, Number(state.altitude)));

  let horizontalSpeed = 0;
  if (forward !== 0 || strafe !== 0) {
    const h = degToRad(state.heading);
    const dist = baseSpeed * dt;
    const fNorth = Math.cos(h) * forward * dist;
    const fEast = Math.sin(h) * forward * dist;
    const sNorth = Math.cos(h + Math.PI / 2) * strafe * dist;
    const sEast = Math.sin(h + Math.PI / 2) * strafe * dist;
    const moved = moveByMeters(state.lat, state.lon, fNorth + sNorth, fEast + sEast);
    state.lat = Math.max(-85, Math.min(85, moved.lat));
    state.lon = ((moved.lon + 180) % 360 + 360) % 360 - 180;
    horizontalSpeed = Math.sqrt((forward * baseSpeed) ** 2 + (strafe * baseSpeed) ** 2);
  }
  state.speed = state.speed * 0.75 + horizontalSpeed * 0.25;

  addPathPointIfNeeded();
  updateMaps();
  if (now - state.lastUiUpdateTime >= UI_UPDATE_INTERVAL_MS) {
    updateUI();
    state.lastUiUpdateTime = now;
  }
  requestAnimationFrame(step);
}

async function checkStatus() {
  try {
    const r = await fetch('/api/status');
    const data = await r.json();
    els.serverStatus.textContent = 'SERVER ONLINE';
    els.modelBar.style.width = data.model_present ? '100%' : '28%';
    const modelName = data.model_path ? data.model_path.split(/[\\/]/).pop() : 'best.pt';
    log(data.model_present ? `YOLO OBB model detected: models/${modelName}` : 'No YOLO model loaded yet. Flight simulator ready.');
  } catch (err) {
    els.serverStatus.textContent = 'SERVER OFFLINE';
    log('Server status check failed.');
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

async function captureJpg() {
  if (state.capturing) return;
  state.capturing = true;
  const qualityOption = getCaptureQualityOption();
  els.captureBtn.textContent = 'CAPTURING...';
  els.captureStatus.textContent = `Saving current camera view as ${qualityOption.label}...`;
  log('Camera capture requested.');

  try {
    const response = await fetch('/api/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getCameraRequestPayload(true)),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const imageUrl = data.url || data.output_url;
    const filename = data.filename || data.output_filename;
    const formatLabel = data.format_label || qualityOption.label;
    const urlWithCacheBust = `${imageUrl}?t=${Date.now()}`;
    els.captureStatus.textContent = `Saved: ${filename} | ${data.width} x ${data.height} | Tile z${data.tile_zoom_level} | ${formatLabel} | Detections: ${data.detection_count}`;
    els.captureLink.href = imageUrl;
    els.captureLink.textContent = qualityOption.openLabel;
    els.captureLink.hidden = false;
    els.latestCapture.src = urlWithCacheBust;
    els.latestCapture.hidden = false;
    log(`${formatLabel} saved in captures folder: ${filename}`);
  } catch (err) {
    els.captureStatus.textContent = `Capture failed: ${err.message}`;
    log(`Capture failed: ${err.message}`);
  } finally {
    state.capturing = false;
    updateCaptureQualityStatus();
  }
}

async function runLiveDetection() {
  if (!state.liveDetection || state.liveDetecting) return;
  state.liveDetecting = true;
  els.liveDetectStatus.textContent = 'Live detection running...';
  updateLiveBadges();
  console.info('[live-detect] frame requested', getCameraRequestPayload(false));

  try {
    const response = await fetch('/api/live-detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getCameraRequestPayload(false)),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    state.liveDetectionCount = data.detection_count;
    els.liveDetectStatus.textContent = `Live detections: ${data.detection_count} object(s)`;
    const previewUrl = `${data.preview_url}?t=${Date.now()}`;
    updateLivePreviewImage(previewUrl);
    updateLiveBadges();
    console.info('[live-detect] frame received', {
      detections: data.detection_count,
      previewUrl,
    });
  } catch (err) {
    els.liveDetectStatus.textContent = 'Live detection failed';
    console.error('[live-detect] failed', err);
    log(`Live detection failed: ${err.message}`);
  } finally {
    state.liveDetecting = false;
    scheduleLiveDetection();
  }
}

function updateLiveDetectionButton() {
  els.liveDetectBtn.textContent = state.liveDetection ? 'LIVE DETECTION: ON' : 'LIVE DETECTION: OFF';
  if (!state.liveDetection && !state.liveDetecting) {
    els.liveDetectStatus.textContent = 'Live detection OFF';
  }
  updateLiveBadges();
}

function scheduleLiveDetection() {
  if (state.liveDetectionTimer) {
    clearTimeout(state.liveDetectionTimer);
    state.liveDetectionTimer = null;
  }
  if (!state.liveDetection) return;
  console.info('[live-detect] next frame scheduled', LIVE_DETECTION_INTERVAL_MS);
  state.liveDetectionTimer = setTimeout(runLiveDetection, LIVE_DETECTION_INTERVAL_MS);
}

window.addEventListener('keydown', (e) => {
  if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
  state.keys.add(e.code);

  if (e.code === 'KeyH' && !e.repeat) {
    state.hold = !state.hold;
    log(state.hold ? 'Altitude hold enabled.' : 'Manual mode enabled.');
  }
  if (e.code === 'Space' && !e.repeat) {
    e.preventDefault();
    captureJpg();
  }
  if (e.code === 'Escape' && state.livePreviewOpen) {
    closeLivePreview();
  }
});

window.addEventListener('keyup', (e) => {
  state.keys.delete(e.code);
});

els.resetBtn.addEventListener('click', () => {
  state.path = [[state.lat, state.lon]];
  state.lastPathLat = state.lat;
  state.lastPathLon = state.lon;
  pathLine.setLatLngs(state.path);
  log('Flight path reset.');
});

if (els.recenterBtn) {
  els.recenterBtn.addEventListener('click', recenterToIslamabadAirport);
}

if (els.followBtn) {
  els.followBtn.addEventListener('click', () => {
    state.followDrone = !state.followDrone;
    state.lastFollowPanTime = 0;
    if (state.followDrone) {
      mainMap.panTo([state.lat, state.lon], { animate: true, duration: 0.25 });
      log('Follow drone enabled.');
    } else {
      log('Follow drone disabled.');
    }
    updateUI();
  });
}

if (els.liveFollowBtn) {
  els.liveFollowBtn.addEventListener('click', () => {
    state.followDrone = !state.followDrone;
    state.lastFollowPanTime = 0;
    if (state.followDrone) {
      mainMap.panTo([state.lat, state.lon], { animate: true, duration: 0.25 });
      log('Follow drone enabled.');
    } else {
      log('Follow drone disabled.');
    }
    updateUI();
  });
}

if (els.liveRecenterBtn) {
  els.liveRecenterBtn.addEventListener('click', recenterToIslamabadAirport);
}

if (els.altitudeControl) {
  els.altitudeControl.addEventListener('input', (e) => {
    setAltitude(e.target.value);
  });
}

els.holdBtn.addEventListener('click', () => {
  state.hold = !state.hold;
  log(state.hold ? 'Altitude hold enabled.' : 'Manual mode enabled.');
});

els.captureBtn.addEventListener('click', captureJpg);

if (els.captureQuality) {
  els.captureQuality.addEventListener('change', updateCaptureQualityStatus);
}

if (els.mapZoomIn) {
  els.mapZoomIn.addEventListener('click', () => mainMap.zoomIn());
}

if (els.mapZoomOut) {
  els.mapZoomOut.addEventListener('click', () => mainMap.zoomOut());
}

if (els.mapAltUp) {
  els.mapAltUp.addEventListener('click', () => adjustAltitude(ALTITUDE_STEP));
}

if (els.mapAltDown) {
  els.mapAltDown.addEventListener('click', () => adjustAltitude(-ALTITUDE_STEP));
}

if (els.openLivePreviewBtn) {
  els.openLivePreviewBtn.addEventListener('click', openLivePreview);
}

if (els.closeLivePreviewBtn) {
  els.closeLivePreviewBtn.addEventListener('click', closeLivePreview);
}

if (els.livePreviewModal) {
  els.livePreviewModal.addEventListener('click', (e) => {
    if (e.target === els.livePreviewModal) {
      closeLivePreview();
    }
  });
}

els.navTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    switchSection(tab.dataset.section);
  });
});

if (els.teleportSelect) {
  els.teleportSelect.addEventListener('change', (e) => {
    const target = TELEPORT_TARGETS[Number(e.target.value)];
    if (!target) return;
    teleportTo(target.lat, target.lng, target.name);
    e.target.value = '';
  });
}

if (els.liveTeleportSelect) {
  els.liveTeleportSelect.addEventListener('change', (e) => {
    const target = TELEPORT_TARGETS[Number(e.target.value)];
    if (!target) return;
    teleportTo(target.lat, target.lng, target.name);
    e.target.value = '';
  });
}

if (els.customTeleportBtn) {
  els.customTeleportBtn.addEventListener('click', () => {
    teleportTo(els.customLat.value, els.customLng.value, 'custom coordinates');
  });
}

els.liveDetectBtn.addEventListener('click', () => {
  state.liveDetection = !state.liveDetection;
  updateLiveDetectionButton();
  if (state.liveDetection) {
    console.info('[live-detect] started');
    log('Live detection enabled.');
    runLiveDetection();
  } else {
    scheduleLiveDetection();
    console.info('[live-detect] stopped');
    log('Live detection disabled.');
  }
});

els.cameraZoom.addEventListener('input', (e) => {
  state.cameraZoom = Number(e.target.value);
  updateMaps();
  updateUI();
});

setTimeout(() => {
  mainMap.invalidateSize();
  cameraMap.invalidateSize();
  updateArrowRotation();
  updateMaps();
}, 300);

els.cameraZoom.value = String(state.cameraZoom);
if (els.altitudeControl) {
  els.altitudeControl.value = String(state.altitude);
}

populateTeleportTargets();
checkStatus();
updateLiveDetectionButton();
updateUI();
closeLivePreview();
switchSection(state.activeSection);
updateMaps();
state.path.push([state.lat, state.lon]);
requestAnimationFrame(step);

window.UavApp = {
  state,
  els,
  mainMap,
  cameraMap,
  droneMarker,
  cameraCentre,
  pathLine,
  log,
  updateMaps,
  updateUI,
  getCameraRequestPayload,
  getEffectiveCameraZoom,
  distanceMeters,
  switchSection,
  teleportTo,
};
