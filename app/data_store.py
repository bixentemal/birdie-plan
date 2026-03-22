"""CSV-backed data store for competitions, cost model, overrides, and selections."""

import csv
import json
import uuid
from datetime import date
from pathlib import Path

from .models import CostModel, CostOverride

DATA_DIR = Path(__file__).parent.parent / "data"
CSV_PATH = DATA_DIR / "competitions_2026_u17_costs.csv"
COST_MODEL_PATH = DATA_DIR / "cost_model.json"
OVERRIDES_PATH = DATA_DIR / "cost_overrides.json"
SELECTIONS_PATH = DATA_DIR / "selections.json"

# In-memory state
_competitions: list[dict] = []
_cost_model: CostModel = CostModel()
_overrides: dict[str, CostOverride] = {}
_selections: set[str] = set()

CSV_FIELDS = [
    "id", "date_start", "date_end", "event_name", "city", "golf_course",
    "department", "department_code", "latitude", "longitude",
    "age_category", "source", "club_file",
    "driving_minutes", "distance_km", "distance_category",
    "total_days", "hotel_nights",
    "cost_meals", "cost_hotel", "cost_ev", "cost_tolls", "cost_entry", "cost_total",
]


def _int(v, default=0):
    try:
        return int(float(v))
    except (ValueError, TypeError):
        return default


def _float(v, default=0.0):
    try:
        return float(v)
    except (ValueError, TypeError):
        return default


