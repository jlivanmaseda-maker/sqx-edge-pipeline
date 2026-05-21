"""
Analizador de calidad sobre CSVs Dukas ya descargados.

Lee directamente csv_for_sqx/<asset>_<TF>.csv y calcula:
  - Cobertura por año (% barras presentes vs esperadas)
  - Gaps por año
  - Bad OHLC
  - Spikes (rango > 5x avg)
  - Veredicto VERDE/AMARILLO/ROJO por año
  - Primer año "minable" (verde sostenido)

Ventaja sobre el script MT5: NO depende del caché del terminal — los CSVs ya tienen
toda la data descargada por download_dukas_bulk.py.
"""
import csv
import sys
from datetime import datetime
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass


CSV_DIR = Path(r"C:\Users\Livan\OneDrive\Documentos\EDGE\Categorias Activos\csv_for_sqx")

# Barras esperadas por año por TF (24h/día × 252 días - 1h cierre/día)
EXPECTED_PER_YEAR = {
    'M5':  69552,
    'M15': 23184,
    'M30': 11592,
    'H1':  5796,
    'H4':  1512,
    'D1':  252,
}


def parse_csv(path):
    """Devuelve lista de dicts con time/open/high/low/close."""
    rows = []
    with open(path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for r in reader:
            try:
                t = datetime.strptime(r['Date'], '%Y-%m-%d %H:%M:%S')
                rows.append({
                    'time': t,
                    'o': float(r['Open']),
                    'h': float(r['High']),
                    'l': float(r['Low']),
                    'c': float(r['Close']),
                })
            except (ValueError, KeyError):
                continue
    return rows


def analyze(rows, tf_label):
    """Calcula calidad por año + veredicto."""
    if not rows:
        return None
    n = len(rows)
    expected_full = EXPECTED_PER_YEAR.get(tf_label, 5796)

    by_year = {}
    for r in rows:
        y = r['time'].year
        if y not in by_year:
            by_year[y] = {'bars': 0, 'spikes': 0, 'bad_ohlc': 0}
        by_year[y]['bars'] += 1

    # Spikes (rolling 100 ranges)
    ranges = [r['h'] - r['l'] for r in rows]
    window = 100
    avg_ranges = [sum(ranges[max(0, i-window):i+1]) / min(i+1, window+1) for i in range(n)]
    for i in range(window, n):
        if avg_ranges[i] > 0 and ranges[i] > 5 * avg_ranges[i]:
            by_year[rows[i]['time'].year]['spikes'] += 1

    # Bad OHLC
    for r in rows:
        h, l, o, c = r['h'], r['l'], r['o'], r['c']
        if h < l or h < o or h < c or l > o or l > c:
            by_year[r['time'].year]['bad_ohlc'] += 1

    # Cobertura por año
    first_year = rows[0]['time'].year
    last_year = rows[-1]['time'].year
    for y, d in by_year.items():
        if y == first_year:
            first_in_year = min(r['time'] for r in rows if r['time'].year == y)
            days = (datetime(y + 1, 1, 1) - first_in_year).days
            expected = int(expected_full * days / 365)
        elif y == last_year:
            last_in_year = max(r['time'] for r in rows if r['time'].year == y)
            days = (last_in_year - datetime(y, 1, 1)).days + 1
            expected = int(expected_full * days / 365)
        else:
            expected = expected_full
        d['expected'] = expected
        d['gaps'] = max(0, expected - d['bars'])
        d['coverage'] = d['bars'] / expected * 100 if expected else 0
        d['bad_pct'] = d['bad_ohlc'] / max(d['bars'], 1) * 100
        if d['coverage'] >= 95 and d['bad_pct'] < 0.5:
            d['verdict'] = 'VERDE'
        elif d['coverage'] >= 80 and d['bad_pct'] < 1:
            d['verdict'] = 'AMARILLO'
        else:
            d['verdict'] = 'ROJO'

    # Primer año verde sostenido (≥2 años verdes consecutivos)
    sorted_years = sorted(by_year.keys())
    first_clean = None
    for i in range(len(sorted_years) - 1):
        y = sorted_years[i]
        y_next = sorted_years[i + 1]
        if by_year[y]['verdict'] == 'VERDE' and by_year[y_next]['verdict'] == 'VERDE':
            first_clean = y
            break

    total_expected = sum(d['expected'] for d in by_year.values())
    total_gaps = sum(d['gaps'] for d in by_year.values())
    total_bad = sum(d['bad_ohlc'] for d in by_year.values())
    total_spikes = sum(d['spikes'] for d in by_year.values())

    return {
        'tf': tf_label,
        'n_bars': n,
        'expected_total': total_expected,
        'coverage_global': n / total_expected * 100 if total_expected else 0,
        'first_bar': rows[0]['time'],
        'last_bar': rows[-1]['time'],
        'total_gaps': total_gaps,
        'total_bad_ohlc': total_bad,
        'total_spikes': total_spikes,
        'gap_pct_global': total_gaps / total_expected * 100 if total_expected else 0,
        'by_year': by_year,
        'first_clean_year': first_clean,
    }


def print_report(asset, tf, r):
    if not r:
        print(f'  [{asset} {tf}]  ⚠ Sin CSV o vacío')
        return
    print(f'  [{asset} {tf}]  Barras={r["n_bars"]:,}/{r["expected_total"]:,}  '
          f'Cov={r["coverage_global"]:.1f}%  Rango: {r["first_bar"]:%Y-%m-%d} → {r["last_bar"]:%Y-%m-%d}')
    print(f'                  Gaps={r["total_gaps"]:,} ({r["gap_pct_global"]:.2f}%)  '
          f'Spikes={r["total_spikes"]}  BadOHLC={r["total_bad_ohlc"]}  '
          f'⭐ Apto desde: {r["first_clean_year"] or "N/A"}')


def main():
    export_json = False
    args = sys.argv[1:]
    if args and args[0] == '--json':
        export_json = True
        args = args[1:]

    if args:
        if args[0].lower() == 'all':
            # Listar CSVs únicos por activo
            csvs = list(CSV_DIR.glob('*_H1.csv'))
            assets = sorted(set(c.stem.rsplit('_', 1)[0] for c in csvs))
        else:
            assets = args
    else:
        # Default: top-priority del proyecto
        assets = ['XAUUSD', 'USTEC', 'US500', 'US30', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDCAD',
                  'EURGBP', 'EURJPY', 'GER40']

    print(f'\nLeyendo CSVs de {CSV_DIR}')
    print(f'Analizando {len(assets)} activos en H1 + H4\n')

    summary = []
    print('═' * 105)
    for asset in assets:
        for tf in ['H1', 'H4']:
            path = CSV_DIR / f'{asset}_{tf}.csv'
            if not path.exists():
                print(f'  [{asset} {tf}]  ⚠ CSV no encontrado: {path.name}')
                continue
            rows = parse_csv(path)
            r = analyze(rows, tf)
            print_report(asset, tf, r)
            if r:
                summary.append({'asset': asset, 'tf': tf, **r})
        print()
    print('═' * 105)

    # Export JSON para la web
    if export_json:
        import json
        web_data = {}
        for s in summary:
            asset = s['asset']; tf = s['tf']
            if asset not in web_data:
                web_data[asset] = {}
            clean_year = s['first_clean_year']
            if clean_year and clean_year <= 2014:
                verdict = 'opc2_ok'
            elif clean_year and clean_year <= 2019:
                verdict = 'opc2_limited'
            elif clean_year:
                verdict = 'opc1_recommended'
            else:
                verdict = 'opc1_only'
            web_data[asset][tf] = {
                'bars': s['n_bars'], 'expected': s['expected_total'],
                'coverage': round(s['coverage_global'], 2),
                'gap_pct': round(s['gap_pct_global'], 2),
                'bad_ohlc': s['total_bad_ohlc'], 'spikes': s['total_spikes'],
                'first_bar': s['first_bar'].strftime('%Y-%m-%d'),
                'last_bar': s['last_bar'].strftime('%Y-%m-%d'),
                'first_clean_year': clean_year, 'verdict': verdict,
                'by_year': {str(y): {
                    'bars': d['bars'], 'expected': d['expected'],
                    'coverage': round(d['coverage'], 2), 'verdict': d['verdict']
                } for y, d in s['by_year'].items()},
            }
        out = {
            'generated_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'source': 'Dukascopy MT5 CSV bulk download',
            'assets': web_data,
        }
        json_path = Path(r"C:\Users\Livan\OneDrive\Documentos\EDGE\Categorias Activos\data\dukas_quality.json")
        json_path.parent.mkdir(parents=True, exist_ok=True)
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(out, f, indent=2, ensure_ascii=False)
        print(f'\n  📁 JSON exportado: {json_path}')

    # Resumen final
    print('\n  RESUMEN GLOBAL')
    print(f'  {"Activo":<10} {"TF":<4} {"Bars":>9} {"Cov%":>6} {"Gap%":>6} {"BadOHLC":>8} {"1er año limpio":<15} {"Veredicto Opc.2"}')
    print('  ' + '-' * 90)
    for s in summary:
        clean = s['first_clean_year'] or 'NO'
        if s['first_clean_year'] and s['first_clean_year'] <= 2014:
            verd = '✅ Opc.2 OK (mining 2010-23 viable)'
        elif s['first_clean_year'] and s['first_clean_year'] <= 2019:
            verd = '⚠ Opc.2 limitado (mining desde año verde)'
        elif s['first_clean_year']:
            verd = '⚠ Sample corto, no compensa Dukas'
        else:
            verd = '❌ Opc.1 obligatorio (Darwinex)'
        print(f'  {s["asset"]:<10} {s["tf"]:<4} {s["n_bars"]:>9,} '
              f'{s["coverage_global"]:>5.1f}% {s["gap_pct_global"]:>5.2f}% '
              f'{s["total_bad_ohlc"]:>8} {str(clean):<15} {verd}')


if __name__ == '__main__':
    sys.exit(main() or 0)
