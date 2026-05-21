"""
Analizador completo de .sqx Capa 1 con MÉTRICAS REALES calculadas desde orders.bin.

Calcula desde la lista completa de trades:
  - NetProfit (NP)
  - ProfitFactor (PF)
  - DrawdownPct (DD%) basado en equity curve
  - DD$ absoluto
  - SharpeRatio (anualizado, usando returns trade-by-trade)
  - RExpectancy (Van Tharp)
  - WinPct
  - AvgWin/AvgLoss
  - Stagnation (max gap entre new equity highs en días)
  - ReturnDDRatio
  - Trades/year, Avg trade $
  - Reglas LONG/SHORT del XML

Capital base por defecto: $100,000 (Darwinex).
"""
import sys
import zipfile
import re
from pathlib import Path
from datetime import datetime

# Importar parser de orders.bin existente
sys.path.insert(0, str(Path(__file__).parent))
from parse_sqx_orders import parse_sqx_orders

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass


STARTING_CAPITAL = 100_000.0


SAFE_BOUNDED_INDICATORS = {
    'RSI', 'Stochastic', 'StochasticD', 'StochasticK',
    'WilliamsPR', 'WilliamsR',
    'ADX', 'ADXR', 'DMI', 'CCI',
    'ChoppinessIndex', 'CSSAMarketRegime',
    'HurstExponent', 'KaufmanEfficiencyRatio', 'KER',
    'Momentum', 'ROC',
    'BollingerBandsPercentB',
    'MoneyFlowIndex', 'MFI',
    'UltimateOscillator', 'AwesomeOscillator',
    'ZScore',
    'SRPercentRank', 'SRPercentRankSmoothed',
    'TTMSqueeze', 'WAE',
    'ConnorsRSI', 'CRSI', 'SmoothedRSI',
    'DSSBressert', 'DeMarker', 'LaguerreRSI', 'QQE',
    'UltimateC', 'DVO', 'DSS',
    'BHErgodic', 'RVI',
    'CaseyCPercent', 'DPO',
    'EntropyMath', 'WaveTrend',
    'TradersDynamicIndex', 'TotalPowerIndicator',
}


def compute_metrics(trades, capital=STARTING_CAPITAL):
    """Calcula métricas standard SQX desde la lista de trades."""
    if not trades:
        return {}

    n = len(trades)
    pls = [t['pl'] for t in trades]
    durations_days = [t['duration_seconds'] / 86400 for t in trades]

    # Net profit
    np_ = sum(pls)
    # Wins / losses
    wins_pls = [p for p in pls if p > 0]
    loss_pls = [p for p in pls if p < 0]
    wins = len(wins_pls)
    losses = len(loss_pls)
    win_pct = (wins / n * 100) if n else 0
    avg_win = (sum(wins_pls) / wins) if wins else 0
    avg_loss = (sum(loss_pls) / losses) if losses else 0  # Negativo

    # Profit Factor
    gross_win = sum(wins_pls)
    gross_loss = abs(sum(loss_pls))
    pf = (gross_win / gross_loss) if gross_loss else float('inf')

    # Equity curve para DD$ y DD%
    equity = [capital]
    for pl in pls:
        equity.append(equity[-1] + pl)
    peak = capital
    dd_money = 0
    dd_pct = 0
    for e in equity:
        if e > peak:
            peak = e
        d = peak - e
        if d > dd_money:
            dd_money = d
        d_pct = d / peak * 100
        if d_pct > dd_pct:
            dd_pct = d_pct

    # Return DD ratio
    ret_dd = (np_ / dd_money) if dd_money else float('inf')

    # R Expectancy (Van Tharp): (avg_trade) / abs(avg_loss)
    avg_trade = np_ / n if n else 0
    r_exp = (avg_trade / abs(avg_loss)) if avg_loss else float('inf')

    # Sharpe ratio anualizado: mean(returns) / std(returns) * sqrt(252 trades/year approx)
    # Usamos return por trade en % del capital al momento del trade
    if n >= 2:
        rets = [trades[i]['pl'] / equity[i] for i in range(n)]
        mean = sum(rets) / n
        var = sum((r - mean) ** 2 for r in rets) / (n - 1)
        std = var ** 0.5
        # Anualizar: trades_per_year * sqrt(trades_per_year)
        first_t = trades[0]['open_time']
        last_t = trades[-1]['close_time']
        years = (last_t - first_t).total_seconds() / (365.25 * 86400)
        trades_per_year = n / years if years > 0 else 0
        sharpe = (mean / std) * (trades_per_year ** 0.5) if std > 0 else 0
    else:
        sharpe = 0
        trades_per_year = 0
        years = 0

    # Stagnation: max gap entre new equity highs (en días)
    last_peak_time = trades[0]['close_time']
    peak_eq = capital
    max_stag_days = 0
    for t in trades:
        eq_after = peak_eq + t['pl'] if t['pl'] < 0 else None  # no se usa, calc real abajo
        # Necesitamos equity al final del trade
        pass
    # Recalcular con equity y timestamps
    last_peak_time = None
    peak_eq = capital
    eq = capital
    for t in trades:
        eq += t['pl']
        if eq > peak_eq:
            peak_eq = eq
            last_peak_time = t['close_time']
        else:
            if last_peak_time:
                gap_days = (t['close_time'] - last_peak_time).total_seconds() / 86400
                if gap_days > max_stag_days:
                    max_stag_days = gap_days

    # CAGR anualizado: ((final/initial)^(1/years)) - 1
    final_eq = capital + np_
    cagr_pct = ((final_eq / capital) ** (1 / years) - 1) * 100 if years > 0 else 0

    return {
        'NP': np_,
        'Trades': n,
        'Wins': wins,
        'Losses': losses,
        'WinPct': win_pct,
        'AvgWin': avg_win,
        'AvgLoss': avg_loss,
        'AvgTrade': avg_trade,
        'PF': pf,
        'DD_money': dd_money,
        'DD_pct': dd_pct,
        'RetDD': ret_dd,
        'RExp': r_exp,
        'Sharpe': sharpe,
        'Years': years,
        'TradesPerYear': trades_per_year,
        'Stagnation_days': max_stag_days,
        'CAGR_pct': cagr_pct,
        'CAGR_DD_ratio': (cagr_pct / dd_pct) if dd_pct > 0 else float('inf'),
        'FinalEquity': final_eq,
    }


