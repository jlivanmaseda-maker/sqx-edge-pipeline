#!/usr/bin/env python3
"""
Fix v5 — Redondeo de Percentile y Bars en IsLowerPercentil/IsGreaterPercentil.

Problema descubierto post-fix v4: aunque SQX ya usa Percentiles (escala-invariante),
los valores del percentil estaban con step=0.1 (genera 90.8%, 98.7%, 96.3% — overfit
fino al decimal) y Bars con step=1 (genera 167, 621, 700 — valores específicos
optimizados).

Cambios aplicados en IsLowerPercentil e IsGreaterPercentil:

  Percentile:  minValue="0.1" maxValue="99.9" step="0.1"
            -> minValue="5"   maxValue="95"   step="5"
            (solo 5%, 10%, 15%, ..., 95% — niveles redondos sin overfit decimal)

  Bars:  minValue="2"   maxValue="1000" step="1"
      -> minValue="100" maxValue="1000" step="100"
      (solo 100, 200, 300, ..., 1000 — saltos sensatos en lugar de granularidad fina)

Uso:
    python fix_bs_v5.py <archivo.sqb> [archivo2.sqb ...]

Modifica IN-PLACE. Haz backup antes.
"""
import sys
import zipfile
import re
import shutil
from pathlib import Path


def fix_percentil_params(xml: str) -> tuple[str, list[str]]:
    changes = []

    # Pattern para Percentile: <Param name="Percentile" type="double" ... step="X" />
    pattern_pct = re.compile(
        r'(<Param key="#Percentile#" name="Percentile" type="double"[^/]*generation="random" )'
        r'minValue="-?\d+(?:\.\d+)?" '
        r'maxValue="-?\d+(?:\.\d+)?" '
        r'step="-?\d+(?:\.\d+)?"'
    )
    replacement_pct = r'\1minValue="5" maxValue="95" step="5"'
    new_xml, n = pattern_pct.subn(replacement_pct, xml)
    if n > 0:
        changes.append(f'Percentile: 5..95 step=5 (was 0.1..99.9 step=0.1) ({n} match)')
        xml = new_xml

    # Pattern para Bars: <Param name="Bars" type="int" ... step="X" />
    # Buscar SOLO los Bars dentro de IsLowerPercentil/IsGreaterPercentil
    # Para ello, busco el bloque y reemplazo el Bars de adentro
    # Solución pragmática: pattern más específico que incluye contexto
    pattern_bars = re.compile(
        r'(<Block key="Is(?:Lower|Greater)Percentil"[^>]*>\s*<Generated[^>]*>\s*'
        r'<Param key="#Indicator#"[^/]+/>\s*'
        r'<Param key="#Bars#" name="Bars" type="int"[^/]*generation="random" )'
        r'minValue="-?\d+" '
        r'maxValue="-?\d+" '
        r'step="-?\d+"',
        re.MULTILINE
    )
    replacement_bars = r'\1minValue="100" maxValue="1000" step="100"'
    new_xml, n = pattern_bars.subn(replacement_bars, xml)
    if n > 0:
        changes.append(f'Bars (IsPercentil): 100..1000 step=100 (was 2..1000 step=1) ({n} match)')
        xml = new_xml

    return xml, changes


def fix_blocksetting(sqb_path: Path) -> None:
    if not sqb_path.exists():
        print(f'ERROR: {sqb_path} no existe', file=sys.stderr)
        sys.exit(1)

    with zipfile.ZipFile(sqb_path, 'r') as z:
        with z.open('config.xml') as f:
            xml = f.read().decode('utf-8')

    new_xml, changes = fix_percentil_params(xml)

    if not changes:
        print(f'  {sqb_path.name}: sin cambios')
        return

    tmp_path = sqb_path.with_suffix('.sqb.tmp')
    with zipfile.ZipFile(sqb_path, 'r') as zin:
        with zipfile.ZipFile(tmp_path, 'w', zipfile.ZIP_DEFLATED) as zout:
            for item in zin.namelist():
                if item == 'config.xml':
                    zout.writestr('config.xml', new_xml)
                else:
                    zout.writestr(item, zin.read(item))
    shutil.move(tmp_path, sqb_path)

    print(f'  {sqb_path.name}:')
    for c in changes:
        print(f'    - {c}')


def main():
    if len(sys.argv) < 2:
        print('Uso: python fix_bs_v5.py <archivo.sqb> [archivo2.sqb ...]', file=sys.stderr)
        sys.exit(1)

    print('Aplicando fix v5 (Percentile step=5 + Bars step=100)...\n')
    for arg in sys.argv[1:]:
        fix_blocksetting(Path(arg))
    print('\nHecho.')


if __name__ == '__main__':
    main()
