"""
Analizador de calidad de data Dukascopy — replica el "Analyze data quality" de SQX.

Conecta a Dukascopy MT5 vía Python (MetaTrader5), descarga barras al TF objetivo,
calcula gaps + spikes + bad OHLC, y reporta por año.

Detección equivalente a SQX:
  - GAP:      hueco temporal entre 2 barras consecutivas >2x el TF normal
              (ignora cierres de fin de semana y festivos predecibles)
  - SPIKE:    barra con rango (High-Low) > 5x el rango promedio rolling 100
  - BAD OHLC: violación lógica (H<L, H<O, H<C, L>O, L>C)

Output por activo:
  - Fechas inicio/fin
  - # barras total
  - Gaps total y por año
  - Spikes total y por año
  - Bad OHLC
  - Veredicto por año: VERDE (<2% gaps) / AMARILLO (2-5%) / ROJO (>5%)
  - Recomendación: año desde el que data es "minable" (verde sostenido)
"""
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

import MetaTrader5 as mt5

DUKAS_PATH = "C:/Program Files/Dukascopy MetaTrader 5/terminal64.exe"
START = datetime(2010, 1, 1)
END = datetime(2026, 5, 19)

# Mapping Dashboard ID → Símbolo Dukas (del download_dukas_bulk.py existente)
SYMBOL_MAP = {
    "EURUSD": "EURUSD", "GBPUSD": "GBPUSD", "USDJPY": "USDJPY", "USDCHF": "USDCHF",
    "AUDUSD": "AUDUSD", "NZDUSD": "NZDUSD", "USDCAD": "USDCAD",
    "EURGBP": "EURGBP", "EURJPY": "EURJPY", "EURCAD": "EURCAD", "EURCHF": "EURCHF",
    "EURAUD": "EURAUD", "EURNZD": "EURNZD",
    "GBPJPY": "GBPJPY", "GBPNZD": "GBPNZD", "GBPAUD": "GBPAUD", "GBPCAD": "GBPCAD", "GBPCHF": "GBPCHF",
    "AUDJPY": "AUDJPY", "NZDJPY": "NZDJPY", "CADJPY": "CADJPY", "CHFJPY": "CHFJPY",
    "AUDNZD": "AUDNZD", "AUDCAD": "AUDCAD", "NZDCAD": "NZDCAD", "CADCHF": "CADCHF",
    "USDMXN": "USDMXN", "USDZAR": "USDZAR",
    "US500": "USA500.IDX", "USTEC": "USATECH.IDX", "GER40": "DEU.IDX", "US30": "USA30.IDX",
    "XAUUSD": "XAUUSD",
}

TF_MAP = {
    "M5":  (mt5.TIMEFRAME_M5,  300),
    "M15": (mt5.TIMEFRAME_M15, 900),
    "M30": (mt5.TIMEFRAME_M30, 1800),
    "H1":  (mt5.TIMEFRAME_H1,  3600),
    "H4":  (mt5.TIMEFRAME_H4,  14400),
    "D1":  (mt5.TIMEFRAME_D1,  86400),
}


def fetch_with_retry(symbol, tf_code, retries=3, delay=3.0):
    for attempt in range(retries):
        rates = mt5.copy_rates_range(symbol, tf_code, START, END)
        if rates is not None and len(rates) > 100:
            return rates
        if attempt < retries - 1:
            time.sleep(delay)
    return rates


