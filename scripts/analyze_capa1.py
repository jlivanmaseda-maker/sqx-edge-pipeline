"""
Analizador profundo para mining Capa 1 (sin SL/TP, solo EAB=20).

Extrae:
  - Reglas LONG/SHORT entry — operadores:
    IsGreater, IsLess, IsGreaterOrEqual, IsLessOrEqual,
    IsRising, IsFalling,
    IsGreaterPercentil, IsLowerPercentil,
    CrossesAbove, CrossesBelow
  - Resuelve constantes Number1, Number2 leyendo <Variables>
  - Exits PT/SL/TS/TSAct/EAB/BE
  - Flag de overfit cuando hay Number absoluto en un indicator NO acotado por rango natural
"""
import sys
import zipfile
import re
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass


# Indicators con rango natural conocido (0-100 oscillators, etc.)
# Constants absolutas en estos indicators son semánticamente válidas
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


def read_xml(sqx_path, name='strategy_Portfolio.xml'):
    with zipfile.ZipFile(sqx_path) as z:
        return z.read(name).decode('utf-8', errors='ignore')


def extract_variables(xml):
    """Extract <variable><id>X</id><name>X</name><type>T</type><value>V</value>..."""
    vars_ = {}
    for m in re.finditer(
        r'<variable[^>]*>\s*<id>([^<]+)</id>\s*<name>([^<]+)</name>\s*'
        r'<type>([^<]+)</type>\s*<value>([^<]+)</value>',
        xml,
    ):
        vars_[m.group(2)] = {'type': m.group(3), 'value': m.group(4)}
    return vars_


def find_top_level_items(body, keys):
    """Devuelve [(start_idx, end_idx, key)] para Items con esas keys, sin nesteados."""
    results = []
    keys_pat = '|'.join(re.escape(k) for k in keys)
    op_pat = re.compile(r'<Item[^>]*?key="(' + keys_pat + r')"[^>]*?>')
    # Para cada match, balancear </Item>
    starts = [(m.start(), m.group(1)) for m in op_pat.finditer(body)]
    for s_idx, op in starts:
        depth = 0
        i = s_idx
        end = None
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
    # Filtrar nesteados: si un block está dentro de otro mayor → descartarlo
    filtered = []
    for s, e, op in results:
        is_nested = False
        for s2, e2, _ in results:
            if s2 < s and e2 > e:
                is_nested = True
                break
        if not is_nested:
            filtered.append((s, e, op))
    return filtered


