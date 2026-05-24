"""
Analizador masivo de mining Capa 2 con métricas REALES desde orders.bin.

A diferencia de analyze_capa1_metrics.py, este:
  - Procesa N estrategias en bloque (no formato individual largo)
  - Aplica filtros estrictos Capa 2 del CLAUDE.md:
       PF ≥ 1.5
       Ret/DD ≥ 5
       R Expectancy ≥ 0.30
       Stagnation < 25% del backtest
       # trades > 150
  - Aplica filtro R:R (post-mining v7): TP_value / SL_value ≥ 0.6
  - Detecta dirección, edge primario, exits configurados (PT/SL/TS/TSAct/EAB/BE)
  - Imprime tabla ordenada por Ret/DD desc con flags pass/fail

Capital base: $100,000 (Darwinex).
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


SAFE_BOUNDED_INDICATORS = {
    'RSI', 'Stochastic', 'StochasticD', 'StochasticK',
    'WilliamsPR', 'WilliamsR', 'ADX', 'ADXR', 'DMI', 'CCI',
    'ChoppinessIndex', 'CSSAMarketRegime',
    'HurstExponent', 'KaufmanEfficiencyRatio', 'KER',
    'Momentum', 'ROC', 'BollingerBandsPercentB',
    'MoneyFlowIndex', 'MFI', 'UltimateOscillator', 'AwesomeOscillator',
    'ZScore', 'SRPercentRank', 'SRPercentRankSmoothed',
    'TTMSqueeze', 'WAE', 'ConnorsRSI', 'CRSI', 'SmoothedRSI',
    'DSSBressert', 'DeMarker', 'LaguerreRSI', 'QQE',
    'UltimateC', 'DVO', 'DSS', 'BHErgodic', 'RVI',
    'CaseyCPercent', 'DPO', 'EntropyMath', 'WaveTrend',
    'TradersDynamicIndex', 'TotalPowerIndicator',
}


def compute_metrics(trades, capital=STARTING_CAPITAL):
    if not trades:
        return {}
    n = len(trades)
    pls = [t['pl'] for t in trades]
    np_ = sum(pls)
    wins_pls = [p for p in pls if p > 0]
    loss_pls = [p for p in pls if p < 0]
    wins, losses = len(wins_pls), len(loss_pls)
    gross_win = sum(wins_pls)
    gross_loss = abs(sum(loss_pls))
    pf = (gross_win / gross_loss) if gross_loss else float('inf')
    avg_win = (gross_win / wins) if wins else 0
    avg_loss = (sum(loss_pls) / losses) if losses else 0  # negativo

    # equity curve
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

    ret_dd = (np_ / dd_money) if dd_money else float('inf')
    avg_trade = np_ / n if n else 0
    r_exp = (avg_trade / abs(avg_loss)) if avg_loss else float('inf')

    # Sharpe
    if n >= 2:
        rets = [trades[i]['pl'] / equity[i] for i in range(n)]
        mean = sum(rets) / n
        var = sum((r - mean) ** 2 for r in rets) / (n - 1)
        std = var ** 0.5
        first_t, last_t = trades[0]['open_time'], trades[-1]['close_time']
        years = (last_t - first_t).total_seconds() / (365.25 * 86400)
        tpy = n / years if years > 0 else 0
        sharpe = (mean / std) * (tpy ** 0.5) if std > 0 else 0
    else:
        sharpe = 0; years = 0; tpy = 0

    # Stagnation: max gap entre new highs en días
    last_peak_time = None; peak_eq = capital; eq = capital
    max_stag_days = 0
    for t in trades:
        eq += t['pl']
        if eq > peak_eq:
            peak_eq = eq; last_peak_time = t['close_time']
        else:
            if last_peak_time:
                g = (t['close_time'] - last_peak_time).total_seconds() / 86400
                if g > max_stag_days: max_stag_days = g

    # Stagnation % del backtest total
    total_days = years * 365.25
    stag_pct = (max_stag_days / total_days * 100) if total_days > 0 else 0

    return {
        'NP': np_, 'Trades': n, 'WinPct': (wins/n*100) if n else 0,
        'AvgWin': avg_win, 'AvgLoss': avg_loss, 'AvgTrade': avg_trade,
        'PF': pf, 'DD_money': dd_money, 'DD_pct': dd_pct, 'RetDD': ret_dd,
        'RExp': r_exp, 'Sharpe': sharpe, 'Years': years, 'TPY': tpy,
        'Stag_days': max_stag_days, 'Stag_pct': stag_pct,
    }


def find_top_level_items(body, keys):
    results = []
    keys_pat = '|'.join(re.escape(k) for k in keys)
    op_pat = re.compile(r'<Item[^>]*?key="(' + keys_pat + r')"[^>]*?>')
    starts = [(m.start(), m.group(1)) for m in op_pat.finditer(body)]
    for s_idx, op in starts:
        depth = 0; i = s_idx; end = None
        while i < len(body):
            if body[i:i+5] == '<Item': depth += 1; i += 5; continue
            if body[i:i+7] == '</Item>':
                depth -= 1
                if depth == 0: end = i + 7; break
                i += 7; continue
            i += 1
        if end is not None: results.append((s_idx, end, op))
    return [r for r in results if not any(s2 < r[0] and e2 > r[1] for s2, e2, _ in results)]


def extract_item_name_shift(item_xml):
    """Devuelve (name, shift). name incluye horarios para indicators Session* (ej. 'SessionLow(19:26-3:49)')."""
    key_m = re.search(r'<Item[^>]*?key="([A-Za-z][A-Za-z0-9_]+)"', item_xml)
    name = key_m.group(1) if key_m else '?'
    shift_m = re.search(r'<Param key="#Shift#"[^>]*?>([^<]+)</Param>', item_xml)
    shift = shift_m.group(1).strip() if shift_m else ''

    # Para indicators Session*: añadir horarios al nombre
    if name.startswith('Session'):
        sh = re.search(r'<Param key="#StartHours#"[^>]*?>([^<]+)</Param>', item_xml)
        sm = re.search(r'<Param key="#StartMinutes#"[^>]*?>([^<]+)</Param>', item_xml)
        eh = re.search(r'<Param key="#EndHours#"[^>]*?>([^<]+)</Param>', item_xml)
        em = re.search(r'<Param key="#EndMinutes#"[^>]*?>([^<]+)</Param>', item_xml)
        def fmt(h, m):
            return f'{int(h.group(1)):02d}:{int(m.group(1)):02d}' if h and m else None
        end_str = fmt(eh, em)
        start_str = fmt(sh, sm)
        if start_str and end_str:
            name = f'{name}({start_str}-{end_str})'   # rango: SessionLow/High
        elif end_str:
            name = f'{name}({end_str})'                # puntual: SessionClose/Open
    return (name, shift)


def parse_signal(xml, side='long'):
    sid = ('33333333-1111-1111-3333-333333333333' if side == 'long'
           else '44444444-2222-2222-4444-444444444444')
    m = re.search(r'<signal variable="' + sid + r'">(.*?)</signal>', xml, re.DOTALL)
    if not m: return []
    body = m.group(1)
    out = []
    op_keys = ['IsGreater', 'IsLower', 'IsLess', 'IsGreaterOrEqual', 'IsLowerOrEqual',
               'IsLessOrEqual', 'IsRising', 'IsFalling', 'IsGreaterPercentil',
               'IsLowerPercentil', 'CrossesAbove', 'CrossesBelow', 'AlwaysTrue']
    for s, e, op in find_top_level_items(body, op_keys):
        block = body[s:e]
        if op == 'AlwaysTrue':
            out.append('AlwaysTrue'); continue
        if op in ('IsRising', 'IsFalling'):
            ind = re.search(r'<Block key="#Indicator#"[^>]*>(.*?)</Block>', block, re.DOTALL)
            n, sh = extract_item_name_shift(ind.group(1) if ind else block)
            out.append(f'{n}[{sh}] {"rising" if op=="IsRising" else "falling"}')
            continue
        if op in ('IsGreaterPercentil', 'IsLowerPercentil'):
            ind = re.search(r'<Block key="#Indicator#"[^>]*>(.*?)</Block>', block, re.DOTALL)
            n, sh = extract_item_name_shift(ind.group(1) if ind else '')
            bars = re.search(r'<Param key="#Bars#"[^>]*?>([^<]+)</Param>', block)
            pct = re.search(r'<Param key="#Percentile#"[^>]*?>([^<]+)</Param>', block)
            verb = '>pct' if op == 'IsGreaterPercentil' else '<pct'
            out.append(f'{n}[{sh}] {verb} {pct.group(1).strip() if pct else "?"}%/'
                       f'{bars.group(1).strip() if bars else "?"}b')
            continue
        if op in ('CrossesAbove', 'CrossesBelow'):
            l = re.search(r'<Block key="#Left#"[^>]*>(.*?)</Block>', block, re.DOTALL)
            r = re.search(r'<Block key="#Right#"[^>]*>(.*?)</Block>', block, re.DOTALL)
            ln, ls = extract_item_name_shift(l.group(1) if l else '')
            rn, rs = extract_item_name_shift(r.group(1) if r else '')
            v = 'X↑' if op == 'CrossesAbove' else 'X↓'
            out.append(f'{ln}[{ls}]{v}{rn}[{rs}]')
            continue
        if op in ('IsGreater', 'IsLower', 'IsLess', 'IsGreaterOrEqual',
                  'IsLowerOrEqual', 'IsLessOrEqual'):
            l = re.search(r'<Block key="#Left#"[^>]*>(.*?)</Block>', block, re.DOTALL)
            r = re.search(r'<Block key="#Right#"[^>]*>(.*?)</Block>', block, re.DOTALL)
            ln, ls = extract_item_name_shift(l.group(1) if l else '')
            rn, rs = extract_item_name_shift(r.group(1) if r else '')
            vm = {'IsGreater': '>', 'IsGreaterOrEqual': '>=',
                  'IsLower': '<', 'IsLowerOrEqual': '<=',
                  'IsLess': '<', 'IsLessOrEqual': '<='}
            verb = vm[op]
            if rn == 'Number':
                nm = re.search(
                    r'<Block key="#Right#"[^>]*>.*?<Param key="#Number#"[^>]*?>([^<]+)</Param>',
                    block, re.DOTALL)
                right_str = f'NUMBER({nm.group(1).strip() if nm else "?"})'
            else:
                right_str = f'{rn}[{rs}]' if rs else rn
            left_str = f'{ln}[{ls}]' if ls else ln
            out.append(f'{left_str}{verb}{right_str}')
    return out


def extract_variables(xml):
    vars_ = {}
    for m in re.finditer(
        r'<variable[^>]*>\s*<id>([^<]+)</id>\s*<name>([^<]+)</name>\s*'
        r'<type>([^<]+)</type>\s*<value>([^<]+)</value>', xml):
        vars_[m.group(2)] = {'type': m.group(3), 'value': m.group(4)}
    return vars_


def resolve_rule(rule, vars_):
    m = re.search(r'NUMBER\(([^)]+)\)', rule)
    if not m: return rule
    vn = m.group(1)
    val = vars_.get(vn, {}).get('value', '?')
    return rule.replace(f'NUMBER({vn})', val)


def parse_exits(xml):
    """Devuelve exits con tipo + valor + R:R.

    Formato del valor por exit:
      ('ATR', value, atr_period)  → ATR-based:       value × ATR(period)
      ('PIPS', value, None)       → Fixed value:     value pips
      ('OFF', None, None)         → exit desactivado
      None                        → exit no encontrado en el XML

    SQX structure: <Param key="#X.X#" ...><Formula key="SQ.Formulas.X.{TIPO}"><Param key="#Value#">N</Param>...</Formula></Param>
    TIPO posibles: ATRBasedValue, FixedValue, PipsBasedValue, None
    """
    out = {}
    for label, key in [('PT', 'ProfitTarget.ProfitTarget'),
                       ('SL', 'StopLoss.StopLoss'),
                       ('TS', 'TrailingStop.TrailingStop'),
                       ('TSAct', 'TrailingStop.TrailingActivation'),
                       ('BE', 'MoveSL2BE.MoveSL2BE')]:
        start_re = re.compile(r'<Param key="#' + re.escape(key) + r'#"[^>]*?>')
        m = start_re.search(xml)
        if not m:
            out[label] = None; continue
        tail = xml[m.end():m.end()+4000]
        # Detectar tipo de Formula
        fm = re.search(r'<Formula key="SQ\.Formulas\.\w+\.(\w+)"', tail[:500])
        ftype = fm.group(1) if fm else None
        if ftype == 'None' or (re.search(r'<Formula key="SQ\.Formulas\.\w+\.None"\s*/?>', tail[:300])):
            out[label] = ('OFF', None, None); continue
        v = re.search(r'<Param key="#Value#"[^>]*?>([0-9.]+)</Param>', tail)
        a = re.search(r'<Param key="#AtrPeriod#"[^>]*?>(\d+)</Param>', tail)
        val = float(v.group(1)) if v else None
        if ftype == 'ATRBasedValue' and v and a:
            out[label] = ('ATR', val, int(a.group(1)))
        elif ftype in ('FixedValue', 'PipsBasedValue') and v:
            out[label] = ('PIPS', val, None)
        elif v and a:
            out[label] = ('ATR', val, int(a.group(1)))   # fallback retro-compat
        elif v:
            out[label] = ('PIPS', val, None)
        else:
            out[label] = (None, None, None)
    # EAB
    eab = re.search(r'<Param key="#ExitAfterBars\.ExitAfterBars#"[^>]*?>\s*([^<]*)\s*</Param>', xml)
    eab_v = eab.group(1).strip() if eab else ''
    out['EAB_raw'] = eab_v
    # Si valor numérico > 0, está activo
    try:
        out['EAB_active'] = float(eab_v) > 0
    except Exception:
        out['EAB_active'] = bool(eab_v and eab_v not in ('-', 'OFF', '0', '0.0'))
    return out


def analyze_one(sqx_path):
    parsed = parse_sqx_orders(sqx_path)
    trades = parsed['trades']
    metrics = compute_metrics(trades, STARTING_CAPITAL)

    with zipfile.ZipFile(sqx_path) as z:
        strat_xml = z.read('strategy_Portfolio.xml').decode('utf-8', errors='ignore')
    vars_ = extract_variables(strat_xml)
    rl = [resolve_rule(r, vars_) for r in parse_signal(strat_xml, 'long')]
    rs = [resolve_rule(r, vars_) for r in parse_signal(strat_xml, 'short')]
    ml = [r for r in rl if r != 'AlwaysTrue']
    ms = [r for r in rs if r != 'AlwaysTrue']
    direction = 'LONG' if ml and not ms else 'SHORT' if ms and not ml else 'L/S' if ml else 'NONE'

    exits = parse_exits(strat_xml)
    # R:R — usa el VALUE (índice 1) de las tuplas (type, value, atr_period)
    # Solo calculamos R:R si PT y SL son comparables (ambos ATR o ambos PIPS — sino no tiene sentido)
    pt = exits.get('PT'); sl = exits.get('SL')
    rr = None
    if pt and sl and pt[0] in ('ATR', 'PIPS') and sl[0] in ('ATR', 'PIPS'):
        if pt[0] == sl[0]:   # mismo tipo de unidad
            if pt[1] and sl[1] and sl[1] > 0:
                rr = pt[1] / sl[1]

    # Close types
    ct = {}
    for t in trades:
        ct[t['close_type']] = ct.get(t['close_type'], 0) + 1

    return {
        'name': Path(sqx_path).stem.replace('Strategy ', ''),
        'header': parsed['header'],
        'metrics': metrics,
        'direction': direction,
        'rules': ml + ms,
        'exits': exits,
        'rr': rr,
        'close_types': ct,
    }


def filters_capa2(r):
    """Aplica filtros estrictos CLAUDE.md y devuelve dict de pass/fail."""
    m = r['metrics']
    rr = r.get('rr')
    return {
        'pf_ok':    m.get('PF', 0) >= 1.5,
        'retdd_ok': m.get('RetDD', 0) >= 5,
        'rexp_ok':  m.get('RExp', 0) >= 0.30,
        'stag_ok':  m.get('Stag_pct', 100) < 25,
        'trd_ok':   m.get('Trades', 0) > 150,
        'rr_ok':    rr is not None and rr >= 0.6,
    }


def main():
    paths = [Path(p) for p in sys.argv[1:]]
    if not paths:
        print('Usage: python analyze_capa2_metrics.py <files...>')
        return 1

    results = []
    for p in paths:
        try:
            results.append(analyze_one(p))
        except Exception as e:
            print(f'  ERROR {p.name}: {e}')

    # Ordenar por Ret/DD desc
    results.sort(key=lambda x: x['metrics'].get('RetDD', 0), reverse=True)

    # Tabla principal
    print(f'\n{"═"*150}')
    print(f'  MINING CAPA 2 — {len(results)} estrategias · Capital ${STARTING_CAPITAL:,.0f}')
    if results:
        h0 = results[0]['header']
        print(f'  {h0["symbol"]} · {h0["chart_name"]}')
    print(f'{"═"*150}')
    print(f'{"#":<3} {"Strategy":<13} {"Dir":<5} {"NP $":>9} {"PF":>5} {"DD%":>5} {"Sharpe":>7} {"RExp":>6} {"Win%":>6} {"Trd":>4} '
          f'{"Stag%":>6} {"Ret/DD":>7} {"R:R":>5} {"PASS"}')
    print('─' * 150)

    pass_count = 0
    for i, r in enumerate(results):
        m = r['metrics']
        f = filters_capa2(r)
        all_pass = all(f.values())
        if all_pass: pass_count += 1
        flag = '✓' if all_pass else ' '
        # Mostrar qué falla
        fails = []
        if not f['pf_ok']: fails.append('PF')
        if not f['retdd_ok']: fails.append('RD')
        if not f['rexp_ok']: fails.append('RE')
        if not f['stag_ok']: fails.append('ST')
        if not f['trd_ok']: fails.append('TR')
        if not f['rr_ok']: fails.append('RR')
        fail_str = ','.join(fails) if fails else '----'

        rr_str = f'{r["rr"]:.2f}' if r['rr'] else '-'
        print(f'{i+1:<3} {r["name"]:<13} {r["direction"]:<5} '
              f'${m["NP"]:>8,.0f} {m["PF"]:>5.2f} {m["DD_pct"]:>5.2f} '
              f'{m["Sharpe"]:>7.2f} {m["RExp"]:>6.2f} {m["WinPct"]:>5.1f}% '
              f'{m["Trades"]:>4} {m["Stag_pct"]:>5.1f}% {m["RetDD"]:>7.2f} {rr_str:>5} '
              f'{flag} {fail_str}')

    print('─' * 150)
    print(f'  TOTAL pass 5/5 filtros: {pass_count} / {len(results)}')
    print()
    print('  Leyenda fails: PF=PF<1.5  RD=Ret/DD<5  RE=RExp<0.30  ST=Stag>25%  TR=#trd<=150  RR=R:R<0.6')

    # Detalle de las que pasan
    passers = [r for r in results if all(filters_capa2(r).values())]
    if passers:
        print()
        print('═' * 100)
        print(f'  DETALLE — {len(passers)} estrategias que PASAN los 6 filtros')
        print('═' * 100)
        for r in passers:
            m = r['metrics']
            pt = r['exits'].get('PT'); sl = r['exits'].get('SL')
            ts = r['exits'].get('TS'); tsa = r['exits'].get('TSAct')
            def fmt_exit(e):
                if not e: return '—'
                if e[0] == 'OFF': return 'OFF'
                if e[0] == 'ATR': return f'{e[1]}xATR({e[2]})'
                if e[0] == 'PIPS': return f'{e[1]}pips'
                return '?'
            print()
            print(f'STRATEGY {r["name"]} · {r["direction"]} · {r["header"]["symbol"]} '
                  f'{r["header"]["chart_name"]}')
            print(f'  NP=${m["NP"]:,.0f}  PF={m["PF"]:.2f}  DD%={m["DD_pct"]:.2f}  '
                  f'Sharpe={m["Sharpe"]:.2f}  RExp={m["RExp"]:.2f}  Win={m["WinPct"]:.1f}%  '
                  f'Trd={m["Trades"]}  Stag={m["Stag_days"]:.0f}d ({m["Stag_pct"]:.1f}%)  '
                  f'Ret/DD={m["RetDD"]:.2f}  Years={m["Years"]:.2f}')
            for rule in r['rules']:
                print(f'    AND  {rule}')
            print(f'  Exits: PT={fmt_exit(pt)}  SL={fmt_exit(sl)}  TS={fmt_exit(ts)}  '
                  f'TSAct={fmt_exit(tsa)}  R:R={r["rr"]:.2f}  EAB={r["exits"].get("EAB_raw")}')
            ct = r['close_types']
            ct_str = ', '.join(f'{k}={v}' for k, v in sorted(ct.items()))
            print(f'  Cierres: {ct_str}')


if __name__ == '__main__':
    sys.exit(main() or 0)
