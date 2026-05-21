#!/usr/bin/env python3
"""
Fix v4 — Indicator values de Indicators.AvgVolume.

Causa raíz REAL del overfitting con `AV(N) > Number_absoluto`:

  El bloque `Indicators.AvgVolume` tenía `indicatorMin=999999999`,
  `indicatorMax=999999999`, `indicatorStep=0` → SQX interpreta esto como
  "calcula automáticamente del histórico del activo" y se queda con
  valores como Min=-230000, Max=900000, Step=56500 → genera comparativas
  tipo `AV(30) >= 561000` que son OVERFITTING PURO (constantes mágicas
  brute-forceadas, no escala-invariante).

  Fix: forzar `indicatorMin=0 indicatorMax=10 indicatorStep=0.5`.
  Como ningún activo tiene AvgVolume entre 0-10, las comparaciones
  contra valores absolutos NUNCA se cumplen y SQX se ve forzado a usar:
    - IsGreaterPercentil(AV(N), %, bars)  ← escala-invariante
    - IsGreater(AV(N), AV(M))             ← ratio entre AVs
    - CrossesAbove/Below entre 2 AVs      ← cruce de AVs

  Validado empíricamente por Livan (mayo 2026) con un test de 20 strategies:
  todas las reglas con AvgVolume usan Percentiles o ratios.

Uso:
    python fix_bs_v4.py <archivo.sqb> [archivo2.sqb ...]

Modifica IN-PLACE. Haz backup antes.
"""
import sys
import zipfile
import re
import shutil
from pathlib import Path


def fix_avg_volume_range(xml: str) -> tuple[str, list[str]]:
    changes = []

    # Pattern matches el bloque AvgVolume con indicatorMin/Max/Step:
    #   <Block key="Indicators.AvgVolume" weight="1" use="true"
    #          indicatorMin="999999999" indicatorMax="999999999" indicatorStep="0" ...>
    pattern = re.compile(
        r'(<Block key="Indicators\.AvgVolume" weight="\d+" use="(?:true|false)" )'
        r'indicatorMin="-?\d+(?:\.\d+)?" '
        r'indicatorMax="-?\d+(?:\.\d+)?" '
        r'indicatorStep="-?\d+(?:\.\d+)?"'
    )
    replacement = r'\1indicatorMin="0" indicatorMax="10" indicatorStep="0.5"'
    new_xml, n = pattern.subn(replacement, xml)
    if n > 0:
        changes.append(f'Indicators.AvgVolume: indicatorMin/Max/Step = 0/10/0.5 ({n} match)')
        xml = new_xml

    return xml, changes


def fix_blocksetting(sqb_path: Path) -> None:
    if not sqb_path.exists():
        print(f'ERROR: {sqb_path} no existe', file=sys.stderr)
        sys.exit(1)

    with zipfile.ZipFile(sqb_path, 'r') as z:
        with z.open('config.xml') as f:
            xml = f.read().decode('utf-8')

    new_xml, changes = fix_avg_volume_range(xml)

    if not changes:
        print(f'  {sqb_path.name}: sin cambios (AvgVolume ya tiene rango fijo o bloque ausente)')
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
        print('Uso: python fix_bs_v4.py <archivo.sqb> [archivo2.sqb ...]', file=sys.stderr)
        sys.exit(1)

    print('Aplicando fix v4 (AvgVolume indicatorMin/Max/Step = 0/10/0.5)...\n')
    for arg in sys.argv[1:]:
        fix_blocksetting(Path(arg))
    print('\nHecho.')


if __name__ == '__main__':
    main()
