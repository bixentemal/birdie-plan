"""Parse FFGOLF scraped markdown files into a single CSV."""

import csv
import json
import re
from datetime import date, timedelta
from pathlib import Path

DOCS_DIR = Path("/Users/vincent/Documents/Golfs_documents_stats")
OUTPUT = Path("/Users/vincent/dev/golf_stats/data/competitions_2026.csv")
OUTPUT_CURATED = Path("/Users/vincent/dev/golf_stats/data/competitions_2026_u17.csv")
OUTPUT_COSTS = Path("/Users/vincent/dev/golf_stats/data/competitions_2026_u17_costs.csv")
DISTANCES_CACHE = Path("/Users/vincent/dev/golf_stats/data/city_distances.json")

# Age categories that a 17-year-old cannot enter
EXCLUDED_CATEGORIES = {"U10", "U12", "U14", "U16", "Benjamins", "Minimes", "Seniors", "Dames", "Cadets"}

# Cities to exclude (not drivable)
EXCLUDED_CITIES = {"LA REUNION", "ST GILLES LES HAUTS"}

# Cost parameters
MEAL_LOCAL_PER_DAY = 10  # coffees & drinks only (sandwiches from home), 2 persons
MEAL_AWAY_PER_DAY = 54   # sandwich lunch (7€/pers) + complete meal (20€/pers) × 2 persons
HOTEL_PER_NIGHT = 80     # €/night
EV_COST_PER_KM = 0.04   # €/km
TOLL_RATE_PER_KM = 0.08  # €/km, estimated on ~70% of distance (autoroute portion)
TOLL_AUTOROUTE_RATIO = 0.70

MONTH_MAP = {
    "janvier": "01", "février": "02", "mars": "03", "avril": "04",
    "mai": "05", "juin": "06", "juillet": "07", "août": "08",
    "septembre": "09", "octobre": "10", "novembre": "11", "décembre": "12",
    # Abbreviated forms (club files)
    "janv.": "01", "févr.": "02", "avr.": "04",
    "juil.": "07", "sept.": "09", "oct.": "10", "nov.": "11", "déc.": "12",
}

# Known month names (for detecting month header lines in GP files)
MONTH_NAMES = {
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
}

# Lines to skip in GP/GPJ files
SKIP_LINES = {
    "VAINQUEUR", "SCORES", "TABLEAU OFFICIEL", "INSCRIPTION / ENTRY",
    "LISTE DES INSCRITS", "DÉTAILS DU TOURNOI", "REPORT TBA",
    "PARTENAIRES OFFICIELS",
}

# Age category patterns to look for in event names
AGE_PATTERNS = [
    (r'\bU10\b', "U10"),
    (r'\bU12\b', "U12"),
    (r'\bU14\b', "U14"),
    (r'\bU16\b', "U16"),
    (r'\b[Bb]enjamins?\b', "Benjamins"),
    (r'\b[Mm]inimes?\b', "Minimes"),
    (r'(?i)\bS[ÉéEe]NIORS?\b', "Seniors"),
    (r'\b[Cc]adets?\b', "Cadets"),
    (r'\b[Dd]ames\b', "Dames"),
]

YEAR = "2026"


def infer_age_category(event_name: str) -> str:
    categories = []
    for pattern, label in AGE_PATTERNS:
        if re.search(pattern, event_name):
            if label not in categories:
                categories.append(label)
    return " - ".join(categories)


def parse_date(day_str: str, month_str: str) -> str:
    """Convert day + French month to ISO date string."""
    day = int(day_str.strip())
    month = MONTH_MAP.get(month_str.lower())
    if not month:
        # Try matching partial
        for key, val in MONTH_MAP.items():
            if month_str.lower().startswith(key.rstrip(".")):
                month = val
                break
    if not month:
        raise ValueError(f"Unknown month: {month_str}")
    return f"{YEAR}-{month}-{day:02d}"


