from fastapi import APIRouter, HTTPException

from ..models import Competition
from .. import data_store as ds

router = APIRouter(prefix="/api/competitions", tags=["competitions"])


@router.get("")
def list_competitions():
    return ds.get_all()


@router.get("/{comp_id}")
def get_competition(comp_id: str):
    comp = ds.get_by_id(comp_id)
    if not comp:
        raise HTTPException(404, "Competition not found")
    return comp


@router.post("", status_code=201)
def create_competition(comp: Competition):
    return ds.create(comp.model_dump())


@router.put("/{comp_id}")
def update_competition(comp_id: str, comp: Competition):
    result = ds.update(comp_id, comp.model_dump(exclude={"id"}))
    if not result:
        raise HTTPException(404, "Competition not found")
    return result


@router.delete("/{comp_id}", status_code=204)
def delete_competition(comp_id: str):
    if not ds.delete(comp_id):
        raise HTTPException(404, "Competition not found")
