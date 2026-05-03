"""
bs_intraday_builder.py — Genera versiones _intraday de los blocksettings BS_*.sqb.

Un .sqb es un ZIP con un único config.xml dentro.
Para hacer una versión _intraday, desactivamos los prices auxiliares cuyo horizonte
temporal es incompatible con TFs intraday cortos (M5/M15):

  Prices.{Open,Close,High,Low}D   - daily
  Prices.{Open,Close,High,Low}W   - semanal
  Prices.{Open,Close,High,Low}M   - mensual
  Prices.HeikenAshi*              - heiken ashi multi-timeframe (si activos)

El resto del BS queda INTACTO (indicators, weights, ranges, exits, condiciones).
"""
from __future__ import annotations

import os
import re
import zipfile
from typing import Iterable

# Bloques a desactivar para intraday (regex sobre el atributo `key`)
INTRADAY_DEACTIVATE_PATTERNS = [
    r'Prices\.(?:Open|Close|High|Low)D',           # daily
    r'Prices\.(?:Open|Close|High|Low)W',           # weekly
    r'Prices\.(?:Open|Close|High|Low)M',           # monthly
    r'Prices\.HeikenAshi(?:Close|Open|High|Low)D',  # HA daily si existe
    r'Prices\.HeikenAshi(?:Close|Open|High|Low)W',
    r'Prices\.HeikenAshi(?:Close|Open|High|Low)M',
]

# Compilamos un regex combinado: <Block key="MATCH" weight="N" use="true" ...>
_BLOCK_USE_TRUE_PATTERN = re.compile(
    r'(<Block\s+key="(?:' + '|'.join(INTRADAY_DEACTIVATE_PATTERNS) + r')"\s+weight="[^"]*"\s+)use="true"',
    re.IGNORECASE,
)


def transform_xml(xml_text: str) -> tuple[str, list[str]]:
    """
    Aplica las desactivaciones intraday al XML.
    Devuelve (nuevo_xml, lista_de_keys_modificadas).
    """
    modified_keys: list[str] = []

    def _replace(m: re.Match) -> str:
        # Extraer la key del bloque modificado para el log
        key_match = re.search(r'key="([^"]+)"', m.group(0))
        if key_match:
            modified_keys.append(key_match.group(1))
        return m.group(1) + 'use="false"'

    new_xml = _BLOCK_USE_TRUE_PATTERN.sub(_replace, xml_text)
    return new_xml, modified_keys


def build_intraday(src_sqb: str, dst_sqb: str, overwrite: bool = True) -> dict:
    """
    Lee un .sqb origen, transforma su config.xml y escribe el .sqb destino.

    Returns dict con stats: {ok, src, dst, modified_count, modified_keys}.
    """
    if not os.path.isfile(src_sqb):
        raise FileNotFoundError(f"source not found: {src_sqb}")
    if os.path.isfile(dst_sqb) and not overwrite:
        raise FileExistsError(dst_sqb)
    os.makedirs(os.path.dirname(os.path.abspath(dst_sqb)) or ".", exist_ok=True)

    # Leer todo en memoria preservando metadata zip
    files: dict[str, bytes] = {}
    infos: dict[str, zipfile.ZipInfo] = {}
    with zipfile.ZipFile(src_sqb, "r") as zin:
        for info in zin.infolist():
            infos[info.filename] = info
            files[info.filename] = zin.read(info.filename)

    if "config.xml" not in files:
        raise ValueError(f"source .sqb has no config.xml: {src_sqb}")

    # Transformar config.xml
    original_xml = files["config.xml"].decode("utf-8")
    new_xml, modified_keys = transform_xml(original_xml)
    files["config.xml"] = new_xml.encode("utf-8")

    # Escribir destino
    with zipfile.ZipFile(dst_sqb, "w", zipfile.ZIP_DEFLATED) as zout:
        for fname, data in files.items():
            info = infos[fname]
            new_info = zipfile.ZipInfo(filename=fname, date_time=info.date_time)
            new_info.compress_type = zipfile.ZIP_DEFLATED
            new_info.external_attr = info.external_attr
            zout.writestr(new_info, data)

    return {
        "ok": True,
        "src": os.path.abspath(src_sqb),
        "dst": os.path.abspath(dst_sqb),
        "modified_count": len(modified_keys),
        "modified_keys": modified_keys,
    }


def build_intraday_batch(src_paths: Iterable[str], dst_dir: str,
                          suffix: str = "_intraday_v5") -> list[dict]:
    """
    Procesa múltiples .sqb. El nombre destino añade suffix antes de .sqb.
    Ejemplo: BS_Volumen_v4.sqb → BS_Volumen_v4_intraday_v5.sqb
    """
    os.makedirs(dst_dir, exist_ok=True)
    results = []
    for src in src_paths:
        base = os.path.splitext(os.path.basename(src))[0]
        dst = os.path.join(dst_dir, f"{base}{suffix}.sqb")
        try:
            r = build_intraday(src, dst, overwrite=True)
            results.append(r)
        except Exception as e:
            results.append({"ok": False, "src": src, "error": str(e)})
    return results
