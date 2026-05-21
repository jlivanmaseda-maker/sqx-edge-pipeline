"""
Análisis de exits + reglas de un .sqx. Imprime una tabla comparativa.
"""
import sys
import zipfile
import re
from pathlib import Path


def extract_xml(sqx_path):
    with zipfile.ZipFile(sqx_path, 'r') as z:
        with z.open('strategy_Portfolio.xml') as f:
            return f.read().decode('utf-8')


def parse_exits_in_actions(xml):
    """
    En las actions de Long entry rule, busca los exits configurados.
    Estructura típica:
       <action key="EnterAtMarket">
           ...
           <ExitMethod key="ProfitTarget" use="true">
               <ATRBased value="X" atrPeriod="Y" />
           ...
    Simplificación: buscar "key=ProfitTarget" "key=StopLoss" etc. y ATR values.
    """
    exits = {}
    # Buscar bloques de exits dentro de las acciones
    # Approach pragmático: buscar el texto crudo cerca de keys conocidas
    for exit_key in ['ExitAfterBars', 'ProfitTarget', 'StopLoss', 'TrailingStop', 'TrailingActivation', 'MoveSL2BE']:
        # Match "ExitAfterBars.ExitAfterBars" or similar internal keys, with their use= and parameters
        pat = re.compile(
            r'<ExitMethod[^>]*?key="' + exit_key + r'"[^>]*?use="(\w+)"[^>]*?>(.{0,500})',
            re.DOTALL
        )
        m = pat.search(xml)
        if m:
            use = m.group(1)
            body = m.group(2)
            # extract value + atrPeriod if present
            val_m = re.search(r'value="([0-9.]+)"', body)
            atr_m = re.search(r'atrPeriod="(\d+)"', body)
            atr_period_m = re.search(r'#AtrPeriod#"[^>]*?>(\d+)<', body)
            value = val_m.group(1) if val_m else None
            atr_period = atr_m.group(1) if atr_m else (atr_period_m.group(1) if atr_period_m else None)
            exits[exit_key] = {
                'use': use,
                'value': value,
                'atr_period': atr_period,
            }

    # Alternative: search by Param names since the XML uses <Param> structure
    # Look for ExitAfterBars value directly in actions
    eab_pat = re.search(r'#ExitAfterBars\.ExitAfterBars#[^>]*?value="([\d.]+)"', xml)
    if eab_pat:
        # Get the use flag
        exit_use = re.search(r'name="Exit After Bars"[^>]*?defaultValue="[\d.]+"', xml)
        # Heuristic: if value=20 and we see "Exit After Bars" enabled in action
        # check if the ExitAfterBars action use is "true"
        action_use = re.search(r'<action[^>]*?key="ExitAfterBars"[^>]*?use="(\w+)"', xml)
        exits['ExitAfterBars_value'] = eab_pat.group(1)

    return exits


def parse_exit_details(xml):
    """Parse the entire <action> blocks for EnterAtMarket Long."""
    # Find the THEN section actions for Long entry
    # Look at <action key="EnterAtMarket"> after long entry IF
    actions_pat = re.compile(
        r'<action[^>]*?key="EnterAtMarket"[^>]*?>(.*?)</action>',
        re.DOTALL
    )
    m = actions_pat.search(xml)
    if not m:
        return {}

    action_xml = m.group(1)

    # Within action, find Exits
    out = {}
    # ExitAfterBars
    eab = re.search(
        r'<Exit[^>]*?name="Exit After Bars"[^>]*?use="(\w+)"[^>]*?>.*?value="([\d.]+)"',
        action_xml, re.DOTALL
    )
    if eab:
        out['ExitAfterBars'] = {'use': eab.group(1), 'value': eab.group(2)}

    # PT
    pt = re.search(
        r'<Exit[^>]*?name="Profit Target"[^>]*?use="(\w+)"[^>]*?>(.{0,2000})',
        action_xml, re.DOTALL
    )
    if pt:
        body = pt.group(2)
        v = re.search(r'<Param[^>]*?name="Value"[^>]*?>([0-9.]+)</Param>', body)
        ap = re.search(r'<Param[^>]*?name="AtrPeriod"[^>]*?>(\d+)</Param>', body)
        out['ProfitTarget'] = {'use': pt.group(1), 'value': v.group(1) if v else None, 'atrPeriod': ap.group(1) if ap else None}

    # SL
    sl = re.search(
        r'<Exit[^>]*?name="Stop Loss"[^>]*?use="(\w+)"[^>]*?>(.{0,2000})',
        action_xml, re.DOTALL
    )
    if sl:
        body = sl.group(2)
        v = re.search(r'<Param[^>]*?name="Value"[^>]*?>([0-9.]+)</Param>', body)
        ap = re.search(r'<Param[^>]*?name="AtrPeriod"[^>]*?>(\d+)</Param>', body)
        out['StopLoss'] = {'use': sl.group(1), 'value': v.group(1) if v else None, 'atrPeriod': ap.group(1) if ap else None}

    # TS
    ts = re.search(
        r'<Exit[^>]*?name="Trailing Stop"[^>]*?use="(\w+)"[^>]*?>(.{0,2000})',
        action_xml, re.DOTALL
    )
    if ts:
        body = ts.group(2)
        v = re.search(r'<Param[^>]*?name="Value"[^>]*?>([0-9.]+)</Param>', body)
        ap = re.search(r'<Param[^>]*?name="AtrPeriod"[^>]*?>(\d+)</Param>', body)
        out['TrailingStop'] = {'use': ts.group(1), 'value': v.group(1) if v else None, 'atrPeriod': ap.group(1) if ap else None}

    # TS Activation
    tsa = re.search(
        r'<Exit[^>]*?name="TS Activation Level"[^>]*?use="(\w+)"[^>]*?>(.{0,2000})',
        action_xml, re.DOTALL
    )
    if tsa:
        body = tsa.group(2)
        v = re.search(r'<Param[^>]*?name="Value"[^>]*?>([0-9.]+)</Param>', body)
        ap = re.search(r'<Param[^>]*?name="AtrPeriod"[^>]*?>(\d+)</Param>', body)
        out['TSActivation'] = {'use': tsa.group(1), 'value': v.group(1) if v else None, 'atrPeriod': ap.group(1) if ap else None}

    return out


def fmt_exit(d):
    if not d: return 'N/A'
    if d.get('use') != 'true': return 'OFF'
    v = d.get('value', '?')
    ap = d.get('atrPeriod', '?')
    return f"{v} x ATR({ap})"


def main():
    paths = sys.argv[1:]
    print(f"{'Strategy':<20} {'PT':<18} {'SL':<18} {'TS':<18} {'TSAct':<18} {'EAB':<10}")
    print("-" * 110)
    for p in paths:
        xml = extract_xml(p)
        exits = parse_exit_details(xml)
        name = Path(p).stem
        pt = fmt_exit(exits.get('ProfitTarget'))
        sl = fmt_exit(exits.get('StopLoss'))
        ts = fmt_exit(exits.get('TrailingStop'))
        tsa = fmt_exit(exits.get('TSActivation'))
        eab_obj = exits.get('ExitAfterBars')
        eab = f"{eab_obj['use']}={eab_obj.get('value','?')}" if eab_obj else 'NONE'
        print(f"{name[:20]:<20} {pt:<18} {sl:<18} {ts:<18} {tsa:<18} {eab:<10}")


if __name__ == '__main__':
    main()