def analyze_quality(rates, tf_seconds, tf_label):
    """Calcula gaps (% cobertura), spikes, bad OHLC por año.

    Enfoque cobertura: el "% gaps" es realmente "% barras esperadas faltantes".
    Para forex/XAU: ~24h/día × 5 días/semana = 120h/semana en H1
                    ~6 H4 × 5 días/semana = 30 H4/semana
                    ~250 días hábiles/año típico

    Esto evita falsos positivos por cierre diario de mercado.
    """
    if rates is None or len(rates) == 0:
        return None

    times = [datetime.fromtimestamp(r['time']) for r in rates]
    highs = [float(r['high']) for r in rates]
    lows = [float(r['low']) for r in rates]
    opens = [float(r['open']) for r in rates]
    closes = [float(r['close']) for r in rates]

    n = len(rates)
    by_year = {}

    # Inicializar contadores por año
    for t in times:
        y = t.year
        if y not in by_year:
            by_year[y] = {'bars': 0, 'gaps': 0, 'spikes': 0, 'bad_ohlc': 0}
        by_year[y]['bars'] += 1

    # Rango promedio rolling para spikes
    ranges = [h - l for h, l in zip(highs, lows)]
    avg_ranges = []
    window = 100
    for i in range(n):
        start = max(0, i - window)
        sub = ranges[start:i+1] if i > 0 else ranges[:1]
        avg_ranges.append(sum(sub) / len(sub))

    # GAPS por COBERTURA — comparar barras reales vs esperadas por año
    # Asume 252 días hábiles/año (forex/XAU 24h, índices ~6h/día)
    # H1:  252 días × 23h = 5796 barras/año esperadas (1h cierre/día)
    # H4:  252 días × 6 H4 = 1512 barras/año esperadas
    # M30: 252 × 46 = 11592
    # M15: 252 × 92 = 23184
    # M5:  252 × 276 = 69552
    expected_per_year = {
        300: 69552,   # M5
        900: 23184,   # M15
        1800: 11592,  # M30
        3600: 5796,   # H1
        14400: 1512,  # H4
        86400: 252,   # D1
    }
    expected_full_year = expected_per_year.get(tf_seconds, 5796)

    for y in by_year:
        # Ajustar para años parciales (primer/último año del rango)
        first_date_year = min(t for t in times if t.year == y)
        last_date_year = max(t for t in times if t.year == y)
        if y == times[0].year:
            # primer año parcial: prorratear desde la fecha real de inicio
            days_in_year = (datetime(y + 1, 1, 1) - first_date_year).days
            expected = int(expected_full_year * days_in_year / 365)
        elif y == times[-1].year:
            # último año parcial
            days_in_year = (last_date_year - datetime(y, 1, 1)).days + 1
            expected = int(expected_full_year * days_in_year / 365)
        else:
            expected = expected_full_year
        missing = max(0, expected - by_year[y]['bars'])
        by_year[y]['expected'] = expected
        by_year[y]['gaps'] = missing

    # SPIKES: rango > 5x rolling avg
    for i in range(window, n):  # skip primeros 100 para tener avg estable
        if ranges[i] > 5 * avg_ranges[i]:
            y = times[i].year
            by_year[y]['spikes'] += 1

    # BAD OHLC: H<L, H<O, H<C, L>O, L>C
    for i in range(n):
        h, l, o, c = highs[i], lows[i], opens[i], closes[i]
        if h < l or h < o or h < c or l > o or l > c:
            y = times[i].year
            by_year[y]['bad_ohlc'] += 1

    # Porcentajes y veredicto por año (gap% sobre EXPECTED, no sobre bars)
    for y, d in by_year.items():
        if d['expected'] > 0:
            d['gap_pct'] = d['gaps'] / d['expected'] * 100
            d['coverage'] = d['bars'] / d['expected'] * 100
            d['spike_pct'] = d['spikes'] / max(d['bars'], 1) * 100
            d['bad_pct'] = d['bad_ohlc'] / max(d['bars'], 1) * 100
            # Veredicto: VERDE cobertura ≥95%, AMARILLO 80-95%, ROJO <80%
            if d['coverage'] >= 95 and d['bad_pct'] < 0.5:
                d['verdict'] = 'VERDE'
            elif d['coverage'] >= 80 and d['bad_pct'] < 1:
                d['verdict'] = 'AMARILLO'
            else:
                d['verdict'] = 'ROJO'
        else:
            d['gap_pct'] = d['coverage'] = d['spike_pct'] = d['bad_pct'] = 0
            d['verdict'] = 'N/A'

    # Total
    total_gaps = sum(d['gaps'] for d in by_year.values())
    total_expected = sum(d['expected'] for d in by_year.values())
    total_spikes = sum(d['spikes'] for d in by_year.values())
    total_bad = sum(d['bad_ohlc'] for d in by_year.values())

    # Encontrar primer año verde sostenido (>=2 años verdes consecutivos)
    sorted_years = sorted(by_year.keys())
    first_clean_year = None
    for i, y in enumerate(sorted_years):
        if by_year[y]['verdict'] == 'VERDE':
            # ¿es sostenido? mira el siguiente
            if i + 1 < len(sorted_years) and by_year[sorted_years[i+1]]['verdict'] == 'VERDE':
                first_clean_year = y
                break

    return {
        'tf': tf_label,
        'n_bars': n,
        'expected_total': total_expected,
        'first_bar': times[0],
        'last_bar': times[-1],
        'total_gaps': total_gaps,
        'total_spikes': total_spikes,
        'total_bad_ohlc': total_bad,
        'gap_pct_global': total_gaps / total_expected * 100 if total_expected else 0,
        'coverage_global': n / total_expected * 100 if total_expected else 0,
        'by_year': by_year,
        'first_clean_year': first_clean_year,
    }


def analyze_asset(asset_id, symbol, tfs=['H1', 'H4']):
    """Analiza un activo en uno o más TFs. Devuelve dict con resultados."""
    results = {}
    # Asegurar símbolo activado
    mt5.symbol_select(symbol, True)
    time.sleep(0.5)
    for tf_label in tfs:
        tf_code, tf_seconds = TF_MAP[tf_label]
        rates = fetch_with_retry(symbol, tf_code)
        if rates is None or len(rates) < 100:
            results[tf_label] = None
            continue
        results[tf_label] = analyze_quality(rates, tf_seconds, tf_label)
    return results


