#!/usr/bin/env python3
"""
Fix Indicators.Number overfitting bug en blocksettings SQX.

Cambios aplicados:
  1. IsLowerPercentil    use="false" -> use="true"
  2. IsGreaterPercentil  use="false" -> use="true"
  3. Indicators.Number  rango -999M..+999M (step=1) -> 0..10 step=0.5

Razon: el rango original permitia que SQX optimizara constantes magicas
(ej. AvgVolume > 278500) que son overfitting puro. Acotar Number a 0-10
+ activar Percentiles fuerza a SQX a usar comparativas escala-invariante.

Uso:
    python fix_bs_number.py <ruta_blocksetting.sqb>

Modifica el archivo IN-PLACE. Haz backup antes.
"""
import sys
import zipfile
import re
import shutil
from pathlib import Path


def fix_config_xml(xml: str) -> tuple[str, list[str]]:
    """Aplica los 3 fixes al config.xml. Devuelve (xml_modificado, cambios)."""
    changes = []

    # Fix 1: IsLowerPercentil  use=false -> use=true
    pattern1 = r'(<Block key="IsLowerPercentil" weight="\d+" use=")false(")'
    new_xml, n = re.subn(pattern1, r'\1true\2', xml)
    if n > 0:
        changes.append(f'IsLowerPercentil: use=false -> use=true ({n} match)')
        xml = new_xml

    # Fix 2: IsGreaterPercentil  use=false -> use=true
    pattern2 = r'(<Block key="IsGreaterPercentil" weight="\d+" use=")false(")'
    new_xml, n = re.subn(pattern2, r'\1true\2', xml)
    if n > 0:
        changes.append(f'IsGreaterPercentil: use=false -> use=true ({n} match)')
        xml = new_xml

    # Fix 3: Indicators.Number rango -999M..+999M -> 0..10 step=0.5
    # Buscamos el bloque y reemplazamos los atributos del Param Number
    pattern3 = (
        r'(<Block key="Indicators\.Number"[^>]*>\s*<Generated[^>]*>\s*'
        r'<Param key="#Number#" name="Number" type="double" paramType="null" generation="random" )'
        r'minValue="-?\d+" maxValue="-?\d+" step="-?[\d.]+"'
    )
    replacement3 = r'\1minValue="0" maxValue="10" step="0.5"'
    new_xml, n = re.subn(pattern3, replacement3, xml)
    if n > 0:
        changes.append(f'Indicators.Number: rango -999M..+999M -> 0..10 step=0.5 ({n} match)')
        xml = new_xml

    return xml, changes


def fix_blocksetting(sqb_path: Path) -> None:
    """Aplica los fixes IN-PLACE al archivo .sqb (que es un ZIP con config.xml)."""
    if not sqb_path.exists():
        print(f'ERROR: {sqb_path} no existe', file=sys.stderr)
        sys.exit(1)

    # Leer config.xml del ZIP
    with zipfile.ZipFile(sqb_path, 'r') as z:
        with z.open('config.xml') as f:
            xml = f.read().decode('utf-8')

    # Aplicar fixes
    new_xml, changes = fix_config_xml(xml)

    if not changes:
        print(f'  {sqb_path.name}: sin cambios (ya estaba arreglado?)')
        return

    # Reescribir el ZIP con el nuevo config.xml
    # Estrategia: crear nuevo ZIP en temporal, swap atomico
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
        print('Uso: python fix_bs_number.py <archivo.sqb> [archivo2.sqb ...]', file=sys.stderr)
        sys.exit(1)

    print('Aplicando fix de Indicators.Number overfitting...\n')
    for arg in sys.argv[1:]:
        fix_blocksetting(Path(arg))
    print('\nHecho.')


if __name__ == '__main__':
    main()
