// Minimal static demo JS to replicate click-overlay and segment speed calculations
const mockForecastData = [
    { segment_id: 1, lat: 12.9, lon: 74.8, forecast: { times: [ { t_iso: "2025-08-21T12:00Z", wind_speed_ms: 8.4, wind_deg: 200, waves: { Hs_m: 1.2, Tp_s: 6.5 } } ] } },
    { segment_id: 2, lat: 13.1, lon: 75.2, forecast: { times: [ { t_iso: "2025-08-21T12:00Z", wind_speed_ms: 9.1, wind_deg: 190, waves: { Hs_m: 1.8, Tp_s: 7.2 } } ] } },
    { segment_id: 3, lat: 13.4, lon: 75.6, forecast: { times: [ { t_iso: "2025-08-21T12:00Z", wind_speed_ms: 6.5, wind_deg: 160, waves: { Hs_m: 0.8, Tp_s: 5.4 } } ] } },
    { segment_id: 4, lat: 14.0, lon: 76.0, forecast: { times: [ { t_iso: "2025-08-21T12:00Z", wind_speed_ms: 7.9, wind_deg: 180, waves: { Hs_m: 2.4, Tp_s: 8.0 } } ] } }
];

let speedProfile = null; // simulate no optimization by default
const selectedTimeIndex = 0;

const canvas = document.getElementById('mapcanvas');
const ctx = canvas.getContext('2d');
const overlayRoot = document.getElementById('overlay-root');

function toCanvasCoords(lat, lon, minLat, maxLat, minLon, maxLon) {
  const latRange = maxLat - minLat || 1;
  const lonRange = maxLon - minLon || 1;
  const x = ((lon - minLon) / lonRange) * (canvas.width - 100) + 50;
  const y = ((maxLat - lat) / latRange) * (canvas.height - 100) + 50;
  return { x, y };
}

