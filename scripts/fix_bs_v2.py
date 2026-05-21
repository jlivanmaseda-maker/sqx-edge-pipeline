#!/usr/bin/env python3
"""
Fix v2 — blindaje completo de Indicators.Number + probability=0 en exits OFF.

Aplica 2 fixes al config.xml interno de cada .sqb:

  FIX A — Triple negación en Indicators.Number (todos los blocksettings):
    weight="1" use="false"  ->  weight="0" use="false" probability="0"

    Razón: el "use=false" se IGNORA cuando Number es argumento de
    comparadores (IsGreater/IsLower). Añadimos weight=0 + probability=0
    para forzar a SQX a no usarlo bajo ninguna circunstancia.

  FIX B — probability=0 en exits con use="false" (solo aplica en v7):
    ExitAfterBars     use="false" probability="100" -> probability="0"
    MoveSL2BE         use="false" probability="50"  -> probability="0"
    MoveSL2BE.SL2BEAddPips  idem

    Razón: SQX se rige por `probability` para exits, NO por `use`. El
    use="false" con probability="100" hace que ExitAfterBars salga en
    el 100% de las strategies aunque digamos "está desactivado".
    Para OFF real hay que probability="0".

Uso:
    python fix_bs_v2.py <archivo.sqb> [archivo2.sqb ...]

Modifica IN-PLACE. Haz backup antes.
"""
import sys
import zipfile
import re
import shutil
from pathlib import Path


def fix_config_xml(xml: str) -> tuple[str, list[str]]:
    changes = []

    # ---------- FIX A: Triple negación en Indicators.Number ----------
    # Pattern matches:
    #   <Block key="Indicators.Number" weight="1" use="false" category="indicators">
    # O versiones con probability ya presente:
    #   <Block key="Indicators.Number" weight="1" use="false" probability="X" category="indicators">
    pattern_a = re.compile(
        r'<Block key="Indicators\.Number"\s+weight="\d+"\s+use="false"(?:\s+probability="\d+")?\s+category="indicators">'
    )
    replacement_a = '<Block key="Indicators.Number" weight="0" use="false" probability="0" category="indicators">'
    new_xml, n = pattern_a.subn(replacement_a, xml)
    if n > 0:
        changes.append(f'Indicators.Number: weight=0 + probability=0 + use=false ({n} match)')
        xml = new_xml

    # ---------- FIX B: probability=0 en exits con use=false ----------
    # Solo si están con use="false" (señal de que el user quiere OFF)
    # Si están con use="true" NO se tocan (mining quiere ese exit activo)

    exits_to_fix = [
        'ExitAfterBars\\.ExitAfterBars',
        'MoveSL2BE\\.MoveSL2BE',
        'MoveSL2BE\\.SL2BEAddPips',
    ]
    for exit_key in exits_to_fix:
        # Match: <Block key="EXIT" use="false" probability="N"
        pattern_b = re.compile(
            r'(<Block key="' + exit_key + r'" use="false" probability=")\d+(")'
        )
        new_xml, n = pattern_b.subn(r'\g<1>0\g<2>', xml)
        if n > 0:
            # Recuperar nombre limpio para el changelog
            clean_name = exit_key.replace('\\.', '.')
            changes.append(f'{clean_name}: probability=0 (was 100/50) ({n} match)')
            xml = new_xml

    return xml, changes


def fix_blocksetting(sqb_path: Path) -> None:
    if not sqb_path.exists():
        print(f'ERROR: {sqb_path} no existe', file=sys.stderr)
        sys.exit(1)

    with zipfile.ZipFile(sqb_path, 'r') as z:
        with z.open('config.xml') as f:
            xml = f.read().decode('utf-8')

    new_xml, changes = fix_config_xml(xml)

    if not changes:
        print(f'  {sqb_path.name}: sin cambios')
        return

    # Reescribir ZIP atomicamente
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
        print('Uso: python fix_bs_v2.py <archivo.sqb> [archivo2.sqb ...]', file=sys.stderr)
        sys.exit(1)

    print('Aplicando fix v2 (triple-negación Number + probability=0 exits)...\n')
    for arg in sys.argv[1:]:
        fix_blocksetting(Path(arg))
    print('\nHecho.')


if __name__ == '__main__':
    main()
