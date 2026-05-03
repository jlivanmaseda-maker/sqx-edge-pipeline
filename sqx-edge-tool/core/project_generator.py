"""
project_generator.py — Orquestador. Toma un mining + plantilla seed y genera un .cfx
listo para SQX, con todos los XMLs internos parametrizados.

Si data.db de SQX está disponible, los costos (spread/swap/commission) se leen de ahí.
Si no, se usa ASSET_DEFAULTS (aproximaciones de Darwinex).
"""
from __future__ import annotations

import os
from typing import Optional

from .cfx_editor import CfxEditor
from .plan import Mining
from .sqx_db import SqxDb
from .xml_patcher import RETEST_PERIODS, apply_mining_to_xml, patch_dates


# ── Mapeo task XML → tipo de retest, por capa ──
# La estructura interna del .cfx difiere entre Capa 1 y Capa 2:
#   Capa 1 (EDGE LONG.cfx): Retest-Task3=RETEST 0, Retest-Task1=RETEST 1, Retest-Task2=FOWARD
#   Capa 2 (EDGE + FOWARD(2).cfx): Retest-Task1=RETEST 0, AR-Task7=RETEST 1, Retest-Task2=FOWARD
# Si añades una nueva capa o cambias el seed, actualiza este mapa.
TASK_PERIOD_MAP_CAPA1 = {
    "Build-Task1.xml":   "BUILD",
    "Retest-Task3.xml":  "RETEST_0",
    "Retest-Task1.xml":  "RETEST_1",
    "Retest-Task2.xml":  "FOWARD",
}
TASK_PERIOD_MAP_CAPA2 = {
    "Build-Task1.xml":            "BUILD",
    "Retest-Task1.xml":           "RETEST_0",
    "AutomaticRetest-Task7.xml":  "RETEST_1",
    "Retest-Task2.xml":           "FOWARD",
    "Optimize-Task1.xml":         "BUILD",  # WFM en Capa 2 usa Optimize sobre IS
}

CAPA_TASK_MAPS = {
    1: TASK_PERIOD_MAP_CAPA1,
    2: TASK_PERIOD_MAP_CAPA2,
}


# Defaults de costos por activo (override desde data.db en F2).
# Estos son valores aproximados de Darwinex; se usan si no hay data en SQX DB.
ASSET_DEFAULTS = {
    "XAUUSD":  {"spread": 30,  "swap_long": -67.8, "swap_short": 38.4},
    "EURUSD":  {"spread": 5,   "swap_long": -1.5,  "swap_short": -1.0},
    "GBPUSD":  {"spread": 8,   "swap_long": -2.0,  "swap_short": -1.5},
    "GBPJPY":  {"spread": 12,  "swap_long": -3.0,  "swap_short": -1.5},
    "USTEC":   {"spread": 100, "swap_long": -8.0,  "swap_short": -5.0},
    "EURGBP":  {"spread": 6,   "swap_long": -1.0,  "swap_short": -1.0},
    "AUDNZD":  {"spread": 10,  "swap_long": -1.5,  "swap_short": -1.5},
}


def _symbol_for_sqx(asset: str, postfix: str = "_darwinex") -> str:
    """Convierte 'XAUUSD' a 'XAUUSD_darwinex' (o el postfix del broker en uso)."""
    return f"{asset}{postfix}"


def resolve_costs(mining: Mining, sqx_db_path: Optional[str], postfix: str = "_darwinex",
                  alias_override: Optional[dict] = None) -> dict:
    """
    Resuelve costos REALES por mining: lee data.db si está disponible, si no usa
    ASSET_DEFAULTS.

    Args:
        mining: Mining del plan
        sqx_db_path: ruta a data.db (None = usa fallback directo)
        postfix: sufijo de broker para construir el symbol final
        alias_override: dict {asset: instrument} para sobreescribir defaults

    Devuelve dict con: source, spread, swap_long, swap_short, swap_type,
    commission_type, commission_value, instrument, symbol.
    """
    # 1) Intentar data.db
    if sqx_db_path and os.path.isfile(sqx_db_path):
        try:
            db = SqxDb(sqx_db_path)
            try:
                info = db.get_symbol_info(mining.asset, alias_override=alias_override)
                if info.get("source") == "db":
                    pf = info.get("broker_postfix") or postfix
                    return {
                        "source": "db",
                        "instrument": info["instrument"],
                        "symbol": _symbol_for_sqx(info["instrument"], pf),
                        "spread": info.get("spread"),
                        "slippage": info.get("slippage"),
                        "swap_long": info.get("swap_long") if info.get("swap_long") is not None else 0.0,
                        "swap_short": info.get("swap_short") if info.get("swap_short") is not None else 0.0,
                        "swap_type": info.get("swap_type"),
                        "commission_type": info.get("commission_type"),
                        "commission_value": info.get("commission_value"),
                        "broker_postfix": pf,
                    }
            finally:
                db.close()
        except Exception:
            pass  # caer a fallback

    # 2) Fallback a ASSET_DEFAULTS
    d = ASSET_DEFAULTS.get(mining.asset, {"spread": 10, "swap_long": -1.0, "swap_short": -1.0})
    return {
        "source": "fallback",
        "instrument": mining.asset,
        "symbol": _symbol_for_sqx(mining.asset, postfix),
        "spread": d["spread"],
        "slippage": 0,
        "swap_long": d["swap_long"],
        "swap_short": d["swap_short"],
        "swap_type": None,
        "commission_type": None,
        "commission_value": None,
        "broker_postfix": postfix,
    }


