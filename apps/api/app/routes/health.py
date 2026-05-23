"""Liveness / readiness endpoints for Railway and uptime monitors."""
from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def root():
    return {"name": "group-holiday-api", "version": "0.2.0-alpha"}


@router.get("/healthz")
def healthz():
    return {"status": "ok"}