def is_all_caps_line(line: str) -> bool:
    """Check if a line is all uppercase (golf course or city)."""
    stripped = line.strip()
    if not stripped:
        return False
    # Allow uppercase letters, spaces, hyphens, apostrophes, digits, dots
    return stripped == stripped.upper() and any(c.isalpha() for c in stripped)


def parse_grand_prix(filepath: Path, source: str) -> list[dict]:
    """Parse Grand Prix or Grand Prix Jeunes file."""
    lines = filepath.read_text(encoding="utf-8").splitlines()
    rows = []

    # Date pattern: "DD month -" or "DD month"
    date_start_re = re.compile(r'^(\d{1,2})\s+(\w+)\s*-\s*$')
    date_end_re = re.compile(r'^(\d{1,2})\s+(\w+)$')

    i = 0
    while i < len(lines):
        line = lines[i].strip()

        # Try to match a date start line
        m = date_start_re.match(line)
        if not m:
            i += 1
            continue

        day_start, month_start = m.group(1), m.group(2)

        # Next non-empty line should be date end
        i += 1
        while i < len(lines) and not lines[i].strip():
            i += 1
        if i >= len(lines):
            break

        end_line = lines[i].strip()
        m2 = date_end_re.match(end_line)
        if not m2:
            continue

        day_end, month_end = m2.group(1), m2.group(2)

        try:
            date_start = parse_date(day_start, month_start)
            date_end = parse_date(day_end, month_end)
        except ValueError:
            i += 1
            continue

        # Next non-empty line: event name
        i += 1
        while i < len(lines) and not lines[i].strip():
            i += 1
        if i >= len(lines):
            break

        event_name = lines[i].strip()

        # Skip if it looks like a skip line or month header
        if event_name in SKIP_LINES or event_name in MONTH_NAMES:
            i += 1
            continue

        # Skip "REPORT TBA -" prefix in event names
        if event_name.startswith("REPORT TBA - "):
            event_name = event_name.replace("REPORT TBA - ", "")

        # Next line: golf course (all caps) - skip it
        i += 1
        while i < len(lines) and not lines[i].strip():
            i += 1
        if i >= len(lines):
            break

        golf_course_line = lines[i].strip()

        # Next line: city (all caps)
        i += 1
        while i < len(lines) and not lines[i].strip():
            i += 1
        if i >= len(lines):
            break

        city = lines[i].strip()

        # Verify city is all-caps; if not, it might be a metadata line
        # In some cases the golf course line IS the city (when course name is omitted)
        if not is_all_caps_line(city):
            # The golf_course_line might actually be the city
            city = golf_course_line

        age_category = infer_age_category(event_name)

        rows.append({
            "date_start": date_start,
            "date_end": date_end,
            "event_name": event_name,
            "city": city,
            "age_category": age_category,
            "source": source,
            "club_file": "",
        })

        i += 1

    return rows


