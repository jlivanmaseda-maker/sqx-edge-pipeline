#!/usr/bin/env python3
"""
Fix v3 — Plan B: eliminar COMPLETAMENTE el bloque <Block key="Indicators.Number">
del config.xml de cada blocksetting.

Razón: si SQX ignora todos los controles del bloque (weight, use, probability,
rango), eliminar el bloque entero fuerza a SQX a usar comparadores alternativos
(Percentiles, ratios entre indicadores) cuando necesita una constante numérica.

Uso:
    python fix_bs_v3.py <archivo.sqb> [archivo2.sqb ...]

Modifica IN-PLACE. Haz backup antes (ya tenemos backup_pre_fix y backup_v2_pre).
"""
import sys
import zipfile
import re
import shutil
from pathlib import Path


def remove_number_block(xml: str) -> tuple[str, list[str]]:
    changes = []

    # Pattern matches el bloque completo:
    #   <Block key="Indicators.Number" ...>
    #     <Generated ...>
    #       <Param .../>
    #     </Generated>
    #     <Predefined ... />
    #   </Block>
    pattern = re.compile(
        r'\s*<Block key="Indicators\.Number"[^>]*>'
        r'.*?'
        r'</Block>\n?',
        re.DOTALL
    )
    new_xml, n = pattern.subn('', xml)
    if n > 0:
        changes.append(f'Indicators.Number: BLOQUE ELIMINADO ({n} match)')
        xml = new_xml

    return xml, changes


def fix_blocksetting(sqb_path: Path) -> None:
    if not sqb_path.exists():
        print(f'ERROR: {sqb_path} no existe', file=sys.stderr)
        sys.exit(1)

    with zipfile.ZipFile(sqb_path, 'r') as z:
        with z.open('config.xml') as f:
            xml = f.read().decode('utf-8')

    new_xml, changes = remove_number_block(xml)

    if not changes:
        print(f'  {sqb_path.name}: sin cambios (ya estaba eliminado?)')
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
        print('Uso: python fix_bs_v3.py <archivo.sqb> [archivo2.sqb ...]', file=sys.stderr)
        sys.exit(1)

    print('Aplicando fix v3 (eliminar bloque Indicators.Number completo)...\n')
    for arg in sys.argv[1:]:
        fix_blocksetting(Path(arg))
    print('\nHecho.')


if __name__ == '__main__':
    main()
