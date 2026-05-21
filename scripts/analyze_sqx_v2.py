"""
Analizador profundo de .sqx — corregido para estructura SQX real.
Extrae rules, exits, y reporta tabla comparativa.
"""
import sys
import zipfile
import re
from pathlib import Path


def extract_xml(sqx_path):
    with zipfile.ZipFile(sqx_path, 'r') as z:
        with z.open('strategy_Portfolio.xml') as f:
            return f.read().decode('utf-8')


def parse_exits(xml):
    """
    Estructura real de exits en SQX:
       <Param key="#ProfitTarget.ProfitTarget#" ... isFormula="true">
           <Formula key="SQ.Formulas.SLPT.ATRBasedValue">
               <Param key="#Value#" ...>X</Param>
               <Param key="#AtrPeriod#" ...>Y</Param>
           </Formula>
       </Param>

    Si "Formula key=SQ.Formulas.X.None" => exit desactivado
    Si "Formula key=SQ.Formulas.X.ATRBasedValue" => activo con value + atrPeriod
    """
    out = {}

    # ExitAfterBars
    eab = re.search(
        r'<Param key="#ExitAfterBars\.ExitAfterBars#"[^>]*?>\s*([^<]*)\s*</Param>',
        xml
    )
    if eab:
        val = eab.group(1).strip()
        out['ExitAfterBars'] = val if val else 'NONE'
    else:
        out['ExitAfterBars'] = 'NOT_FOUND'

    # ProfitTarget / StopLoss / TrailingStop / TrailingActivation
    for label, key_name in [
        ('ProfitTarget', 'ProfitTarget.ProfitTarget'),
        ('StopLoss', 'StopLoss.StopLoss'),
        ('TrailingStop', 'TrailingStop.TrailingStop'),
        ('TrailingActivation', 'TrailingStop.TrailingActivation'),
        ('MoveSL2BE', 'MoveSL2BE.MoveSL2BE'),
    ]:
        # Find the Param block for this exit
        pat = re.compile(
            r'<Param key="#' + re.escape(key_name) + r'#"[^>]*?>\s*(.*?)\s*</Param>',
            re.DOTALL
        )
        m = pat.search(xml)
        if not m:
            out[label] = 'NOT_FOUND'
            continue
        body = m.group(1)
        # Check if Formula is "None" (disabled)
        formula_none = re.search(r'<Formula key="SQ\.Formulas\.\w+\.None"\s*/>', body)
        if formula_none:
            out[label] = 'OFF'
            continue
        # Extract Value and AtrPeriod
        val_m = re.search(r'<Param key="#Value#"[^>]*?>([0-9.]+)</Param>', body)
        atr_m = re.search(r'<Param key="#AtrPeriod#"[^>]*?>(\d+)</Param>', body)
        if val_m and atr_m:
            out[label] = f"{val_m.group(1)} x ATR({atr_m.group(1)})"
        elif val_m:
            out[label] = f"{val_m.group(1)} (fixed)"
        else:
            out[label] = 'CONFIGURED'

    return out


