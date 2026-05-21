"""
Comparador cross-broker de estrategias Capa 2.

Toma pares DK<id>.sqx (Dukas) + DW<id>.sqx (Darwinex), calcula métricas en
ambos brokers y reporta:
  - Métricas lado a lado (NP, PF, DD%, Sharpe, RExp, Win%, Trd, Ret/DD)
  - Discrepancia % por métrica
  - Veredicto consistencia: CONSISTENTE (<10%) / TOLERABLE (10-20%) / DRIFT (>20%)
  - Filtros Capa 2 sobre el broker REAL (Darwinex = donde se opera)

Uso: python compare_cross_broker.py <carpeta>
     detecta pares automáticamente por prefijo DK/DW + id numérico
"""
import sys
import zipfile
import re
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from parse_sqx_orders import parse_sqx_orders

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

STARTING_CAPITAL = 100_000.0


def compute_metrics(trades, capital=STARTING_CAPITAL):
    if not trades:
        return None
    n = len(trades)
    pls = [t['pl'] for t in trades]
    np_ = sum(pls)
    wins_pls = [p for p in pls if p > 0]
    loss_pls = [p for p in pls if p < 0]
    wins, losses = len(wins_pls), len(loss_pls)
    gross_win = sum(wins_pls)
    gross_loss = abs(sum(loss_pls))
    pf = (gross_win / gross_loss) if gross_loss else (99.0 if gross_win else 0)
    avg_loss = (sum(loss_pls) / losses) if losses else 0
    equity = [capital]
    for pl in pls:
        equity.append(equity[-1] + pl)
    peak = capital
    dd_money, dd_pct = 0, 0
    for e in equity:
        if e > peak: peak = e
        d = peak - e
        if d > dd_money: dd_money = d
        if peak > 0 and (d / peak * 100) > dd_pct: dd_pct = d / peak * 100
    ret_dd = (np_ / dd_money) if dd_money else (99.0 if np_ > 0 else 0)
    avg_trade = np_ / n if n else 0
    r_exp = (avg_trade / abs(avg_loss)) if avg_loss else 0
    if n >= 2:
        rets = [trades[i]['pl'] / equity[i] for i in range(n)]
        mean = sum(rets) / n
        var = sum((r - mean) ** 2 for r in rets) / (n - 1)
        std = var ** 0.5
        years = (trades[-1]['close_time'] - trades[0]['close_time']).total_seconds() / (365.25 * 86400)
        tpy = n / years if years > 0 else 0
        sharpe = (mean / std) * (tpy ** 0.5) if std > 0 else 0
    else:
        sharpe = 0; years = 0
    # Stagnation
    last_peak_time = None; peak_eq = capital; eq = capital
    max_stag = 0
    for t in trades:
        eq += t['pl']
        if eq > peak_eq:
            peak_eq = eq; last_peak_time = t['close_time']
        elif last_peak_time:
            g = (t['close_time'] - last_peak_time).total_seconds() / 86400
            if g > max_stag: max_stag = g
    total_days = years * 365.25
    stag_pct = (max_stag / total_days * 100) if total_days > 0 else 0
    return {
        'NP': np_, 'Trades': n, 'PF': pf, 'DD_pct': dd_pct, 'DD_money': dd_money,
        'Sharpe': sharpe, 'RExp': r_exp, 'WinPct': (wins/n*100) if n else 0,
        'RetDD': ret_dd, 'Years': years, 'Stag_pct': stag_pct,
        'first': trades[0]['close_time'], 'last': trades[-1]['close_time'],
    }


def discrepancy(a, b):
    """% de diferencia relativa entre 2 valores (sobre el mayor en abs)."""
    if a is None or b is None:
        return None
    denom = max(abs(a), abs(b))
    if denom == 0:
        return 0.0
    return abs(a - b) / denom * 100


def find_pairs(folder):
    """Detecta pares DK<id> / DW<id> por id numérico."""
    files = list(Path(folder).glob('*.sqx'))
    dk, dw = {}, {}
    for f in files:
        m = re.match(r'(DK|DW)Strategy\s+([\d.]+)', f.name)
        if not m:
            continue
        prefix, sid = m.group(1), m.group(2)
        if prefix == 'DK':
            dk[sid] = f
        else:
            dw[sid] = f
    pairs = []
    for sid in sorted(set(dk) | set(dw)):
        pairs.append({'id': sid, 'dk': dk.get(sid), 'dw': dw.get(sid)})
    return pairs


# Filtros Capa 2 (CLAUDE.md)
def capa2_filters(m):
    return {
        'PF':    m['PF'] >= 1.5,
        'RetDD': m['RetDD'] >= 5,
        'RExp':  m['RExp'] >= 0.30,
        'Stag':  m['Stag_pct'] < 25,
        'Trd':   m['Trades'] > 150,
    }


