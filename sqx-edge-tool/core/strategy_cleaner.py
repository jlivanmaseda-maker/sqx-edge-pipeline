"""
strategy_cleaner.py — Procesa archivos .sqx generados por SQX:
  - Elimina/desactiva ExitAfterBars (típico cleanup post-Capa 2 con SL/TP/Trailing)
  - Renombra siguiendo convención institucional [Symbol]_[TF]_[Direction]_[ID].sqx
  - Extrae metadata para listado previo

Un .sqx es un ZIP con:
  - settings.xml, lastSettings.xml, strategy_Portfolio.xml (los tres pueden tener ExitAfterBars)
  - orders.bin, version.txt, META-INF/, Results/

ExitAfterBars en SQX se representa como:
  <Param key="#ExitAfterBars.ExitAfterBars#" controlType="..." type="int" exitMethod="true">VALUE</Param>

Para "limpiar" lo convertimos a 0 (más seguro que eliminar el nodo, evita que SQX se queje).
"""
from __future__ import annotations

import os
import re
import zipfile
import io
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Iterable, Optional


EXIT_AFTER_BARS_PATTERN = re.compile(
    r'(<Param[^>]*key="#ExitAfterBars\.ExitAfterBars#"[^>]*>)([^<]*)(</Param>)'
)
RESULT_KEY_PATTERN = re.compile(
    r'<Result\s+resultKey="(?:Main:\s*)?([^/]+?)/([^"]+)"'
)
RESULTS_NAME_PATTERN = re.compile(r'<ResultsGroup\s+ResultName="([^"]+)"')
MARKET_SIDES_PATTERN = re.compile(r'<MarketSides\s+type="(long|short|both)"')


@dataclass
class SqxMetadata:
    path: str
    name: str            # "Strategy 4.1.33"
    fitness_id: str      # "4.1.33"
    symbol: str          # "EURUSD_TICK_ESTPlus07"
    asset: str           # "EURUSD" (extraído del symbol)
    timeframe: str       # "M30"
    direction: str       # "long" / "short" / "both" / "?"
    exit_after_bars_count: int   # cuántas occurrences hay
    size_kb: float

    def to_dict(self) -> dict:
        return {
            "path": self.path, "name": self.name, "fitness_id": self.fitness_id,
            "symbol": self.symbol, "asset": self.asset, "timeframe": self.timeframe,
            "direction": self.direction, "exit_after_bars_count": self.exit_after_bars_count,
            "size_kb": self.size_kb,
        }


def _read_zip_file(zf: zipfile.ZipFile, name: str) -> str:
    try:
        return zf.read(name).decode("utf-8", errors="replace")
    except KeyError:
        return ""


def _extract_asset_from_symbol(symbol: str) -> str:
    """De 'EURUSD_TICK_ESTPlus07' → 'EURUSD'. De 'XAUUSD_darwinex' → 'XAUUSD'."""
    if not symbol or symbol == "NULL":
        return "?"
    # Quitar sufijos comunes
    for suffix in ("_TICK_ESTPlus07", "_darwinex", "_dukascopy", "_icmarkets",
                   "_pepperstone", "_ftmo", "_oanda", "_roboforex"):
        if symbol.endswith(suffix):
            return symbol[:-len(suffix)]
    # Si tiene _ en medio, usar la parte antes
    if "_" in symbol:
        return symbol.split("_", 1)[0]
    return symbol


def extract_metadata(sqx_path: str) -> SqxMetadata:
    """Lee metadata clave de un .sqx sin modificarlo."""
    if not os.path.isfile(sqx_path):
        raise FileNotFoundError(sqx_path)
    size_kb = round(os.path.getsize(sqx_path) / 1024, 1)
    name = os.path.splitext(os.path.basename(sqx_path))[0]
    fitness_id = name.replace("Strategy ", "") if name.startswith("Strategy ") else name

    symbol, timeframe, direction = "?", "?", "?"
    eab_count = 0

    with zipfile.ZipFile(sqx_path, "r") as zf:
        settings_xml = _read_zip_file(zf, "settings.xml")
        last_xml = _read_zip_file(zf, "lastSettings.xml")
        portfolio_xml = _read_zip_file(zf, "strategy_Portfolio.xml")

        # ResultName + resultKey vienen en settings.xml
        m = RESULTS_NAME_PATTERN.search(settings_xml)
        if m:
            fitness_id = m.group(1).replace("Strategy ", "")
        m = RESULT_KEY_PATTERN.search(settings_xml)
        if m:
            symbol, timeframe = m.group(1).strip(), m.group(2).strip()
        # Si no encontramos en settings.xml, fallback a lastSettings.xml (atributos directos)
        if symbol == "?":
            m = re.search(r'<Chart[^>]*symbol="([^"]+)"', last_xml)
            if m:
                symbol = m.group(1)
        if timeframe == "?":
            m = re.search(r'timeframe="([^"]+)"', last_xml)
            if m:
                timeframe = m.group(1)

        # Direction está en lastSettings.xml (MarketSides)
        m = MARKET_SIDES_PATTERN.search(last_xml)
        if m:
            direction = m.group(1)

        # Contar ExitAfterBars en los 3 XMLs
        for content in (portfolio_xml, settings_xml, last_xml):
            eab_count += len(EXIT_AFTER_BARS_PATTERN.findall(content))

    return SqxMetadata(
        path=sqx_path, name=name, fitness_id=fitness_id,
        symbol=symbol, asset=_extract_asset_from_symbol(symbol),
        timeframe=timeframe, direction=direction,
        exit_after_bars_count=eab_count, size_kb=size_kb,
    )