# ---------- Parser de reglas (mismo que analyze_capa1_full.py) ----------
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
        if end is not None:
            results.append((s_idx, end, op))
    filtered = []
    for s, e, op in results:
        if not any(s2 < s and e2 > e for s2, e2, _ in results):
            filtered.append((s, e, op))
    return filtered


def extract_item_name_shift(item_xml):
    key_m = re.search(r'<Item[^>]*?key="([A-Za-z][A-Za-z0-9_]+)"', item_xml)
    name = key_m.group(1) if key_m else '?'
    shift_m = re.search(r'<Param key="#Shift#"[^>]*?>([^<]+)</Param>', item_xml)
    return (name, shift_m.group(1).strip() if shift_m else '')


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
            out.append(f'{n}[{sh}] {"is rising" if op=="IsRising" else "is falling"}')
            continue
        if op in ('IsGreaterPercentil', 'IsLowerPercentil'):
            ind = re.search(r'<Block key="#Indicator#"[^>]*>(.*?)</Block>', block, re.DOTALL)
            n, sh = extract_item_name_shift(ind.group(1) if ind else '')
            bars = re.search(r'<Param key="#Bars#"[^>]*?>([^<]+)</Param>', block)
            pct = re.search(r'<Param key="#Percentile#"[^>]*?>([^<]+)</Param>', block)
            verb = 'is greater than' if op == 'IsGreaterPercentil' else 'is lower than'
            out.append(f'{n}[{sh}] {verb} {pct.group(1).strip() if pct else "?"}% of '
                       f'{bars.group(1).strip() if bars else "?"} bars')
            continue
        if op in ('CrossesAbove', 'CrossesBelow'):
            l = re.search(r'<Block key="#Left#"[^>]*>(.*?)</Block>', block, re.DOTALL)
            r = re.search(r'<Block key="#Right#"[^>]*>(.*?)</Block>', block, re.DOTALL)
            ln, ls = extract_item_name_shift(l.group(1) if l else '')
            rn, rs = extract_item_name_shift(r.group(1) if r else '')
            verb = 'crosses above' if op == 'CrossesAbove' else 'crosses below'
            out.append(f'{ln}[{ls}] {verb} {rn}[{rs}]')
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
            out.append(f'{left_str} {verb} {right_str}')
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
    if not m: return rule, False
    vn = m.group(1)
    val = vars_.get(vn, {}).get('value', '?')
    rule = rule.replace(f'NUMBER({vn})', val)
    left = re.match(r'(\w+)', rule)
    overfit = left and left.group(1) not in SAFE_BOUNDED_INDICATORS
    return rule, bool(overfit)


