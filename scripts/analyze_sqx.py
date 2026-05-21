"""
Análisis profundo de archivos .sqx — extrae source code, exits, parámetros y métricas.

Uso: python analyze_sqx.py <archivo.sqx> [archivo2.sqx ...]
"""
import sys
import zipfile
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from collections import defaultdict


def extract_xml_from_sqx(sqx_path):
    """Extrae strategy_Portfolio.xml de un .sqx."""
    with zipfile.ZipFile(sqx_path, 'r') as z:
        with z.open('strategy_Portfolio.xml') as f:
            return f.read().decode('utf-8')


def parse_signal_rules(xml_text):
    """Extrae las reglas de Long/Short Entry/Exit del XML."""
    # Patron simplificado: buscar <signal variable="..."> y extraer display attribute
    # Las 4 signals son LongEntry, ShortEntry, LongExit, ShortExit (IDs específicos)
    SIGNAL_IDS = {
        '33333333-1111-1111-3333-333333333333': 'LongEntrySignal',
        '33333333-2222-1111-3333-333333333333': 'ShortEntrySignal',
        '33333333-1111-2222-3333-333333333333': 'LongExitSignal',
        '33333333-2222-2222-3333-333333333333': 'ShortExitSignal',
    }
    rules = {}
    # Extraer items con display attribute dentro de cada signal
    for sig_id, sig_name in SIGNAL_IDS.items():
        # Find the signal block
        pat = re.compile(
            r'<signal variable="' + re.escape(sig_id) + r'">(.*?)</signal>',
            re.DOTALL
        )
        m = pat.search(xml_text)
        if not m:
            rules[sig_name] = ['(not found)']
            continue
        signal_body = m.group(1)
        # Extract Item displays + params
        items = []
        item_pat = re.compile(r'<Item[^>]*?key="([^"]+)"[^>]*?display="([^"]*)"[^>]*?>')
        params_inside_item_pat = re.compile(r'<Param key="#(\w+)#"[^>]*?>([^<]+)</Param>')
        for item_m in item_pat.finditer(signal_body):
            key = item_m.group(1)
            display = item_m.group(2)
            # Skip Boolean false placeholders
            if key == 'Boolean' and 'false' in signal_body[item_m.end():item_m.end()+200].lower():
                continue
            # Extract surrounding context for parameters
            start = item_m.end()
            # Look ahead for params within this item
            tail = signal_body[start:start+5000]
            params = {}
            for p in params_inside_item_pat.finditer(tail[:2000]):
                params[p.group(1)] = p.group(2).strip()
            items.append({'key': key, 'display': display, 'params': params})
        rules[sig_name] = items
    return rules


def parse_strategy_property(xml_text, key):
    """Find a strategy-level property like Engine, ID, etc."""
    pat = re.compile(r'<' + key + r'>([^<]+)</' + key + r'>')
    m = pat.search(xml_text)
    return m.group(1) if m else None


def parse_money_management(xml_text):
    """Extract MM params."""
    out = {}
    for key in ['RiskedMoney', 'LotsIfNoMM', 'MaxLots']:
        m = re.search(r'key="' + key + r'"[^>]*?value="([^"]+)"', xml_text)
        if m:
            out[key] = m.group(1)
    cap = re.search(r'<InitialCapital>(\d+)</InitialCapital>', xml_text)
    if cap: out['InitialCapital'] = cap.group(1)
    return out


def parse_exits(xml_text):
    """Find exit configuration in EnterAtMarket."""
    out = {}
    # ExitAfterBars param (active or not)
    eab_pat = re.search(
        r'<Param[^>]*?name="ExitAfterBars"[^>]*?value="(\d+)"[^>]*?use="(\w+)"',
        xml_text
    )
    if eab_pat:
        out['ExitAfterBars'] = {'value': eab_pat.group(1), 'use': eab_pat.group(2)}

    # Profit Target / Stop Loss / Trailing Stop / Activation
    for label in ['ProfitTarget', 'StopLoss', 'TrailingStop', 'TrailingActivation']:
        # Buscar el bloque que contiene el label
        block_pat = re.search(
            r'<Param[^>]*?name="' + label + r'"[^>]*?>(.*?)</Param>',
            xml_text,
            re.DOTALL
        )
        # Approach: buscar el campo dentro de actions
        # Más simple: buscar use= cerca del nombre
    return out