def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else '.'
    pairs = find_pairs(folder)
    if not pairs:
        print('No se detectaron pares DK/DW en', folder)
        return 1

    print('═' * 132)
    print(f'  COMPARACIÓN CROSS-BROKER — {len(pairs)} estrategias  ·  DK=Dukas (16y)  ·  DW=Darwinex (broker real)')
    print('═' * 132)

    rows = []
    for p in pairs:
        sid = p['id']
        mdk = mdw = mdk_full = None
        dk_trades = dw_trades = None
        if p['dk']:
            try:
                dk_trades = parse_sqx_orders(p['dk'])['trades']
                mdk_full = compute_metrics(dk_trades)  # sample completo 16y
            except Exception as e:
                print(f'  ERROR DK {sid}: {e}')
        if p['dw']:
            try:
                dw_trades = parse_sqx_orders(p['dw'])['trades']
                mdw = compute_metrics(dw_trades)
            except Exception as e:
                print(f'  ERROR DW {sid}: {e}')
        # Para comparación cross-broker JUSTA: recortar DK al periodo solapado con DW
        if dk_trades and dw_trades:
            dw_start = dw_trades[0]['close_time']
            dk_overlap = [t for t in dk_trades if t['close_time'] >= dw_start]
            mdk = compute_metrics(dk_overlap)  # mismo periodo que DW
        rows.append({'id': sid, 'dk': mdk, 'dw': mdw, 'dk_full': mdk_full})

    # Tabla lado a lado — 3 vistas:
    #   DK-16y  = Dukas sample completo (robustez histórica, CvC)
    #   DK-ovl  = Dukas recortado al periodo de DW (comparación cross-broker justa)
    #   DW      = Darwinex broker real
    print()
    print(f'{"Strategy":<11} {"Vista":<10} {"NP $":>9} {"PF":>5} {"DD%":>5} {"Shrp":>5} '
          f'{"RExp":>5} {"Win%":>5} {"Trd":>4} {"Ret/DD":>7} {"Years":>6}')
    print('─' * 92)
    for r in rows:
        for label, m in [('DK-16y', r['dk_full']), ('DK-overlap', r['dk']), ('DW-real', r['dw'])]:
            if not m:
                print(f'{r["id"]:<11} {label:<10} {"— sin data —":>30}')
                continue
            print(f'{r["id"]:<11} {label:<10} ${m["NP"]:>8,.0f} {m["PF"]:>5.2f} {m["DD_pct"]:>5.2f} '
                  f'{m["Sharpe"]:>5.2f} {m["RExp"]:>5.2f} {m["WinPct"]:>4.0f}% {m["Trades"]:>4} '
                  f'{m["RetDD"]:>7.2f} {m["Years"]:>6.1f}')
        print('─' * 92)

    # Consistencia cross-broker
    print()
    print('═' * 110)
    print('  CONSISTENCIA CROSS-BROKER  (discrepancia % entre Dukas y Darwinex)')
    print('═' * 110)
    print(f'{"Strategy":<11} {"PF disc":>8} {"DD% disc":>9} {"RExp disc":>10} {"Win disc":>9} '
          f'{"Veredicto":>14}  {"Filtros C2 (DW real)"}')
    print('─' * 110)
    consistent, drift = [], []
    for r in rows:
        if not r['dk'] or not r['dw']:
            print(f'{r["id"]:<11} {"— par incompleto —":>40}')
            continue
        d_pf = discrepancy(r['dk']['PF'], r['dw']['PF'])
        d_dd = discrepancy(r['dk']['DD_pct'], r['dw']['DD_pct'])
        d_re = discrepancy(r['dk']['RExp'], r['dw']['RExp'])
        d_wn = discrepancy(r['dk']['WinPct'], r['dw']['WinPct'])
        max_disc = max(d_pf, d_dd, d_re, d_wn)
        if max_disc < 15:
            verd = '✓ CONSISTENTE'; consistent.append(r['id'])
        elif max_disc < 30:
            verd = '⚠ TOLERABLE'
        else:
            verd = '✗ DRIFT'; drift.append(r['id'])
        # Filtros Capa 2 sobre Darwinex (broker real)
        f = capa2_filters(r['dw'])
        fails = [k for k, v in f.items() if not v]
        fstr = '✓ 5/5' if not fails else f'✗ falla {",".join(fails)}'
        print(f'{r["id"]:<11} {d_pf:>7.1f}% {d_dd:>8.1f}% {d_re:>9.1f}% {d_wn:>8.1f}% '
              f'{verd:>14}  {fstr}')
    print('─' * 110)
    print(f'  CONSISTENTES (<15% disc): {len(consistent)}  ·  DRIFT (>30%): {len(drift)}')

    # Candidatas: consistentes + pasan filtros Capa 2 en Darwinex
    print()
    print('  ⭐ CANDIDATAS (cross-broker consistente + 5/5 filtros Capa 2 en Darwinex):')
    found = False
    for r in rows:
        if not r['dk'] or not r['dw']:
            continue
        d_pf = discrepancy(r['dk']['PF'], r['dw']['PF'])
        d_dd = discrepancy(r['dk']['DD_pct'], r['dw']['DD_pct'])
        d_re = discrepancy(r['dk']['RExp'], r['dw']['RExp'])
        d_wn = discrepancy(r['dk']['WinPct'], r['dw']['WinPct'])
        max_disc = max(d_pf, d_dd, d_re, d_wn)
        f = capa2_filters(r['dw'])
        if max_disc < 15 and all(f.values()):
            found = True
            m = r['dw']
            print(f'    {r["id"]}  ·  DW: NP ${m["NP"]:,.0f}  PF {m["PF"]:.2f}  '
                  f'Ret/DD {m["RetDD"]:.2f}  RExp {m["RExp"]:.2f}  ({m["Trades"]} trd)')
    if not found:
        print('    (ninguna pasa ambos criterios — revisar manualmente las TOLERABLE)')


if __name__ == '__main__':
    sys.exit(main() or 0)
