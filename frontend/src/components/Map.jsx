import React, { useEffect, useRef, useState } from 'react';

const Map = ({ forecastData, selectedTimeIndex, speedProfile }) => {
  const mapRef = useRef(null);
  const coordsRef = useRef([]);
  const [selectedSegment, setSelectedSegment] = useState(null);
  const [clickPos, setClickPos] = useState(null);

  useEffect(() => {
    // Simple fallback map implementation using Canvas or basic rendering
    if (!mapRef.current || !forecastData.length) return;

    const canvas = mapRef.current;
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    
    // Draw background
    ctx.fillStyle = '#E0F2FE';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Calculate bounds
    const lats = forecastData.map(p => p.lat);
    const lons = forecastData.map(p => p.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    
    const latRange = maxLat - minLat || 1;
    const lonRange = maxLon - minLon || 1;
    
    // Convert lat/lon to canvas coordinates
    const toCanvasCoords = (lat, lon) => {
      const x = ((lon - minLon) / lonRange) * (canvas.width - 100) + 50;
      const y = ((maxLat - lat) / latRange) * (canvas.height - 100) + 50;
      return { x, y };
    };
    
    // Clear coordsRef
    coordsRef.current = [];

    // Draw route line
    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    forecastData.forEach((point, index) => {
      const { x, y } = toCanvasCoords(point.lat, point.lon);
      // store canvas coordinates for click hit-testing
      coordsRef.current[index] = { x, y, segment: point };
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    
    // Draw points
    forecastData.forEach((point, index) => {
      const { x, y } = toCanvasCoords(point.lat, point.lon);
      const currentForecast = point.forecast?.times[selectedTimeIndex];
      
      // Determine color based on conditions
      let color = '#10B981'; // Green
      
      if (currentForecast) {
        const windSpeed = currentForecast.wind_speed_ms || 0;
        const waveHeight = currentForecast.waves?.Hs_m || 0;
        
        if (windSpeed > 17.2 || waveHeight > 3.5) {
          color = '#EF4444'; // Red
        } else if (windSpeed > 12 || waveHeight > 2.5) {
          color = '#F59E0B'; // Orange
        }
      }
      
      // Draw marker
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, 2 * Math.PI);
      ctx.fill();
      
      // Draw white border
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Draw segment label
      ctx.fillStyle = '#000000';
      ctx.font = '12px Arial';
      ctx.fillText(`S${point.segment_id}`, x + 12, y + 4);
      
      // Speed profile overlay
      if (speedProfile) {
        const speedData = speedProfile.find(sp => sp.segment_id === point.segment_id);
        if (speedData) {
          ctx.fillStyle = '#000000';
          ctx.font = '10px Arial';
          ctx.fillText(`${speedData.speed_kn.toFixed(1)}kn`, x + 12, y + 16);
        }
      }
    });
    
  }, [forecastData, selectedTimeIndex, speedProfile]);

  // Utility: haversine distance in nautical miles
  const haversineNm = (lat1, lon1, lat2, lon2) => {
    const toRad = (d) => d * Math.PI / 180;
    const R = 6371e3; // meters
    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const dphi = toRad(lat2 - lat1);
    const dlambda = toRad(lon2 - lon1);
    const a = Math.sin(dphi/2) * Math.sin(dphi/2) + Math.cos(phi1)*Math.cos(phi2)*Math.sin(dlambda/2)*Math.sin(dlambda/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const meters = R * c;
    const nm = meters / 1852;
    return nm;
  };

  // Bearing from point A to B (degrees)
  const bearingDeg = (lat1, lon1, lat2, lon2) => {
    const toRad = (d) => d * Math.PI / 180;
    const toDeg = (r) => r * 180 / Math.PI;
    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const dlambda = toRad(lon2 - lon1);
    const y = Math.sin(dlambda) * Math.cos(phi2);
    const x = Math.cos(phi1)*Math.sin(phi2) - Math.sin(phi1)*Math.cos(phi2)*Math.cos(dlambda);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  };

  // Compute route durations (estimated from speedProfile and actual adjusted by waves)
  const computeRouteDurations = () => {
    if (!forecastData || forecastData.length === 0) return { estimated_days: 0, actual_days: 0 };

    const default_est_kn = 12.0;
    let totalEstHours = 0;
    let totalActHours = 0;

    for (let i = 0; i < forecastData.length - 1; i++) {
      const a = forecastData[i];
      const b = forecastData[i+1];
      const dist_nm = haversineNm(a.lat, a.lon, b.lat, b.lon) || 0.1; // small fallback

      // estimated speed (kn)
      const sp = speedProfile ? speedProfile.find(s => s.segment_id === a.segment_id) : null;
      const est_kn = sp ? (sp.speed_kn || default_est_kn) : default_est_kn;

      // wave params
      const forecast = a.forecast?.times[selectedTimeIndex] || {};
      const Hs = forecast.waves?.Hs_m || 0;
      const Tp = forecast.waves?.Tp_s || null;
      const wind_deg = forecast.wind_deg || null;

      // compute segment bearing
      const segBearing = bearingDeg(a.lat, a.lon, b.lat, b.lon);

      // approximate wave direction using wind_deg if present
      const waveDir = wind_deg !== null ? wind_deg : segBearing;
      const rel = (((waveDir - segBearing + 540) % 360) - 180) * Math.PI/180; // -pi..pi

      // modifier based on Hs and relative angle
      let delta = 0;
      if (Hs) {
        delta = (Hs / 10) * Math.cos(rel); // small influence: up to +/- Hs/10
        // clamp
        delta = Math.max(-0.3, Math.min(0.3, delta));
      }

      const act_kn = Math.max(1, est_kn * (1 + delta));

      totalEstHours += dist_nm / Math.max(0.1, est_kn);
      totalActHours += dist_nm / Math.max(0.1, act_kn);
    }

    return {
      estimated_days: +(totalEstHours/24).toFixed(2),
      actual_days: +(totalActHours/24).toFixed(2)
    };
  };

  const routeDurations = computeRouteDurations();

  const handleCanvasClick = (event) => {
    // Handle click events if needed
    const rect = mapRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    setClickPos({ x, y });

    // hit-test nearest point within radius
    let nearest = null;
    let minDist = 9999;
    coordsRef.current.forEach((c, idx) => {
      if (!c) return;
      const dx = c.x - x;
      const dy = c.y - y;
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d < minDist) {
        minDist = d;
        nearest = { c, idx };
      }
    });

    if (nearest && minDist <= 12) {
      setSelectedSegment(nearest.c.segment);
    } else {
      setSelectedSegment(null);
    }
  };

  // Helper to compute per-segment info for overlay
  const segmentInfo = (segment) => {
    if (!segment) return null;
    const idx = forecastData.findIndex(s => s.segment_id === segment.segment_id);
    const next = forecastData[idx+1];
    const dist_nm = next ? haversineNm(segment.lat, segment.lon, next.lat, next.lon) : 0;
    const sp = speedProfile ? speedProfile.find(s => s.segment_id === segment.segment_id) : null;
    const est_kn = sp ? (sp.speed_kn || 12) : 12;
    const forecast = segment.forecast?.times[selectedTimeIndex] || {};
    const Hs = forecast.waves?.Hs_m || 0;
    const Tp = forecast.waves?.Tp_s || null;
    const wind_deg = forecast.wind_deg || null;

    // wave speed (m/s) using deep-water approximation c = g*T/(2*pi)
    const waveSpeed_ms = Tp ? (9.81 * Tp / (2 * Math.PI)) : null;
    const waveSpeed_kn = waveSpeed_ms ? waveSpeed_ms * 1.94384 : null;

    // segment bearing
    let segBearing = null;
    if (next) segBearing = bearingDeg(segment.lat, segment.lon, next.lat, next.lon);
    const waveDir = wind_deg !== null ? wind_deg : segBearing || 0;
    const rel = segBearing !== null ? (((waveDir - segBearing + 540) % 360) - 180) * Math.PI/180 : 0;
    let delta = 0;
    if (Hs) {
      delta = (Hs / 10) * Math.cos(rel);
      delta = Math.max(-0.3, Math.min(0.3, delta));
    }
    const act_kn = Math.max(1, est_kn * (1 + delta));

    return {
      est_kn: +est_kn.toFixed(2),
      act_kn: +act_kn.toFixed(2),
      Hs: +Hs.toFixed(2),
      Tp: Tp ? +Tp.toFixed(2) : null,
      waveSpeed_ms: waveSpeed_ms ? +waveSpeed_ms.toFixed(2) : null,
      waveSpeed_kn: waveSpeed_kn ? +waveSpeed_kn.toFixed(2) : null,
      dist_nm: +dist_nm.toFixed(2)
    };
  };

  return (
    <div className="relative w-full h-96">
      <canvas
        ref={mapRef}
        className="w-full h-full border border-gray-300 rounded-lg bg-blue-50"
        onClick={handleCanvasClick}
        style={{ minHeight: '400px' }}
      />
      
      {/* Weather Legend */}
      <div className="absolute bottom-4 left-4 bg-white p-3 rounded-lg shadow-lg">
        <h4 className="text-sm font-semibold mb-2">Conditions</h4>
        <div className="space-y-1 text-xs">
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
            <span>Good (Wind &lt;12 m/s, Waves &lt;2.5m)</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-yellow-500 mr-2"></div>
            <span>Moderate (Wind 12-17 m/s, Waves 2.5-3.5m)</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
            <span>Severe (Wind &gt;17 m/s, Waves &gt;3.5m)</span>
          </div>
        </div>
      </div>

      {/* Route Info */}
      <div className="absolute top-4 left-4 bg-white p-3 rounded-lg shadow-lg">
        <h4 className="text-sm font-semibold mb-1">Route: Mumbai → Kochi</h4>
        <p className="text-xs text-gray-600">
          {forecastData.length} segments • Indian Ocean
        </p>
      </div>

      {/* Current Weather Info for Selected Time */}
      {forecastData.length > 0 && selectedTimeIndex >= 0 && (
        <div className="absolute top-4 right-4 bg-white p-3 rounded-lg shadow-lg max-w-xs">
          <h4 className="text-sm font-semibold mb-2">Current Conditions</h4>
          {forecastData.map((segment) => {
            const forecast = segment.forecast?.times[selectedTimeIndex];
            if (!forecast) return null;
            
            return (
              <div key={segment.segment_id} className="mb-2 text-xs">
                <div className="font-medium text-gray-700">Segment {segment.segment_id}</div>
                <div className="grid grid-cols-2 gap-1 mt-1">
                  <div>Wind: {forecast.wind_speed_ms?.toFixed(1)} m/s</div>
                  <div>Waves: {forecast.waves?.Hs_m?.toFixed(1)} m</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Route Durations */}
      <div className="absolute bottom-4 right-4 bg-white p-3 rounded-lg shadow-lg text-sm">
        <div className="font-medium">Route Duration</div>
        <div className="text-xs text-gray-700 mt-1">Estimated: {routeDurations.estimated_days} days</div>
        <div className="text-xs text-gray-700">Actual (wave-adjusted): {routeDurations.actual_days} days</div>
      </div>

      {/* Clicked waypoint overlay */}
      {selectedSegment && clickPos && (
        (() => {
          const info = segmentInfo(selectedSegment);
          return (
            <div style={{ left: clickPos.x + 16, top: clickPos.y + 16 }} className="absolute bg-white p-3 rounded-lg shadow-lg text-xs max-w-xs">
              <div className="font-medium mb-1">Segment {selectedSegment.segment_id}</div>
              <div className="grid grid-cols-2 gap-2">
                <div>Hs: <strong>{info.Hs} m</strong></div>
                <div>Tp: <strong>{info.Tp ?? '—'} s</strong></div>
                <div>Wave speed: <strong>{info.waveSpeed_ms ? `${info.waveSpeed_ms} m/s` : '—'}</strong></div>
                <div>({info.waveSpeed_kn ? `${info.waveSpeed_kn} kn` : '—'})</div>
                <div>Estimated speed: <strong>{info.est_kn} kn</strong></div>
                <div>Actual speed: <strong>{info.act_kn} kn</strong></div>
                <div>Segment dist: <strong>{info.dist_nm} nm</strong></div>
              </div>
              <div className="mt-2 text-right">
                <button onClick={() => setSelectedSegment(null)} className="text-blue-600 text-xs">Close</button>
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
};

export default Map;
