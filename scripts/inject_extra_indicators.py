"""
Inyecta los bloques XML de los snippets ULTRA-nuevos en los .sqb v7 existentes.

Estrategia:
  1. Para cada snippet .java instalado en user/extend/Snippets/SQ/Blocks/
  2. Parsea sus anotaciones @BuildingBlock + @Indicator + @Parameter
  3. Genera el bloque XML <Block key="Indicators.X">... siguiendo el formato v6
  4. Inyecta en cada .sqb v7 (donde corresponda según categoría)
  5. Marca use="true" para los snippets de la "shopping list" del usuario

Aplica fixes acumulados (v6): indicatorMin/Max/Step universales por indicator.

Backup automático del .sqb antes de modificar.
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


SNIPPETS_DIR = Path(r'D:\WuantumBot\Software\SQX_142\SQX_142\SQX_142_Crack\user\extend\Snippets\SQ\Blocks')
BS_V7_DIR = Path(r"C:\Users\Livan\OneDrive\Documentos\EDGE\Block Settings\v7")
BACKUP_DIR = BS_V7_DIR / "backup_pre_inject_2026-05-17"


# ============================================================================
# RANGOS FIJOS DE indicatorMin/Max/Step POR INDICATOR (fix v6 universal)
# ============================================================================
# Si el snippet está aquí, usamos estos valores (más coherentes que los del .java).
# Si NO está aquí, usamos los del .java (sus @Indicator(min, max, step)).
INDICATOR_RANGES = {
    # Magnitudes variables → forzar rango escala-invariante (Percentiles)
    'ATRPercent':       (0, 10, 0.5),
    'ATRPercentRank':   (0, 100, 10),     # ya es percentil natural
    'LogATR':           (-5, 10, 0.1),
    'WaveTrend':        (-100, 100, 10),
    'VST':              (0, 10, 0.5),
    'KalmanFilter':     (0, 10, 0.5),
    'EfficiencySuperTrend': (0, 10, 0.5),
    'HalfTrend':        (0, 10, 0.5),
    'EhlersMOAMA':      (0, 10, 0.5),
    'MAMAFAMAKAMA':     (0, 10, 0.5),
    'KAMAOhlc':         (0, 10, 0.5),
    'VIDYA':            (0, 10, 0.5),
    'VMA':              (0, 10, 0.5),
    'DEMA':             (0, 10, 0.5),
    'SlopeDirectionLine': (0, 10, 0.5),
    'AdaptiveFisherTransform': (-5, 5, 0.5),
    'CMMA':             (-5, 5, 0.5),
    'BollingerBandsPercentB': (0, 1, 0.1),
    'DPO':              (-5, 5, 0.5),
    'VWAPATRBands':     (0, 10, 0.5),
    'VWAPBollingerBands': (0, 10, 0.5),
    'HullMovingAverageATRBands': (0, 10, 0.5),
    'HullMovingAverageBollingerBands': (0, 10, 0.5),
    'HullMovingAverageBands': (0, 10, 0.5),
    'VIDYABollingerBands': (0, 10, 0.5),
    'VMABollingerBands': (0, 10, 0.5),
    'SmoothedATRWithBands': (0, 10, 0.5),
    'TMACenteredBands': (0, 10, 0.5),
    'HalfTrendBollingerBands': (0, 10, 0.5),
    # Oscillators con rangos naturales convencionales
    'TTMSqueeze':       (0, 100, 10),
    'WAE':              (0, 100, 10),
    'ConnorsRSI':       (10, 90, 10),
    'SmoothedRSI':      (20, 80, 10),
    'MoneyFlowIndex':   (20, 80, 10),
    'DVO':              (10, 90, 10),
    'RVI':              (-1, 1, 0.1),
    'DSSBressert':      (10, 90, 10),
    'CaseyCPercent':    (10, 90, 10),
    'UltimateC':        (10, 90, 10),
    'BHErgodic':        (-2, 2, 0.5),
    'DidiIndex':        (-1, 1, 0.1),
    'DisparityIndex':   (-5, 5, 0.5),
    'UltimateOscillator': (20, 80, 10),
    'TotalPowerIndicator': (10, 90, 10),
    'TradersDynamicIndex': (10, 90, 10),
    'RCI3Lines':        (-100, 100, 10),
    'Accelerator':      (-2, 2, 0.5),
    'SwingFailureIndex': (-1, 1, 0.1),
    'AutoCorrelation':  (-1, 1, 0.1),
    'CUSUM':            (-10, 10, 1),
    'DTW':              (0, 100, 5),
    'WassersteinDistance': (0, 100, 5),
    'KolmogorovSmirnovTest': (0, 1, 0.1),
    'VolumeOscillator': (-50, 50, 5),
    'SRPercentRankSmoothed': (10, 90, 10),
    'ZScore':           (-2, 2, 0.5),
    'SSL':              (0, 10, 0.5),
    'SMC':              (0, 10, 0.5),
    'LiquiditySweep':   (0, 10, 0.5),
}


# ============================================================================
# ASIGNACIÓN DE SNIPPETS A CADA BS v7 (lista de extras + estado use=true)
# ============================================================================
BS_EXTRAS = {
    'BS_Tendencia_v7': [
        'EfficiencySuperTrend', 'KalmanFilter', 'MAMAFAMAKAMA', 'SlopeDirectionLine',
        'DEMA', 'HalfTrend', 'VIDYA', 'VMA', 'AdaptiveFisherTransform',
        'DidiIndex', 'KAMAOhlc',
    ],
    'BS_Momentum_v7': [
        'WaveTrend', 'UltimateOscillator', 'ConnorsRSI', 'DSSBressert', 'DVO',
        'RCI3Lines', 'DisparityIndex', 'BollingerBandsPercentB', 'Accelerator',
        'TotalPowerIndicator', 'TradersDynamicIndex', 'BHErgodic', 'UltimateC',
    ],
    'BS_Volatilidad_v7': [
        'TTMSqueeze', 'ATRPercent', 'ATRPercentRank', 'WAE', 'VST',
        'HullMovingAverageBands', 'VIDYABollingerBands', 'VMABollingerBands',
        'SmoothedATRWithBands', 'TMACenteredBands', 'HalfTrendBollingerBands',
    ],
    'BS_Regimen_v7': [
        'DTW', 'WassersteinDistance', 'KolmogorovSmirnovTest', 'CUSUM',
        'AutoCorrelation',
    ],
    'BS_Estadistico_v7': [
        'AutoCorrelation', 'ConnorsRSI', 'CUSUM', 'KolmogorovSmirnovTest',
        'WassersteinDistance', 'DVO', 'BollingerBandsPercentB', 'CMMA',
        'SRPercentRankSmoothed',
    ],
    'BS_Volumen_v7': [
        'MoneyFlowIndex', 'VolumeOscillator',
    ],
    'BS_SoporteResistencia_v7': [
        'SSL', 'SwingFailureIndex',
        # SMC se desglosa en 3 .java:
        'BreakOfStructure', 'FairValueGap', 'OrderBlockDetector',
        'LiquiditySweep',
    ],
}

# Para los 5 BS_Filtros, mismo set de extras
BS_FILTROS_EXTRAS = [
    'MoneyFlowIndex', 'ATRPercent', 'TTMSqueeze', 'EfficiencySuperTrend',
]


# ============================================================================
# PARSER del .java
# ============================================================================

def find_main_java(snippet_name: str) -> Path | None:
    """Busca el .java 'principal' de un snippet dentro de su carpeta.
    Reglas:
      1. SMC contiene 3 .java distintos → buscar en carpeta SMC/<snippet_name>.java
      2. Si existe <name>/<name>.java exacto → ése
      3. Si existe <name>/<alias>.java (CRSI para ConnorsRSI, etc) → mapeo
      4. El primer .java de la carpeta SIN sufijos (Rising/Falling/AboveLevel/etc.)
    """
    # SMC tiene 3 .java separados dentro de SMC/
    smc_components = {'BreakOfStructure', 'FairValueGap', 'OrderBlockDetector'}
    if snippet_name in smc_components:
        candidate = SNIPPETS_DIR / 'SMC' / f'{snippet_name}.java'
        if candidate.exists(): return candidate

    folder = SNIPPETS_DIR / snippet_name
    if not folder.exists():
        return None

    # Mapeos especiales para nombres alternativos
    alias_map = {
        'ConnorsRSI':       'CRSI',
        'LiquiditySweep':   'SimpleLiquiditySweep',
        'EhlersMOAMA':      'EhlersMotherOfAdaptiveMovingAverages',
    }
    if snippet_name in alias_map:
        candidate = folder / f'{alias_map[snippet_name]}.java'
        if candidate.exists(): return candidate

    # Exact match
    candidate = folder / f'{snippet_name}.java'
    if candidate.exists(): return candidate

    # Primer .java sin sufijos de variantes
    suffixes_to_skip = ('AboveLevel', 'BelowLevel', 'Rising', 'Falling',
                       'CrossDown', 'CrossUp', 'CrossesAbove', 'CrossesBelow',
                       'CrossesAboveLevel', 'CrossesBelowLevel', 'CrossAboveLevel', 'CrossBelowLevel',
                       'ChangesDown', 'ChangesUp', 'IsHigher', 'IsLower')
    for j in sorted(folder.glob('*.java')):
        if not any(j.stem.endswith(s) for s in suffixes_to_skip):
            return j
    return None


def parse_snippet_java(java_path: Path) -> dict | None:
    """Parsea las anotaciones @BuildingBlock, @Indicator, @Parameter del .java.
       Devuelve {key, indicator_min, indicator_max, indicator_step, parameters: [...]}.
       Devuelve None si no es un IndicatorBlock parseable."""
    if not java_path.exists():
        return None
    code = java_path.read_text(encoding='utf-8', errors='replace')

    # Solo IndicatorBlocks (no ConditionBlocks)
    if 'extends IndicatorBlock' not in code:
        return None

    # @Indicator(min=X, max=Y, step=Z) — OPCIONAL (algunos snippets no lo tienen)
    ind_m = re.search(r'@Indicator\([^)]*\)', code)
    if ind_m:
        ind_args = ind_m.group(0)
        min_m = re.search(r'min\s*=\s*([-\d.]+)', ind_args)
        max_m = re.search(r'max\s*=\s*([-\d.]+)', ind_args)
        step_m = re.search(r'step\s*=\s*([-\d.]+)', ind_args)
        indicator_min = float(min_m.group(1)) if min_m else 0
        indicator_max = float(max_m.group(1)) if max_m else 100
        indicator_step = float(step_m.group(1)) if step_m else 1
    else:
        # Defaults conservadores (serán sobrescritos por INDICATOR_RANGES si está mapeado)
        indicator_min, indicator_max, indicator_step = 0, 100, 1

    # class name (key)
    cls_m = re.search(r'public\s+class\s+(\w+)\s+extends', code)
    if not cls_m:
        return None
    class_name = cls_m.group(1)

    # @Parameter blocks — soporta @Help entre @Parameter y public
    params = []
    param_pattern = re.compile(
        r'@Parameter\s*(?:\(([^)]*)\))?'           # @Parameter o @Parameter(...)
        r'(?:\s*\n\s*@Help\([^)]*\))*'             # opcional: 0+ @Help(...) intermedios
        r'\s*\n\s*public\s+(\w+(?:\[\])?)\s+(\w+)\s*;',
        re.MULTILINE | re.DOTALL
    )
    for m in param_pattern.finditer(code):
        attrs_str = m.group(1) or ''
        java_type = m.group(2)
        java_name = m.group(3)

        # Saltar ChartData (será emitido como 'Chart' aparte siempre)
        if java_type == 'ChartData':
            continue

        # Extraer name, minValue, maxValue, step, defaultValue de attrs_str
        def attr(key):
            mm = re.search(key + r'\s*=\s*"?([\-\d.\w]+)"?', attrs_str)
            return mm.group(1) if mm else None

        name = attr('name') or java_name
        min_val = attr('minValue')
        max_val = attr('maxValue')
        step = attr('step')
        default = attr('defaultValue')

        # Mapear tipo Java a tipo XML
        if java_type in ('int', 'long'):
            xml_type = 'int'
        elif java_type in ('double', 'float'):
            xml_type = 'double'
        elif java_type == 'boolean':
            xml_type = 'boolean'
        else:
            xml_type = 'int'

        # Defaults razonables si faltan
        if min_val is None and xml_type == 'int':
            min_val = '10'
        if max_val is None and xml_type == 'int':
            max_val = '200'
        if step is None:
            step = '10' if xml_type == 'int' else '0.1'

        params.append({
            'key': java_name,
            'name': name,
            'type': xml_type,
            'min': min_val,
            'max': max_val,
            'step': step,
        })

    return {
        'class_name': class_name,
        'key': f'Indicators.{class_name}',
        'indicator_min': indicator_min,
        'indicator_max': indicator_max,
        'indicator_step': indicator_step,
        'parameters': params,
    }


def generate_block_xml(parsed: dict, use_value: str) -> str:
    """Genera el bloque XML para un snippet parseado."""
    name = parsed['class_name']
    imin, imax, istep = parsed['indicator_min'], parsed['indicator_max'], parsed['indicator_step']

    # Aplicar override del INDICATOR_RANGES (fix v6 universal)
    if name in INDICATOR_RANGES:
        imin, imax, istep = INDICATOR_RANGES[name]

    # Format helper: int si es int, else float compacto
    def fmt(v):
        if isinstance(v, float) and v == int(v):
            return str(int(v))
        return str(v)

    lines = [
        f'        <Block key="Indicators.{name}" weight="1" use="{use_value}" '
        f'indicatorMin="{fmt(imin)}" indicatorMax="{fmt(imax)}" indicatorStep="{fmt(istep)}" '
        f'category="indicators">',
        f'            <Generated weight="1">',
        f'                <Param key="#Chart#" name="Chart" type="data" paramType="null" generation="random" minValue="null" maxValue="null" step="null" allCharts="true" />',
    ]

    for p in parsed['parameters']:
        # Acotar Period mínimo a 2
        min_v = p['min']
        max_v = p['max']
        step_v = p['step']
        # Para rangos Period, usar formato típico v6
        lines.append(
            f'                <Param key="#{p["key"]}#" name="{p["name"]}" type="{p["type"]}" paramType="null" '
            f'generation="random" minValue="{min_v}" maxValue="{max_v}" step="{step_v}" />'
        )

    # Shift siempre al final
    lines.append(
        '                <Param key="#Shift#" name="Shift" type="int" paramType="null" '
        'generation="random" minValue="-1000001" maxValue="-1000002" step="1" />'
    )
    lines.append('            </Generated>')
    lines.append('            <Predefined changed="false" />')
    lines.append('        </Block>')
    return '\n'.join(lines)


def inject_blocks_into_sqb(sqb_path: Path, snippets_to_add: list[str], snippets_on: set[str]) -> tuple[int, list[str]]:
    """Inyecta los bloques XML de los snippets en el .sqb.
       snippets_to_add: lista de nombres a añadir al XML
       snippets_on: subset que debe quedar use="true" (el resto será use="false")
       Devuelve (count_added, log_msgs)
    """
    log = []

    with zipfile.ZipFile(sqb_path) as z:
        xml = z.read('config.xml').decode('utf-8', errors='replace')

    # Filtrar los que ya estén en el XML (no duplicar)
    already_listed = set(re.findall(r'<Block key="Indicators\.(\w+)"', xml))

    new_blocks_xml = []
    added = []
    for snip in snippets_to_add:
        if snip in already_listed:
            log.append(f'  ⊘ {snip}: ya en XML — saltado')
            continue

        # Buscar el .java principal (main indicator, no las variantes Above/Below/Rising/etc.)
        java_path = find_main_java(snip)
        if not java_path:
            log.append(f'  ✗ {snip}: .java no encontrado para snippet {snip}')
            continue

        parsed = parse_snippet_java(java_path)
        if parsed:
            # Si el class_name del .java es distinto del snip pedido, usamos el class_name
            # para el bloque XML (key Indicators.X)
            pass
        if not parsed:
            log.append(f'  ✗ {snip}: no parseable (no es IndicatorBlock?)')
            continue

        use_val = 'true' if snip in snippets_on else 'false'
        block_xml = generate_block_xml(parsed, use_val)
        new_blocks_xml.append(block_xml)
        added.append(snip)
        log.append(f'  ✓ {snip}: añadido use={use_val} (min={parsed["indicator_min"]}, max={parsed["indicator_max"]})')

    if not new_blocks_xml:
        return 0, log

    # Inyectar antes del cierre de <BuildingBlocks>
    insertion = '\n' + '\n'.join(new_blocks_xml) + '\n'
    if '</BuildingBlocks>' in xml:
        xml = xml.replace('</BuildingBlocks>', insertion + '    </BuildingBlocks>', 1)
    else:
        log.append(f'  ✗ No se encontró </BuildingBlocks> — no se inyectó')
        return 0, log

    # Reescribir el .sqb
    with zipfile.ZipFile(sqb_path, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('config.xml', xml)

    return len(new_blocks_xml), log


def main():
    print('=' * 80)
    print('INYECTOR DE EXTRAS — SNIPPETS ULTRA-NUEVOS A LOS .SQB v7')
    print('=' * 80)
    print(f'Snippets dir:  {SNIPPETS_DIR}')
    print(f'BS v7 dir:     {BS_V7_DIR}')
    print()

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    for sqb in BS_V7_DIR.glob('*.sqb'):
        shutil.copy2(sqb, BACKUP_DIR / sqb.name)
    print(f'Backup en:     {BACKUP_DIR}\n')

    total_added = 0

    # 1. BS de categoría
    for bs_name, snippets_list in BS_EXTRAS.items():
        sqb_path = BS_V7_DIR / f'{bs_name}.sqb'
        if not sqb_path.exists():
            print(f'⚠ {bs_name}.sqb no existe — saltado')
            continue
        print(f'\n📦 {bs_name}.sqb')
        count, log = inject_blocks_into_sqb(sqb_path, snippets_list, set(snippets_list))
        for line in log:
            print(line)
        print(f'   → {count} bloques añadidos')
        total_added += count

    # 2. BS_Filtros por TF (mismo set de extras a todos)
    for tf in ['M5', 'M15', 'M30', 'H1', 'H4']:
        sqb_path = BS_V7_DIR / f'BS_Filtros_v7_{tf}.sqb'
        if not sqb_path.exists():
            continue
        print(f'\n📦 BS_Filtros_v7_{tf}.sqb')
        count, log = inject_blocks_into_sqb(sqb_path, BS_FILTROS_EXTRAS, set(BS_FILTROS_EXTRAS))
        for line in log:
            print(line)
        print(f'   → {count} bloques añadidos')
        total_added += count

    print()
    print('=' * 80)
    print(f'✓ TOTAL: {total_added} bloques inyectados en los 12 .sqb v7')
    print('=' * 80)
    print()
    print('Próximos pasos:')
    print('  1. Cargar UN .sqb v7 en SQX para verificar que carga sin errores')
    print('  2. Si OK, los demás también funcionarán (mismo formato)')
    print('  3. Si falla, ver mensaje de error y reportar para ajustar el parser')


if __name__ == '__main__':
    main()
