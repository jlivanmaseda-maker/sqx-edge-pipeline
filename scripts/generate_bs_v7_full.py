"""
Generador BS v7 — REESTRUCTURA COMPLETA
========================================

Aprovecha los 119 indicators disponibles (47 nativos + 72 snippets) tras descarga masiva.

Estrategia:
  - Para cada BS v7, toma un .sqb v6 como plantilla (tiene 70 indicators listados)
  - Flipa use="true"/"false" según la lista por categoría
  - Aplica fixes acumulados (v1-v6 ya están en el v6 base, se preservan)
  - Para BS_Filtros, ajusta rangos PT/SL/TS/TSA por TF

Genera:
  8 BS de categoría:
    BS_Tendencia_v7, BS_Momentum_v7, BS_Volatilidad_v7, BS_Regimen_v7,
    BS_Estadistico_v7, BS_Volumen_v7, BS_SoporteResistencia_v7
  +
  5 BS_Filtros por TF:
    BS_Filtros_v7_M5, M15, M30, H1, H4

Output: C:\\Users\\Livan\\OneDrive\\Documentos\\EDGE\\Block Settings\\v7\\
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


V6_DIR = Path(r"C:\Users\Livan\OneDrive\Documentos\EDGE\Block Settings\v4\v6")
OUTPUT_DIR = Path(r"C:\Users\Livan\OneDrive\Documentos\EDGE\Block Settings\v7")
BACKUP_DIR = OUTPUT_DIR / "backup_pre_v7_2026-05-17"


# ============================================================================
# DEFINICIÓN DE BS v7 — qué indicators activar en cada uno
# ============================================================================
# Cada lista contiene los nombres EXACTOS de Indicators.X tal como aparecen en el XML v6.
# Los snippets ULTRA-nuevos (KalmanFilter, MAMAFAMAKAMA, WaveTrend, etc.) NO están en el v6
# y deben añadirse manualmente desde SQX UI tras cargar el .sqb v7 generado.

BS_CATEGORIES = {
    'BS_Tendencia_v7': {
        'template': 'BS_Tendencia_v6.sqb',
        'indicators_on': {
            # Moving averages clásicos
            'SMA', 'EMA', 'LWMA', 'SMMA', 'TEMA',
            # MAs adaptativos
            'HullMovingAverage', 'KAMA',
            # Trend signals
            'Ichimoku', 'MACD', 'ParabolicSAR', 'SuperTrend',
            # Linear regression
            'LinearRegression',
            # Trailing + Cycle
            'ATRTrailingStops', 'EhlersMotherOfAdaptiveMovingAverages',
            'SchaffTrendCycle', 'Reflex',
        },
        'is_filter': False,
    },
    'BS_Momentum_v7': {
        'template': 'BS_Momentum_v6.sqb',
        'indicators_on': {
            # Clásicos
            'RSI', 'Stochastic', 'Momentum', 'CCI', 'ROC',
            'AwesomeOscillator', 'OSMA', 'WilliamsPR',
            # Especializados
            'DeMarker', 'LaguerreRSI', 'QQE',
            # Smoothed / vigor
            'SmoothedRSI', 'RVI', 'CaseyCPercent', 'DSSBressert',
            # Power
            'BearsPower', 'BullsPower',
            # MACD complemento
            'MACD',
        },
        'is_filter': False,
    },
    'BS_Volatilidad_v7': {
        'template': 'BS_Volatilidad_v6_intraday_v6.sqb',
        'indicators_on': {
            # ATR family
            'ATR', 'MTATR', 'TrueRange', 'LogATR',
            # Volatility bands
            'BollingerBands', 'KeltnerChannel', 'MTKeltnerChannel',
            'DonchianChannels',
            # Custom bands
            'VWAPATRBands', 'VWAPBollingerBands',
            'HullMovingAverageATRBands', 'HullMovingAverageBollingerBands',
            # Statistical vol
            'StdDev', 'UlcerIndex',
        },
        'is_filter': False,
    },
    'BS_Regimen_v7': {
        'template': 'BS_Regimen_v6.sqb',
        'indicators_on': {
            # Trend strength nativos
            'ADX', 'Aroon', 'Vortex', 'KaufmanEfficiencyRatio',
            # Cycle/Trend Ehlers
            'Reflex',
            # Range detection
            'ChoppinessIndex',
            # Custom regime
            'CSSAMarketRegime', 'EhlersHilbertTransform',
            'EntropyMath', 'HurstExponent',
        },
        'is_filter': False,
    },
    'BS_Estadistico_v7': {
        'template': 'BS_Estadistico_v6.sqb',
        'indicators_on': {
            # Statistical
            'ZScore', 'SRPercentRank',
            # Distributional
            'HurstExponent', 'EntropyMath',
            # Detrended
            'DPO', 'CaseyCPercent',
        },
        'is_filter': False,
    },
    'BS_Volumen_v7': {
        'template': 'BS_Volumen_v6.sqb',
        'indicators_on': {
            'AvgVolume', 'VWAP',
            'VWAPATRBands', 'VWAPBollingerBands',
        },
        'is_filter': False,
    },
    'BS_SoporteResistencia_v7': {
        'template': 'BS_SoporteResistencia_v6.sqb',
        'indicators_on': {
            # Price action
            'Fractal', 'Highest', 'HighestInRange', 'Lowest', 'LowestInRange',
            # Classic levels
            'Fibo', 'GannHiLo', 'Pivots',
            # Channels
            'DonchianChannels',
        },
        'is_filter': False,
    },
}


# BS_Filtros — 5 por TF, mismo set de indicators (subset estricto), exits ajustados por TF
BS_FILTROS_INDICATORS_ON = {
    'ADX', 'KaufmanEfficiencyRatio',
    'ATR',
    'AvgVolume',
    'RSI',
    'BollingerBands',
    'ChoppinessIndex', 'HurstExponent',
}

# Rangos PT/SL/TS/TSA por TF (los mismos del v7 original)
TF_CONFIGS = {
    'M5':  (1.5, 3.5, 0.5, 1.5, 0.3, 0.8, 0.3, 0.8, 0.1),
    'M15': (1.5, 4.0, 0.5, 1.5, 0.3, 1.0, 0.3, 1.0, 0.1),
    'M30': (2.0, 4.5, 0.5, 2.0, 0.4, 1.2, 0.4, 1.2, 0.1),
    'H1':  (2.0, 5.0, 1.0, 3.0, 0.5, 2.0, 0.5, 2.0, 0.5),
    'H4':  (1.5, 3.0, 0.5, 1.5, 0.3, 1.0, 0.3, 1.0, 0.1),
}


# ============================================================================
# FUNCIONES de manipulación XML
# ============================================================================

def flip_indicator(xml: str, indicator: str, use_value: str) -> tuple[str, bool]:
    """Cambia el use= del bloque Indicators.<indicator>. Devuelve (xml, changed)."""
    pattern = re.compile(
        r'(<Block key="Indicators\.' + re.escape(indicator) + r'"[^>]+use=")(true|false)(")'
    )
    new_xml, n = pattern.subn(rf'\g<1>{use_value}\g<3>', xml)
    return new_xml, n > 0


def set_category_indicators(xml: str, on_set: set) -> tuple[str, dict]:
    """Para cada Indicators.X listado: pone use=true si está en on_set, else use=false.
    Devuelve (xml_modificado, {indicator: 'on'/'off'/'not_found'})."""
    # Detectar todos los Indicators listados
    listed = set(re.findall(r'<Block key="Indicators\.(\w+)"', xml))
    log = {}

    for indicator in listed:
        if indicator == 'Number':
            # Number siempre OFF (overfit guard, fix v1)
            xml, _ = flip_indicator(xml, indicator, 'false')
            continue
        target = 'true' if indicator in on_set else 'false'
        xml, ok = flip_indicator(xml, indicator, target)
        log[indicator] = target if ok else 'not_found'

    # Detectar los que pedimos pero NO están listados
    not_in_xml = on_set - listed
    for ind in not_in_xml:
        log[ind] = 'MISSING_IN_XML (añadir manualmente desde SQX UI)'

    return xml, log


def patch_atr_block(xml: str, block_name: str, value_path: str,
                    min_val: float, max_val: float, step: float) -> str:
    """Modifica los min/max/step del Param Value de un bloque ATR-based."""
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
    """Aplica política Capa 2 a los exits:
       PT use=true prob=100, SL use=true prob=100,
       TS use=true prob=50, TSA use=true prob=100,
       ExitAfterBars OFF, MoveSL2BE OFF (prob=0),
       FixedValue en Trailing/Activation OFF.
    """
    # ProfitTarget ON 100%
    xml = re.sub(r'(<Block key="ProfitTarget\.ProfitTarget"[^>]*?use=")\w+(")', r'\g<1>true\g<2>', xml)
    xml = re.sub(r'(<Block key="ProfitTarget\.ProfitTarget"[^>]*?probability=")\d+(")', r'\g<1>100\g<2>', xml)
    # StopLoss ON 100%
    xml = re.sub(r'(<Block key="StopLoss\.StopLoss"[^>]*?use=")\w+(")', r'\g<1>true\g<2>', xml)
    xml = re.sub(r'(<Block key="StopLoss\.StopLoss"[^>]*?probability=")\d+(")', r'\g<1>100\g<2>', xml)
    # TrailingStop ON 50%
    xml = re.sub(r'(<Block key="TrailingStop\.TrailingStop"[^>]*?use=")\w+(")', r'\g<1>true\g<2>', xml)
    xml = re.sub(r'(<Block key="TrailingStop\.TrailingStop"[^>]*?probability=")\d+(")', r'\g<1>50\g<2>', xml)
    # TrailingActivation ON 100%
    xml = re.sub(r'(<Block key="TrailingStop\.TrailingActivation"[^>]*?use=")\w+(")', r'\g<1>true\g<2>', xml)
    xml = re.sub(r'(<Block key="TrailingStop\.TrailingActivation"[^>]*?probability=")\d+(")', r'\g<1>100\g<2>', xml)
    # ExitAfterBars OFF, prob=0
    xml = re.sub(r'(<Block key="ExitAfterBars\.ExitAfterBars"[^>]*?use=")\w+(")', r'\g<1>false\g<2>', xml)
    xml = re.sub(r'(<Block key="ExitAfterBars\.ExitAfterBars"[^>]*?probability=")\d+(")', r'\g<1>0\g<2>', xml)
    # MoveSL2BE OFF, prob=0
    xml = re.sub(r'(<Block key="MoveSL2BE\.MoveSL2BE"[^>]*?use=")\w+(")', r'\g<1>false\g<2>', xml)
    xml = re.sub(r'(<Block key="MoveSL2BE\.MoveSL2BE"[^>]*?probability=")\d+(")', r'\g<1>0\g<2>', xml)
    # FixedValue OFF en Trailing y Activation
    xml = re.sub(
        r'(<Block key="TrailingStop\.TrailingActivation"[^>]*>.*?<Value key="SQ\.Formulas\.Range\.FixedValue" use=")true(")',
        r'\g<1>false\g<2>', xml, flags=re.DOTALL
    )
    xml = re.sub(
        r'(<Block key="TrailingStop\.TrailingStop"[^>]*>.*?<Value key="SQ\.Formulas\.RangeLevel\.FixedValue" use=")true(")',
        r'\g<1>false\g<2>', xml, flags=re.DOTALL
    )
    return xml


def disable_all_exits(xml: str) -> str:
    """Para BS de categoría (edges puros): TODOS los exits OFF (se manejan en BS_Filtros)."""
    for key in ['ProfitTarget.ProfitTarget', 'StopLoss.StopLoss',
                'TrailingStop.TrailingStop', 'TrailingStop.TrailingActivation',
                'MoveSL2BE.MoveSL2BE']:
        xml = re.sub(
            r'(<Block key="' + re.escape(key) + r'"[^>]*?use=")\w+(")',
            r'\g<1>false\g<2>', xml
        )
        xml = re.sub(
            r'(<Block key="' + re.escape(key) + r'"[^>]*?probability=")\d+(")',
            r'\g<1>0\g<2>', xml
        )
    # ExitAfterBars sigue OFF (políticade v6 ya)
    xml = re.sub(r'(<Block key="ExitAfterBars\.ExitAfterBars"[^>]*?use=")\w+(")', r'\g<1>false\g<2>', xml)
    xml = re.sub(r'(<Block key="ExitAfterBars\.ExitAfterBars"[^>]*?probability=")\d+(")', r'\g<1>0\g<2>', xml)
    return xml


# ============================================================================
# GENERACIÓN
# ============================================================================

def gen_category_bs(bs_name: str, cfg: dict) -> Path:
    template_path = V6_DIR / cfg['template']
    if not template_path.exists():
        raise FileNotFoundError(f'Template no encontrado: {template_path}')

    with zipfile.ZipFile(template_path) as z:
        xml = z.read('config.xml').decode('utf-8')

    xml, log = set_category_indicators(xml, cfg['indicators_on'])

    if cfg['is_filter']:
        xml = apply_filter_exits(xml)
    else:
        xml = disable_all_exits(xml)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / f'{bs_name}.sqb'
    with zipfile.ZipFile(out_path, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('config.xml', xml)

    return out_path, log


def gen_filtros_for_tf(tf: str, config: tuple) -> Path:
    tp_min, tp_max, sl_min, sl_max, ts_min, ts_max, tact_min, tact_max, ts_step = config
    template_path = V6_DIR / 'BS_Filtros_v6.sqb'
    with zipfile.ZipFile(template_path) as z:
        xml = z.read('config.xml').decode('utf-8')

    # Set indicators (subset estricto)
    xml, log = set_category_indicators(xml, BS_FILTROS_INDICATORS_ON)

    # Aplicar rangos por TF
    xml = patch_atr_block(xml, 'ProfitTarget.ProfitTarget', 'SQ.Formulas.SLPT.ATRBasedValue',
                          tp_min, tp_max, 0.5)
    xml = patch_atr_block(xml, 'StopLoss.StopLoss', 'SQ.Formulas.SLPT.ATRBasedValue',
                          sl_min, sl_max, 0.5)
    xml = patch_atr_block(xml, 'TrailingStop.TrailingStop', 'SQ.Formulas.RangeLevel.ATRBasedValue',
                          ts_min, ts_max, ts_step)
    xml = patch_atr_block(xml, 'TrailingStop.TrailingActivation', 'SQ.Formulas.Range.ATRBasedValue',
                          tact_min, tact_max, ts_step)

    # Exits config (Capa 2)
    xml = apply_filter_exits(xml)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / f'BS_Filtros_v7_{tf}.sqb'
    with zipfile.ZipFile(out_path, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('config.xml', xml)
    return out_path, log


def main():
    print('=' * 80)
    print('GENERADOR BS v7 — REESTRUCTURA COMPLETA')
    print('=' * 80)
    print(f'  Plantillas (v6): {V6_DIR}')
    print(f'  Output (v7):     {OUTPUT_DIR}')

    # Backup
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    if OUTPUT_DIR.exists():
        for f in OUTPUT_DIR.glob('*.sqb'):
            shutil.copy2(f, BACKUP_DIR / f.name)
    print(f'  Backup pre-v7:   {BACKUP_DIR}')
    print()

    all_missing = {}  # bs_name -> list of indicators no listed in v6

    # 1. Generar BS de categoría
    print('=' * 80)
    print('FASE 1: BS de categoría (8)')
    print('=' * 80)
    for bs_name, cfg in BS_CATEGORIES.items():
        out_path, log = gen_category_bs(bs_name, cfg)
        on_count = sum(1 for v in log.values() if v == 'true')
        missing = [k for k, v in log.items() if 'MISSING' in v]
        size_kb = out_path.stat().st_size / 1024
        print(f'\n[OK] {out_path.name} ({size_kb:.1f} KB) · {on_count} indicators ON')
        if missing:
            all_missing[bs_name] = missing

    # 2. Generar BS_Filtros por TF
    print()
    print('=' * 80)
    print('FASE 2: BS_Filtros por TF (5)')
    print('=' * 80)
    for tf, config in TF_CONFIGS.items():
        out_path, _ = gen_filtros_for_tf(tf, config)
        size_kb = out_path.stat().st_size / 1024
        print(f'[OK] {out_path.name} ({size_kb:.1f} KB)  '
              f'TP {config[0]}-{config[1]} · SL {config[2]}-{config[3]} · '
              f'TS {config[4]}-{config[5]}')

    # 3. Reporte de snippets no listados (a añadir manual en SQX UI)
    if all_missing:
        print()
        print('=' * 80)
        print('⚠ SNIPPETS NO LISTADOS EN v6 — AÑADIR DESDE SQX UI')
        print('=' * 80)
        for bs_name, missing in all_missing.items():
            if missing:
                print(f'\n{bs_name}:')
                for m in missing: print(f'   • {m}')

    print()
    print('=' * 80)
    print(f'✓ {len(BS_CATEGORIES) + len(TF_CONFIGS)} BS generados en {OUTPUT_DIR}')
    print('=' * 80)
    print()
    print('Próximos pasos:')
    print('  1. Cargar cada .sqb v7 en SQX para verificar carga sin errores')
    print('  2. Para los snippets "no listados" arriba: marcarlos manualmente desde')
    print('     "Settings → Indicators" en el proyecto SQX (1 click cada uno) y guardar')
    print('  3. Usar BS_Filtros_v7_<TF> según el timeframe del proyecto')


if __name__ == '__main__':
    main()
