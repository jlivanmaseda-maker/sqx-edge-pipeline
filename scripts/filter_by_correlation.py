"""
Filter by Correlation entre N estrategias — replica el algoritmo de SQX.

Para cada par de estrategias calcula correlación de Pearson sobre:
  - Daily returns (resamplea trades a equity curve diaria)
  - O alternativamente sobre los PLs de trades alineados temporalmente

Estrategia: descartar pares con corr >= threshold (default 0.7) priorizando
la mejor (por Ret/DD).
"""
import sys
import zipfile
from pathlib import Path
from datetime import timedelta, timezone, datetime
import re

sys.path.insert(0, str(Path(__file__).parent))
from parse_sqx_orders import parse_sqx_orders

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass


STARTING_CAPITAL = 100_000.0

# Parámetros configurables via CLI
DEFAULT_THRESHOLD = 0.7
DEFAULT_RESAMPLE = 'daily'  # 'daily' | 'monthly'


def daily_pl_series(trades, start=None, end=None):
    """Devuelve serie de PL diaria (PL acumulado por día)."""
    if not trades: return [], []
    if start is None: start = trades[0]['close_time'].date()
    if end is None: end = trades[-1]['close_time'].date()
    pl_by_day = {}
    for t in trades:
        d = t['close_time'].date()
        pl_by_day[d] = pl_by_day.get(d, 0) + t['pl']
    days = []
    pls = []
    d = start
    while d <= end:
        days.append(d)
        pls.append(pl_by_day.get(d, 0))
        d += timedelta(days=1)
    return pls, days


def monthly_pl_series(trades, start=None, end=None):
    """Devuelve serie de PL mensual (PL agregado por mes año-mes)."""
    if not trades: return [], []
    if start is None: start = trades[0]['close_time'].date()
    if end is None: end = trades[-1]['close_time'].date()
    pl_by_month = {}
    for t in trades:
        key = (t['close_time'].year, t['close_time'].month)
        pl_by_month[key] = pl_by_month.get(key, 0) + t['pl']
    # Generar todos los meses entre start y end
    keys = []
    pls = []
    y, m = start.year, start.month
    end_key = (end.year, end.month)
    while (y, m) <= end_key:
        keys.append((y, m))
        pls.append(pl_by_month.get((y, m), 0))
        m += 1
        if m > 12:
            m = 1; y += 1
    return pls, keys


def pearson(x, y):
    n = len(x)
    if n < 2: return 0
    mean_x = sum(x) / n
    mean_y = sum(y) / n
    cov = sum((x[i] - mean_x) * (y[i] - mean_y) for i in range(n))
    var_x = sum((x[i] - mean_x) ** 2 for i in range(n))
    var_y = sum((y[i] - mean_y) ** 2 for i in range(n))
    if var_x == 0 or var_y == 0: return 0
    return cov / (var_x ** 0.5 * var_y ** 0.5)


def compute_ret_dd(trades):
    pls = [t['pl'] for t in trades]
    np_ = sum(pls)
    eq = [STARTING_CAPITAL]
    for pl in pls: eq.append(eq[-1] + pl)
    peak = STARTING_CAPITAL
    dd = 0
    for e in eq:
        if e > peak: peak = e
        if peak - e > dd: dd = peak - e
    return (np_ / dd) if dd else float('inf'), np_, dd


