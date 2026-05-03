"""
plan.py — Plan de 14 minings (mismo que js/data/plan.js del dashboard).

En F2 esto se sustituirá por un loader que parsee el plan.js / plan_user.json
para mantener un único source-of-truth con el dashboard.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Mining:
    num: int
    phase: int
    asset: str
    asset_type: str  # 'forex' | 'index' | 'oro'
    tf: str
    bs: str
    dir: str  # 'long' | 'short' | 'both' — interno; el dashboard usa 'L' / 'S' / 'L/S'

    @property
    def name(self) -> str:
        return f"Mining{self.num:02d}_{self.asset}_{self.tf}_{self.bs}"

    @property
    def sqx_config(self) -> str:
        """Configuración SQX A/B/C/D según asset_type + dir."""
        return _sqx_cfg(self.asset_type, self.dir)


def _dir(d: str) -> str:
    """Normaliza 'L' → 'long', 'S' → 'short', 'L/S' → 'both'."""
    d = d.strip().upper()
    return {"L": "long", "S": "short", "L/S": "both", "LONG": "long", "SHORT": "short", "BOTH": "both"}[d]


def _sqx_cfg(asset_type: str, dir_: str) -> str:
    """
    Config SQX a aplicar en el Builder según asset_type + dir:
      A · Both + Entry Sym       — Forex L/S simétrico (espejado)
      B · Both sin Symmetry      — Índices/oro L+S asimétrico (raro)
      C · Only Long              — Índices/oro Long puras
      D · Only Short             — Short puras (categoría estrella)
    """
    if dir_ == "short":
        return "D"
    if asset_type == "forex" and dir_ == "both":
        return "A"
    if asset_type in ("index", "oro") and dir_ == "long":
        return "C"
    if asset_type in ("index", "oro") and dir_ == "both":
        return "B"
    # Forex long puro (raro pero posible) → B
    return "B"


PLAN: list[Mining] = [
    # ── FASE 1 — TOP DATA-DRIVEN (composite ≥95%, edge estructural confirmado) ──
    Mining(num=1,  phase=1, asset="AUDCAD", asset_type="forex", tf="M30", bs="BS_Momentum",          dir=_dir("L/S")),  # 100% · A
    Mining(num=2,  phase=1, asset="USTEC",  asset_type="index", tf="H1",  bs="BS_Tendencia",         dir=_dir("L")),    # 100% · C
    Mining(num=3,  phase=1, asset="USTEC",  asset_type="index", tf="H4",  bs="BS_Regimen",           dir=_dir("L")),    # 99%  · C
    Mining(num=4,  phase=1, asset="US500",  asset_type="index", tf="M30", bs="BS_Volumen",           dir=_dir("L")),    # 97%  · C
    Mining(num=5,  phase=1, asset="US30",   asset_type="index", tf="M5",  bs="BS_Volumen",           dir=_dir("L")),    # 95%  · C (intraday)
    Mining(num=6,  phase=1, asset="XAUUSD", asset_type="oro",   tf="H1",  bs="BS_Volatilidad",       dir=_dir("L")),    # 95%  · C

    # ── FASE 2 — DIVERSIFICACIÓN MAJOR + cross-categoría (composite 90-94%) ──
    Mining(num=7,  phase=2, asset="USDCHF", asset_type="forex", tf="H4",  bs="BS_SoporteResistencia",dir=_dir("L/S")),  # 94%  · A
    Mining(num=8,  phase=2, asset="US500",  asset_type="index", tf="H4",  bs="BS_Regimen",           dir=_dir("L")),    # 94%  · C
    Mining(num=9,  phase=2, asset="XAUUSD", asset_type="oro",   tf="H1",  bs="BS_SoporteResistencia",dir=_dir("L")),    # 94%  · C
    Mining(num=10, phase=2, asset="US30",   asset_type="index", tf="H1",  bs="BS_Tendencia",         dir=_dir("L")),    # 92%  · C
    Mining(num=11, phase=2, asset="EURUSD", asset_type="forex", tf="H1",  bs="BS_Tendencia",         dir=_dir("L/S")),  # 90%  · A

    # ── FASE 3 — CRUCES + INTRADAY corto (composite 87-91%) ──
    Mining(num=12, phase=3, asset="EURCHF", asset_type="forex", tf="H4",  bs="BS_Momentum",          dir=_dir("L/S")),  # 91%  · A (mean-revert)
    Mining(num=13, phase=3, asset="EURGBP", asset_type="forex", tf="H4",  bs="BS_SoporteResistencia",dir=_dir("L/S")),  # 89%  · A
    Mining(num=14, phase=3, asset="GER40",  asset_type="index", tf="M15", bs="BS_Volatilidad",       dir=_dir("S")),    # 88%  · D (estrella SHORT)
]


def get(num: int) -> Mining:
    """Devuelve el Mining por número (1-indexed)."""
    for m in PLAN:
        if m.num == num:
            return m
    raise KeyError(f"Mining {num} not in plan")


def all_minings() -> list[Mining]:
    return list(PLAN)
