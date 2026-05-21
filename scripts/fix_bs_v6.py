#!/usr/bin/env python3
"""
Fix v6 — Indicator values universales para los 24 indicadores principales.

Aplica 2 lógicas distintas según el tipo de indicador:

  CATEGORÍA A — Magnitudes variables (depende del precio/escala del activo):
    Forzar Indicator values = 0/10/0.5 (matemáticamente imposible)
    → SQX FORZADO a usar Percentiles o ratios entre indicadores
    → Escala-invariante (funciona en FX, índices, oro, todos)

  CATEGORÍA B — Oscillators normalizados (rango universal conocido):
    Rangos universales con steps redondos (niveles psicológicos clásicos)
    → SQX puede generar `RSI > 70`, `ADX > 25` (edges canónicos)
    → Valores convencionales del análisis técnico

⚠️  IMPORTANTE: SQX sobreescribe Indicator values cuando ejecutas "Calibrate".
    NO calibrar después de aplicar este fix (o re-aplicar el script tras calibrar).

Uso:
    python fix_bs_v6.py <archivo.sqb> [archivo2.sqb ...]
"""
import sys
import zipfile
import re
import shutil
from pathlib import Path


# ============================================================
# MAPA DE INDICADORES Y SUS RANGOS
# ============================================================
# Categoría A — magnitudes variables → 0/10/0.5
CATEGORY_A = {
    'Indicators.ATR':                     {'min': '0',    'max': '10',  'step': '0.5'},
    'Indicators.LogATR':                  {'min': '0',    'max': '10',  'step': '0.5'},
    'Indicators.MTATR':                   {'min': '0',    'max': '10',  'step': '0.5'},
    'Indicators.StdDev':                  {'min': '0',    'max': '10',  'step': '0.5'},
    'Indicators.TrueRange':               {'min': '0',    'max': '10',  'step': '0.5'},
    'Indicators.MACD':                    {'min': '0',    'max': '10',  'step': '0.5'},
    'Indicators.OSMA':                    {'min': '0',    'max': '10',  'step': '0.5'},
    'Indicators.AwesomeOscillator':       {'min': '0',    'max': '10',  'step': '0.5'},
    'Indicators.EhlersHilbertTransform':  {'min': '0',    'max': '10',  'step': '0.5'},
    'Indicators.UlcerIndex':              {'min': '0',    'max': '10',  'step': '0.5'},
    # AvgVolume ya está aplicado en fix v4, lo reincluyo por idempotencia
    'Indicators.AvgVolume':               {'min': '0',    'max': '10',  'step': '0.5'},
}

# Categoría B — oscillators normalizados → rangos universales convencionales
CATEGORY_B = {
    'Indicators.RSI':                  {'min': '20',   'max': '80',  'step': '10'},
    'Indicators.Stochastic':           {'min': '20',   'max': '80',  'step': '10'},
    'Indicators.WilliamsPR':           {'min': '-80',  'max': '-20', 'step': '10'},
    'Indicators.ADX':                  {'min': '10',   'max': '50',  'step': '5'},
    'Indicators.CCI':                  {'min': '-100', 'max': '100', 'step': '25'},
    'Indicators.ChoppinessIndex':      {'min': '30',   'max': '70',  'step': '10'},
    'Indicators.HurstExponent':        {'min': '0.4',  'max': '0.7', 'step': '0.05'},
    'Indicators.KaufmanEfficiencyRatio':{'min': '0.1',  'max': '0.7', 'step': '0.1'},
    'Indicators.ZScore':               {'min': '-2',   'max': '2',   'step': '0.5'},
    'Indicators.Momentum':             {'min': '98',   'max': '102', 'step': '1'},
    'Indicators.ROC':                  {'min': '-0.5', 'max': '0.5', 'step': '0.1'},
    'Indicators.CSSAMarketRegime':     {'min': '10',   'max': '90',  'step': '10'},
    'Indicators.SRPercentRank':        {'min': '10',   'max': '90',  'step': '10'},
    'Indicators.EntropyMath':          {'min': '100',  'max': '200', 'step': '20'},
}

ALL_INDICATORS = {**CATEGORY_A, **CATEGORY_B}


def fix_indicator_values(xml: str) -> tuple[str, list[str]]:
    changes = []
    for ind_key, ranges in ALL_INDICATORS.items():
        # Solo modifica si el bloque está use="true" (los desactivados no nos preocupan)
        # El regex captura el bloque y reemplaza los 3 atributos numéricos
        ind_key_escaped = re.escape(ind_key)
        pattern = re.compile(
            r'(<Block key="' + ind_key_escaped + r'" weight="\d+" use="true" )'
            r'indicatorMin="-?\d+(?:\.\d+)?" '
            r'indicatorMax="-?\d+(?:\.\d+)?" '
            r'indicatorStep="-?\d+(?:\.\d+)?"'
        )
        new_attrs = (
            f'indicatorMin="{ranges["min"]}" '
            f'indicatorMax="{ranges["max"]}" '
            f'indicatorStep="{ranges["step"]}"'
        )
        new_xml, n = pattern.subn(r'\1' + new_attrs, xml)
        if n > 0:
            short_name = ind_key.replace('Indicators.', '')
            category = 'A' if ind_key in CATEGORY_A else 'B'
            changes.append(
                f'[{category}] {short_name}: '
                f'min={ranges["min"]} max={ranges["max"]} step={ranges["step"]} '
                f'({n} match)'
            )
            xml = new_xml
    return xml, changes


def fix_blocksetting(sqb_path: Path) -> None:
    if not sqb_path.exists():
        print(f'ERROR: {sqb_path} no existe', file=sys.stderr)
        sys.exit(1)

    with zipfile.ZipFile(sqb_path, 'r') as z:
        with z.open('config.xml') as f:
            xml = f.read().decode('utf-8')

    new_xml, changes = fix_indicator_values(xml)

    if not changes:
        print(f'  {sqb_path.name}: sin cambios (ningún indicador activo del mapa)')
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
        print('Uso: python fix_bs_v6.py <archivo.sqb> [archivo2.sqb ...]', file=sys.stderr)
        sys.exit(1)

    print('Aplicando fix v6 (Indicator values universales)...\n')
    print('CATEGORIA A (magnitudes variables -> 0/10/0.5 -> Percentiles): ' +
          str(len(CATEGORY_A)) + ' indicators')
    print('CATEGORIA B (oscillators normalizados -> rangos universales): ' +
          str(len(CATEGORY_B)) + ' indicators')
    print()
    for arg in sys.argv[1:]:
        fix_blocksetting(Path(arg))
    print('\nHecho. IMPORTANTE: NO ejecutar "Calibrate" en SQX despues de este fix.')


if __name__ == '__main__':
    main()