def load():
    """Load all data from disk."""
    global _competitions, _cost_model, _overrides, _selections

    # Load competitions from CSV
    _competitions = []
    with open(CSV_PATH, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if "id" not in row or not row.get("id"):
                row["id"] = str(uuid.uuid4())[:8]
            row["latitude"] = _float(row.get("latitude"))
            row["longitude"] = _float(row.get("longitude"))
            row["driving_minutes"] = _int(row.get("driving_minutes"))
            row["distance_km"] = _int(row.get("distance_km"))
            row["total_days"] = _int(row.get("total_days"))
            row["hotel_nights"] = _int(row.get("hotel_nights"))
            row["cost_meals"] = _float(row.get("cost_meals"))
            row["cost_hotel"] = _float(row.get("cost_hotel"))
            row["cost_ev"] = _float(row.get("cost_ev"))
            row["cost_tolls"] = _float(row.get("cost_tolls"))
            row["cost_entry"] = _float(row.get("cost_entry"))
            row["cost_total"] = _float(row.get("cost_total"))
            _competitions.append(row)

    # Load cost model
    if COST_MODEL_PATH.exists():
        _cost_model = CostModel(**json.loads(COST_MODEL_PATH.read_text()))
    else:
        _cost_model = CostModel()
        _save_cost_model()

    # Load overrides
    if OVERRIDES_PATH.exists():
        raw = json.loads(OVERRIDES_PATH.read_text())
        _overrides = {k: CostOverride(**v) for k, v in raw.items()}
    else:
        _overrides = {}
        _save_overrides()

    # Load selections
    if SELECTIONS_PATH.exists():
        _selections = set(json.loads(SELECTIONS_PATH.read_text()))
    else:
        _selections = _compute_default_selections()
        _save_selections()

    # Recompute all costs with current model
    _recompute_all()
    _save_csv()


def _compute_default_selections() -> set[str]:
    """Initial selection: 2 closest clubs/month + 1 closest GP in Jun/Jul/Sep/Oct/Nov."""
    gp_months = {"2026-06", "2026-07", "2026-09", "2026-10", "2026-11"}
    selected = set()

    # Clubs: 2 closest per month (local only)
    clubs_by_month: dict[str, list[dict]] = {}
    for c in _competitions:
        if c["source"] == "club" and c.get("distance_category") == "local":
            m = c["date_start"][:7]
            clubs_by_month.setdefault(m, []).append(c)
    for evts in clubs_by_month.values():
        evts.sort(key=lambda r: r["driving_minutes"])
        for r in evts[:2]:
            selected.add(r["id"])

    # GP: 1 closest per selected month (local/regional)
    gps_by_month: dict[str, list[dict]] = {}
    for c in _competitions:
        if c["source"] == "grand_prix" and c.get("distance_category") in ("local", "regional"):
            m = c["date_start"][:7]
            if m in gp_months:
                gps_by_month.setdefault(m, []).append(c)
    for evts in gps_by_month.values():
        evts.sort(key=lambda r: r["driving_minutes"])
        if evts:
            selected.add(evts[0]["id"])

    return selected


def compute_cost(comp: dict, model: CostModel | None = None, override: CostOverride | None = None) -> dict:
    """Recompute cost fields for a competition."""
    m = model or _cost_model

    d_start = date.fromisoformat(comp["date_start"])
    d_end = date.fromisoformat(comp["date_end"])
    competition_days = (d_end - d_start).days + 1
    total_days = competition_days + 1 if (m.gp_prep_day and comp["source"] == "grand_prix") else competition_days

    cat = comp.get("distance_category", "local")
    hotel_nights = 0 if cat == "local" else total_days - 1

    distance_km = comp["distance_km"]
    round_trip_km = distance_km * 2
    meal_rate = m.meal_local_per_day if cat == "local" else m.meal_away_per_day

    cost_meals = round(total_days * meal_rate, 2)
    cost_hotel = round(hotel_nights * m.hotel_per_night, 2)
    cost_ev = round(round_trip_km * m.ev_cost_per_km, 2)
    cost_tolls = round(distance_km * m.toll_autoroute_ratio * m.toll_rate_per_km * 2, 2)
    cost_entry = m.entry_fee_gp if comp["source"] == "grand_prix" else m.entry_fee_club

    # Apply overrides
    if override:
        if override.cost_meals is not None:
            cost_meals = override.cost_meals
        if override.cost_hotel is not None:
            cost_hotel = override.cost_hotel
        if override.cost_ev is not None:
            cost_ev = override.cost_ev
        if override.cost_tolls is not None:
            cost_tolls = override.cost_tolls
        if override.cost_entry is not None:
            cost_entry = override.cost_entry

    comp["total_days"] = total_days
    comp["hotel_nights"] = hotel_nights
    comp["cost_meals"] = cost_meals
    comp["cost_hotel"] = cost_hotel
    comp["cost_ev"] = cost_ev
    comp["cost_tolls"] = cost_tolls
    comp["cost_entry"] = cost_entry
    comp["cost_total"] = round(cost_meals + cost_hotel + cost_ev + cost_tolls + cost_entry, 2)
    return comp


def _recompute_all():
    for c in _competitions:
        override = _overrides.get(c["id"])
        compute_cost(c, _cost_model, override)


def _save_csv():
    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(_competitions)


def _save_cost_model():
    COST_MODEL_PATH.write_text(json.dumps(_cost_model.model_dump(), indent=2))


def _save_overrides():
    raw = {k: v.model_dump(exclude_none=True) for k, v in _overrides.items()}
    OVERRIDES_PATH.write_text(json.dumps(raw, indent=2))


def _save_selections():
    SELECTIONS_PATH.write_text(json.dumps(sorted(_selections), indent=2))


# ── Public API ──

def get_all() -> list[dict]:
    return _competitions


def get_by_id(comp_id: str) -> dict | None:
    return next((c for c in _competitions if c["id"] == comp_id), None)


def create(data: dict) -> dict:
    data["id"] = str(uuid.uuid4())[:8]
    compute_cost(data, _cost_model)
    _competitions.append(data)
    _save_csv()
    return data


def update(comp_id: str, data: dict) -> dict | None:
    comp = get_by_id(comp_id)
    if not comp:
        return None
    for k, v in data.items():
        if k != "id":
            comp[k] = v
    override = _overrides.get(comp_id)
    compute_cost(comp, _cost_model, override)
    _save_csv()
    return comp


def delete(comp_id: str) -> bool:
    global _competitions
    before = len(_competitions)
    _competitions = [c for c in _competitions if c["id"] != comp_id]
    if len(_competitions) < before:
        _selections.discard(comp_id)
        _overrides.pop(comp_id, None)
        _save_csv()
        _save_selections()
        _save_overrides()
        return True
    return False


def get_cost_model() -> CostModel:
    return _cost_model


def update_cost_model(model: CostModel) -> CostModel:
    global _cost_model
    _cost_model = model
    _recompute_all()
    _save_cost_model()
    _save_csv()
    return _cost_model


def get_overrides() -> dict[str, CostOverride]:
    return _overrides


def set_override(comp_id: str, override: CostOverride) -> dict | None:
    comp = get_by_id(comp_id)
    if not comp:
        return None
    _overrides[comp_id] = override
    compute_cost(comp, _cost_model, override)
    _save_overrides()
    _save_csv()
    return comp


def delete_override(comp_id: str) -> dict | None:
    comp = get_by_id(comp_id)
    if not comp:
        return None
    _overrides.pop(comp_id, None)
    compute_cost(comp, _cost_model)
    _save_overrides()
    _save_csv()
    return comp


def get_selections() -> set[str]:
    return _selections


def toggle_selection(comp_id: str) -> bool:
    """Toggle selection. Returns new state (True=selected)."""
    if comp_id in _selections:
        _selections.discard(comp_id)
        _save_selections()
        return False
    else:
        _selections.add(comp_id)
        _save_selections()
        return True


def set_selections_bulk(ids: list[str]) -> set[str]:
    global _selections
    _selections = set(ids)
    _save_selections()
    return _selections


def get_timeline_data() -> list[dict]:
    """Return all competitions with costs + selection state."""
    result = []
    for c in _competitions:
        entry = {**c}
        entry["selected"] = c["id"] in _selections
        entry["has_override"] = c["id"] in _overrides
        result.append(entry)
    return result