def extract_item_name_shift(item_xml):
    """De un bloque '<Item ... key="X" ...> ... </Item>', devuelve (key, shift)."""
    key_m = re.search(r'<Item[^>]*?key="([A-Za-z][A-Za-z0-9_]+)"', item_xml)
    if not key_m:
        return ('?', '')
    name = key_m.group(1)
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
    blocks = find_top_level_items(body, op_keys)
    for s, e, op in blocks:
        block = body[s:e]
        if op == 'AlwaysTrue':
            out.append('AlwaysTrue')
            continue
        if op in ('IsRising', 'IsFalling'):
            ind_blk = re.search(r'<Block key="#Indicator#"[^>]*>(.*?)</Block>', block, re.DOTALL)
            ind_xml = ind_blk.group(1) if ind_blk else block
            name, shift = extract_item_name_shift(ind_xml)
            verb = 'is rising' if op == 'IsRising' else 'is falling'
            out.append(f'{name}[{shift}] {verb}')
            continue
        if op in ('IsGreaterPercentil', 'IsLowerPercentil'):
            ind_blk = re.search(r'<Block key="#Indicator#"[^>]*>(.*?)</Block>', block, re.DOTALL)
            ind_xml = ind_blk.group(1) if ind_blk else ''
            name, shift = extract_item_name_shift(ind_xml)
            bars = re.search(r'<Param key="#Bars#"[^>]*?>([^<]+)</Param>', block)
            pct = re.search(r'<Param key="#Percentile#"[^>]*?>([^<]+)</Param>', block)
            verb = 'is greater than' if op == 'IsGreaterPercentil' else 'is lower than'
            out.append(f'{name}[{shift}] {verb} {pct.group(1).strip() if pct else "?"}% of '
                       f'{bars.group(1).strip() if bars else "?"} bars')
            continue
        if op in ('CrossesAbove', 'CrossesBelow'):
            left_blk = re.search(r'<Block key="#Left#"[^>]*>(.*?)</Block>', block, re.DOTALL)
            right_blk = re.search(r'<Block key="#Right#"[^>]*>(.*?)</Block>', block, re.DOTALL)
            ln, ls = extract_item_name_shift(left_blk.group(1) if left_blk else '')
            rn, rs = extract_item_name_shift(right_blk.group(1) if right_blk else '')
            verb = 'crosses above' if op == 'CrossesAbove' else 'crosses below'
            out.append(f'{ln}[{ls}] {verb} {rn}[{rs}]')
            continue
        # IsGreater / IsLower / IsLess + variants
        if op in ('IsGreater', 'IsLower', 'IsLess',
                  'IsGreaterOrEqual', 'IsLowerOrEqual', 'IsLessOrEqual'):
            left_blk = re.search(r'<Block key="#Left#"[^>]*>(.*?)</Block>', block, re.DOTALL)
            right_blk = re.search(r'<Block key="#Right#"[^>]*>(.*?)</Block>', block, re.DOTALL)
            ln, ls = extract_item_name_shift(left_blk.group(1) if left_blk else '')
            rn, rs = extract_item_name_shift(right_blk.group(1) if right_blk else '')
            verb_map = {
                'IsGreater': '>', 'IsGreaterOrEqual': '>=',
                'IsLower': '<', 'IsLowerOrEqual': '<=',
                'IsLess': '<', 'IsLessOrEqual': '<=',
            }
            verb = verb_map[op]
            # Right may be Number → capture variable name
            if rn == 'Number':
                num_m = re.search(
                    r'<Block key="#Right#"[^>]*>.*?<Param key="#Number#"[^>]*?>([^<]+)</Param>',
                    block, re.DOTALL,
                )
                rvar = num_m.group(1).strip() if num_m else 'Number?'
                right_str = f'NUMBER({rvar})'
            else:
                right_str = f'{rn}[{rs}]' if rs != '' else rn
            left_str = f'{ln}[{ls}]' if ls != '' else ln
            out.append(f'{left_str} {verb} {right_str}')
            continue
    return out


def parse_exits(xml):
    out = {}
    eab = re.search(r'<Param key="#ExitAfterBars\.ExitAfterBars#"[^>]*?>\s*([^<]*)\s*</Param>', xml)
    eab_val = eab.group(1).strip() if eab else ''
    out['EAB'] = eab_val or '-'
    for label, key in [
        ('PT', 'ProfitTarget.ProfitTarget'),
        ('SL', 'StopLoss.StopLoss'),
        ('TS', 'TrailingStop.TrailingStop'),
        ('TSAct', 'TrailingStop.TrailingActivation'),
        ('BE', 'MoveSL2BE.MoveSL2BE'),
    ]:
        m = re.search(r'<Param key="#' + re.escape(key) + r'#"[^>]*?>(.*?)</Param>', xml, re.DOTALL)
        if not m:
            out[label] = '-'
            continue
        body = m.group(1)
        if re.search(r'<Formula key="SQ\.Formulas\.\w+\.None"\s*/>', body):
            out[label] = 'OFF'
        else:
            val = re.search(r'<Param key="#Value#"[^>]*?>([0-9.]+)</Param>', body)
            atr = re.search(r'<Param key="#AtrPeriod#"[^>]*?>(\d+)</Param>', body)
            if val and atr:
                out[label] = f'{val.group(1)}xATR({atr.group(1)})'
            elif val:
                out[label] = f'{val.group(1)}fix'
            else:
                out[label] = 'ON'
    return out


