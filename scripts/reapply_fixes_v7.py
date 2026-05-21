"""
Re-aplica los fixes v4+v5+v6 a los .sqb v7.

Problema detectado: los .sqb v6 base tenían algunos rangos auto-calibrados por SQX
(no los universales del fix). Mi generador v7 los heredó. Este script los corrige.

Fixes aplicados:
  v4 — AvgVolume → indicatorMin/Max/Step = 0/10/0.5 (NO auto-calibrado)
  v5 — En IsGreater/LowerPercentil: Bars 100..1000 step=100, Percentile 5..95 step=5
  v6 — Indicator ranges universales:
    CAT A (magnitudes variables → 0/10/0.5): ATR, LogATR, MTATR, StdDev, TrueRange,
          MACD, OSMA, AwesomeOscillator, EhlersHilbertTransform, UlcerIndex, AvgVolume
    CAT B (oscillators con rango natural): RSI 20-80, ADX 10-50, ChoppinessIndex 30-70,
          HurstExponent 0.4-0.7, KER 0.1-0.7, ZScore -2..2, etc.
"""
import sys
import zipfile
import re
import shutil
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

BS_V7_DIR = Path(r"C:\Users\Livan\OneDrive\Documentos\EDGE\Block Settings\v7")
BACKUP_DIR = BS_V7_DIR / "backup_pre_fix_reapply_2026-05-17"


# ============================================================================
# RANGOS UNIVERSALES POR INDICATOR (fix v4 + v6)
# ============================================================================
# CAT A: magnitudes variables que requieren Percentil → 0/10/0.5
# CAT B: oscillators con rango natural conocido
INDICATOR_RANGES = {
    # ─── CAT A — fuerza Percentiles (0/10/0.5) ───
    'ATR':         ('0', '10', '0.5'),
    'LogATR':      ('-5', '10', '0.1'),
    'MTATR':       ('0', '10', '0.5'),
    'StdDev':      ('0', '10', '0.5'),
    'TrueRange':   ('0', '10', '0.5'),
    'MACD':        ('0', '10', '0.5'),
    'OSMA':        ('0', '10', '0.5'),
    'AwesomeOscillator': ('0', '10', '0.5'),
    'EhlersHilbertTransform': ('0', '10', '0.5'),
    'UlcerIndex':  ('0', '10', '0.5'),
    'AvgVolume':   ('0', '10', '0.5'),

    # ─── CAT B — oscillators con rango natural ───
    'RSI':                ('20', '80', '10'),
    'Stochastic':         ('20', '80', '10'),
    'WilliamsPR':         ('-80', '-20', '10'),
    'ADX':                ('10', '50', '5'),
    'CCI':                ('-100', '100', '25'),
    'ChoppinessIndex':    ('30', '70', '10'),
    'HurstExponent':      ('0.4', '0.7', '0.05'),
    'KaufmanEfficiencyRatio': ('0.1', '0.7', '0.1'),
    'ZScore':             ('-2', '2', '0.5'),
    'Momentum':           ('98', '102', '1'),
    'ROC':                ('-0.5', '0.5', '0.1'),
    'CSSAMarketRegime':   ('10', '90', '10'),
    'SRPercentRank':      ('10', '90', '10'),
    'EntropyMath':        ('100', '200', '20'),

    # ─── Inyectados ULTRA-nuevos (fix v6 extendido) ───
    'ATRPercent':       ('0', '10', '0.5'),
    'ATRPercentRank':   ('0', '100', '10'),
    'WaveTrend':        ('-100', '100', '10'),
    'VST':              ('0', '10', '0.5'),
    'KalmanFilter':     ('0', '10', '0.5'),
    'EfficiencySuperTrend': ('0', '10', '0.5'),
    'HalfTrend':        ('0', '10', '0.5'),
    'EhlersMOAMA':      ('0', '10', '0.5'),
    'EhlersMotherOfAdaptiveMovingAverages': ('0', '10', '0.5'),
    'MAMAFAMAKAMA':     ('0', '10', '0.5'),
    'KAMAOhlc':         ('0', '10', '0.5'),
    'VIDYA':            ('0', '10', '0.5'),
    'VMA':              ('0', '10', '0.5'),
    'DEMA':             ('0', '10', '0.5'),
    'SlopeDirectionLine': ('0', '10', '0.5'),
    'AdaptiveFisherTransform': ('-5', '5', '0.5'),
    'CMMA':             ('-5', '5', '0.5'),
    'BollingerBandsPercentB': ('0', '1', '0.1'),
    'DPO':              ('-5', '5', '0.5'),
    'VWAPATRBands':     ('0', '10', '0.5'),
    'VWAPBollingerBands': ('0', '10', '0.5'),
    'HullMovingAverageATRBands': ('0', '10', '0.5'),
    'HullMovingAverageBollingerBands': ('0', '10', '0.5'),
    'HullMovingAverageBands': ('0', '10', '0.5'),
    'VIDYABollingerBands': ('0', '10', '0.5'),
    'VMABollingerBands': ('0', '10', '0.5'),
    'SmoothedATRWithBands': ('0', '10', '0.5'),
    'TMACenteredBands': ('0', '10', '0.5'),
    'HalfTrendBollingerBands': ('0', '10', '0.5'),
    'TTMSqueeze':       ('0', '100', '10'),
    'WAE':              ('0', '100', '10'),
    'ConnorsRSI':       ('10', '90', '10'),
    'SmoothedRSI':      ('20', '80', '10'),
    'MoneyFlowIndex':   ('20', '80', '10'),
    'DVO':              ('10', '90', '10'),
    'RVI':              ('-1', '1', '0.1'),
    'DSSBressert':      ('10', '90', '10'),
    'CaseyCPercent':    ('10', '90', '10'),
    'UltimateC':        ('10', '90', '10'),
    'BHErgodic':        ('-2', '2', '0.5'),
    'DidiIndex':        ('-1', '1', '0.1'),
    'DisparityIndex':   ('-5', '5', '0.5'),
    'UltimateOscillator': ('20', '80', '10'),
    'TotalPowerIndicator': ('10', '90', '10'),
    'TradersDynamicIndex': ('10', '90', '10'),
    'RCI3Lines':        ('-100', '100', '10'),
    'Accelerator':      ('-2', '2', '0.5'),
    'SwingFailureIndex': ('-1', '1', '0.1'),
    'AutoCorrelation':  ('-1', '1', '0.1'),
    'CUSUM':            ('-10', '10', '1'),
    'DTW':              ('0', '100', '5'),
    'WassersteinDistance': ('0', '100', '5'),
    'KolmogorovSmirnovTest': ('0', '1', '0.1'),
    'VolumeOscillator': ('-50', '50', '5'),
    'SRPercentRankSmoothed': ('10', '90', '10'),
}


