import json
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..models import CostModel, CostOverride
from .. import data_store as ds

_golf_list = json.loads(Path("data/golf_list.json").read_text())

router = APIRouter(prefix="/api", tags=["cost-model"])


@router.get("/cost-model")
def get_cost_model():
    return ds.get_cost_model()


@router.put("/cost-model")
def update_cost_model(model: CostModel):
    return ds.update_cost_model(model)


@router.get("/cost-overrides")
def get_overrides():
    return ds.get_overrides()


@router.put("/cost-overrides/{comp_id}")
def set_override(comp_id: str, override: CostOverride):
    result = ds.set_override(comp_id, override)
    if not result:
        raise HTTPException(404, "Competition not found")
    return result


@router.delete("/cost-overrides/{comp_id}")
def delete_override(comp_id: str):
    result = ds.delete_override(comp_id)
    if not result:
        raise HTTPException(404, "Competition not found")
    return result


@router.get("/selections")
def get_selections():
    return sorted(ds.get_selections())


@router.put("/selections/{comp_id}")
def toggle_selection(comp_id: str):
    new_state = ds.toggle_selection(comp_id)
    return {"id": comp_id, "selected": new_state}


class BulkSelections(BaseModel):
    ids: list[str]


@router.put("/selections/bulk")
def set_selections_bulk(body: BulkSelections):
    return sorted(ds.set_selections_bulk(body.ids))


@router.get("/golf-courses")
def get_golf_courses():
    return _golf_list


@router.get("/timeline")
def get_timeline():
    return ds.get_timeline_data()
