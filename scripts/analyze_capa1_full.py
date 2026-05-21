"""
Analizador completo de .sqx Capa 1 — combina:
  - Reglas LONG/SHORT (parser de operadores robusto)
  - Constantes Number con valor real
  - Exits (PT/SL/TS/TSAct/EAB/BE)
  - Métricas extraídas:
      * Fingerprint:  trades, profit, drawdown (money)
      * Settings:     Complexity, BacktestDuration, EntryIndicators
      * MEC_OOS_Main: sparkline equity por bloque OOS (cuenta de new-highs)
      * Filtros:      FiltersResultFailedReason (Pass/Fail)
  - Métricas derivadas: AnnualReturn, Ret/DD ratio, Avg trade $, Trades/año

Las métricas avanzadas (PF, Sharpe, R Exp, DD%, Stagnation) están en blob binario
SQStats — NO se extraen aquí. Para esas, mirar SQX UI o exportar databank CSV.
"""
import sys
import zipfile
import re
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass


SAFE_BOUNDED_INDICATORS = {
    'RSI', 'Stochastic', 'StochasticD', 'StochasticK',
    'WilliamsPR', 'WilliamsR',
    'ADX', 'ADXR', 'DMI',
    'CCI',
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


def read_file(sqx_path, name):
    with zipfile.ZipFile(sqx_path) as z:
        try:
            return z.read(name).decode('utf-8', errors='ignore')
        except KeyError:
            return ''


def extract_variables(xml):
    vars_ = {}
    for m in re.finditer(
        r'<variable[^>]*>\s*<id>([^<]+)</id>\s*<name>([^<]+)</name>\s*'
        r'<type>([^<]+)</type>\s*<value>([^<]+)</value>',
        xml,
    ):
        vars_[m.group(2)] = {'type': m.group(3), 'value': m.group(4)}
    return vars_


def find_top_level_items(body, keys):
    results = []
    keys_pat = '|'.join(re.escape(k) for k in keys)
    op_pat = re.compile(r'<Item[^>]*?key="(' + keys_pat + r')"[^>]*?>')
    starts = [(m.start(), m.group(1)) for m in op_pat.finditer(body)]
    for s_idx, op in starts:
        depth = 0; i = s_idx; end = None
        while i < len(body):
            if body[i:i+5] == '<Item':
                depth += 1; i += 5; continue
            if body[i:i+7] == '</Item>':
                depth -= 1
                if depth == 0:
                    end = i + 7; break
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
    shift = shift_m.group(1).strip() if shift_m else ''
    return (name, shift)


def parse_signal(xml, side='long'):
    sid = ('33333333-1111-1111-3333-333333333333' if side == 'long'
           else '44444444-2222-2222-4444-444444444444')
    m = re.search(r'<signal variable="' + sid + r'">(.*?)</signal>', xml, re.DOTALL)
    if not m:
        return []
    body = m.group(1)
    out = []
    op_keys = [
        'IsGreater', 'IsLower', 'IsLess',
        'IsGreaterOrEqual', 'IsLowerOrEqual', 'IsLessOrEqual',
        'IsRising', 'IsFalling',
        'IsGreaterPercentil', 'IsLowerPercentil',
        'CrossesAbove', 'CrossesBelow',
        'AlwaysTrue',
    ]
    for s, e, op in find_top_level_items(body, op_keys):
        block = body[s:e]
        if op == 'AlwaysTrue':
            out.append('AlwaysTrue'); continue
        if op in ('IsRising', 'IsFalling'):
            ind = re.search(r'<Block key="#Indicator#"[^>]*>(.*?)</Block>', block, re.DOTALL)
            n, sh = extract_item_name_shift(ind.group(1) if ind else block)
            out.append(f'{n}[{sh}] {"is rising" if op == "IsRising" else "is falling"}')
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
        if op in ('IsGreater', 'IsLower', 'IsLess',
                  'IsGreaterOrEqual', 'IsLowerOrEqual', 'IsLessOrEqual'):
            l = re.search(r'<Block key="#Left#"[^>]*>(.*?)</Block>', block, re.DOTALL)
            r = re.search(r'<Block key="#Right#"[^>]*>(.*?)</Block>', block, re.DOTALL)
            ln, ls = extract_item_name_shift(l.group(1) if l else '')
            rn, rs = extract_item_name_shift(r.group(1) if r else '')
            verb_map = {
                'IsGreater': '>', 'IsGreaterOrEqual': '>=',
                'IsLower': '<', 'IsLowerOrEqual': '<=',
                'IsLess': '<', 'IsLessOrEqual': '<=',
            }
            verb = verb_map[op]
            if rn == 'Number':
                nm = re.search(
                    r'<Block key="#Right#"[^>]*>.*?<Param key="#Number#"[^>]*?>([^<]+)</Param>',
                    block, re.DOTALL,
                )
                rvar = nm.group(1).strip() if nm else '?'
                right_str = f'NUMBER({rvar})'
            else:
                right_str = f'{rn}[{rs}]' if rs != '' else rn
            left_str = f'{ln}[{ls}]' if ls != '' else ln
            out.append(f'{left_str} {verb} {right_str}')
    return out


def parse_exits(xml):
    out = {}
    eab = re.search(r'<Param key="#ExitAfterBars\.ExitAfterBars#"[^>]*?>\s*([^<]*)\s*</Param>', xml)
    out['EAB'] = eab.group(1).strip() if eab else '-'
    for label, key in [
        ('PT', 'ProfitTarget.ProfitTarget'),
        ('SL', 'StopLoss.StopLoss'),
        ('TS', 'TrailingStop.TrailingStop'),
        ('TSAct', 'TrailingStop.TrailingActivation'),
        ('BE', 'MoveSL2BE.MoveSL2BE'),
    ]:
        m = re.search(r'<Param key="#' + re.escape(key) + r'#"[^>]*?>(.*?)</Param>', xml, re.DOTALL)
        if not m:
            out[label] = '-'; continue
        body = m.group(1)
        if re.search(r'<Formula key="SQ\.Formulas\.\w+\.None"\s*/>', body):
            out[label] = 'OFF'
        else:
            v = re.search(r'<Param key="#Value#"[^>]*?>([0-9.]+)</Param>', body)
            a = re.search(r'<Param key="#AtrPeriod#"[^>]*?>(\d+)</Param>', body)
            out[label] = f'{v.group(1)}xATR({a.group(1)})' if v and a else (
                f'{v.group(1)}fix' if v else 'ON')
    return out


def parse_metrics_plain(settings_xml):
    """Métricas accesibles en plain text (Fingerprint + SettingsMap)."""
    m = {}
    # Fingerprint
    fp = re.search(
        r'<Fingerprint[^/]*?strategyName="([^"]*)"\s+exact="([^"]*)"\s+trades="([^"]*)"'
        r'\s+profit="([^"]*)"\s+drawdown="([^"]*)"',
        settings_xml,
    )
    if fp:
        m['Name'] = fp.group(1)
        m['Trades'] = int(fp.group(3))
        m['Profit'] = float(fp.group(4))
        m['DD_money'] = float(fp.group(5))
    # Backtest duration (years)
    bd = re.search(r'<BacktestDuration[^>]*?>([\d.]+)</BacktestDuration>', settings_xml)
    if bd:
        m['Years'] = float(bd.group(1))
    # Entry indicators
    ei = re.search(r'<EntryIndicators[^>]*?>([^<]+)</EntryIndicators>', settings_xml)
    if ei:
        m['EntryInd'] = ei.group(1).strip()
    # Complexity
    cx = re.search(r'<Complexity[^>]*?>(\d+)</Complexity>', settings_xml)
    if cx:
        m['Complexity'] = int(cx.group(1))
    # Filter result (Pass/Fail)
    fr = re.search(r'<FiltersResultFailedReason[^>]*?>([^<]+)</FiltersResultFailedReason>', settings_xml)
    if fr:
        m['FilterResult'] = fr.group(1).strip()
    # MEC OOS sparkline values
    mec = re.search(
        r'<MEC_OOS_Main[^>]*?>\{\{sparklinesWidget data=\'(\{[^\']+\})\'\}\}</MEC_OOS_Main>',
        settings_xml,
    )
    if mec:
        # Extract values array
        vals_m = re.search(r'"values":\[([\d,\-.\s]+)\]', mec.group(1))
        if vals_m:
            try:
                vals = [int(x) for x in vals_m.group(1).split(',') if x.strip()]
                m['MEC_OOS_vals'] = vals
                # Compute OOS blocks summary
                oos_match = re.search(r'"oos":\[(\[[^\]]+\](?:,\[[^\]]+\])*)\]', mec.group(1))
                if oos_match:
                    # Each [start_idx, count] gives a block
                    blocks = re.findall(r'\[(\d+),(\d+)\]', oos_match.group(1))
                    m['OOS_blocks'] = [(int(s), int(c)) for s, c in blocks]
            except Exception:
                pass
    # Derived metrics
    if 'Profit' in m and 'Years' in m and m['Years'] > 0:
        m['AnnualReturn'] = m['Profit'] / m['Years']
    if 'Profit' in m and 'DD_money' in m and m['DD_money'] > 0:
        m['RetDD'] = m['Profit'] / m['DD_money']
    if 'Profit' in m and 'Trades' in m and m['Trades'] > 0:
        m['AvgTrade'] = m['Profit'] / m['Trades']
        m['TradesPerYear'] = (m['Trades'] / m['Years']) if m.get('Years', 0) > 0 else None
    return m


def resolve_rule(rule, vars_, safe_set):
    m = re.search(r'NUMBER\(([^)]+)\)', rule)
    if not m:
        return rule, False
    vn = m.group(1)
    val = vars_.get(vn, {}).get('value', '?')
    rule = rule.replace(f'NUMBER({vn})', val)
    left = re.match(r'(\w+)', rule)
    overfit = left and left.group(1) not in safe_set
    return rule, bool(overfit)


def main():
    paths = [Path(p) for p in sys.argv[1:]]
    if not paths:
        print('Usage: python analyze_capa1_full.py <file1.sqx> ...')
        return 1

    rows = []
    print()
    for p in paths:
        strat_xml = read_file(p, 'strategy_Portfolio.xml')
        settings_xml = read_file(p, 'settings.xml')
        vars_ = extract_variables(strat_xml)
        rules_long = parse_signal(strat_xml, 'long')
        rules_short = parse_signal(strat_xml, 'short')
        exits = parse_exits(strat_xml)
        metrics = parse_metrics_plain(settings_xml)

        resolved_long, resolved_short, overfit_flags = [], [], []
        for r in rules_long:
            res, of = resolve_rule(r, vars_, SAFE_BOUNDED_INDICATORS)
            resolved_long.append(res)
            if of:
                overfit_flags.append(f'LONG: {res}')
        for r in rules_short:
            res, of = resolve_rule(r, vars_, SAFE_BOUNDED_INDICATORS)
            resolved_short.append(res)
            if of:
                overfit_flags.append(f'SHORT: {res}')

        ml = [r for r in resolved_long if r != 'AlwaysTrue']
        ms = [r for r in resolved_short if r != 'AlwaysTrue']
        direction = 'LONG' if ml and not ms else 'SHORT' if ms and not ml else 'L/S' if ml else 'NONE'

        # Print per-strategy
        name = Path(p).stem.replace('Strategy ', '')
        print('═' * 100)
        print(f'STRATEGY {name}   ·   {direction}   ·   Filter: {metrics.get("FilterResult", "?")}')
        print('═' * 100)
        # Métricas plain
        m = metrics
        line1 = []
        if 'Profit' in m: line1.append(f'NP=${m["Profit"]:,.0f}')
        if 'Trades' in m: line1.append(f'#trades={m["Trades"]}')
        if 'DD_money' in m: line1.append(f'DD$=${m["DD_money"]:,.0f}')
        if 'RetDD' in m: line1.append(f'Ret/DD={m["RetDD"]:.2f}')
        if 'AnnualReturn' in m: line1.append(f'Annual=${m["AnnualReturn"]:,.0f}')
        if 'AvgTrade' in m: line1.append(f'Avg/trade=${m["AvgTrade"]:.2f}')
        if 'TradesPerYear' in m and m['TradesPerYear']: line1.append(f'Trd/año={m["TradesPerYear"]:.0f}')
        if 'Years' in m: line1.append(f'Years={m["Years"]:.2f}')
        if 'Complexity' in m: line1.append(f'Cx={m["Complexity"]}')
        print('  ', ' · '.join(line1))
        if 'EntryInd' in m:
            print(f'   Entry indicators: {m["EntryInd"]}')
        # Reglas
        if ml:
            print('  LONG entry:')
            for r in resolved_long:
                print(f'    AND  {r}')
        if ms:
            print('  SHORT entry:')
            for r in resolved_short:
                print(f'    AND  {r}')
        # Exits
        print(f'   Exits: PT={exits["PT"]}  SL={exits["SL"]}  TS={exits["TS"]}  '
              f'TSAct={exits["TSAct"]}  EAB={exits["EAB"]}  BE={exits["BE"]}')
        # OOS sparkline summary
        if 'MEC_OOS_vals' in m:
            vals = m['MEC_OOS_vals']
            blocks = m.get('OOS_blocks', [])
            if blocks:
                # Map values to blocks
                summary = []
                last = 0
                for i, (start, count) in enumerate(blocks):
                    if start + count <= len(vals):
                        block_vals = vals[start:start+count]
                        # Tomamos último valor del bloque
                        end_v = block_vals[-1] if block_vals else 0
                        delta = end_v - last
                        summary.append(f'OOS{i+1}:{end_v}({"+" if delta>=0 else ""}{delta})')
                        last = end_v
                if summary:
                    print(f'   OOS new-highs: {", ".join(summary)}')
        if overfit_flags:
            print('  ⚠ Number absoluto en indicator NO acotado:')
            for f in overfit_flags:
                print(f'    - {f}')
        print()
        rows.append({
            'name': name,
            'dir': direction,
            'rules': ' AND '.join(resolved_long + resolved_short),
            'metrics': metrics,
            'exits': exits,
            'overfit': bool(overfit_flags),
        })

    # Tabla comparativa
    print()
    print('═' * 110)
    print('TABLA COMPARATIVA')
    print('═' * 110)
    print(f'{"Strategy":<14} {"Dir":<5} {"NP $":>10} {"Trd":>5} {"DD$":>8} {"Ret/DD":>7} '
          f'{"Year$":>9} {"Filter":<10} {"Edge":<35}')
    print('─' * 110)
    for r in rows:
        m = r['metrics']
        np_ = f'${m["Profit"]:,.0f}' if 'Profit' in m else '-'
        trd = m.get('Trades', '-')
        dd_ = f'${m["DD_money"]:,.0f}' if 'DD_money' in m else '-'
        rd = f'{m["RetDD"]:.2f}' if 'RetDD' in m else '-'
        yr = f'${m["AnnualReturn"]:,.0f}' if 'AnnualReturn' in m else '-'
        fr = m.get('FilterResult', '?')[:9]
        edge = r['rules'][:33]
        print(f'{r["name"]:<14} {r["dir"]:<5} {np_:>10} {trd:>5} {dd_:>8} {rd:>7} '
              f'{yr:>9} {fr:<10} {edge:<35}')


if __name__ == '__main__':
    sys.exit(main() or 0)