def list_sqx_directory(directory: str, recursive: bool = True) -> list[SqxMetadata]:
    """Devuelve metadata de todos los .sqx en un directorio."""
    if not os.path.isdir(directory):
        return []
    out = []
    if recursive:
        for root, _, files in os.walk(directory):
            for f in files:
                if f.lower().endswith(".sqx"):
                    try:
                        out.append(extract_metadata(os.path.join(root, f)))
                    except Exception:
                        pass  # archivo corrupto, skip
    else:
        for f in os.listdir(directory):
            if f.lower().endswith(".sqx"):
                try:
                    out.append(extract_metadata(os.path.join(directory, f)))
                except Exception:
                    pass
    return out


def clean_exit_after_bars(sqx_path: str, in_place: bool = True) -> dict:
    """
    Pone a 0 todos los ExitAfterBars dentro del .sqx (los desactiva sin romper).
    Si in_place=False, crea una copia con sufijo _clean.
    Devuelve {ok, changes, output_path}.
    """
    if not os.path.isfile(sqx_path):
        return {"ok": False, "error": "file not found", "path": sqx_path}

    output_path = sqx_path if in_place else sqx_path.replace(".sqx", "_clean.sqx")

    # Leer todo en memoria
    files: dict[str, bytes] = {}
    infos: dict[str, zipfile.ZipInfo] = {}
    with zipfile.ZipFile(sqx_path, "r") as zin:
        for info in zin.infolist():
            infos[info.filename] = info
            files[info.filename] = zin.read(info.filename)

    changes = 0
    for fname in ("strategy_Portfolio.xml", "settings.xml", "lastSettings.xml"):
        if fname not in files:
            continue
        content = files[fname].decode("utf-8", errors="replace")
        new_content, n = EXIT_AFTER_BARS_PATTERN.subn(r"\g<1>0\g<3>", content)
        if n > 0:
            files[fname] = new_content.encode("utf-8")
            changes += n

    # Escribir de vuelta
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zout:
        for fname, data in files.items():
            info = infos[fname]
            new_info = zipfile.ZipInfo(filename=fname, date_time=info.date_time)
            new_info.compress_type = zipfile.ZIP_DEFLATED
            new_info.external_attr = info.external_attr
            zout.writestr(new_info, data)

    return {"ok": True, "changes": changes, "output_path": output_path}


def institutional_name(meta: SqxMetadata, pattern: str = "{asset}_{tf}_{dir}_{id}") -> str:
    """Construye nombre institucional. Ej: EURUSD_M30_LONG_4.1.33."""
    direction_short = {"long": "LONG", "short": "SHORT", "both": "LS"}.get(meta.direction, "DIR")
    return pattern.format(
        asset=meta.asset.upper(),
        tf=meta.timeframe.upper(),
        dir=direction_short,
        id=meta.fitness_id,
        symbol=meta.symbol,
    )


def rename_sqx(sqx_path: str, new_basename: str) -> dict:
    """Renombra el .sqx (manteniendo extensión)."""
    if not os.path.isfile(sqx_path):
        return {"ok": False, "error": "file not found"}
    new_basename = re.sub(r'[<>:"/\\|?*]', '_', new_basename)  # sanitize
    new_path = os.path.join(os.path.dirname(sqx_path), new_basename + ".sqx")
    if new_path == sqx_path:
        return {"ok": True, "renamed": False, "path": sqx_path}
    if os.path.exists(new_path):
        return {"ok": False, "error": f"target exists: {new_basename}.sqx"}
    os.rename(sqx_path, new_path)
    return {"ok": True, "renamed": True, "path": new_path}


def _process_one(args: tuple) -> dict:
    """Worker para ProcessPoolExecutor: procesa 1 .sqx con las opciones dadas."""
    sqx_path, opts = args
    result: dict = {"path": sqx_path, "ok": True, "actions": []}
    try:
        if opts.get("remove_exit_bars"):
            r = clean_exit_after_bars(sqx_path, in_place=True)
            if r["ok"]:
                result["actions"].append(f"cleaned ExitAfterBars ({r['changes']} occurrences)")
            else:
                result["ok"] = False
                result["actions"].append(f"clean failed: {r.get('error')}")
                return result

        if opts.get("rename_institutional"):
            meta = extract_metadata(sqx_path)
            new_name = institutional_name(meta, opts.get("rename_pattern", "{asset}_{tf}_{dir}_{id}"))
            r = rename_sqx(sqx_path, new_name)
            if r["ok"]:
                if r.get("renamed"):
                    result["actions"].append(f"renamed -> {os.path.basename(r['path'])}")
                    result["new_path"] = r["path"]
            else:
                result["actions"].append(f"rename failed: {r.get('error')}")
    except Exception as e:
        result["ok"] = False
        result["actions"].append(f"exception: {type(e).__name__}: {e}")
    return result


def process_files(paths: Iterable[str], options: dict, max_workers: Optional[int] = None) -> list[dict]:
    """
    Procesa varios .sqx en paralelo.
    options: {remove_exit_bars: bool, rename_institutional: bool, rename_pattern: str}
    """
    paths = list(paths)
    if not paths:
        return []
    # Para pocos archivos, evitar overhead de ProcessPool
    if len(paths) <= 4:
        return [_process_one((p, options)) for p in paths]

    workers = max_workers or min(8, (os.cpu_count() or 4))
    results = []
    with ProcessPoolExecutor(max_workers=workers) as ex:
        futures = {ex.submit(_process_one, (p, options)): p for p in paths}
        for fut in as_completed(futures):
            results.append(fut.result())
    return results
