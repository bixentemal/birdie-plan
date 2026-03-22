# Birdie Plan

A golf competition planner for the 2026 season. Helps a young player (U17/U18) decide which club and Grand Prix competitions to attend, by computing travel costs, visualizing competitions on a timeline and map, and tracking a season budget.

## Features

- **Competition timeline** — visual overview of all available competitions across the season
- **Interactive map** — see competition locations and distances from home
- **Cost estimation** — automatic cost calculation (meals, hotel, EV fuel, tolls, entry fees) based on distance category
- **Selection planner** — pick which competitions to attend, with smart defaults (2 closest clubs/month + 1 GP in key months)
- **Configurable cost model** — adjust rates for meals, hotel, tolls, etc.
- **Per-competition overrides** — override computed costs for specific events

## Setup

Requires Python 3.14+ and [uv](https://docs.astral.sh/uv/).

```bash
uv sync
```

## Running

```bash
uv run uvicorn app.main:app --reload
```

Then open http://localhost:8000.

## Data Pipeline

The competition data comes from FFGOLF markdown documents, processed through a series of scripts:

1. **`parse_golf_docs.py`** — Parse Grand Prix and club calendar markdown files into CSV
2. **`fetch_distances.py`** — Geocode cities and fetch driving distances from home via Nominatim/OSRM
3. **`fetch_departments.py`** — Enrich with French department data via reverse geocoding

These scripts are run occasionally to refresh the dataset. The web app reads from the resulting CSV and JSON files in `data/`.

## Project Structure

```
app/                  # FastAPI web application
  main.py             # App setup, static file serving
  models.py           # Pydantic models (Competition, CostModel, etc.)
  data_store.py       # In-memory data store backed by CSV/JSON
  routers/            # API route handlers
static/               # Frontend (vanilla HTML/JS/CSS)
data/                 # Competition data, cost model, caches
build_timeline.py     # Standalone Plotly HTML timeline generator
```

## Key Concepts

- **Distance categories**: local (≤2h drive), regional (2–4h), national (4h+) — determines hotel needs and meal rates
- **Cost model**: configurable rates for meals, hotel, EV charging, tolls, entry fees; Grand Prix events include an extra preparation day
- **Origin**: configurable home city used for distance/cost calculations
