from pydantic import BaseModel


class Competition(BaseModel):
    id: str = ""
    date_start: str
    date_end: str
    event_name: str
    city: str
    golf_course: str = ""
    department: str = ""
    department_code: str = ""
    latitude: float = 0.0
    longitude: float = 0.0
    age_category: str = ""
    source: str  # "club" | "grand_prix"
    club_file: str = ""
    driving_minutes: int = 0
    distance_km: int = 0
    distance_category: str = "local"


class CompetitionWithCosts(Competition):
    total_days: int = 0
    hotel_nights: int = 0
    cost_meals: float = 0
    cost_hotel: float = 0
    cost_ev: float = 0
    cost_tolls: float = 0
    cost_entry: float = 0
    cost_total: float = 0
    has_override: bool = False
    selected: bool = False


class CostModel(BaseModel):
    meal_local_per_day: float = 10
    meal_away_per_day: float = 54
    hotel_per_night: float = 80
    ev_cost_per_km: float = 0.04
    toll_rate_per_km: float = 0.08
    toll_autoroute_ratio: float = 0.70
    gp_prep_day: bool = True
    entry_fee_club: float = 10
    entry_fee_gp: float = 50


class CostOverride(BaseModel):
    cost_meals: float | None = None
    cost_hotel: float | None = None
    cost_ev: float | None = None
    cost_tolls: float | None = None
    cost_entry: float | None = None
