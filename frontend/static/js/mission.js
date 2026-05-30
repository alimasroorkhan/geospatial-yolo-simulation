(function () {
  const app = window.UavApp;
  const api = window.UavApi;
  if (!app || !api || !window.L) return;

  const MISSION_TARGETS = {
    'Islamabad International Airport': { lat: 33.554250, lng: 72.830417, type: 'Airport' },
    'Fateh Jhang Airfield': { lat: 33.548361, lng: 72.631722, type: 'Airfield' },
    'Attock Fuel Storage Site': { lat: 33.551139, lng: 73.073389, type: 'Fuel Storage' },
    'Nur Khan Base': { lat: 33.609861, lng: 73.101667, type: 'Airbase' },
  };

  const MISSION_CLASSES = ['airplane', 'airport', 'storage_tank'];
  const KM_PER_DEG_LAT = 111.32;
  const SCAN_DELAY_MS = 500;

  const missionState = {
    status: 'IDLE',
    missionId: null,
    targetName: null,
    targetLat: null,
    targetLng: null,
    missionType: 'Reconnaissance Patrol',
    scanAreaWidthKm: 2,
    scanAreaHeightKm: 2,
    gridRows: 4,
    gridCols: 4,
    overlapPercent: 20,
    scanQuality: 'detection',
    captureFormat: 'jpg',
    sectors: [],
    scanOrder: [],
    currentIndex: 0,
    results: [],
    isScanning: false,
    isPaused: false,
    isStopped: false,
    gridLayer: null,
    labelLayer: null,
    pathLayer: null,
    sectorLayers: new Map(),
  };

  const els = {
    target: document.getElementById('missionTarget'),
    coordinateReadout: document.getElementById('missionCoordinateReadout'),
    missionType: document.getElementById('missionType'),
    areaSize: document.getElementById('missionAreaSize'),
    areaWidth: document.getElementById('missionAreaWidth'),
    areaHeight: document.getElementById('missionAreaHeight'),
    customAreaFields: document.getElementById('missionCustomAreaFields'),
    gridSize: document.getElementById('missionGridSize'),
    rows: document.getElementById('missionRows'),
    cols: document.getElementById('missionColumns'),
    customGridFields: document.getElementById('missionCustomGridFields'),
    overlap: document.getElementById('missionOverlap'),
    scanQuality: document.getElementById('missionScanQuality'),
    captureFormat: document.getElementById('missionCaptureFormat'),
    useViewBtn: document.getElementById('missionUseViewBtn'),
    drawBtn: document.getElementById('missionDrawBtn'),
    generateBtn: document.getElementById('missionPlanBtn'),
    startBtn: document.getElementById('missionStartBtn'),
    pauseBtn: document.getElementById('missionPauseBtn'),
    stopBtn: document.getElementById('missionStopBtn'),
    clearBtn: document.getElementById('missionClearBtn'),
    exportBtn: document.getElementById('missionExportBtn'),
    progressBar: document.getElementById('missionProgressBar'),
    progressText: document.getElementById('missionProgressText'),
    sectorVal: document.getElementById('missionSectorVal'),
    progressVal: document.getElementById('missionProgressVal'),
    detectionsVal: document.getElementById('missionDetectionsVal'),
    stateVal: document.getElementById('missionStateVal'),
    sectorList: document.getElementById('missionSectorList'),
    currentCapture: document.getElementById('missionCurrentCapture'),
    latestDetails: document.getElementById('missionLatestDetails'),
    totalDetections: document.getElementById('missionTotalDetections'),
    aircraftCount: document.getElementById('missionAircraftCount'),
    airportCount: document.getElementById('missionAirportCount'),
    tankCount: document.getElementById('missionTankCount'),
    avgConfidence: document.getElementById('missionAvgConfidence'),
    highestSector: document.getElementById('missionHighestSector'),
    assessment: document.getElementById('missionAssessment'),
    resultsBody: document.getElementById('missionResultsBody'),
    detailsPanel: document.getElementById('missionSectorDetailsPanel'),
    jsonLink: document.getElementById('missionJsonLink'),
    csvLink: document.getElementById('missionCsvLink'),
    reportLink: document.getElementById('missionReportLink'),
  };

  let drawing = false;
  let drawStart = null;
  let draftLayer = null;

  function sectorCode(row, col) {
    return `${String.fromCharCode(65 + row)}${col + 1}`;
  }

  function missionId() {
    if (!missionState.missionId) {
      const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      missionState.missionId = `mission_${stamp}`;
    }
    return missionState.missionId;
  }

  function blankCounts() {
    return { airplane: 0, airport: 0, storage_tank: 0 };
  }

  function setStatus(status) {
    missionState.status = status;
    if (els.stateVal) els.stateVal.textContent = status;
  }

  function ensureLayers() {
    if (!missionState.gridLayer) missionState.gridLayer = L.layerGroup().addTo(app.mainMap);
    if (!missionState.labelLayer) missionState.labelLayer = L.layerGroup().addTo(app.mainMap);
  }

  function clearLayers() {
    if (missionState.gridLayer) missionState.gridLayer.clearLayers();
    if (missionState.labelLayer) missionState.labelLayer.clearLayers();
    if (missionState.pathLayer) {
      app.mainMap.removeLayer(missionState.pathLayer);
      missionState.pathLayer = null;
    }
    missionState.sectorLayers.clear();
  }

  function syncCustomControls() {
    if (els.customAreaFields) els.customAreaFields.hidden = els.areaSize.value !== 'custom';
    if (els.customGridFields) els.customGridFields.hidden = els.gridSize.value !== 'custom';
    readMissionInputs();
  }

  function readMissionInputs() {
    const targetName = els.target.value || 'Islamabad International Airport';
    const target = MISSION_TARGETS[targetName] || { lat: app.state.lat, lng: app.state.lon, type: 'Custom' };
    const areaPreset = els.areaSize.value || '2x2';
    let widthKm = 2;
    let heightKm = 2;
    if (areaPreset === 'custom') {
      widthKm = Math.max(0.25, Math.min(8, Number(els.areaWidth.value) || 2));
      heightKm = Math.max(0.25, Math.min(8, Number(els.areaHeight.value) || 2));
    } else {
      [widthKm, heightKm] = areaPreset.split('x').map(Number);
      els.areaWidth.value = String(widthKm);
      els.areaHeight.value = String(heightKm);
    }

    const gridPreset = els.gridSize.value || '4x4';
    let rows = 4;
    let cols = 4;
    if (gridPreset === 'custom') {
      rows = Math.max(2, Math.min(8, Math.round(Number(els.rows.value) || 4)));
      cols = Math.max(2, Math.min(8, Math.round(Number(els.cols.value) || 4)));
    } else {
      [rows, cols] = gridPreset.split('x').map(Number);
      els.rows.value = String(rows);
      els.cols.value = String(cols);
    }

    missionState.targetName = targetName;
    missionState.targetLat = target.lat;
    missionState.targetLng = target.lng;
    missionState.missionType = els.missionType.value || 'Reconnaissance Patrol';
    missionState.scanAreaWidthKm = widthKm;
    missionState.scanAreaHeightKm = heightKm;
    missionState.gridRows = rows;
    missionState.gridCols = cols;
    missionState.overlapPercent = Math.max(0, Math.min(25, Number(els.overlap.value) || 20));
    missionState.scanQuality = els.scanQuality.value || 'detection';
    missionState.captureFormat = els.captureFormat.value === 'png' ? 'png' : 'jpg';
    els.coordinateReadout.value = `${target.lat.toFixed(12)}, ${target.lng.toFixed(12)}`;
    return target;
  }

  function buildScanOrder(sectors) {
    const order = [];
    for (let row = 0; row < missionState.gridRows; row += 1) {
      const rowSectors = sectors.filter((sector) => sector.row === row);
      rowSectors.sort((a, b) => (row % 2 === 0 ? a.col - b.col : b.col - a.col));
      order.push(...rowSectors);
    }
    return order;
  }

  function buildSectorGrid() {
    const target = readMissionInputs();
    const lat = target.lat;
    const lng = target.lng;
    const heightDegrees = missionState.scanAreaHeightKm / KM_PER_DEG_LAT;
    const lonKm = KM_PER_DEG_LAT * Math.cos(lat * Math.PI / 180) || KM_PER_DEG_LAT;
    const widthDegrees = missionState.scanAreaWidthKm / lonKm;
    const north = lat + heightDegrees / 2;
    const south = lat - heightDegrees / 2;
    const east = lng + widthDegrees / 2;
    const west = lng - widthDegrees / 2;
    const rowHeight = (north - south) / missionState.gridRows;
    const colWidth = (east - west) / missionState.gridCols;
    const latPad = rowHeight * (missionState.overlapPercent / 100) / 2;
    const lonPad = colWidth * (missionState.overlapPercent / 100) / 2;
    const sectors = [];

    for (let row = 0; row < missionState.gridRows; row += 1) {
      for (let col = 0; col < missionState.gridCols; col += 1) {
        const visualNorth = north - row * rowHeight;
        const visualSouth = visualNorth - rowHeight;
        const visualWest = west + col * colWidth;
        const visualEast = visualWest + colWidth;
        sectors.push({
          sector_id: sectorCode(row, col),
          row,
          col,
          centre_lat: (visualNorth + visualSouth) / 2,
          centre_lng: (visualEast + visualWest) / 2,
          visual_north: visualNorth,
          visual_south: visualSouth,
          visual_east: visualEast,
          visual_west: visualWest,
          north: Math.min(north, visualNorth + latPad),
          south: Math.max(south, visualSouth - latPad),
          east: Math.min(east, visualEast + lonPad),
          west: Math.max(west, visualWest - lonPad),
          overlap_percent: missionState.overlapPercent,
          status: 'pending',
          detection_count: 0,
          class_counts: blankCounts(),
          average_confidence: 0,
          prediction_url: null,
          raw_url: null,
          detections: [],
          error: '',
        });
      }
    }
    missionState.sectors = sectors;
    missionState.scanOrder = buildScanOrder(sectors);
  }

  function displayStatusKey(sector) {
    if (sector.status === 'pending') return 'pending';
    if (sector.status === 'current' || sector.status === 'scanning') return 'scanning';
    if (sector.status === 'failed') return 'failed';
    if (sector.status && sector.status.startsWith('scanned')) return 'complete';
    return sector.status || 'pending';
  }

  function displayStatus(sector) {
    return {
      pending: 'Pending',
      scanning: 'Scanning',
      complete: 'Complete',
      failed: 'Failed',
    }[displayStatusKey(sector)] || sector.status;
  }

  function statusStyle(status, detectionCount = 0) {
    if (status === 'current' || status === 'scanning') return { color: '#70ffd6', fillColor: '#70ffd6', fillOpacity: 0.20, weight: 3 };
    if (status === 'failed') return { color: '#b45b62', fillColor: '#5f252c', fillOpacity: 0.20, weight: 2 };
    if (displayStatusKey({ status }) === 'complete' && detectionCount === 0) return { color: '#62ff9d', fillColor: '#62ff9d', fillOpacity: 0.16, weight: 2 };
    if (detectionCount >= 4) return { color: '#ff5c8a', fillColor: '#ff5c8a', fillOpacity: 0.20, weight: 2 };
    if (detectionCount >= 1) return { color: '#f4d35e', fillColor: '#f4d35e', fillOpacity: 0.18, weight: 2 };
    return { color: '#70ffd6', fillColor: '#70ffd6', fillOpacity: 0.07, weight: 1 };
  }

  function updateSectorColour(sector) {
    const layer = missionState.sectorLayers.get(sector.sector_id);
    if (layer) layer.setStyle(statusStyle(sector.status, sector.detection_count));
    const chip = document.querySelector(`[data-mission-sector="${sector.sector_id}"]`);
    if (chip) {
      chip.className = `mission-sector-chip ${displayStatusKey(sector)}`;
      chip.textContent = `${sector.sector_id} ${displayStatus(sector)}`;
    }
  }

  function drawGrid() {
    ensureLayers();
    clearLayers();
    missionState.sectors.forEach((sector) => {
      const bounds = L.latLngBounds([sector.visual_south, sector.visual_west], [sector.visual_north, sector.visual_east]);
      const rect = L.rectangle(bounds, statusStyle(sector.status, 0)).addTo(missionState.gridLayer);
      const label = L.marker([sector.centre_lat, sector.centre_lng], {
        interactive: false,
        icon: L.divIcon({
          className: 'mission-sector-label',
          html: sector.sector_id,
          iconSize: [42, 20],
          iconAnchor: [21, 10],
        }),
      }).addTo(missionState.labelLayer);
      missionState.sectorLayers.set(sector.sector_id, rect);
      missionState.sectorLayers.set(`${sector.sector_id}:label`, label);
    });
    missionState.pathLayer = L.polyline(
      missionState.scanOrder.map((sector) => [sector.centre_lat, sector.centre_lng]),
      { color: '#f4d35e', weight: 2, opacity: 0.85, dashArray: '8 6' },
    ).addTo(app.mainMap);
    const mapBounds = L.latLngBounds(missionState.sectors.map((sector) => [sector.centre_lat, sector.centre_lng]));
    app.mainMap.fitBounds(mapBounds.pad(0.25));
    renderSectorChips();
    renderResultsTable();
  }

  function renderSectorChips() {
    els.sectorList.innerHTML = '';
    missionState.sectors.forEach((sector) => {
      const chip = document.createElement('div');
      chip.className = `mission-sector-chip ${displayStatusKey(sector)}`;
      chip.dataset.missionSector = sector.sector_id;
      chip.textContent = `${sector.sector_id} ${displayStatus(sector)}`;
      els.sectorList.appendChild(chip);
    });
  }

  function summary() {
    const totals = blankCounts();
    let confidenceSum = 0;
    let confidenceCount = 0;
    let highest = null;
    missionState.sectors.forEach((sector) => {
      if (displayStatusKey(sector) !== 'complete') return;
      MISSION_CLASSES.forEach((name) => {
        totals[name] += sector.class_counts[name] || 0;
      });
      if (sector.detection_count > 0) {
        confidenceSum += sector.average_confidence * sector.detection_count;
        confidenceCount += sector.detection_count;
      }
      if (!highest || sector.detection_count > highest.detection_count) highest = sector;
    });
    const total = totals.airplane + totals.airport + totals.storage_tank;
    let assessment = 'LOW ACTIVITY';
    if (totals.airport >= 1 && (totals.airplane >= 1 || totals.storage_tank >= 1)) assessment = 'STRATEGIC SITE INDICATOR';
    else if (total > 5 || totals.airplane >= 3 || totals.storage_tank >= 8) assessment = 'HIGH ACTIVITY';
    else if (total >= 1) assessment = 'MEDIUM ACTIVITY';
    return {
      ...totals,
      total,
      average_confidence: confidenceCount ? confidenceSum / confidenceCount : 0,
      highest_sector: highest && highest.detection_count > 0 ? highest.sector_id : '--',
      assessment,
    };
  }

  function updateProgress() {
    const scanned = missionState.sectors.filter((sector) => ['complete', 'failed'].includes(displayStatusKey(sector))).length;
    const total = missionState.sectors.length;
    const pct = total ? Math.round(scanned / total * 100) : 0;
    els.progressBar.style.width = `${pct}%`;
    els.progressVal.textContent = `${pct}%`;
    els.progressText.textContent = total ? `${scanned} / ${total} sectors scanned` : 'Mission area not defined.';
    els.detectionsVal.textContent = String(summary().total);
  }

  function updateSummary() {
    const data = summary();
    els.totalDetections.textContent = String(data.total);
    els.aircraftCount.textContent = String(data.airplane);
    els.airportCount.textContent = String(data.airport);
    els.tankCount.textContent = String(data.storage_tank);
    els.avgConfidence.textContent = data.average_confidence ? data.average_confidence.toFixed(4) : '0';
    els.highestSector.textContent = data.highest_sector;
    els.assessment.textContent = data.assessment;
    updateProgress();
  }

  function renderResultsTable() {
    els.resultsBody.innerHTML = '';
    missionState.sectors.forEach(upsertResultRow);
  }

  function upsertResultRow(sector) {
    let row = document.getElementById(`mission-result-${sector.sector_id}`);
    if (!row) {
      row = document.createElement('tr');
      row.id = `mission-result-${sector.sector_id}`;
      els.resultsBody.appendChild(row);
    }
    const link = sector.prediction_url
      ? `<a href="${sector.prediction_url}" target="_blank">Open Image</a>`
      : 'No image';
    row.innerHTML = `
      <td>${sector.sector_id}</td>
      <td>${displayStatus(sector)}</td>
      <td>${sector.class_counts.airplane || 0}</td>
      <td>${sector.class_counts.airport || 0}</td>
      <td>${sector.class_counts.storage_tank || 0}</td>
      <td>${sector.detection_count || 0}</td>
      <td>${sector.average_confidence ? sector.average_confidence.toFixed(4) : '0'}</td>
      <td>${link}</td>
      <td><button type="button" class="mission-details-btn" data-sector-details="${sector.sector_id}">Details</button></td>
    `;
  }

  function highestConfidenceDetection(sector) {
    return (sector.detections || []).reduce((best, item) => (
      !best || Number(item.confidence || 0) > Number(best.confidence || 0) ? item : best
    ), null);
  }

  function showSectorDetails(sectorId) {
    const sector = missionState.sectors.find((item) => item.sector_id === sectorId);
    if (!sector || !els.detailsPanel) return;
    const highest = highestConfidenceDetection(sector);
    const objects = (sector.detections || [])
      .map((item) => `<li>${item.class_name || 'object'} ${Number(item.confidence || 0).toFixed(2)}</li>`)
      .join('') || '<li>No detections recorded.</li>';
    els.detailsPanel.innerHTML = `
      <strong>Sector ${sector.sector_id}</strong>
      <div>Status: ${displayStatus(sector)}</div>
      <div>Detection count: ${sector.detection_count || 0}</div>
      <div>Aircraft: ${sector.class_counts.airplane || 0}</div>
      <div>Airport: ${sector.class_counts.airport || 0}</div>
      <div>Storage tanks: ${sector.class_counts.storage_tank || 0}</div>
      <div>Average confidence: ${sector.average_confidence || 0}</div>
      <div>Highest confidence: ${highest ? `${highest.class_name} ${Number(highest.confidence || 0).toFixed(2)}` : '--'}</div>
      ${sector.error ? `<div>Error: ${sector.error}</div>` : ''}
      <ul>${objects}</ul>
    `;
  }

  function generateGrid() {
    console.log('Mission Scan: Generate Grid clicked');
    buildSectorGrid();
    missionState.results = [];
    missionState.currentIndex = 0;
    missionState.isPaused = false;
    missionState.isStopped = false;
    drawGrid();
    setStatus('GRID_READY');
    updateSummary();
    app.log(`Mission grid ready: ${missionState.gridRows} x ${missionState.gridCols}, ${missionState.scanAreaWidthKm} km x ${missionState.scanAreaHeightKm} km.`);
  }

  function clearMission() {
    console.log('Mission Scan: Clear Mission clicked');
    clearLayers();
    missionState.status = 'IDLE';
    missionState.missionId = null;
    missionState.sectors = [];
    missionState.scanOrder = [];
    missionState.currentIndex = 0;
    missionState.results = [];
    missionState.isScanning = false;
    missionState.isPaused = false;
    missionState.isStopped = false;
    els.sectorList.innerHTML = '';
    els.resultsBody.innerHTML = '';
    if (els.detailsPanel) els.detailsPanel.textContent = 'Select Details for a sector.';
    els.currentCapture.hidden = true;
    els.currentCapture.removeAttribute('src');
    els.latestDetails.textContent = 'Latest sector: --';
    els.sectorVal.textContent = '--';
    [els.jsonLink, els.csvLink, els.reportLink].forEach((link) => {
      if (!link) return;
      link.hidden = true;
      link.href = '#';
    });
    setStatus('IDLE');
    updateSummary();
    els.progressText.textContent = 'Mission area not defined.';
  }

  function qualitySettings() {
    if (missionState.scanQuality === 'fast') return { width: 900, height: 620, capture_tile_zoom: 18 };
    if (missionState.scanQuality === 'detail') return { width: 1536, height: 1536, capture_tile_zoom: 19 };
    return { width: 1280, height: 900, capture_tile_zoom: 18 };
  }

  function moveDroneToSector(sector, previous) {
    app.state.lat = sector.centre_lat;
    app.state.lon = sector.centre_lng;
    if (previous) {
      const dx = sector.centre_lng - previous.centre_lng;
      const dy = sector.centre_lat - previous.centre_lat;
      if (dx !== 0 || dy !== 0) app.state.heading = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
    }
    app.state.lastFollowPanTime = 0;
    app.mainMap.panTo([app.state.lat, app.state.lon], { animate: true, duration: 0.35 });
    app.cameraMap.panTo([app.state.lat, app.state.lon], { animate: false });
    app.updateMaps();
    app.updateUI();
  }

  function scanPayload(sector) {
    const quality = qualitySettings();
    return {
      mission_id: missionId(),
      sector_id: sector.sector_id,
      target_name: missionState.targetName,
      mission_type: missionState.missionType,
      lat: sector.centre_lat,
      lon: sector.centre_lng,
      north: sector.north,
      south: sector.south,
      east: sector.east,
      west: sector.west,
      altitude: app.state.altitude,
      heading: app.state.heading,
      width: quality.width,
      height: quality.height,
      image_format: missionState.captureFormat,
      jpeg_quality: missionState.captureFormat === 'png' ? 1 : 0.98,
      capture_tile_zoom: quality.capture_tile_zoom,
      draw_hud: true,
      overlap_percent: missionState.overlapPercent,
      scan_area_width_km: missionState.scanAreaWidthKm,
      scan_area_height_km: missionState.scanAreaHeightKm,
      grid_rows: missionState.gridRows,
      grid_columns: missionState.gridCols,
      scan_quality: missionState.scanQuality,
      capture_format: missionState.captureFormat,
    };
  }

  async function startScan() {
    console.log('Mission Scan: Start Scan clicked');
    if (!missionState.sectors.length) {
      els.progressText.textContent = 'Generate grid first.';
      return;
    }
    if (missionState.isScanning) return;
    missionState.isScanning = true;
    missionState.isPaused = false;
    missionState.isStopped = false;
    setStatus('SCANNING');

    for (let i = missionState.currentIndex; i < missionState.scanOrder.length; i += 1) {
      const sector = missionState.scanOrder[i];
      if (['complete', 'failed'].includes(displayStatusKey(sector))) {
        missionState.currentIndex = i + 1;
        continue;
      }
      const previous = i > 0 ? missionState.scanOrder[i - 1] : null;
      sector.status = 'scanning';
      els.sectorVal.textContent = sector.sector_id;
      updateSectorColour(sector);
      upsertResultRow(sector);
      moveDroneToSector(sector, previous);

      try {
        const data = await api.scanMissionSectorFlat(scanPayload(sector));
        Object.assign(sector, {
          detection_count: data.detection_count || 0,
          class_counts: data.class_counts || blankCounts(),
          average_confidence: data.average_confidence || 0,
          prediction_url: data.prediction_url,
          raw_url: data.raw_url,
          detections: data.detections || [],
          error: '',
          status: (data.detection_count || 0) >= 4
            ? 'scanned_high_activity'
            : (data.detection_count || 0) >= 1
              ? 'scanned_low_activity'
              : 'scanned_no_detection',
        });
        missionState.results = missionState.results.filter((item) => item.sector_id !== sector.sector_id);
        missionState.results.push({ ...sector });
        if (sector.prediction_url) {
          els.currentCapture.src = `${sector.prediction_url}?t=${Date.now()}`;
          els.currentCapture.hidden = false;
        }
        els.latestDetails.textContent = `Latest sector: ${sector.sector_id} | Detections: ${sector.detection_count} | Aircraft: ${sector.class_counts.airplane || 0} | Airport: ${sector.class_counts.airport || 0} | Storage Tanks: ${sector.class_counts.storage_tank || 0} | Avg: ${sector.average_confidence || 0}`;
        if (els.jsonLink) {
          els.jsonLink.href = `/captures/missions/${missionState.missionId}/mission_summary.json`;
          els.jsonLink.hidden = false;
        }
        if (els.csvLink) {
          els.csvLink.href = `/captures/missions/${missionState.missionId}/mission_summary.csv`;
          els.csvLink.hidden = false;
        }
      } catch (err) {
        sector.status = 'failed';
        sector.error = err.message;
        app.log(`Mission sector ${sector.sector_id} failed: ${err.message}`);
      }

      updateSectorColour(sector);
      upsertResultRow(sector);
      updateSummary();
      missionState.currentIndex = i + 1;

      await new Promise((resolve) => setTimeout(resolve, SCAN_DELAY_MS));
      if (missionState.isPaused) {
        missionState.isScanning = false;
        setStatus('PAUSED');
        return;
      }
      if (missionState.isStopped) {
        missionState.isScanning = false;
        setStatus('STOPPED');
        return;
      }
    }

    missionState.isScanning = false;
    setStatus('COMPLETE');
  }

  function pauseScan() {
    console.log('Mission Scan: Pause Scan clicked');
    missionState.isPaused = true;
  }

  function stopScan() {
    console.log('Mission Scan: Stop Scan clicked');
    missionState.isStopped = true;
    missionState.isPaused = false;
    if (!missionState.isScanning) setStatus('STOPPED');
  }

  function exportReport() {
    console.log('Mission Scan: Export Report clicked');
    const payload = {
      mission_id: missionState.missionId,
      target_name: missionState.targetName,
      mission_type: missionState.missionType,
      scan_area_width_km: missionState.scanAreaWidthKm,
      scan_area_height_km: missionState.scanAreaHeightKm,
      grid_rows: missionState.gridRows,
      grid_columns: missionState.gridCols,
      overlap_percent: missionState.overlapPercent,
      scan_quality: missionState.scanQuality,
      capture_format: missionState.captureFormat,
      mission_status: missionState.status,
      summary: summary(),
      sectors: missionState.sectors,
      results: missionState.results,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mission_summary_${missionState.missionId || 'unsaved'}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function enableDrawMode() {
    drawing = true;
    drawStart = null;
    app.mainMap.dragging.disable();
    els.progressText.textContent = 'Drag on the map to define mission bounds.';
  }

  function finishDrawMode() {
    drawing = false;
    drawStart = null;
    app.mainMap.dragging.enable();
  }

  app.mainMap.on('mousedown', (event) => {
    if (!drawing || app.state.activeSection !== 'missionSection') return;
    drawStart = event.latlng;
    if (draftLayer) app.mainMap.removeLayer(draftLayer);
    draftLayer = L.rectangle(L.latLngBounds(drawStart, drawStart), { color: '#f4d35e', weight: 1, fillOpacity: 0.08 }).addTo(app.mainMap);
  });

  app.mainMap.on('mousemove', (event) => {
    if (!drawing || !drawStart || !draftLayer) return;
    draftLayer.setBounds(L.latLngBounds(drawStart, event.latlng));
  });

  app.mainMap.on('mouseup', (event) => {
    if (!drawing || !drawStart) return;
    const bounds = L.latLngBounds(drawStart, event.latlng);
    const center = bounds.getCenter();
    MISSION_TARGETS['Custom Coordinates'] = { lat: center.lat, lng: center.lng, type: 'Custom' };
    els.target.value = 'Custom Coordinates';
    finishDrawMode();
    generateGrid();
  });

  function attachMissionHandlers() {
    els.generateBtn.addEventListener('click', generateGrid);
    els.startBtn.addEventListener('click', () => startScan().catch((err) => {
      setStatus('FAILED');
      missionState.isScanning = false;
      app.log(`Mission scan failed: ${err.message}`);
    }));
    els.pauseBtn.addEventListener('click', pauseScan);
    els.stopBtn.addEventListener('click', stopScan);
    els.clearBtn.addEventListener('click', clearMission);
    els.exportBtn.addEventListener('click', exportReport);
    els.drawBtn.addEventListener('click', enableDrawMode);
    els.useViewBtn.addEventListener('click', () => {
      const center = app.mainMap.getCenter();
      MISSION_TARGETS['Custom Coordinates'] = { lat: center.lat, lng: center.lng, type: 'Custom' };
      els.target.value = 'Custom Coordinates';
      generateGrid();
    });
    els.target.addEventListener('change', () => {
      readMissionInputs();
      if (missionState.sectors.length) generateGrid();
    });
    els.areaSize.addEventListener('change', () => {
      syncCustomControls();
      if (missionState.sectors.length) generateGrid();
    });
    [els.areaWidth, els.areaHeight].forEach((input) => input.addEventListener('input', () => {
      readMissionInputs();
      if (missionState.sectors.length && els.areaSize.value === 'custom') generateGrid();
    }));
    els.gridSize.addEventListener('change', () => {
      syncCustomControls();
      if (missionState.sectors.length) generateGrid();
    });
    [els.rows, els.cols].forEach((input) => input.addEventListener('input', () => {
      readMissionInputs();
      if (missionState.sectors.length && els.gridSize.value === 'custom') generateGrid();
    }));
    els.overlap.addEventListener('change', () => {
      readMissionInputs();
      if (missionState.sectors.length) generateGrid();
    });
    [els.missionType, els.scanQuality, els.captureFormat].forEach((input) => input.addEventListener('change', readMissionInputs));
    els.resultsBody.addEventListener('click', (event) => {
      const button = event.target.closest('[data-sector-details]');
      if (button) showSectorDetails(button.dataset.sectorDetails);
    });
  }

  attachMissionHandlers();
  syncCustomControls();
  updateSummary();
  window.missionState = missionState;
}());
