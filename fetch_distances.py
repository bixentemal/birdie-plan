"""Geocode competition cities and fetch driving distances from Fonsorbes via OSRM."""

import csv
import json
import time
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen, Request

DATA_DIR = Path("/Users/vincent/dev/golf_stats/data")
CURATED_CSV = DATA_DIR / "competitions_2026_u17.csv"
COORDS_CACHE = DATA_DIR / "city_coordinates.json"
DISTANCES_CACHE = DATA_DIR / "city_distances.json"

# Fonsorbes coordinates
ORIGIN_LAT = 43.5372
ORIGIN_LNG = 1.2314

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
OSRM_URL = "https://router.project-osrm.org/route/v1/driving"


def fetch_json(url: str) -> dict:
    req = Request(url, headers={"User-Agent": "golf-stats-script/1.0"})
    with urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def geocode_city(city: str) -> dict | None:
    """Geocode a city name using Nominatim. Returns {lat, lng} or None."""
    query = f"{city}, France"
    url = f"{NOMINATIM_URL}?q={quote(query)}&format=json&limit=1&countrycodes=fr"
    try:
        results = fetch_json(url)
        if results:
            return {"lat": float(results[0]["lat"]), "lng": float(results[0]["lon"])}
    except Exception as e:
        print(f"  Geocoding error for {city}: {e}")
    return None


def get_driving_route(lat: float, lng: float) -> dict | None:
    """Get driving distance/time from Fonsorbes to destination via OSRM."""
    url = f"{OSRM_URL}/{ORIGIN_LNG},{ORIGIN_LAT};{lng},{lat}?overview=false"
    try:
        result = fetch_json(url)
        if result.get("code") == "Ok" and result.get("routes"):
            route = result["routes"][0]
            return {
                "distance_km": round(route["distance"] / 1000, 1),
                "duration_minutes": round(route["duration"] / 60, 1),
            }
    except Exception as e:
        print(f"  OSRM error: {e}")
    return None


def load_unique_cities() -> list[str]:
    with open(CURATED_CSV, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return sorted(set(r["city"] for r in reader))


def main():
    cities = load_unique_cities()
    print(f"Found {len(cities)} unique cities")

    # Step 1: Geocode
    coords = {}
    if COORDS_CACHE.exists():
        coords = json.loads(COORDS_CACHE.read_text())
        print(f"Loaded {len(coords)} cached coordinates")

    missing_coords = [c for c in cities if c not in coords]
    if missing_coords:
        print(f"Geocoding {len(missing_coords)} cities...")
        for i, city in enumerate(missing_coords):
            result = geocode_city(city)
            if result:
                coords[city] = result
                print(f"  [{i+1}/{len(missing_coords)}] {city} -> {result['lat']:.4f}, {result['lng']:.4f}")
            else:
                print(f"  [{i+1}/{len(missing_coords)}] {city} -> FAILED")
            time.sleep(1.1)  # Nominatim rate limit

        COORDS_CACHE.write_text(json.dumps(coords, indent=2, ensure_ascii=False))
        print(f"Saved {len(coords)} coordinates to cache")

    failed_geocode = [c for c in cities if c not in coords]
    if failed_geocode:
        print(f"\nWARNING: {len(failed_geocode)} cities failed geocoding: {failed_geocode}")

    # Step 2: Get driving distances via OSRM
    distances = {}
    if DISTANCES_CACHE.exists():
        distances = json.loads(DISTANCES_CACHE.read_text())
        print(f"Loaded {len(distances)} cached distances")

    missing_dist = [c for c in cities if c in coords and c not in distances]
    if missing_dist:
        print(f"Fetching driving distances for {len(missing_dist)} cities...")
        for i, city in enumerate(missing_dist):
            c = coords[city]
            result = get_driving_route(c["lat"], c["lng"])
            if result:
                distances[city] = result
                mins = result["duration_minutes"]
                km = result["distance_km"]
                print(f"  [{i+1}/{len(missing_dist)}] {city} -> {mins:.0f}min, {km:.0f}km")
            else:
                print(f"  [{i+1}/{len(missing_dist)}] {city} -> FAILED")
            time.sleep(0.5)  # Be polite to OSRM demo server

        DISTANCES_CACHE.write_text(json.dumps(distances, indent=2, ensure_ascii=False))
        print(f"Saved {len(distances)} distances to cache")

    failed_dist = [c for c in cities if c in coords and c not in distances]
    if failed_dist:
        print(f"\nWARNING: {len(failed_dist)} cities failed routing: {failed_dist}")

    # Summary
    print(f"\n=== Summary ===")
    print(f"Cities: {len(cities)}")
    print(f"Geocoded: {len(coords)}")
    print(f"Routed: {len(distances)}")

    # Quick category breakdown
    local = regional = national = 0
    for city, d in distances.items():
        mins = d["duration_minutes"]
        if mins <= 120:
            local += 1
        elif mins <= 240:
            regional += 1
        else:
            national += 1
    print(f"Local (0-2h): {local} cities")
    print(f"Regional (2-4h): {regional} cities")
    print(f"National (4h+): {national} cities")


if __name__ == "__main__":
    main()
