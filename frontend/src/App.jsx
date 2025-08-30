import React, { useEffect, useState } from 'react';
import Map from './components/Map';
import TimeSlider from './components/TimeSlider';
import AlertsPanel from './components/AlertsPanel';
import SpeedOverlay from './components/SpeedOverlay';
import { fetchRouteForecast, fetchAlerts, optimizeRoute } from './services/api';
import { 
  Waves, 
  Wind, 
  Navigation, 
  AlertTriangle, 
  Fuel, 
  Clock,
  MapPin,
  Zap
} from 'lucide-react';

const App = () => {
    const [forecastData, setForecastData] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [selectedTimeIndex, setSelectedTimeIndex] = useState(0);
    const [speedProfile, setSpeedProfile] = useState(null);
    const [optimizationResult, setOptimizationResult] = useState(null);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [useMock, setUseMock] = useState(false);

    // Helpers for geodesy and simple wave-speed/speed-adjustment model
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
        return meters / 1852;
    };

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

    // Compute per-segment estimated/actual speeds and durations
    const computeSegmentSpeeds = () => {
        if (!forecastData || forecastData.length === 0) return { rows: [], totalEstDays: 0, totalActDays: 0 };

        const rows = [];
        const defaultEstKn = 12.0;
        let totalEstHours = 0;
        let totalActHours = 0;

        for (let i = 0; i < forecastData.length; i++) {
            const seg = forecastData[i];
            const next = forecastData[i+1];
            const dist_nm = next ? haversineNm(seg.lat, seg.lon, next.lat, next.lon) : 0;

            const sp = speedProfile ? speedProfile.find(s => s.segment_id === seg.segment_id) : null;
            const est_kn = sp ? (sp.speed_kn || defaultEstKn) : defaultEstKn;

            const f = seg.forecast?.times[selectedTimeIndex] || {};
            const Hs = f.waves?.Hs_m || 0;
            const Tp = f.waves?.Tp_s || null;
            const wind_deg = f.wind_deg ?? null;

            const segBearing = next ? bearingDeg(seg.lat, seg.lon, next.lat, next.lon) : 0;
            const waveDir = wind_deg !== null ? wind_deg : segBearing;
            const rel = (((waveDir - segBearing + 540) % 360) - 180) * Math.PI/180;

            let delta = 0;
            if (Hs) {
                delta = (Hs / 10) * Math.cos(rel);
                delta = Math.max(-0.4, Math.min(0.4, delta));
            }

            const act_kn = Math.max(1, est_kn * (1 + delta));

            const estHours = dist_nm / Math.max(0.1, est_kn);
            const actHours = dist_nm / Math.max(0.1, act_kn);

            totalEstHours += estHours;
            totalActHours += actHours;

            // wave speed (m/s) if Tp available
            const waveSpeed_ms = Tp ? (9.81 * Tp / (2 * Math.PI)) : null;

            rows.push({
                segment_id: seg.segment_id,
                dist_nm: +dist_nm.toFixed(2),
                est_kn: +est_kn.toFixed(2),
                act_kn: +act_kn.toFixed(2),
                est_hours: +estHours.toFixed(2),
                act_hours: +actHours.toFixed(2),
                Hs: +Hs.toFixed(2),
                Tp: Tp ? +Tp.toFixed(2) : null,
                waveSpeed_ms: waveSpeed_ms ? +waveSpeed_ms.toFixed(2) : null
            });
        }

        return { rows, totalEstDays: +(totalEstHours/24).toFixed(2), totalActDays: +(totalActHours/24).toFixed(2) };
    };

    const segmentSpeeds = computeSegmentSpeeds();

    useEffect(() => {
        const loadForecast = async () => {
            try {
                const data = await fetchRouteForecast(1);
                setForecastData(data);
                
                // Check if using mock data
                if (data.length > 0 && data[0].forecast?.times[0]?.mock) {
                    setUseMock(true);
                }
            } catch (error) {
                console.error('Error loading forecast:', error);
                setUseMock(true);
            }
        };

        loadForecast();
    }, []);

    useEffect(() => {
        const loadAlerts = async () => {
            try {
                const data = await fetchAlerts(1);
                setAlerts(data);
            } catch (error) {
                console.error('Error loading alerts:', error);
            }
        };

        loadAlerts();
    }, [selectedTimeIndex]);

    const handleOptimize = async () => {
        if (forecastData.length === 0) return;
        
        setIsOptimizing(true);
        try {
            const route = forecastData.map(segment => ({
                segment_id: segment.segment_id,
                lat: segment.lat,
                lon: segment.lon,
                dist_nm: 50 // Default distance
            }));

            const vessel = {
                name: "DemoVessel",
                base_speed_kn: 12.0
            };

            const result = await optimizeRoute(route, vessel, {});
            setOptimizationResult(result);
            setSpeedProfile(result.speed_profile);
        } catch (error) {
            console.error('Error optimizing route:', error);
        } finally {
            setIsOptimizing(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100">
            {useMock && (
                <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4">
                    <div className="flex items-center">
                        <AlertTriangle className="h-5 w-5 mr-2" />
                        <span className="font-medium">Using Mock Data</span>
                        <span className="ml-2 text-sm">- Deterministic demo mode for reproducible results</span>
                    </div>
                </div>
            )}

            {/* Header */}
            <header className="bg-white shadow-lg border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center py-4">
                        <div className="flex items-center space-x-3">
                            <div className="p-2 bg-blue-600 rounded-lg">
                                <Waves className="h-8 w-8 text-white" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">Weather Engine</h1>
                                <p className="text-sm text-gray-600">Maritime Weather Intelligence</p>
                            </div>
                        </div>
                        
                        <div className="flex items-center space-x-4">
                            <div className="flex items-center space-x-2 text-sm text-gray-600">
                                <MapPin className="h-4 w-4" />
                                <span>Mumbai → Kochi</span>
                            </div>
                            
                            <button
                                onClick={handleOptimize}
                                disabled={isOptimizing || forecastData.length === 0}
                                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                            >
                                {isOptimizing ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                ) : (
                                    <Zap className="h-4 w-4 mr-2" />
                                )}
                                {isOptimizing ? 'Optimizing...' : 'Optimize Speed'}
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Map Section */}
                    <div className="lg:col-span-3">
                        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                            <div className="p-4 border-b border-gray-200">
                                <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                                    <Navigation className="h-5 w-5 mr-2 text-blue-600" />
                                    Route Visualization
                                </h2>
                            </div>
                            <div className="relative">
                                <Map 
                                    forecastData={forecastData} 
                                    selectedTimeIndex={selectedTimeIndex}
                                    speedProfile={speedProfile}
                                />
                                {speedProfile && (
                                    <SpeedOverlay 
                                        speedProfile={speedProfile}
                                        className="absolute top-4 right-4"
                                    />
                                )}
                            </div>
                        </div>

                        {/* Time Slider */}
                        <div className="mt-6 bg-white rounded-xl shadow-lg p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                                    <Clock className="h-5 w-5 mr-2 text-blue-600" />
                                    Timeline Control
                                </h3>
                                <span className="text-sm text-gray-600">
                                    10-day forecast period
                                </span>
                            </div>
                            <TimeSlider 
                                onTimeChange={setSelectedTimeIndex}
                                selectedTimeIndex={selectedTimeIndex}
                            />
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        {/* Optimization Results */}
                        {optimizationResult && (
                            <div className="bg-white rounded-xl shadow-lg p-6">
                                <h3 className="text-lg font-semibold text-gray-900 flex items-center mb-4">
                                    <Fuel className="h-5 w-5 mr-2 text-green-600" />
                                    Fuel Optimization
                                </h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                                        <span className="text-sm font-medium text-green-800">Optimized Fuel</span>
                                        <span className="text-lg font-bold text-green-900">
                                            {optimizationResult.total_fuel.toFixed(2)} tons
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                        <span className="text-sm font-medium text-gray-600">Baseline Fuel</span>
                                        <span className="text-lg font-semibold text-gray-800">
                                            {optimizationResult.naive_fuel.toFixed(2)} tons
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                                        <span className="text-sm font-medium text-blue-800">Savings</span>
                                        <span className="text-xl font-bold text-blue-900">
                                            {optimizationResult.savings_pct.toFixed(1)}%
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Alerts Panel */}
                        <div className="bg-white rounded-xl shadow-lg">
                            <div className="p-4 border-b border-gray-200">
                                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                                    <AlertTriangle className="h-5 w-5 mr-2 text-amber-500" />
                                    Weather Alerts
                                    {alerts.length > 0 && (
                                        <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                            {alerts.length}
                                        </span>
                                    )}
                                </h3>
                            </div>
                            <AlertsPanel alerts={alerts} />
                        </div>

                        {/* Current Weather Info */}
                        {forecastData.length > 0 && (
                            <div className="bg-white rounded-xl shadow-lg p-6">
                                <h3 className="text-lg font-semibold text-gray-900 flex items-center mb-4">
                                    <Wind className="h-5 w-5 mr-2 text-blue-600" />
                                    Current Conditions
                                </h3>
                                {forecastData.map((segment, index) => (
                                    <div key={segment.segment_id} className="mb-4 last:mb-0">
                                        <h4 className="font-medium text-gray-700 mb-2">
                                            Segment {segment.segment_id}
                                        </h4>
                                        {segment.forecast?.times[selectedTimeIndex] && (
                                            <div className="grid grid-cols-2 gap-3 text-sm">
                                                <div className="bg-blue-50 p-2 rounded">
                                                    <div className="text-blue-600 font-medium">Wind</div>
                                                    <div className="text-blue-900">
                                                        {segment.forecast.times[selectedTimeIndex].wind_speed_ms?.toFixed(1)} m/s
                                                    </div>
                                                </div>
                                                <div className="bg-cyan-50 p-2 rounded">
                                                    <div className="text-cyan-600 font-medium">Waves</div>
                                                    <div className="text-cyan-900">
                                                        {segment.forecast.times[selectedTimeIndex].waves?.Hs_m?.toFixed(1)} m
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Segment Speeds & Durations */}
                        <div className="bg-white rounded-xl shadow-lg p-6">
                            <h3 className="text-lg font-semibold text-gray-900 flex items-center mb-4">
                                <Waves className="h-5 w-5 mr-2 text-blue-600" />
                                Segment Speeds
                            </h3>
                            <div className="text-xs text-gray-700 mb-3">
                                Estimated and actual (wave-adjusted) speeds per waypoint. Totals below.
                            </div>
                            <div className="max-h-48 overflow-auto text-xs">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="text-[11px] text-gray-500">
                                            <th className="pb-2">Seg</th>
                                            <th className="pb-2">Dist (nm)</th>
                                            <th className="pb-2">Hs (m)</th>
                                            <th className="pb-2">Est (kn)</th>
                                            <th className="pb-2">Act (kn)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {segmentSpeeds.rows.map(r => (
                                            <tr key={r.segment_id} className="border-t border-gray-100">
                                                <td className="py-1 text-[12px]">{r.segment_id}</td>
                                                <td className="py-1">{r.dist_nm}</td>
                                                <td className="py-1">{r.Hs}</td>
                                                <td className="py-1">{r.est_kn}</td>
                                                <td className="py-1">{r.act_kn}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="mt-3 text-sm">
                                <div>Estimated route duration: <strong>{segmentSpeeds.totalEstDays} days</strong></div>
                                <div>Actual (wave-adjusted): <strong>{segmentSpeeds.totalActDays} days</strong></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default App;