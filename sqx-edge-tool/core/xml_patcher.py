"""
xml_patcher.py — patches específicos sobre los XMLs internos de un .cfx.

Cada función toma un ElementTree (root) y aplica un cambio puntual.
Se aplican sobre TODOS los Setup nodes encontrados (Build + Retest + AutomaticRetest),
para que el .cfx sea coherente extremo a extremo.
"""
from __future__ import annotations

from typing import Optional
from xml.etree import ElementTree as ET


# Mapeo: tipo de retest → (date_from, date_to). Ajustar al cheatsheet del usuario.
RETEST_PERIODS = {
    "BUILD":     ("2017.10.02", "2023.12.31"),  # IS Capa 1/2
    "RETEST_0":  ("2017.10.02", "2026.04.30"),  # período completo
    "RETEST_1":  ("2010.01.01", "2016.12.31"),  # OOS hacia atrás
    "FOWARD":    ("2024.01.01", "2026.04.30"),  # forward intocado
}


# ── Helpers ───────────────────────────────────────────────────────
def _all_setups(root: ET.Element) -> list[ET.Element]:
    """Devuelve todos los nodos <Setup> encontrados en el XML."""
    return root.findall(".//Setup")


def _all_charts(root: ET.Element) -> list[ET.Element]:
    return root.findall(".//Setup/Chart")


def _all_swaps(root: ET.Element) -> list[ET.Element]:
    return root.findall(".//Setup/Swap")


def _all_market_sides(root: ET.Element) -> list[ET.Element]:
    return root.findall(".//MarketSides")


def _all_strategy_types(root: ET.Element) -> list[ET.Element]:
    return root.findall(".//StrategyType")


# ── Patches por concepto ──────────────────────────────────────────
def patch_symbol_tf_spread(
    root: ET.Element,
    symbol: str,
    timeframe: str,
    spread: Optional[float] = None,
) -> int:
    """Cambia el símbolo + TF (+ spread opcional) en todos los Charts."""
    n = 0
    for chart in _all_charts(root):
        chart.set("symbol", symbol)
        chart.set("timeframe", timeframe)
        if spread is not None:
            chart.set("spread", str(spread))
        n += 1
    return n


def patch_swap(root: ET.Element, swap_long: float, swap_short: float,
               swap_type: Optional[str] = None) -> int:
    """Cambia los swap long/short (+ type opcional 'money'|'points') en todos los Setup."""
    n = 0
    for swap in _all_swaps(root):
        swap.set("long", str(swap_long))
        swap.set("short", str(swap_short))
        if swap_type:
            swap.set("type", swap_type)
        n += 1
    return n


def patch_commission(root: ET.Element, ctype: str, value: float) -> int:
    """
    Cambia la comisión en todos los Setup.
    SQX representa comisiones con varios <Method> (PercentageBased, SizeBased, ...)
    y solo uno tiene use="true". Ajustamos el activo o lo cambiamos.
    """
    n = 0
    for setup in _all_setups(root):
        comm = setup.find("Commissions")
        if comm is None:
            continue
        # Desactivar todos los Methods
        for m in comm.findall("Method"):
            m.set("use", "false")
        # Buscar el del tipo deseado, o crear si no existe
        target = comm.find(f"Method[@type='{ctype}']")
        if target is None:
            # Crear nuevo
            target = ET.SubElement(comm, "Method")
            target.set("type", ctype)
            params_node = ET.SubElement(target, "Params")
            param = ET.SubElement(params_node, "Param")
            param.set("key", "Commission")
            param.set("className", ctype)
            param.text = str(value)
        else:
            # Actualizar valor del Param key="Commission"
            param = target.find("Params/Param[@key='Commission']")
            if param is not None:
                param.text = str(value)
        target.set("use", "true")
        n += 1
    return n


def patch_direction(root: ET.Element, direction: str) -> int:
    """direction ∈ {'long', 'short', 'both'}."""
    if direction not in ("long", "short", "both"):
        raise ValueError(f"direction must be long|short|both, got {direction!r}")
    n = 0
    for ms in _all_market_sides(root):
        ms.set("type", direction)
    n += len(_all_market_sides(root))
    return n


def patch_dates(
    root: ET.Element,
    date_from: str,
    date_to: str,
) -> int:
    """Setea dateFrom/dateTo en TODOS los Setup del XML."""
    n = 0
    for setup in _all_setups(root):
        setup.set("dateFrom", date_from)
        setup.set("dateTo", date_to)
        n += 1
    return n


def clean_external_paths(root: ET.Element) -> int:
    """
    Quita los paths absolutos del PC original en <StrategyType>.
    El usuario tendrá que re-seleccionarlos manualmente en SQX Builder
    (templateFile y strategyFile), pero al menos no apuntan a un PC ajeno.
    """
    n = 0
    for st in _all_strategy_types(root):
        for attr in ("templateFile", "strategyFile"):
            if st.get(attr):
                st.set(attr, "")
                n += 1
    return n


# ── Aplicar tal y como el cheatsheet pide por mining ──────────────
def apply_mining_to_xml(
    root: ET.Element,
    symbol: str,
    timeframe: str,
    direction: str,
    swap_long: float,
    swap_short: float,
    spread: Optional[float] = None,
    swap_type: Optional[str] = None,
    commission_type: Optional[str] = None,
    commission_value: Optional[float] = None,
    period: tuple[str, str] = RETEST_PERIODS["BUILD"],
    clean_paths: bool = True,
) -> dict:
    """Aplica el set completo de patches por mining a un XML root."""
    stats = {
        "charts": patch_symbol_tf_spread(root, symbol, timeframe, spread),
        "swaps": patch_swap(root, swap_long, swap_short, swap_type),
        "sides": patch_direction(root, direction),
        "dates": patch_dates(root, period[0], period[1]),
        "paths_cleaned": clean_external_paths(root) if clean_paths else 0,
        "commissions": 0,
    }
    if commission_type and commission_value is not None:
        stats["commissions"] = patch_commission(root, commission_type, commission_value)
    return stats