def parse_rules_clean(xml):
    """Extrae las reglas de entrada y las muestra de forma legible."""
    # Find the Long Entry rule
    # Pattern: <Rule ... name="Long entry" ...> ... <If> ... </If> ...
    rules_text = []

    # Buscar el long entry signal
    long_signal_pat = re.search(
        r'<signal variable="33333333-1111-1111-3333-333333333333">(.*?)</signal>',
        xml, re.DOTALL
    )
    if not long_signal_pat:
        return 'No long entry signal found'

    signal_body = long_signal_pat.group(1)

    # Extract conditions: parse Items with key=IsGreaterPercentil, IsLowerPercentil, etc.
    conditions = []

    # Helper para extraer un percentile condition
    def extract_pct_condition(item_xml, comparator='greater'):
        """Extract Indicator name + Percentile + Bars from an Item."""
        # Find indicator name
        ind_item = re.search(
            r'<Block key="#Indicator#"[^>]*?>\s*<Item[^>]*?key="(\w+)"',
            item_xml
        )
        indicator = ind_item.group(1) if ind_item else '?'
        # Shift inside indicator
        ind_shift = re.search(
            r'<Item[^>]*?key="' + indicator + r'"[^>]*?>.*?<Param key="#Shift#"[^>]*?>(\d+)</Param>',
            item_xml, re.DOTALL
        )
        shift = ind_shift.group(1) if ind_shift else '?'
        # Bars (outside indicator, in main item)
        bars = re.search(r'<Param key="#Bars#"[^>]*?>(\d+)</Param>', item_xml)
        # Percentile
        pct = re.search(r'<Param key="#Percentile#"[^>]*?>([\d.]+)</Param>', item_xml)
        op = 'is greater or equal than' if comparator == 'greater' else 'is lower or equal than'
        return f"{indicator}[{shift}] {op} {pct.group(1) if pct else '?'}% of {bars.group(1) if bars else '?'} bars"

    # Find all top-level Items in signal
    # Look for IsGreaterPercentil / IsLowerPercentil / IsRising / IsFalling / IsGreater / IsLower etc.
    # Use a simple regex approach
    items_pat = re.compile(
        r'<Item[^>]*?key="(IsGreaterPercentil|IsLowerPercentil|IsRising|IsFalling|CrossesAbove|CrossesBelow|IsGreater|IsLower)"[^>]*?>(.*?)(?=<Item[^>]*?key="(IsGreaterPercentil|IsLowerPercentil|IsRising|IsFalling|CrossesAbove|CrossesBelow|IsGreater|IsLower|Boolean|AlwaysTrue)"|</signal>)',
        re.DOTALL
    )

    # Simpler approach: extract each Item block
    item_blocks = re.findall(
        r'<Item retries="\d+"[^>]*?key="(\w+)"[^>]*?>',
        signal_body
    )

    # Walk through manually for percentile items
    pct_greater = re.findall(
        r'<Item[^>]*?key="IsGreaterPercentil".*?</Item>',
        signal_body, re.DOTALL
    )
    pct_lower = re.findall(
        r'<Item[^>]*?key="IsLowerPercentil".*?</Item>',
        signal_body, re.DOTALL
    )

    for blk in pct_greater[:5]:
        conditions.append(extract_pct_condition(blk, 'greater'))
    for blk in pct_lower[:5]:
        conditions.append(extract_pct_condition(blk, 'lower'))

    # Check for AlwaysTrue
    if 'key="AlwaysTrue"' in signal_body:
        conditions.append('Always True (placeholder)')

    return ' AND '.join(conditions) if conditions else '(no conditions parsed)'


def get_metric(xml, tag):
    m = re.search(r'<' + tag + r'>([^<]+)</' + tag + r'>', xml)
    return m.group(1) if m else None


def main():
    paths = sys.argv[1:]
    print(f"\n{'='*120}")
    print(f"AUDITORIA DE EXITS — Mining SP500 LONG CLOSE")
    print(f"{'='*120}")
    print(f"{'Strategy':<22} {'PT':<22} {'SL':<22} {'TS':<22} {'TSAct':<22} {'EAB':<8} {'R:R'}")
    print('-' * 120)
    results = []
    for p in paths:
        xml = extract_xml(p)
        exits = parse_exits(xml)
        name = Path(p).stem.replace('Strategy ', 'S_')
        pt = exits.get('ProfitTarget', '?')
        sl = exits.get('StopLoss', '?')
        ts = exits.get('TrailingStop', '?')
        tsa = exits.get('TrailingActivation', '?')
        eab = exits.get('ExitAfterBars', '?')
        # Compute R:R
        rr = '?'
        if 'ATR' in pt and 'ATR' in sl:
            try:
                ptval = float(pt.split('x')[0].strip())
                slval = float(sl.split('x')[0].strip())
                rr = f"{ptval/slval:.2f}"
            except: pass
        results.append({'name': name, 'pt': pt, 'sl': sl, 'ts': ts, 'tsa': tsa, 'eab': eab, 'rr': rr})
        print(f"{name[:22]:<22} {pt[:22]:<22} {sl[:22]:<22} {ts[:22]:<22} {tsa[:22]:<22} {eab[:8]:<8} {rr}")

    # Rules summary
    print(f"\n{'='*120}")
    print(f"RULES DE ENTRADA — Long entry condition")
    print(f"{'='*120}")
    for p in paths:
        xml = extract_xml(p)
        name = Path(p).stem.replace('Strategy ', 'S_')
        rules = parse_rules_clean(xml)
        print(f"\n{name}:")
        print(f"  {rules}")


if __name__ == '__main__':
    main()