def main():
    # Parse args: detect --threshold N y --monthly
    args = sys.argv[1:]
    threshold = DEFAULT_THRESHOLD
    resample = DEFAULT_RESAMPLE
    paths = []
    i = 0
    while i < len(args):
        a = args[i]
        if a in ('-t', '--threshold'):
            threshold = float(args[i + 1]); i += 2; continue
        if a in ('-m', '--monthly'):
            resample = 'monthly'; i += 1; continue
        if a in ('-d', '--daily'):
            resample = 'daily'; i += 1; continue
        paths.append(Path(a))
        i += 1

    if len(paths) < 2:
        print('Usage: filter_by_correlation.py [-t 0.7] [-m|--monthly] <file1.sqx> ...')
        return 1

    # Parsear cada estrategia
    data = []
    global_start = None; global_end = None
    for p in paths:
        try:
            parsed = parse_sqx_orders(p)
            trades = parsed['trades']
            if not trades: continue
            t0 = trades[0]['close_time'].date()
            tN = trades[-1]['close_time'].date()
            if global_start is None or t0 < global_start: global_start = t0
            if global_end is None or tN > global_end: global_end = tN
            retdd, np_, dd = compute_ret_dd(trades)
            data.append({
                'path': p,
                'name': p.stem.replace('Strategy ', ''),
                'trades': trades,
                'retdd': retdd,
                'np': np_,
                'dd': dd,
                'start_date': t0,
                'end_date': tN,
            })
        except Exception as e:
            print(f'  ERROR {p.name}: {e}')

    if len(data) < 2:
        print('Need at least 2 valid strategies')
        return 1

    print(f'Strategies: {len(data)}  ·  Periodo global: {global_start} → {global_end}')
    print(f'Resample: {resample}  ·  Threshold correlación: {threshold}')
    print()

    # Construir serie alineada según resample
    for d in data:
        if resample == 'monthly':
            pls, keys = monthly_pl_series(d['trades'], global_start, global_end)
        else:
            pls, keys = daily_pl_series(d['trades'], global_start, global_end)
        d['series'] = pls
        d['series_keys'] = keys
    n_pts = len(data[0]['series']) if data else 0
    print(f'Puntos en periodo común ({resample}): {n_pts}')

    # Matriz de correlación
    n = len(data)
    corr = [[0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i == j: corr[i][j] = 1.0
            elif j > i:
                c = pearson(data[i]['series'], data[j]['series'])
                corr[i][j] = c
                corr[j][i] = c

    # Tabla
    print()
    print(f'{"Strategy":<14} {"Ret/DD":>7}  ' + '  '.join(f'{d["name"][:5]:>5}' for d in data))
    print('─' * (24 + 7 * len(data)))
    for i, d in enumerate(data):
        cells = '  '.join(f'{corr[i][j]:>5.2f}' for j in range(n))
        print(f'{d["name"]:<14} {d["retdd"]:>7.2f}  {cells}')

    # Algoritmo de filtrado: ordenar por Ret/DD desc, ir aceptando si correlación con
    # todos los ya aceptados < threshold
    print()
    print('═' * 80)
    print(f'  FILTRO POR CORRELACIÓN ({resample}, threshold {threshold}) — priorizar Ret/DD desc')
    print('═' * 80)
    sorted_idx = sorted(range(n), key=lambda i: data[i]['retdd'], reverse=True)
    kept = []
    rejected = []
    for i in sorted_idx:
        ok = True
        reason = ''
        for k in kept:
            c = corr[i][k]
            if abs(c) >= threshold:
                ok = False
                reason = f'corr {c:.2f} con {data[k]["name"]}'
                break
        if ok:
            kept.append(i)
            print(f'  ✓ KEEP  {data[i]["name"]:<14} (Ret/DD {data[i]["retdd"]:>6.2f})')
        else:
            rejected.append(i)
            print(f'  ✗ DROP  {data[i]["name"]:<14} (Ret/DD {data[i]["retdd"]:>6.2f})  → {reason}')

    print()
    print(f'  Resultado: {len(kept)} estrategias ortogonales · {len(rejected)} descartadas')
    print()
    print('  ESTRATEGIAS FINALES (descorrelacionadas):')
    for i in kept:
        d = data[i]
        print(f'  - {d["name"]:<14}  NP=${d["np"]:,.0f}  Ret/DD={d["retdd"]:.2f}  DD=${d["dd"]:,.0f}')


if __name__ == '__main__':
    sys.exit(main() or 0)