def print_report(asset_id, symbol, results):
    print('═' * 100)
    print(f'  {asset_id}  (Dukas symbol: {symbol})')
    print('═' * 100)
    for tf, r in results.items():
        if r is None:
            print(f'  [{tf}]  ⚠ Sin data o sample insuficiente')
            continue
        print(f'\n  [{tf}]  Barras={r["n_bars"]:,} / esperadas={r["expected_total"]:,}  '
              f'Cobertura={r["coverage_global"]:.1f}%  Rango: {r["first_bar"]:%Y-%m-%d} → {r["last_bar"]:%Y-%m-%d}')
        print(f'         Gaps={r["total_gaps"]:,} ({r["gap_pct_global"]:.2f}%)  '
              f'Spikes={r["total_spikes"]:,}  Bad OHLC={r["total_bad_ohlc"]}')
        if r['first_clean_year']:
            print(f'         ⭐ Apto para mining desde: {r["first_clean_year"]} (verde sostenido)')
        else:
            print(f'         ❌ No hay periodo verde sostenido')
        # Tabla por año
        print(f'         {"Año":<6} {"Bars":>7} {"Esp.":>7} {"Cov%":>6} {"BadOHLC":>8} {"Vrd"}')
        print(f'         {"-"*6:<6} {"-"*7:>7} {"-"*7:>7} {"-"*6:>6} {"-"*8:>8} {"-"*3}')
        for y in sorted(r['by_year']):
            d = r['by_year'][y]
            symbol_mark = '🟢' if d['verdict'] == 'VERDE' else ('🟡' if d['verdict'] == 'AMARILLO' else '🔴')
            print(f'         {y:<6} {d["bars"]:>7} {d["expected"]:>7} {d["coverage"]:>5.1f}% '
                  f'{d["bad_ohlc"]:>8}  {symbol_mark} {d["verdict"]}')
    print()


def main():
    # Args: lista de activos o "all"
    if len(sys.argv) > 1:
        if sys.argv[1].lower() == 'all':
            assets = list(SYMBOL_MAP.keys())
        else:
            assets = sys.argv[1:]
    else:
        # Default: top-priority del proyecto
        assets = ['XAUUSD', 'USTEC', 'US500', 'US30', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDCAD']

    print(f'Conectando a Dukascopy MT5 (path forzado)...')
    # SIEMPRE forzar path Dukas para evitar que tome otro terminal corriendo (ej. Darwinex)
    if not mt5.initialize(path=DUKAS_PATH, portable=False):
        print(f'❌ MT5 init failed: {mt5.last_error()}')
        return 1
    info = mt5.account_info()
    server = info.server if info else '?'
    print(f'  Conectado a: {server} (login {info.login if info else "?"})')
    if 'dukas' not in server.lower() and 'dukascopy' not in server.lower():
        print(f'  ❌ ERROR: NO es Dukascopy ({server})')
        return 1

    # Pre-activar todos los símbolos para warm cache
    for asset_id in assets:
        symbol = SYMBOL_MAP.get(asset_id, asset_id)
        mt5.symbol_select(symbol, True)
    time.sleep(2)

    print(f'Conexión OK. Analizando {len(assets)} activos en TF H1 + H4...\n')

    summary = []
    for asset_id in assets:
        symbol = SYMBOL_MAP.get(asset_id, asset_id)
        if not symbol:
            print(f'⚠ {asset_id}: símbolo no mapeado')
            continue
        results = analyze_asset(asset_id, symbol, tfs=['H1', 'H4'])
        print_report(asset_id, symbol, results)
        summary.append({
            'asset': asset_id,
            'symbol': symbol,
            'H1': results.get('H1'),
            'H4': results.get('H4'),
        })

    # Tabla resumen final
    print()
    print('═' * 100)
    print('  RESUMEN GLOBAL')
    print('═' * 100)
    print(f'  {"Activo":<10} {"Dukas Symbol":<14} {"H1 desde":>10} {"H1 Gap%":>8} {"H4 desde":>10} {"H4 Gap%":>8} {"Veredicto Opc.2"}')
    print('  ' + '-' * 95)
    for s in summary:
        h1 = s['H1']; h4 = s['H4']
        h1_year = h1['first_clean_year'] if h1 and h1['first_clean_year'] else 'NO'
        h1_pct = f'{h1["gap_pct_global"]:.2f}%' if h1 else '-'
        h4_year = h4['first_clean_year'] if h4 and h4['first_clean_year'] else 'NO'
        h4_pct = f'{h4["gap_pct_global"]:.2f}%' if h4 else '-'
        # Veredicto Opción 2: viable si H1/H4 limpio desde ≤2014
        viable_h1 = h1 and h1['first_clean_year'] and h1['first_clean_year'] <= 2014
        viable_h4 = h4 and h4['first_clean_year'] and h4['first_clean_year'] <= 2014
        if viable_h1 or viable_h4:
            verd = '✅ Opc.2 OK'
        elif (h1 and h1['first_clean_year']) or (h4 and h4['first_clean_year']):
            verd = '⚠ Opc.2 limitado'
        else:
            verd = '❌ Opc.1 obligatorio'
        print(f'  {s["asset"]:<10} {s["symbol"]:<14} {str(h1_year):>10} {h1_pct:>8} {str(h4_year):>10} {h4_pct:>8}  {verd}')

    mt5.shutdown()


if __name__ == '__main__':
    sys.exit(main() or 0)
