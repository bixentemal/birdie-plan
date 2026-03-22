from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from . import data_store as ds
from .routers import competitions, cost_model

app = FastAPI(title="Birdie Plan", version="0.1.0")

app.include_router(competitions.router)
app.include_router(cost_model.router)
app.mount("/", StaticFiles(directory="static", html=True), name="static")


@app.on_event("startup")
def startup():
    ds.load()
