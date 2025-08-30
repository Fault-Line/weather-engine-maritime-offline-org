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
    cache_key = f"{lat},{lon}"
    if cache_key in CACHE:
        cached_data, timestamp = CACHE[cache_key]
        if time.time() - timestamp < CACHE_TTL_SECONDS:
            return cached_data

    data = fetch_onecall(lat, lon)
    normalized_data = normalize_onecall(data)
    CACHE[cache_key] = (normalized_data, time.time())
    return normalized_data