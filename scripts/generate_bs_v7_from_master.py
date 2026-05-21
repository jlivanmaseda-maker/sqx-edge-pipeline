"""
Reconstruye los 12 BS v7 usando BS_master_v7.sqb como template.

Estrategia:
  1. El master tiene los 119 indicators listados en formato SQX nativo
  2. Para cada BS v7, copia el master ENTERO y:
     - Flipa use="true" para los indicators de la categoría
     - Aplica fixes v1-v6 (calibración universal)
     - Para BS_Filtros, ajusta exits PT/SL/TS por TF
     - Para BS de categoría, deja exits OFF

Resultado: 12 .sqb v7 con formato 100% compatible con SQX 142.
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


MASTER_PATH = Path(r'C:\Users\Livan\OneDrive\Desktop\BS_master_v7.sqb')
OUTPUT_DIR = Path(r'C:\Users\Livan\OneDrive\Documentos\EDGE\Block Settings\v7')
BACKUP_DIR = OUTPUT_DIR / 'backup_pre_rebuild_from_master_2026-05-18'


# ============================================================================
# DEFINICIÓN BS v7 — qué indicators activar en cada uno
# ============================================================================
BS_INDICATORS_ON = {
    'BS_Tendencia_v7': {
        # MAs clásicos + adaptativos
        'SMA', 'EMA', 'LWMA', 'SMMA', 'TEMA', 'DEMA',
        'HullMovingAverage', 'KAMA', 'KAMAOhlc',
        # Trend signals
        'Ichimoku', 'MACD', 'ParabolicSAR', 'SuperTrend', 'EfficiencySuperTrend',
        'HalfTrend', 'LinearRegression', 'ATRTrailingStops', 'SlopeDirectionLine',
        # Adaptivos avanzados
        'MAMAFAMAKAMA', 'EhlersMotherOfAdaptiveMovingAverages',
        'KalmanFilter', 'VIDYA', 'VMA', 'AdaptiveFisherTransform',
        # Cycle/Ehlers
        'Reflex', 'SchaffTrendCycle', 'DidiIndex',
    },
    'BS_Momentum_v7': {
        # Clásicos
        'RSI', 'Stochastic', 'Momentum', 'CCI', 'ROC',
        'AwesomeOscillator', 'OSMA', 'WilliamsPR', 'MACD', 'MACDV',
        # Especializados
        'DeMarker', 'LaguerreRSI', 'QQE', 'RVI',
        # Smoothed / vigor
        'SmoothedRSI', 'CRSI', 'CaseyCPercent', 'DSSBressert', 'UltimateC',
        # Power
        'BearsPower', 'BullsPower',
        # Avanzados
        'WaveTrend', 'UltimateOscillator', 'DVO', 'RCI3Lines',
        'DisparityIndex', 'BollingerBandsPercentB', 'Accelerator',
        'TotalPowerIndicator', 'TradersDynamicIndex', 'BHErgodic',
    },
    'BS_Volatilidad_v7': {
        # ATR family
        'ATR', 'MTATR', 'TrueRange', 'LogATR',
        'ATRPercent', 'ATRPercentRank',
        # Volatility bands
        'BollingerBands', 'KeltnerChannel', 'MTKeltnerChannel',
        'DonchianChannels',
        # Custom bands
        'VWAPATRBands', 'VWAPBollingerBands',
        'HullMovingAverageATRBands', 'HullMovingAverageBollingerBands',
        'VIDYABollingerBands', 'VMABollingerBands',
        'SmoothedATRWithBands', 'TMACenteredBands', 'HalfTrendBollingerBands',
        # Statistical vol
        'StdDev', 'UlcerIndex',
        # Squeeze/explosion
        'TTMSqueeze', 'WAE', 'VST',
    },
    'BS_Regimen_v7': {
        # Trend strength
        'ADX', 'Aroon', 'Vortex', 'KaufmanEfficiencyRatio',
        # Cycle/Ehlers
        'Reflex',
        # Range detection
        'ChoppinessIndex',
        # Custom regime
        'CSSAMarketRegime', 'EhlersHilbertTransform',
        'EntropyMath', 'HurstExponent',
        # Statistical regime change
        'DTW', 'WassersteinDistance', 'KolmogorovSmirnovTest',
        'CUSUM', 'AutoCorrelation',
    },
    'BS_Estadistico_v7': {
        'ZScore', 'SRPercentRank', 'SRPercentRankSmoothed',
        'HurstExponent', 'EntropyMath',
        'DPO', 'CaseyCPercent', 'CMMA',
        'BollingerBandsPercentB', 'DVO',
        'AutoCorrelation', 'CUSUM',
        'KolmogorovSmirnovTest', 'WassersteinDistance',
        'CRSI',
    },
    'BS_Volumen_v7': {
        'AvgVolume', 'VWAP',
        'MoneyFlowIndex', 'VolumeOscillator',
        'VWAPATRBands', 'VWAPBollingerBands',
    },
    'BS_SoporteResistencia_v7': {
        # Classic
        'Fractal', 'Highest', 'HighestInRange', 'Lowest', 'LowestInRange',
        'Fibo', 'GannHiLo', 'Pivots',
        # Channels
        'DonchianChannels',
        # SMC + price action
        'SSL', 'SwingFailureIndex',
        'BreakOfStructure', 'FairValueGap', 'OrderBlockDetector',
        'SimpleLiquiditySweep',
    },
}

# BS_Filtros — subset estricto (todos los TFs comparten lista)
BS_FILTROS_INDICATORS_ON = {
    'ADX', 'KaufmanEfficiencyRatio',
    'ATR', 'ATRPercent',
    'AvgVolume', 'MoneyFlowIndex',
    'RSI',
    'BollingerBands',
    'ChoppinessIndex', 'HurstExponent',
    'TTMSqueeze',
    'EfficiencySuperTrend',
}

# TF configs PT/SL/TS/TSA por TF
TF_CONFIGS = {
    'M5':  (1.5, 3.5, 0.5, 1.5, 0.3, 0.8, 0.3, 0.8, 0.1),
    'M15': (1.5, 4.0, 0.5, 1.5, 0.3, 1.0, 0.3, 1.0, 0.1),
    'M30': (2.0, 4.5, 0.5, 2.0, 0.4, 1.2, 0.4, 1.2, 0.1),
    'H1':  (2.0, 5.0, 1.0, 3.0, 0.5, 2.0, 0.5, 2.0, 0.5),
    'H4':  (1.5, 3.0, 0.5, 1.5, 0.3, 1.0, 0.3, 1.0, 0.1),
}


# ============================================================================
# FIX v6 — Rangos universales indicatorMin/Max/Step
# ============================================================================
INDICATOR_RANGES_V6 = {
    # CAT A: magnitudes variables → escala-invariante (0/10/0.5)
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

    # CAT B: oscillators con rango natural
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

    # Inyectados ULTRA-nuevos
    'ATRPercent':       ('0', '10', '0.5'),
    'ATRPercentRank':   ('0', '100', '10'),
    'WaveTrend':        ('-100', '100', '10'),
    'VST':              ('0', '10', '0.5'),
    'KalmanFilter':     ('0', '10', '0.5'),
    'EfficiencySuperTrend': ('0', '10', '0.5'),
    'HalfTrend':        ('0', '10', '0.5'),
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
    'MACDV':            ('0', '10', '0.5'),
    'VWAPATRBands':     ('0', '10', '0.5'),
    'VWAPBollingerBands': ('0', '10', '0.5'),
    'HullMovingAverageATRBands': ('0', '10', '0.5'),
    'HullMovingAverageBollingerBands': ('0', '10', '0.5'),
    'VIDYABollingerBands': ('0', '10', '0.5'),
    'VMABollingerBands': ('0', '10', '0.5'),
    'SmoothedATRWithBands': ('0', '10', '0.5'),
    'TMACenteredBands': ('0', '10', '0.5'),
    'HalfTrendBollingerBands': ('0', '10', '0.5'),
    'TTMSqueeze':       ('0', '100', '10'),
    'WAE':              ('0', '100', '10'),
    'CRSI':             ('10', '90', '10'),
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
    # Snippets que solo registran (Number sigue OFF)
    'OrderBlockDetector': ('-2', '2', '0.5'),
    'BreakOfStructure': ('0', '100', '10'),
    'FairValueGap':     ('0', '100', '10'),
    'SimpleLiquiditySweep': ('0', '100', '10'),
    'SSL':              ('0', '10', '0.5'),
}


# ============================================================================
# FUNCIONES
# ============================================================================

def set_use_for_indicators(xml: str, on_set: set) -> tuple[str, dict]:
    """Para cada Indicators.X: use=true si está en on_set, else use=false.
       Number siempre OFF."""
    listed = sorted(set(re.findall(r'<Block key="Indicators\.(\w+)"', xml)))
    log = {}
    for ind in listed:
        if ind == 'Number':
            target = 'false'
        else:
            target = 'true' if ind in on_set else 'false'
        # Flipa todos los use= en la línea de cabecera del bloque Indicators.<ind>
        pattern = re.compile(
            r'(<Block key="Indicators\.' + re.escape(ind) + r'"[^>]+use=")(true|false)(")'
        )
        new_xml, n = pattern.subn(rf'\g<1>{target}\g<3>', xml)
        if n > 0:
            xml = new_xml
            log[ind] = target
    return xml, log


def apply_v6_ranges(xml: str) -> int:
    """Fuerza indicatorMin/Max/Step según INDICATOR_RANGES_V6."""
    count = 0
    for name, (imin, imax, istep) in INDICATOR_RANGES_V6.items():
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
    """Fix v5: Bars 100..1000 step=100, Percentile 5..95 step=5."""
    count = 0
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


def patch_atr_block(xml: str, block_name: str, value_path: str,
                    min_val: float, max_val: float, step: float) -> str:
    block_pattern = re.compile(
        r'(<Block key="' + re.escape(block_name) +
        r'"[^>]*>.*?<Value key="' + re.escape(value_path) +
        r'"[^>]*>.*?<Param key="#Value#"[^/]*?)minValue="[^"]*"\s+maxValue="[^"]*"(\s+step="[^"]*")?',
        re.DOTALL,
    )
    def repl(m):
        return f'{m.group(1)}minValue="{min_val}" maxValue="{max_val}" step="{step}"'
    new_xml, n = block_pattern.subn(repl, xml)
    return new_xml


def apply_filter_exits(xml: str) -> str:
    """Política Capa 2 exits (PT/SL on 100%, TS 50%, TSA 100%, EAB/BE off)."""
    xml = re.sub(r'(<Block key="ProfitTarget\.ProfitTarget"[^>]*?use=")\w+(")', r'\g<1>true\g<2>', xml)
    xml = re.sub(r'(<Block key="ProfitTarget\.ProfitTarget"[^>]*?probability=")\d+(")', r'\g<1>100\g<2>', xml)
    xml = re.sub(r'(<Block key="StopLoss\.StopLoss"[^>]*?use=")\w+(")', r'\g<1>true\g<2>', xml)
    xml = re.sub(r'(<Block key="StopLoss\.StopLoss"[^>]*?probability=")\d+(")', r'\g<1>100\g<2>', xml)
    xml = re.sub(r'(<Block key="TrailingStop\.TrailingStop"[^>]*?use=")\w+(")', r'\g<1>true\g<2>', xml)
    xml = re.sub(r'(<Block key="TrailingStop\.TrailingStop"[^>]*?probability=")\d+(")', r'\g<1>50\g<2>', xml)
    xml = re.sub(r'(<Block key="TrailingStop\.TrailingActivation"[^>]*?use=")\w+(")', r'\g<1>true\g<2>', xml)
    xml = re.sub(r'(<Block key="TrailingStop\.TrailingActivation"[^>]*?probability=")\d+(")', r'\g<1>100\g<2>', xml)
    xml = re.sub(r'(<Block key="ExitAfterBars\.ExitAfterBars"[^>]*?use=")\w+(")', r'\g<1>false\g<2>', xml)
    xml = re.sub(r'(<Block key="ExitAfterBars\.ExitAfterBars"[^>]*?probability=")\d+(")', r'\g<1>0\g<2>', xml)
    xml = re.sub(r'(<Block key="MoveSL2BE\.MoveSL2BE"[^>]*?use=")\w+(")', r'\g<1>false\g<2>', xml)
    xml = re.sub(r'(<Block key="MoveSL2BE\.MoveSL2BE"[^>]*?probability=")\d+(")', r'\g<1>0\g<2>', xml)
    return xml


def apply_layer1_exits(xml: str) -> str:
    """Política Capa 1 (BS de categoría / edge puro):
       - ExitAfterBars: use=true probability=100 (Capa 1 cierra forzosamente a N barras)
       - PT/SL/TS/TSA/BE: use=false probability=0 (NO gestión en Capa 1)
       NOTA: SQX respeta use=false en PT/SL/TS/TSA/BE, pero NO en ExitAfterBars
             (por eso ExitAfterBars usa probability como control real).
    """
    for key in ['ProfitTarget.ProfitTarget', 'StopLoss.StopLoss',
                'TrailingStop.TrailingStop', 'TrailingStop.TrailingActivation',
                'MoveSL2BE.MoveSL2BE']:
        xml = re.sub(r'(<Block key="' + re.escape(key) + r'"[^>]*?use=")\w+(")', r'\g<1>false\g<2>', xml)
        xml = re.sub(r'(<Block key="' + re.escape(key) + r'"[^>]*?probability=")\d+(")', r'\g<1>0\g<2>', xml)
    # ExitAfterBars ON al 100% en Capa 1 (CLAUDE.md: "Exit: ExitAfterBars=20 fijo")
    xml = re.sub(r'(<Block key="ExitAfterBars\.ExitAfterBars"[^>]*?use=")\w+(")', r'\g<1>true\g<2>', xml)
    xml = re.sub(r'(<Block key="ExitAfterBars\.ExitAfterBars"[^>]*?probability=")\d+(")', r'\g<1>100\g<2>', xml)
    return xml


# ============================================================================
# MAIN
# ============================================================================

def gen_bs(bs_name: str, on_set: set, is_filter: bool, tf_config: tuple = None) -> dict:
    with zipfile.ZipFile(MASTER_PATH) as z:
        xml = z.read('config.xml').decode('utf-8')

    # Set use= por indicator
    xml, log = set_use_for_indicators(xml, on_set)

    # Fix v6: rangos universales
    xml, n_ranges = apply_v6_ranges(xml)

    # Fix v5: Bars + Percentile
    xml, n_pct = apply_percentile_bars_fix(xml)

    # Exits según tipo de BS
    if is_filter:
        xml = apply_filter_exits(xml)
        if tf_config:
            tp_min, tp_max, sl_min, sl_max, ts_min, ts_max, tact_min, tact_max, ts_step = tf_config
            xml = patch_atr_block(xml, 'ProfitTarget.ProfitTarget', 'SQ.Formulas.SLPT.ATRBasedValue',
                                  tp_min, tp_max, 0.5)
            xml = patch_atr_block(xml, 'StopLoss.StopLoss', 'SQ.Formulas.SLPT.ATRBasedValue',
                                  sl_min, sl_max, 0.5)
            xml = patch_atr_block(xml, 'TrailingStop.TrailingStop', 'SQ.Formulas.RangeLevel.ATRBasedValue',
                                  ts_min, ts_max, ts_step)
            xml = patch_atr_block(xml, 'TrailingStop.TrailingActivation', 'SQ.Formulas.Range.ATRBasedValue',
                                  tact_min, tact_max, ts_step)
    else:
        xml = apply_layer1_exits(xml)

    # Guardar
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUTPUT_DIR / f'{bs_name}.sqb'
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('config.xml', xml)

    on_count = sum(1 for v in log.values() if v == 'true')
    return {
        'path': out,
        'on_count': on_count,
        'ranges_fixed': n_ranges,
        'pct_bars_fixed': n_pct,
    }


def main():
    print('=' * 80)
    print('RECONSTRUCCIÓN BS v7 DESDE MASTER')
    print('=' * 80)
    print(f'Master: {MASTER_PATH}')
    print(f'Output: {OUTPUT_DIR}')

    if not MASTER_PATH.exists():
        print(f'ERROR: master no encontrado')
        return 1

    # Backup
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    if OUTPUT_DIR.exists():
        for f in OUTPUT_DIR.glob('*.sqb'):
            shutil.copy2(f, BACKUP_DIR / f.name)
    print(f'Backup: {BACKUP_DIR}\n')

    # BS de categoría
    print('FASE 1: BS de categoría (7)')
    print('-' * 80)
    for bs_name, on_set in BS_INDICATORS_ON.items():
        r = gen_bs(bs_name, on_set, is_filter=False)
        size_kb = r['path'].stat().st_size / 1024
        print(f'  {bs_name:<35} {r["on_count"]:>3} ON  |  {size_kb:>6.1f} KB  |  '
              f'ranges={r["ranges_fixed"]}, pct/bars={r["pct_bars_fixed"]}')

    print()
    print('FASE 2: BS_Filtros por TF (5)')
    print('-' * 80)
    for tf, config in TF_CONFIGS.items():
        bs_name = f'BS_Filtros_v7_{tf}'
        r = gen_bs(bs_name, BS_FILTROS_INDICATORS_ON, is_filter=True, tf_config=config)
        size_kb = r['path'].stat().st_size / 1024
        print(f'  {bs_name:<35} {r["on_count"]:>3} ON  |  {size_kb:>6.1f} KB  |  '
              f'TP {config[0]}-{config[1]} · SL {config[2]}-{config[3]}')

    print()
    print('=' * 80)
    print(f'✓ 12 BS v7 reconstruidos en {OUTPUT_DIR}')
    print('=' * 80)


if __name__ == '__main__':
    sys.exit(main() or 0)