function draw() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#052033';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  const lats = mockForecastData.map(p=>p.lat);
  const lons = mockForecastData.map(p=>p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  // line
  ctx.strokeStyle = '#4dd0e1'; ctx.lineWidth = 3; ctx.beginPath();
  mockForecastData.forEach((pt,i)=>{
    const c = toCanvasCoords(pt.lat,pt.lon,minLat,maxLat,minLon,maxLon);
    if(i===0) ctx.moveTo(c.x,c.y); else ctx.lineTo(c.x,c.y);
  }); ctx.stroke();

  // markers
  coords = [];
  mockForecastData.forEach((pt,i)=>{
    const c = toCanvasCoords(pt.lat,pt.lon,minLat,maxLat,minLon,maxLon);
    coords.push({x:c.x,y:c.y,segment:pt});
    ctx.fillStyle = '#10B981'; ctx.beginPath(); ctx.arc(c.x,c.y,8,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle='#000'; ctx.font='12px Arial'; ctx.fillText('S'+pt.segment_id,c.x+12,c.y+4);
  });
}

// geodesy helpers
function haversineNm(lat1,lon1,lat2,lon2){
  const toRad = d => d*Math.PI/180;
  const R = 6371e3;
  const phi1 = toRad(lat1), phi2 = toRad(lat2);
  const dphi = toRad(lat2-lat1), dlambda = toRad(lon2-lon1);
  const a = Math.sin(dphi/2)**2 + Math.cos(phi1)*Math.cos(phi2)*Math.sin(dlambda/2)**2;
  const c = 2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  return (R*c)/1852;
}
function bearingDeg(lat1,lon1,lat2,lon2){ const toRad=d=>d*Math.PI/180; const toDeg=r=>r*180/Math.PI; const phi1=toRad(lat1), phi2=toRad(lat2); const dlambda=toRad(lon2-lon1); const y=Math.sin(dlambda)*Math.cos(phi2); const x=Math.cos(phi1)*Math.sin(phi2)-Math.sin(phi1)*Math.cos(phi2)*Math.cos(dlambda); return (toDeg(Math.atan2(y,x))+360)%360; }

function computeSegmentSpeeds(){
  const rows=[]; let totalEstH=0, totalActH=0; const defaultEst=12;
  for(let i=0;i<mockForecastData.length;i++){
    const s = mockForecastData[i];
    const n = mockForecastData[i+1];
    const dist = n? haversineNm(s.lat,s.lon,n.lat,n.lon):0;
    const sp = speedProfile ? speedProfile.find(p=>p.segment_id===s.segment_id): null;
    const est = sp? sp.speed_kn: defaultEst;
    const f = s.forecast.times[selectedTimeIndex]||{}; const Hs=f.waves?.Hs_m||0; const Tp=f.waves?.Tp_s||null; const wind_deg = f.wind_deg??null;
    const segBearing = n? bearingDeg(s.lat,s.lon,n.lat,n.lon):0; const waveDir = wind_deg!==null?wind_deg:segBearing; const rel = (((waveDir-segBearing+540)%360)-180)*Math.PI/180;
    let delta = 0; if(Hs){ delta=(Hs/10)*Math.cos(rel); delta=Math.max(-0.4,Math.min(0.4,delta)); }
    const act = Math.max(1, est*(1+delta)); const estH = dist/Math.max(0.1,est); const actH = dist/Math.max(0.1,act);
    totalEstH += estH; totalActH += actH; const waveSpeed = Tp? (9.81*Tp/(2*Math.PI)) : null;
    rows.push({segment_id:s.segment_id, dist_nm: +dist.toFixed(2), Hs:+Hs.toFixed(2), Tp: Tp?+Tp.toFixed(2):null, est_kn:+est.toFixed(2), act_kn:+act.toFixed(2), waveSpeed_ms: waveSpeed? +waveSpeed.toFixed(2):null});
  }
  return {rows, totalEstDays:+(totalEstH/24).toFixed(2), totalActDays:+(totalActH/24).toFixed(2)};
}

function renderTable(){
  const el = document.getElementById('segments-table'); const res = computeSegmentSpeeds();
  let html = '<table><thead><tr><th>Seg</th><th>Dist</th><th>Hs</th><th>Est</th><th>Act</th></tr></thead><tbody>';
  res.rows.forEach(r=>{ html += `<tr><td>${r.segment_id}</td><td>${r.dist_nm}</td><td>${r.Hs}</td><td>${r.est_kn}</td><td>${r.act_kn}</td></tr>`; });
  html += `</tbody></table><div style="margin-top:8px">Estimated: <strong>${res.totalEstDays} days</strong><br/>Actual: <strong>${res.totalActDays} days</strong></div>`;
  el.innerHTML = html; document.getElementById('route-duration').innerText = `Estimated: ${res.totalEstDays} days | Actual: ${res.totalActDays} days`;
}

let coords = [];
canvas.addEventListener('click', (ev)=>{
  const rect = canvas.getBoundingClientRect(); const x = ev.clientX-rect.left; const y = ev.clientY-rect.top;
  let nearest=null; let minD=9999; coords.forEach(c=>{ const dx=c.x-x; const dy=c.y-y; const d=Math.sqrt(dx*dx+dy*dy); if(d<minD){minD=d; nearest=c;} });
  overlayRoot.innerHTML=''; if(nearest && minD<=12){ const s = nearest.segment; const f = s.forecast.times[selectedTimeIndex]||{}; const Hs=f.waves?.Hs_m||0; const Tp=f.waves?.Tp_s||null; const waveSpeed = Tp? (9.81*Tp/(2*Math.PI)):null; const sp = speedProfile? speedProfile.find(p=>p.segment_id===s.segment_id):null; const est = sp? sp.speed_kn:12; const nidx = mockForecastData.findIndex(z=>z.segment_id===s.segment_id); const next = mockForecastData[nidx+1]; const dist = next? haversineNm(s.lat,s.lon,next.lat,next.lon):0; const segBearing = next? bearingDeg(s.lat,s.lon,next.lat,next.lon):0; const waveDir = f.wind_deg!==undefined?f.wind_deg:segBearing; const rel = (((waveDir-segBearing+540)%360)-180)*Math.PI/180; let delta = 0; if(Hs){ delta=(Hs/10)*Math.cos(rel); delta=Math.max(-0.4,Math.min(0.4,delta)); } const act = Math.max(1, est*(1+delta));
    const box = document.createElement('div'); box.className='overlay'; box.style.left=(nearest.x+16)+'px'; box.style.top=(nearest.y+16)+'px'; box.innerHTML = `<div style="font-weight:700;margin-bottom:6px">Segment ${s.segment_id}</div><div>Hs: <strong>${Hs} m</strong></div><div>Tp: <strong>${Tp??'—'} s</strong></div><div>Wave speed: <strong>${waveSpeed?waveSpeed.toFixed(2)+' m/s':'—'}</strong></div><div>Estimated speed: <strong>${est.toFixed(2)} kn</strong></div><div>Actual speed: <strong>${act.toFixed(2)} kn</strong></div><div>Segment dist: <strong>${dist.toFixed(2)} nm</strong></div><div style="margin-top:6px;text-align:right"><button onclick="(function(b){b.remove();})(this.parentNode.parentNode)">Close</button></div>`;
    overlayRoot.appendChild(box);
  }
});

// initial draw and render
draw(); renderTable();

// expose for debug
window.mockForecastData = mockForecastData; window.computeSegmentSpeeds = computeSegmentSpeeds;