def resolve_rule(rule, vars_, indicator_safety):
    """Reemplaza NUMBER(VarName) por valor real y devuelve (rule, overfit_flag)."""
    overfit = False
    m = re.search(r'NUMBER\(([^)]+)\)', rule)
    if not m:
        return rule, False
    vn = m.group(1)
    vd = vars_.get(vn, {})
    val = vd.get('value', '?')
    rule = rule.replace(f'NUMBER({vn})', val)
    # Check overfit: ¿el lado izquierdo es un indicator con rango natural?
    left_m = re.match(r'(\w+)', rule)
    if left_m:
        left_ind = left_m.group(1)
        if left_ind not in indicator_safety:
            overfit = True
    return rule, overfit


def short_name(p):
    return Path(p).stem.replace('Strategy ', '')


def main():
    paths = [Path(p) for p in sys.argv[1:]]
    if not paths:
        print('Usage: python analyze_capa1.py <file1.sqx> ...')
        return 1

    summary = []
    for p in paths:
        xml = read_xml(p)
        vars_ = extract_variables(xml)
        rules_long = parse_signal(xml, 'long')
        rules_short = parse_signal(xml, 'short')
        exits = parse_exits(xml)

        # Resolver Number → valor
        resolved_long = []
        resolved_short = []
        overfit_flags = []
        for r in rules_long:
            res, of = resolve_rule(r, vars_, SAFE_BOUNDED_INDICATORS)
            resolved_long.append(res)
            if of:
                overfit_flags.append(f'LONG: Number absoluto en indicator NO acotado → {res}')
        for r in rules_short:
            res, of = resolve_rule(r, vars_, SAFE_BOUNDED_INDICATORS)
            resolved_short.append(res)
            if of:
                overfit_flags.append(f'SHORT: Number absoluto en indicator NO acotado → {res}')

        # Direction
        meaning_long = [r for r in resolved_long if r != 'AlwaysTrue']
        meaning_short = [r for r in resolved_short if r != 'AlwaysTrue']
        if meaning_long and not meaning_short:
            direction = 'LONG'
        elif meaning_short and not meaning_long:
            direction = 'SHORT'
        elif meaning_long and meaning_short:
            direction = 'L/S'
        else:
            direction = 'NONE'

        # Numbers absolutos usados (resumen)
        numbers_used = []
        for vn, vd in vars_.items():
            if vn.startswith('Number') and vd.get('type') == 'double':
                numbers_used.append(f'{vn}={vd["value"]}')

        print('=' * 100)
        print(f'STRATEGY {short_name(p)}   ·   Direction: {direction}')
        print('=' * 100)
        if meaning_long:
            print('  LONG entry:')
            for r in resolved_long:
                marker = '  ' if r != 'AlwaysTrue' else '∅ '
                print(f'    {marker}AND  {r}')
        if meaning_short:
            print('  SHORT entry:')
            for r in resolved_short:
                marker = '  ' if r != 'AlwaysTrue' else '∅ '
                print(f'    {marker}AND  {r}')
        print()
        print(f'  Exits: PT={exits["PT"]:<14}  SL={exits["SL"]:<14}  '
              f'TS={exits["TS"]:<14}  TSAct={exits["TSAct"]:<14}  '
              f'EAB={exits["EAB"]:<6}  BE={exits["BE"]}')
        if numbers_used:
            print(f'  Constantes Number: {", ".join(numbers_used)}')
        if overfit_flags:
            print('  ⚠ Overfit flags:')
            for f in overfit_flags:
                print(f'    - {f}')
        print()

        summary.append({
            'name': short_name(p),
            'dir': direction,
            'rules_long': resolved_long,
            'rules_short': resolved_short,
            'exits': exits,
            'numbers': numbers_used,
            'overfit': overfit_flags,
        })

    # Tabla resumen
    print()
    print('=' * 100)
    print('RESUMEN')
    print('=' * 100)
    print(f'{"Strategy":<14} {"Dir":<5} {"Rules":<40} {"EAB":<6} {"Overfit"}')
    print('-' * 100)
    for s in summary:
        rules_str = ' AND '.join(s['rules_long'] + s['rules_short'])[:38]
        overfit = '⚠ YES' if s['overfit'] else 'no'
        print(f'{s["name"]:<14} {s["dir"]:<5} {rules_str:<40} {s["exits"]["EAB"]:<6} {overfit}')


if __name__ == '__main__':
    sys.exit(main() or 0)