def parse_club_file(filepath: Path) -> list[dict]:
    """Parse a Competitions_*.md club file."""
    lines = filepath.read_text(encoding="utf-8").splitlines()
    rows = []

    # Extract club name from filename: Competitions_Albi_2026.md -> Albi
    stem = filepath.stem  # e.g. Competitions_Albi_2026
    parts = stem.split("_")
    # Remove "Competitions" prefix and "2026" suffix
    club_name = "_".join(parts[1:-1]) if len(parts) > 2 else parts[1] if len(parts) > 1 else stem

    # Date pattern for club files: "DD month." or "DD month"
    date_re = re.compile(r'^(\d{1,2})\s+(\S+)\s*$')

    # Find content boundaries
    start_idx = 0
    end_idx = len(lines)

    for idx, line in enumerate(lines):
        if "PARTENAIRES OFFICIELS" in line:
            end_idx = idx
            break

    i = 0
    while i < end_idx:
        line = lines[i].strip()

        # Try to match a date line
        m = date_re.match(line)
        if not m:
            i += 1
            continue

        day_str, month_str = m.group(1), m.group(2)

        # Validate that month_str is actually a month
        month_lower = month_str.lower().rstrip(".")
        is_month = False
        for key in MONTH_MAP:
            if key.rstrip(".").startswith(month_lower) or month_lower.startswith(key.rstrip(".")):
                is_month = True
                break
        if not is_month:
            i += 1
            continue

        # Next line should be "2026"
        i += 1
        while i < end_idx and not lines[i].strip():
            i += 1
        if i >= end_idx:
            break

        year_line = lines[i].strip()
        if year_line != "2026":
            continue

        try:
            date = parse_date(day_str, month_str.rstrip("."))
        except ValueError:
            # Try with the period
            try:
                date = parse_date(day_str, month_str)
            except ValueError:
                i += 1
                continue

        # Next non-empty line: event name
        i += 1
        while i < end_idx and not lines[i].strip():
            i += 1
        if i >= end_idx:
            break

        event_name = lines[i].strip()

        # Skip boilerplate
        if event_name in SKIP_LINES or event_name.startswith("Ping Golf") or event_name.startswith("["):
            i += 1
            continue

        # Next line: golf course (skip)
        i += 1
        while i < end_idx and not lines[i].strip():
            i += 1
        if i >= end_idx:
            break

        golf_course = lines[i].strip()

        # Next line: city
        i += 1
        while i < end_idx and not lines[i].strip():
            i += 1
        if i >= end_idx:
            break

        city = lines[i].strip()

        # City should be all caps; if it's "RÉSULTATS" or similar, use golf course location
        if city == "RÉSULTATS" or not is_all_caps_line(city):
            # The city might have been on the golf_course line, or city is the golf_course
            # In club files, the city always follows the golf course
            # If "RÉSULTATS" appears, city was already read as golf_course
            # Actually let's reconsider: the pattern is event_name / golf_course / city / optional RÉSULTATS
            # If city == "RÉSULTATS", then what we thought was golf_course is actually city
            # and what we thought was event_name's next line is golf_course
            # Let's just check if golf_course is all caps and city isn't
            if city == "RÉSULTATS":
                city = golf_course  # golf_course was actually the city
            # else keep as-is

        age_category = infer_age_category(event_name)

        rows.append({
            "date_start": date,
            "date_end": date,
            "event_name": event_name,
            "city": city,
            "age_category": age_category,
            "source": "club",
            "club_file": club_name,
        })

        i += 1

    return rows