def apply_indicator_ranges(xml: str) -> tuple[str, int]:
    """Fuerza indicatorMin/Max/Step en los bloques Indicators.X según INDICATOR_RANGES.
    Devuelve (xml, count_changed)."""
    count = 0
    for name, (imin, imax, istep) in INDICATOR_RANGES.items():
        # Buscar el bloque y reemplazar los 3 atributos
        # Cuidado: hay que mantener cualquier otro atributo (use, weight, etc.)
        pattern = re.compile(
            r'(<Block key="Indicators\.' + re.escape(name) + r'"[^>]*?)'
            r'indicatorMin="[^"]*"\s+indicatorMax="[^"]*"\s+indicatorStep="[^"]*"'
        )
        new_xml, n = pattern.subn(
            lambda m: m.group(1) + f'indicatorMin="{imin}" indicatorMax="{imax}" indicatorStep="{istep}"',
            xml
        )
        if n > 0:
            xml = new_xml
            count += n
    return xml, count


def apply_percentile_bars_fix(xml: str) -> tuple[str, int]:
    """Fix v5: dentro de Items IsGreaterPercentil / IsLowerPercentil,
       reemplazar #Bars# range a 100..1000 step=100 y #Percentile# a 5..95 step=5.
    """
    count = 0
    # Buscar bloques IsGreater/LowerPercentil con su Param Bars y Percentile
    # Como están dentro de comparison templates, modificamos los Params dentro de cada Item
    # Approach: buscar todos los #Bars# y #Percentile# en el XML y forzar rangos

    # Bars: solo si está como Param del IsGreater/LowerPercentil (no como Param de un Indicator)
    # Heurística: cualquier <Param key="#Bars#"> en el XML
    bars_pat = re.compile(
        r'(<Param key="#Bars#"[^>]+?)minValue="[^"]*"\s+maxValue="[^"]*"\s+step="[^"]*"'
    )
    new_xml, n = bars_pat.subn(
        lambda m: m.group(1) + 'minValue="100" maxValue="1000" step="100"',
        xml
    )
    if n > 0:
        xml = new_xml
        count += n

    # Percentile
    pct_pat = re.compile(
        r'(<Param key="#Percentile#"[^>]+?)minValue="[^"]*"\s+maxValue="[^"]*"\s+step="[^"]*"'
    )
    new_xml, n = pct_pat.subn(
        lambda m: m.group(1) + 'minValue="5" maxValue="95" step="5"',
        xml
    )
    if n > 0:
        xml = new_xml
        count += n

    return xml, count


def process_sqb(sqb_path: Path) -> dict:
    with zipfile.ZipFile(sqb_path) as z:
        xml = z.read('config.xml').decode('utf-8')

    xml, n_ind = apply_indicator_ranges(xml)
    xml, n_pct = apply_percentile_bars_fix(xml)

    with zipfile.ZipFile(sqb_path, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('config.xml', xml)

    return {'indicators_fixed': n_ind, 'percentile_bars_fixed': n_pct}


def main():
    print('=' * 70)
    print('RE-APLICACIÓN DE FIXES v4+v5+v6 A LOS BS v7')
    print('=' * 70)

    if not BS_V7_DIR.exists():
        print(f'ERROR: {BS_V7_DIR} no existe')
        return 1

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    for sqb in BS_V7_DIR.glob('*.sqb'):
        shutil.copy2(sqb, BACKUP_DIR / sqb.name)
    print(f'Backup: {BACKUP_DIR}\n')

    total_ind = 0
    total_pct = 0
    for sqb in sorted(BS_V7_DIR.glob('*.sqb')):
        r = process_sqb(sqb)
        print(f'  {sqb.name:<40} indicators={r["indicators_fixed"]:>3}  pct/bars={r["percentile_bars_fixed"]:>3}')
        total_ind += r['indicators_fixed']
        total_pct += r['percentile_bars_fixed']

    print()
    print(f'TOTAL: {total_ind} indicators range-fixed, {total_pct} percentile/bars fixed')
    print('\nVerificación recomendada: re-ejecutar verify_v7_fixes.py para confirmar.')


if __name__ == '__main__':
    sys.exit(main() or 0)
