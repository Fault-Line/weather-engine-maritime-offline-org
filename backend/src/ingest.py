from fastapi import HTTPException
import httpx
from typing import List, Dict, Any
import random
import time
import os
from datetime import datetime, timedelta

CACHE_TTL_SECONDS = 3600  # 1 hour cache TTL
CACHE = {}

def fetch_onecall(lat: float, lon: float) -> Dict[str, Any]:
    """Fetch weather data from OpenWeather API"""
    owm_key = os.getenv("OWM_KEY")
    if not owm_key:
        raise HTTPException(status_code=503, detail="OpenWeather API key not configured")
    
    response = httpx.get(
        f"https://api.openweathermap.org/data/2.5/onecall?lat={lat}&lon={lon}&appid={owm_key}&units=metric"
    )
    response.raise_for_status()
    return response.json()

def normalize_onecall(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Normalize the response from the weather API to our internal format"""
    normalized = []
    
    hourly_data = data["hourly"][:240]  # 10 days * 24 hours
    
    for hourly in hourly_data:
        dt_iso = datetime.fromtimestamp(hourly["dt"]).isoformat() + "Z"
        normalized.append({
            "t_iso": dt_iso,
            "wind_speed_ms": hourly.get("wind_speed", 0),
            "wind_deg": hourly.get("wind_deg", 0),
            "waves": {
                "Hs_m": hourly.get("waves", {}).get("Hs_m", 0),
                "Tp_s": hourly.get("waves", {}).get("Tp_s", 0)
            }
        })
    
    return normalized

def get_weather_data(lat: float, lon: float) -> List[Dict[str, Any]]:
    """Get cached or fresh weather data"""
    # Check if we should use mock data
    use_mock = os.getenv("USE_MOCK", "0").lower() in ("1", "true", "yes")
    owm_key = os.getenv("OWM_KEY")
    
    # Use mock data if USE_MOCK is set or if no valid API key
    if use_mock or not owm_key or owm_key == "demo_key_12345":
        return get_mock_weather_data(lat, lon)
    
    cache_key = f"{lat},{lon}"
    if cache_key in CACHE:
        cached_data, timestamp = CACHE[cache_key]
        if time.time() - timestamp < CACHE_TTL_SECONDS:
            return cached_data

    try:
        data = fetch_onecall(lat, lon)
        normalized_data = normalize_onecall(data)
        CACHE[cache_key] = (normalized_data, time.time())
        return normalized_data
    except Exception as e:
        # Fallback to mock data if API call fails
        print(f"API call failed, using mock data: {e}")
        return get_mock_weather_data(lat, lon)

def get_mock_weather_data(lat: float, lon: float) -> List[Dict[str, Any]]:
    """Generate deterministic mock weather data"""
    mock_data = []
    base_time = datetime.now()
    
    for i in range(240):  # 10 days * 24 hours
        time_offset = base_time + timedelta(hours=i)
        
        # Generate deterministic weather based on time and location
        # Use a more varied seed pattern for better randomization
        time_seed = int(time_offset.timestamp()) % 10000
        location_seed = int((lat + lon) * 1000) % 1000
        combined_seed = time_seed + location_seed + i
        random.seed(combined_seed)
        
        # Create more realistic weather patterns
        hour_of_day = time_offset.hour
        day_factor = i // 24  # Which day we're on
        
        # Wind speed varies by time of day and has weather front patterns
        base_wind = 8 + 3 * (day_factor % 3)  # Weather fronts every 3 days
        wind_variation = 2 * (1 + 0.5 * abs(hour_of_day - 12) / 12)  # Stronger at noon/midnight
        wind_speed = base_wind + random.uniform(-wind_variation, wind_variation)
        wind_speed = max(2.0, min(25.0, wind_speed))  # Keep realistic bounds
        
        # Wind direction has daily patterns
        base_direction = 200 + 30 * (day_factor % 5)  # Shifting fronts
        direction_variation = 40 + 20 * random.random()
        wind_direction = (base_direction + direction_variation) % 360
        
        # Wave height correlates with wind speed but with delay
        wave_base = min(wind_speed * 0.15, 4.0)  # Roughly related to wind
        wave_height = wave_base + random.uniform(-0.3, 0.8)
        wave_height = max(0.5, min(6.0, wave_height))  # Realistic bounds
        
        # Wave period increases with wave height
        wave_period = 4 + wave_height * 0.8 + random.uniform(-1, 2)
        wave_period = max(3.0, min(12.0, wave_period))
        
        mock_data.append({
            "t_iso": time_offset.strftime("%Y-%m-%dT%H:%M:%S") + "Z",
            "wind_speed_ms": round(wind_speed, 1),
            "wind_deg": round(wind_direction, 1),
            "waves": {
                "Hs_m": round(wave_height, 1),
                "Tp_s": round(wave_period, 1)
            },
            "mock": True
        })
    
    return mock_data