def main():
    all_rows = []

    # 1. Grand Prix
    gp_file = DOCS_DIR / "Grands_prix_2026.md"
    if gp_file.exists():
        rows = parse_grand_prix(gp_file, "grand_prix")
        print(f"Grand Prix: {len(rows)} events parsed")
        all_rows.extend(rows)

    # 2. Grand Prix Jeunes
    gpj_file = DOCS_DIR / "Grands_prix_jeunes_2026.md"
    if gpj_file.exists():
        rows = parse_grand_prix(gpj_file, "grand_prix_jeunes")
        print(f"Grand Prix Jeunes: {len(rows)} events parsed")
        all_rows.extend(rows)

    # 3. Club competitions
    club_total = 0
    for club_file in sorted(DOCS_DIR.glob("Competitions_*.md")):
        rows = parse_club_file(club_file)
        print(f"  {club_file.name}: {len(rows)} events parsed")
        club_total += len(rows)
        all_rows.extend(rows)
    print(f"Club competitions total: {club_total} events parsed")

    # Sort by date
    all_rows.sort(key=lambda r: (r["date_start"], r["date_end"], r["event_name"]))

    # Write CSV
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = ["date_start", "date_end", "event_name", "city", "age_category", "source", "club_file"]
    with open(OUTPUT, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_rows)

    print(f"\nTotal: {len(all_rows)} rows written to {OUTPUT}")

    # Curated version for 17-year-old (Cadets 2 / U18):
    # - Exclude non-matching age categories
    # - Exclude grand_prix_jeunes entirely (no Cadets/U18 events in GPJ calendar)
    curated_rows = [
        r for r in all_rows
        if r["source"] != "grand_prix_jeunes"
        and not any(exc in r["age_category"] for exc in EXCLUDED_CATEGORIES)
    ]
    with open(OUTPUT_CURATED, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(curated_rows)

    excluded = len(all_rows) - len(curated_rows)
    print(f"Curated (17yo): {len(curated_rows)} rows written to {OUTPUT_CURATED} ({excluded} excluded)")

    # Enrich with costs
    enrich_with_costs(curated_rows)


def enrich_with_costs(rows: list[dict]):
    """Add distance category and cost columns, write enriched CSV."""
    if not DISTANCES_CACHE.exists():
        print("WARNING: city_distances.json not found. Run fetch_distances.py first.")
        return

    distances = json.loads(DISTANCES_CACHE.read_text())

    # Exclude non-drivable cities
    rows = [r for r in rows if r["city"] not in EXCLUDED_CITIES]

    enriched = []
    missing_cities = set()

    for row in rows:
        city = row["city"]
        dist_info = distances.get(city)

        if not dist_info:
            missing_cities.add(city)
            continue

        driving_min = dist_info["duration_minutes"]
        distance_km = dist_info["distance_km"]

        # Distance category
        if driving_min <= 120:
            category = "local"
        elif driving_min <= 240:
            category = "regional"
        else:
            category = "national"

        # Days calculation
        d_start = date.fromisoformat(row["date_start"])
        d_end = date.fromisoformat(row["date_end"])
        competition_days = (d_end - d_start).days + 1
        # Grand Prix: +1 day for preparation round the day before
        total_days = competition_days + 1 if row["source"] == "grand_prix" else competition_days

        # Hotel nights: 0 for local, total_days - 1 for regional/national
        hotel_nights = 0 if category == "local" else total_days - 1

        # Costs
        round_trip_km = distance_km * 2
        meal_rate = MEAL_LOCAL_PER_DAY if category == "local" else MEAL_AWAY_PER_DAY
        cost_meals = total_days * meal_rate
        cost_hotel = hotel_nights * HOTEL_PER_NIGHT
        cost_ev = round(round_trip_km * EV_COST_PER_KM, 2)
        cost_tolls = round(distance_km * TOLL_AUTOROUTE_RATIO * TOLL_RATE_PER_KM * 2, 2)
        cost_total = round(cost_meals + cost_hotel + cost_ev + cost_tolls, 2)

        enriched_row = {
            **row,
            "driving_minutes": round(driving_min),
            "distance_km": round(distance_km),
            "distance_category": category,
            "total_days": total_days,
            "hotel_nights": hotel_nights,
            "cost_meals": cost_meals,
            "cost_hotel": cost_hotel,
            "cost_ev": cost_ev,
            "cost_tolls": cost_tolls,
            "cost_total": cost_total,
        }
        enriched.append(enriched_row)

    if missing_cities:
        print(f"WARNING: {len(missing_cities)} cities missing from distance cache: {missing_cities}")

    # Write enriched CSV
    cost_fields = [
        "date_start", "date_end", "event_name", "city", "age_category", "source", "club_file",
        "driving_minutes", "distance_km", "distance_category",
        "total_days", "hotel_nights",
        "cost_meals", "cost_hotel", "cost_ev", "cost_tolls", "cost_total",
    ]
    with open(OUTPUT_COSTS, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=cost_fields)
        writer.writeheader()
        writer.writerows(enriched)

    # Summary
    by_cat = {"local": [], "regional": [], "national": []}
    for r in enriched:
        by_cat[r["distance_category"]].append(r["cost_total"])

    print(f"\nCost-enriched: {len(enriched)} rows written to {OUTPUT_COSTS}")
    for cat in ("local", "regional", "national"):
        costs = by_cat[cat]
        if costs:
            avg = sum(costs) / len(costs)
            print(f"  {cat}: {len(costs)} events, avg cost {avg:.0f}€ (min {min(costs):.0f}€, max {max(costs):.0f}€)")


if __name__ == "__main__":
    main()