def analyze_one(sqx_path):
    """Analiza un .sqx — devuelve dict completo."""
    parsed = parse_sqx_orders(sqx_path)
    trades = parsed['trades']
    metrics = compute_metrics(trades, STARTING_CAPITAL)

    # Reglas + exits desde XML
    with zipfile.ZipFile(sqx_path) as z:
        strat_xml = z.read('strategy_Portfolio.xml').decode('utf-8', errors='ignore')
    vars_ = extract_variables(strat_xml)
    rules_long_raw = parse_signal(strat_xml, 'long')
    rules_short_raw = parse_signal(strat_xml, 'short')

    rules_long, rules_short, overfit_flags = [], [], []
    for r in rules_long_raw:
        res, of = resolve_rule(r, vars_)
        rules_long.append(res)
        if of: overfit_flags.append(f'LONG: {res}')
    for r in rules_short_raw:
        res, of = resolve_rule(r, vars_)
        rules_short.append(res)
        if of: overfit_flags.append(f'SHORT: {res}')

    ml = [r for r in rules_long if r != 'AlwaysTrue']
    ms = [r for r in rules_short if r != 'AlwaysTrue']
    direction = 'LONG' if ml and not ms else 'SHORT' if ms and not ml else 'L/S' if ml else 'NONE'

    # Close types histogram
    ct_counts = {}
    for t in trades:
        ct_counts[t['close_type']] = ct_counts.get(t['close_type'], 0) + 1

    return {
        'name': Path(sqx_path).stem.replace('Strategy ', ''),
        'header': parsed['header'],
        'metrics': metrics,
        'direction': direction,
        'rules_long': rules_long,
        'rules_short': rules_short,
        'overfit_flags': overfit_flags,
        'close_types': ct_counts,
    }


def main():
    paths = [Path(p) for p in sys.argv[1:]]
    if not paths:
        print('Usage: python analyze_capa1_metrics.py <file.sqx> ...')
        return 1

    results = []
    for p in paths:
        try:
            results.append(analyze_one(p))
        except Exception as e:
            print(f'ERROR processing {p.name}: {e}')

    # Tabla detallada por estrategia
    for r in results:
        m = r['metrics']
        print('═' * 100)
        print(f'STRATEGY {r["name"]}   ·   {r["direction"]}   ·   '
              f'{r["header"]["symbol"]} {r["header"]["chart_name"]}')
        print('═' * 100)
        print(f'   NP=${m["NP"]:,.0f}  PF={m["PF"]:.2f}  DD%={m["DD_pct"]:.2f}  '
              f'DD$=${m["DD_money"]:,.0f}  Sharpe={m["Sharpe"]:.2f}  '
              f'RExp={m["RExp"]:.2f}  WinPct={m["WinPct"]:.1f}%')
        print(f'   #trades={m["Trades"]}  Trd/año={m["TradesPerYear"]:.0f}  '
              f'Years={m["Years"]:.2f}  Avg/trade=${m["AvgTrade"]:.2f}  '
              f'Stag={m["Stagnation_days"]:.0f}d  Ret/DD={m["RetDD"]:.2f}  '
              f'CAGR={m["CAGR_pct"]:.2f}%  CAGR/DD={m["CAGR_DD_ratio"]:.2f}')
        if r['rules_long']:
            print('  LONG entry:')
            for rr in r['rules_long']: print(f'    AND  {rr}')
        if r['rules_short']:
            print('  SHORT entry:')
            for rr in r['rules_short']: print(f'    AND  {rr}')
        # Close types
        ct = r['close_types']
        ct_str = ', '.join(f'{k}={v}' for k, v in sorted(ct.items()))
        print(f'   Cierres: {ct_str}')
        if r['overfit_flags']:
            print('  ⚠ Overfit (Number absoluto en indicator NO acotado):')
            for f in r['overfit_flags']: print(f'    - {f}')
        print()

    # Tabla comparativa final
    print()
    print('═' * 135)
    print('TABLA COMPARATIVA — métricas REALES desde orders.bin')
    print('═' * 135)
    h = f'{"Strategy":<12} {"Dir":<5} {"NP $":>9} {"PF":>5} {"DD%":>5} {"DD$":>8} {"Sharpe":>7} {"RExp":>6} {"Win%":>6} {"Trd":>4} {"Stag d":>7} {"Ret/DD":>7} {"Edge"}'
    print(h)
    print('─' * 135)
    # Ordenar por Ret/DD descendente
    sorted_results = sorted(results, key=lambda x: x['metrics'].get('RetDD', 0), reverse=True)
    for r in sorted_results:
        m = r['metrics']
        edge = ' AND '.join(r['rules_long'] + r['rules_short'])[:55]
        print(f'{r["name"]:<12} {r["direction"]:<5} '
              f'${m["NP"]:>8,.0f} {m["PF"]:>5.2f} {m["DD_pct"]:>5.2f} ${m["DD_money"]:>7,.0f} '
              f'{m["Sharpe"]:>7.2f} {m["RExp"]:>6.2f} {m["WinPct"]:>5.1f}% '
              f'{m["Trades"]:>4} {m["Stagnation_days"]:>7.0f} {m["RetDD"]:>7.2f}  {edge}')


if __name__ == '__main__':
    sys.exit(main() or 0)
