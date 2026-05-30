(function () {
  async function postJson(url, payload) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `HTTP ${response.status}`);
    }
    return response.json();
  }

  window.UavApi = {
    planMission: (payload) => postJson('/api/mission/plan', payload),
    createMission: (payload) => postJson('/api/mission/create', payload),
    scanMissionSector: (payload) => postJson('/api/mission/scan-sector', payload),
    scanMissionSectorFlat: (payload) => postJson('/api/mission-scan-sector', payload),
    completeMission: (payload) => postJson('/api/mission/complete', payload),
  };
}());
