"""Fetch French department for each city using Nominatim reverse geocoding.

Uses cached coordinates from city_coordinates.json.
Stores results in city_departments.json and enriches the competitions CSV.
"""

import csv
import json
import time
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen, Request

DATA_DIR = Path(__file__).parent / "data"
COORDS_CACHE = DATA_DIR / "city_coordinates.json"
DEPT_CACHE = DATA_DIR / "city_departments.json"
CSV_PATH = DATA_DIR / "competitions_2026_u17_costs.csv"

NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"


def fetch_json(url: str) -> dict:
    req = Request(url, headers={"User-Agent": "golf-stats-script/1.0"})
    with urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def reverse_geocode(lat: float, lng: float) -> dict | None:
    """Reverse geocode to get department name and code."""
    url = (
        f"{NOMINATIM_REVERSE_URL}?lat={lat}&lon={lng}"
        f"&format=json&zoom=8&addressdetails=1"
    )
    try:
        result = fetch_json(url)
        addr = result.get("address", {})
        # French departments appear in different fields depending on zoom
        dept = addr.get("county", "")
        # state = region (e.g. Occitanie), county = department (e.g. Haute-Garonne)
        postcode = addr.get("postcode", "")
        dept_code = postcode[:2] if postcode else ""
        # For Corsica and DOM-TOM, postcode prefix may be 3 digits
        if postcode and postcode[:2] in ("20",):
            dept_code = postcode[:3] if len(postcode) >= 3 else postcode[:2]
        return {"department": dept, "department_code": dept_code}
    except Exception as e:
        print(f"  Reverse geocoding error: {e}")
    return None


def main():
    coords = json.loads(COORDS_CACHE.read_text())
    print(f"Loaded {len(coords)} city coordinates")

    # Load existing department cache
    depts = {}
    if DEPT_CACHE.exists():
        depts = json.loads(DEPT_CACHE.read_text())
        print(f"Loaded {len(depts)} cached departments")

    missing = [c for c in coords if c not in depts]
    if missing:
        print(f"Fetching departments for {len(missing)} cities...")
        for i, city in enumerate(missing):
            c = coords[city]
            result = reverse_geocode(c["lat"], c["lng"])
            if result:
                depts[city] = result
                print(f"  [{i+1}/{len(missing)}] {city} -> {result['department']} ({result['department_code']})")
            else:
                print(f"  [{i+1}/{len(missing)}] {city} -> FAILED")
            time.sleep(1.1)  # Nominatim rate limit: 1 req/sec

        DEPT_CACHE.write_text(json.dumps(depts, indent=2, ensure_ascii=False))
        print(f"Saved {len(depts)} departments to cache")

    # Enrich the CSV
    print(f"\nEnriching CSV with department + coordinates...")
    rows = []
    with open(CSV_PATH, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        original_fields = reader.fieldnames
        for row in reader:
            city = row["city"]
            c = coords.get(city, {})
            d = depts.get(city, {})
            row["department"] = d.get("department", "")
            row["department_code"] = d.get("department_code", "")
            row["latitude"] = c.get("lat", "")
            row["longitude"] = c.get("lng", "")
            rows.append(row)

    # Write enriched CSV - insert new columns after 'city'
    city_idx = original_fields.index("city")
    new_fields = list(original_fields)
    for col in reversed(["department", "department_code", "latitude", "longitude"]):
        if col not in new_fields:
            new_fields.insert(city_idx + 1, col)

    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=new_fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    print(f"CSV enriched: {len(rows)} rows, added columns: department, department_code, latitude, longitude")

    # Summary
    unique_depts = sorted(set(d["department"] for d in depts.values() if d["department"]))
    print(f"\n{len(unique_depts)} departments found:")
    for d in unique_depts:
        count = sum(1 for v in depts.values() if v["department"] == d)
        print(f"  {d}: {count} cities")


if __name__ == "__main__":
    main()
