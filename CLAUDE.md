# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Birdie Plan is a golf competition planner for a young player (U17/U18). It helps plan which club and Grand Prix competitions to attend during the 2026 season, computing travel costs, showing competitions on a timeline/map, and tracking a budget.

## Tech Stack

- **Python 3.14**, managed with **uv**
- **FastAPI** backend serving a vanilla JS/HTML/CSS frontend
- **Plotly** for standalone HTML timeline generation
- **Pydantic** models for API validation
- Data stored in CSV + JSON files (no database)

## Running the App

```bash
uv run uvicorn app.main:app --reload
```

The app serves the frontend from `static/` at the root and the API at `/api/`.

## Architecture

### Web App (`app/`)
- `app/main.py` — FastAPI app setup, mounts static files, loads data on startup
- `app/models.py` — Pydantic models: `Competition`, `CompetitionWithCosts`, `CostModel`, `CostOverride`
- `app/data_store.py` — In-memory data store backed by CSV/JSON files in `data/`. Handles CRUD, cost computation, selections, and overrides. All state is loaded into memory at startup and persisted on mutation.
- `app/routers/competitions.py` — CRUD endpoints for competitions (`/api/competitions`)
- `app/routers/cost_model.py` — Endpoints for cost model, overrides, selections, timeline, and golf courses (`/api/cost-model`, `/api/selections`, `/api/timeline`, etc.)

### Frontend (`static/`)
- `index.html` — Single-page app with timeline, map, competition table, and settings panel
- `app.js` — Main app initialization
- `competitions.js` — Competition table rendering and interaction
- `timeline.js` — Timeline visualization
- `map.js` — Map visualization
- `settings.js` — Cost model settings UI

### Data Pipeline (root-level scripts)
These are one-off/occasional scripts, not part of the web app:
- `parse_golf_docs.py` — Parses FFGOLF markdown files (Grand Prix + club calendars) into CSV. Source docs are in `~/Documents/Golfs_documents_stats/`
- `fetch_distances.py` — Geocodes cities via Nominatim and fetches driving distances from home via OSRM
- `fetch_departments.py` — Reverse-geocodes to get French department info for each city
- `build_timeline.py` — Generates a standalone interactive Plotly HTML timeline (legacy, before the web app)

### Data Files (`data/`)
- `competitions_2026_u17_costs.csv` — Main competition dataset with costs (the web app's primary data source)
- `cost_model.json` — Current cost model parameters
- `cost_overrides.json` — Per-competition cost overrides
- `selections.json` — IDs of selected competitions
- `city_coordinates.json`, `city_distances.json`, `city_departments.json` — Geocoding/routing caches
- `golf_list.json` — Golf course reference data

## Key Concepts

- **Distance categories**: local (<=2h drive), regional (2-4h), national (4h+). Determines hotel needs and meal rates.
- **Cost model**: Configurable rates for meals, hotel, EV charging, tolls, entry fees. Grand Prix events get an extra prep day.
- **Selections**: Which competitions are "selected" for the season plan. Default: 2 closest clubs/month + 1 closest GP in Jun/Jul/Sep/Oct/Nov.
- **Overrides**: Per-competition cost overrides that take precedence over the computed values.
- Origin city coordinates are configured in `fetch_distances.py` (ORIGIN_LAT/ORIGIN_LNG).
