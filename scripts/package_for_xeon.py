"""Empaqueta TODO lo necesario para replicar la configuración SQX 142 en el server xeon.

Contenido del .zip generado en /tmp/sqx_v7_transfer.zip:
  sqx_user/extend/Snippets/SQ/Blocks/*          (69 snippets indicators)
  sqx_user/extend/Snippets/SQ/Columns/*         (194 databank columns)
  sqx_user/extend/Code/*                        (templates .tpl para export)
  sqx_custom_indicators/MetaTrader4/Indicators/* (102 .mq4)
  sqx_custom_indicators/MetaTrader5/Indicators/* (106 .mq5)
  sqx_custom_indicators/Tradestation/*          (.ELD)
  bs_v7/*.sqb                                   (12 blocksettings v7)
"""
import sys
import zipfile
import os
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ZIP_OUT = Path('/tmp/sqx_v7_transfer.zip') if os.name != 'nt' else Path('C:/Users/Livan/AppData/Local/Temp/sqx_v7_transfer.zip')
SQX = Path(r'D:\WuantumBot\Software\SQX_142\SQX_142\SQX_142_Crack')
BS_V7 = Path(r'C:\Users\Livan\OneDrive\Documentos\EDGE\Block Settings\v7')

SEP = '\\'
ARC_SEP = '/'

def arcname(base, file, prefix):
    rel = str(file.relative_to(base)).replace(SEP, ARC_SEP)
    return prefix + rel

def main():
    print(f'Empaquetando en: {ZIP_OUT}')
    if ZIP_OUT.exists():
        ZIP_OUT.unlink()

    count_by_section = {}
    with zipfile.ZipFile(ZIP_OUT, 'w', zipfile.ZIP_DEFLATED) as z:
        # user/extend/Snippets/SQ/Blocks/
        base = SQX / 'user' / 'extend' / 'Snippets' / 'SQ' / 'Blocks'
        if base.exists():
            n = 0
            for f in base.rglob('*'):
                if f.is_file():
                    z.write(f, arcname(base, f, 'sqx_user/extend/Snippets/SQ/Blocks/'))
                    n += 1
            count_by_section['SQ/Blocks/'] = n

        # user/extend/Snippets/SQ/Columns/
        base = SQX / 'user' / 'extend' / 'Snippets' / 'SQ' / 'Columns'
        if base.exists():
            n = 0
            for f in base.rglob('*'):
                if f.is_file():
                    z.write(f, arcname(base, f, 'sqx_user/extend/Snippets/SQ/Columns/'))
                    n += 1
            count_by_section['SQ/Columns/'] = n

        # user/extend/Code/
        base = SQX / 'user' / 'extend' / 'Code'
        if base.exists():
            n = 0
            for f in base.rglob('*'):
                if f.is_file():
                    z.write(f, arcname(base, f, 'sqx_user/extend/Code/'))
                    n += 1
            count_by_section['user/extend/Code/'] = n

        # custom_indicators/ (solo MT4/MT5/TS)
        base = SQX / 'custom_indicators'
        if base.exists():
            n = 0
            for f in base.rglob('*'):
                if f.is_file():
                    rel = str(f.relative_to(base)).replace(SEP, ARC_SEP)
                    # Solo MetaTrader y Tradestation (skip BrokerProfile y JForex que ocupan mucho)
                    if rel.startswith(('MetaTrader4/', 'MetaTrader5/', 'Tradestation/')):
                        z.write(f, 'sqx_custom_indicators/' + rel)
                        n += 1
            count_by_section['custom_indicators/'] = n

        # BS v7 .sqb
        if BS_V7.exists():
            n = 0
            for sqb in BS_V7.glob('*.sqb'):
                z.write(sqb, f'bs_v7/{sqb.name}')
                n += 1
            count_by_section['bs_v7/'] = n

    size_mb = ZIP_OUT.stat().st_size / (1024*1024)
    print(f'\nZIP creado: {ZIP_OUT}')
    print(f'Tamaño:     {size_mb:.2f} MB')
    print(f'\nContenido:')
    for section, n in count_by_section.items():
        print(f'  {section:<30} {n} archivos')

if __name__ == '__main__':
    main()