def generate_project(
    mining: Mining,
    template_path: str,
    output_dir: str,
    capa: int = 1,
    suffix: str = "",
    sqx_data: Optional[dict] = None,
    sqx_db_path: Optional[str] = None,
    broker_postfix: str = "_darwinex",
    alias_override: Optional[dict] = None,
    overwrite: bool = True,
) -> str:
    """
    Genera un .cfx para el mining especificado.

    Args:
        mining: instancia Mining del plan
        template_path: path al .cfx seed (Capa1_Long.cfx o Capa2_Base.cfx)
        output_dir: carpeta donde se guarda el .cfx generado
        capa: 1 o 2 — determina el mapping de tasks → períodos
        suffix: sufijo opcional para el nombre (ej. "_v1")
        sqx_data: dict con datos extraídos de data.db (si None, usa ASSET_DEFAULTS)
        overwrite: sobreescribir si existe

    Returns:
        Path absoluto al .cfx generado.
    """
    if not os.path.isfile(template_path):
        raise FileNotFoundError(f"Template not found: {template_path}")
    if capa not in CAPA_TASK_MAPS:
        raise ValueError(f"capa must be 1 or 2, got {capa}")

    editor = CfxEditor(template_path)
    task_map = CAPA_TASK_MAPS[capa]

    # Resolver costos: data.db → fallback. Override manual con sqx_data si pasa.
    costs = resolve_costs(mining, sqx_db_path, broker_postfix, alias_override=alias_override)
    if sqx_data:
        costs.update(sqx_data)

    # Aplicar patches a todos los XMLs internos del .cfx
    total_stats = {"files_patched": 0, "charts": 0, "swaps": 0, "sides": 0,
                   "dates": 0, "paths_cleaned": 0, "commissions": 0,
                   "costs_source": costs["source"], "symbol": costs["symbol"]}
    for filename, tree in editor.iter_xml_files():
        if filename == "config.xml":
            continue  # config.xml no contiene Setup nodes
        root = tree.getroot()
        # Determinar el período correcto para este task XML según capa
        period_key = task_map.get(filename, "BUILD")
        period = RETEST_PERIODS[period_key]

        stats = apply_mining_to_xml(
            root,
            symbol=costs["symbol"],
            timeframe=mining.tf,
            direction=mining.dir,
            swap_long=costs["swap_long"],
            swap_short=costs["swap_short"],
            spread=costs["spread"],
            swap_type=costs.get("swap_type"),
            commission_type=costs.get("commission_type"),
            commission_value=costs.get("commission_value"),
            period=period,
            clean_paths=True,
        )
        editor.update_xml(filename, tree)
        total_stats["files_patched"] += 1
        for k in ("charts", "swaps", "sides", "dates", "paths_cleaned", "commissions"):
            total_stats[k] += stats[k]

    # Renombrar el proyecto en config.xml (incluye capa en el nombre)
    if editor.has("config.xml"):
        config_tree = editor.parse_xml("config.xml")
        config_tree.getroot().set("name", f"{mining.name}_Capa{capa}")
        editor.update_xml("config.xml", config_tree)

    # Guardar el .cfx
    out_name = f"{mining.name}_Capa{capa}{suffix}.cfx"
    out_path = os.path.abspath(os.path.join(output_dir, out_name))
    editor.save(out_path, overwrite=overwrite)
    return out_path
