"""Verifica los 12 BS v7 desde la perspectiva del Xeon."""
import zipfile, re, sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

V7 = Path(r'C:\Users\Administrator\Desktop\EDGE\Block Settings')
print(f'{"BS":<35} {"Inds":>5} {"ON":>4} {"NumberON":>10}')
print('-' * 60)
for sqb in sorted(V7.glob('*.sqb')):
    with zipfile.ZipFile(sqb) as z:
        xml = z.read('config.xml').decode('utf-8')
    inds = re.findall(r'<Block key="Indicators\.([^"]+)"[^>]*use="(true|false)"', xml)
    on = sum(1 for _, u in inds if u == 'true')
    number_on = any(n == 'Number' and u == 'true' for n, u in inds)
    print(f'{sqb.stem:<35} {len(inds):>5} {on:>4} {str(number_on):>10}')