def get_rule_summary(rules):
    """Producir un texto legible de las rules."""
    lines = []
    for sig_name, items in rules.items():
        if not items or (len(items) == 1 and 'not found' in str(items[0])):
            lines.append(f"  {sig_name}: false")
            continue
        # Filter out empty/false items
        meaningful = [i for i in items if i.get('display') and i['display'] != '#Value#']
        if not meaningful:
            lines.append(f"  {sig_name}: false")
            continue
        for i, item in enumerate(meaningful):
            display = item['display']
            params = item['params']
            # Substitute params in display
            for pkey, pval in params.items():
                placeholder = '#' + pkey + '#'
                if placeholder in display:
                    display = display.replace(placeholder, pval)
                # Also @Chart@
            display = re.sub(r'@\w+@', '', display)
            connector = '' if i == 0 else '  AND '
            lines.append(f"  {sig_name if i == 0 else '       '}: {connector}{display}")
    return '\n'.join(lines)


def analyze_sqx(sqx_path):
    """Análisis completo de un .sqx."""
    print(f"\n{'='*70}")
    print(f"ANALYZE: {Path(sqx_path).name}")
    print(f"{'='*70}")

    xml = extract_xml_from_sqx(sqx_path)

    # Metadata
    name = parse_strategy_property(xml, 'StrategyName')
    date = parse_strategy_property(xml, 'Date')
    print(f"\nName:   {name}")
    print(f"Date:   {date}")

    # Money Management
    mm = parse_money_management(xml)
    print(f"\nMoneyMgmt:  {mm}")

    # Rules
    rules = parse_signal_rules(xml)
    print(f"\nRULES:")
    print(get_rule_summary(rules))

    # Detección de overfit numérico
    print(f"\nOVERFIT SCAN:")
    # Buscar Numbers absolutos en reglas (no escala-invariante)
    number_pat = re.compile(
        r'<Item[^>]*?key="Number"[^>]*?>.*?<Param[^>]*?value="([0-9.\-]+)"',
        re.DOTALL
    )
    numbers_found = [m.group(1) for m in number_pat.finditer(xml)]
    if numbers_found:
        # Filtrar los que están en rules (no en otros campos)
        big_numbers = [n for n in numbers_found if abs(float(n)) > 100]
        if big_numbers:
            print(f"  [WARN] Number absolutos sospechosos (>100): {big_numbers[:10]}")
        else:
            print(f"  [OK] Numbers encontrados pero todos pequeños (<100): {numbers_found[:5]}")
    else:
        print(f"  [OK] Sin Number absolutos en reglas")

    # Detección de Percentiles (buena señal)
    pct_count = xml.count('IsGreaterPercentil') + xml.count('IsLowerPercentil')
    print(f"  Uses {pct_count} IsLower/GreaterPercentil  {'[OK]' if pct_count > 0 else '[WARN]'}")

    # ExitAfterBars status
    if '"ExitAfterBars.ExitAfterBars"' in xml:
        if 'use="true"' in xml.split('"ExitAfterBars.ExitAfterBars"')[1][:500]:
            print(f"  [WARN] ExitAfterBars: USE=TRUE (activo)")
        else:
            print(f"  [OK] ExitAfterBars: NOT FOUND or use=false")
    else:
        print(f"  [OK] ExitAfterBars: NOT in strategy")


def main():
    if len(sys.argv) < 2:
        print("Uso: python analyze_sqx.py <archivo.sqx> [archivo2.sqx ...]", file=sys.stderr)
        sys.exit(1)
    for arg in sys.argv[1:]:
        analyze_sqx(arg)


if __name__ == '__main__':
    main()
