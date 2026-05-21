"""
Parser final de orders.bin de archivos .sqx (StrategyQuant X).

Estructura del archivo:
- Header Java serialization: ac ed 00 05
- Stream de bloques TC_BLOCKDATALONG (7a) o TC_BLOCKDATA (77) que llevan datos en chunks
- Datos crudos (tras stripear los block-markers):
    [HEADER 117 bytes]:
       u16 len + "SQOrderFileFormat:11"
       padding/version
       u16 len + strategy name (ej "Strategy 0.333026")
       u16 len + chart name (ej "Main: SP500_darwinex/M30")
       u16 len + symbol (ej "SP500_darwinex")
    [TRADE RECORDS de 149 bytes cada uno]:
       +0..3   magic = 04 03 02 01
       +4..7   trade index (u32 BE, 1-based)
       +8..11  reservado (= 0)
       +12     flag1 = 0x01
       +13     close_type_id (2=SL, 3=PT, ...)
       +14     subtype byte (0x15-0x1d)
       +15..22 openTime ms (u64 BE)
       +23     separator = 0x01
       +24..27 size (f32 BE) lots
       +28..31 openPrice (f32 BE)
       +32..39 openFillTime (u64 BE)
       +40..43 openFillPrice (f32 BE)
       +44..51 closeTime (u64 BE)
       +52..55 closePrice (f32 BE)
       +56..59 closeFillPrice (f32 BE)
       +60..63 tpPrice (f32 BE) — target price (puede no haberse alcanzado)
       +64..65 closeType (u16 BE, redundante con +13)
       +66..69 pl (f32 BE) — Profit/Loss en USD
       +99..102 maeAbs (f32 BE) — Max Adverse Excursion en USD (valor absoluto)
       +103..106 maePerLot (f32 BE)
       +107..110 mfeAbs (f32 BE) — Max Favorable Excursion en USD
       +111..114 mfePerLot (f32 BE)
       [resto de campos no esenciales]

Validado contra TradelistExport.csv del Strategy 0.333026 (SP500 LONG CLOSE):
  174/174 trades coinciden exactamente en: ticket, openTime, closeTime, size,
  openPrice, closePrice, PL, closeType, MAE, MFE.

Uso:
    python parse_sqx_orders.py <archivo.sqx>
"""
import sys
import zipfile
import struct
from pathlib import Path
from datetime import datetime, timezone


CLOSE_TYPE_MAP = {
    2: 'SL',   # Stop Loss
    3: 'PT',   # Profit Target
    4: 'XC',   # X-Close (cierre forzado, fin de periodo)
    6: 'TR',   # Trailing Stop (variante antigua)
    19: 'EAB', # Exit After Bars (Capa 1 / template)
    21: 'TR',  # Trailing Stop (variante observada en mining WS30 FINALES con trailing activo)
}


def strip_java_blocks(raw):
    """Reconstruye stream raw eliminando markers TC_BLOCKDATA(LONG) de Java serialization."""
    out = bytearray()
    i = 0
    if raw[:4] == b'\xac\xed\x00\x05':
        i = 4
    while i < len(raw):
        op = raw[i]
        if op == 0x7a:  # TC_BLOCKDATALONG
            length = struct.unpack('>I', raw[i+1:i+5])[0]
            out.extend(raw[i+5:i+5+length])
            i += 5 + length
        elif op == 0x77:  # TC_BLOCKDATA
            length = raw[i+1]
            out.extend(raw[i+2:i+2+length])
            i += 2 + length
        else:
            # End of blocks (could be TC_ENDBLOCKDATA = 0x78 or other)
            break
    return bytes(out)


def _read_utf(stream, off):
    """Lee Java modified-UTF: u16 length + bytes."""
    length = struct.unpack('>H', stream[off:off+2])[0]
    s = stream[off+2:off+2+length].decode('utf-8', errors='replace')
    return s, off + 2 + length


MAGIC_VARIANTS = [b'\x04\x03\x02\x01', b'\x03\x02\x04\x01', b'\x02\x03\x04\x01', b'\x03\x04\x02\x01', b'\x02\x04\x03\x01', b'\x04\x02\x03\x01']


def _find_magic(stream, start=0):
    """Encuentra primer magic marker (variantes conocidas) tras 'start'. Devuelve (offset, magic_bytes)."""
    best = (-1, None)
    for m in MAGIC_VARIANTS:
        idx = stream.find(m, start)
        if idx >= 0 and (best[0] == -1 or idx < best[0]):
            best = (idx, m)
    return best


def parse_header(stream):
    """Parsea cabecera. Devuelve dict con info + offset donde empiezan los trades."""
    off = 0
    file_format, off = _read_utf(stream, off)
    if not file_format.startswith('SQOrderFileFormat'):
        raise ValueError(f'Unexpected file format: {file_format}')

    # Skip padding (varies per file but always ends before strategy name)
    # Find first trade record by looking for either magic variant
    magic_pos, magic_bytes = _find_magic(stream, off)
    if magic_pos == -1:
        raise ValueError('No trade records found')

    # Between current off and magic_pos we have:
    #   padding zeros + version bytes + 3 strings (strategy name, chart, symbol)
    # Find 3 strings backwards: each is u16 length + bytes
    # Symbol is last (right before magic)
    cursor = magic_pos - 1
    # Symbol
    # We know symbol typically 6-20 chars. Try to read backwards.
    # Heuristic: scan for valid u16-prefixed UTF strings
    # Easier: scan forward from off looking for plausible strings
    strings = []
    scan = off
    while scan < magic_pos - 2:
        slen = struct.unpack('>H', stream[scan:scan+2])[0]
        if 1 <= slen <= 200 and scan + 2 + slen <= magic_pos:
            payload = stream[scan+2:scan+2+slen]
            # All chars printable?
            try:
                s = payload.decode('utf-8')
                if all(c.isprintable() for c in s) and len(s) >= 3:
                    strings.append((scan, s))
                    scan = scan + 2 + slen
                    continue
            except Exception:
                pass
        scan += 1

    # Identify strings by content (chart contains '/', strategy starts with letter, symbol is uppercase-ish)
    strategy_name = None
    chart_name = None
    symbol = None
    for pos, s in strings:
        if 'Main:' in s or '/' in s:
            chart_name = s
        elif s.lower().startswith('strategy') or s.startswith('TEMPLATE'):
            strategy_name = s
        else:
            # First unrecognized = symbol (heuristic)
            if symbol is None:
                symbol = s
    # Fallback if heuristic failed
    if not strategy_name and len(strings) >= 3:
        strategy_name = strings[-1][1]
    if not chart_name and len(strings) >= 2:
        chart_name = strings[0][1]
    if not symbol and len(strings) >= 2:
        symbol = strings[1][1]

    return {
        'file_format': file_format,
        'strategy_name': strategy_name,
        'chart_name': chart_name,
        'symbol': symbol,
        'records_offset': magic_pos,
        'magic_bytes': magic_bytes,
    }


def parse_trade_record(rec, base_idx=None):
    """Parsea un registro de 149 bytes."""
    if len(rec) < 149:
        raise ValueError(f'Record too short: {len(rec)} bytes')
    if rec[0:4] not in MAGIC_VARIANTS:
        raise ValueError(f'Bad magic in record: {rec[0:4].hex()}')

    idx = struct.unpack('>I', rec[4:8])[0]
    close_type_id = rec[13]
    open_ms = struct.unpack('>q', rec[15:23])[0]
    size = struct.unpack('>f', rec[24:28])[0]
    open_price = struct.unpack('>f', rec[28:32])[0]
    open_fill_ms = struct.unpack('>q', rec[32:40])[0]
    open_fill_price = struct.unpack('>f', rec[40:44])[0]
    close_ms = struct.unpack('>q', rec[44:52])[0]
    close_price = struct.unpack('>f', rec[52:56])[0]
    close_fill_price = struct.unpack('>f', rec[56:60])[0]
    tp_price = struct.unpack('>f', rec[60:64])[0]
    close_type_short = struct.unpack('>H', rec[64:66])[0]
    pl = struct.unpack('>f', rec[66:70])[0]
    mae_abs = struct.unpack('>f', rec[99:103])[0]
    mae_per_lot = struct.unpack('>f', rec[103:107])[0]
    mfe_abs = struct.unpack('>f', rec[107:111])[0]
    mfe_per_lot = struct.unpack('>f', rec[111:115])[0]

    return {
        'ticket': idx,
        'close_type_id': close_type_id,
        'close_type': CLOSE_TYPE_MAP.get(close_type_id, f'?{close_type_id}'),
        'open_time': datetime.fromtimestamp(open_ms/1000, tz=timezone.utc),
        'open_fill_time': datetime.fromtimestamp(open_fill_ms/1000, tz=timezone.utc),
        'close_time': datetime.fromtimestamp(close_ms/1000, tz=timezone.utc),
        'size': size,
        'open_price': open_price,
        'open_fill_price': open_fill_price,
        'close_price': close_price,
        'close_fill_price': close_fill_price,
        'tp_price': tp_price,  # Target price (puede no haberse alcanzado)
        'pl': pl,
        'mae': -abs(mae_abs),  # Convertir a negativo
        'mfe': mfe_abs,
        'mae_per_lot': mae_per_lot,
        'mfe_per_lot': mfe_per_lot,
        'duration_seconds': (close_ms - open_ms) // 1000,
    }


def parse_sqx_orders(sqx_path):
    """Función principal: lee un .sqx y devuelve {header, trades}."""
    with zipfile.ZipFile(sqx_path, 'r') as z:
        with z.open('orders.bin') as f:
            raw = f.read()

    stream = strip_java_blocks(raw)
    header = parse_header(stream)

    trades = []
    offset = header['records_offset']
    while offset + 149 <= len(stream):
        rec = stream[offset:offset+149]
        if rec[0:4] not in MAGIC_VARIANTS:
            break
        trades.append(parse_trade_record(rec))
        offset += 149

    return {
        'header': header,
        'trades': trades,
    }


def main():
    if len(sys.argv) < 2:
        print('Uso: python parse_sqx_orders.py <archivo.sqx>', file=sys.stderr)
        sys.exit(1)

    sqx_path = sys.argv[1]
    result = parse_sqx_orders(sqx_path)
    h = result['header']
    trades = result['trades']

    print(f'\n=== {Path(sqx_path).name} ===')
    print(f'Strategy:  {h["strategy_name"]}')
    print(f'Chart:     {h["chart_name"]}')
    print(f'Symbol:    {h["symbol"]}')
    print(f'# trades:  {len(trades)}')

    if trades:
        print(f'\nPrimer trade:')
        t = trades[0]
        print(f'  #{t["ticket"]} {t["close_type"]} {t["open_time"]} -> {t["close_time"]}')
        print(f'  Open {t["open_price"]:.2f} -> Close {t["close_price"]:.2f}  (TP={t["tp_price"]:.2f})')
        print(f'  Size {t["size"]:.2f}  PL ${t["pl"]:.2f}  MAE ${t["mae"]:.2f}  MFE ${t["mfe"]:.2f}')
        print(f'\nÚltimo trade:')
        t = trades[-1]
        print(f'  #{t["ticket"]} {t["close_type"]} {t["open_time"]} -> {t["close_time"]}')
        print(f'  Open {t["open_price"]:.2f} -> Close {t["close_price"]:.2f}')
        print(f'  PL ${t["pl"]:.2f}')

        # Summary
        total_pl = sum(t['pl'] for t in trades)
        wins = sum(1 for t in trades if t['pl'] > 0)
        ct_counts = {}
        for t in trades:
            ct_counts[t['close_type']] = ct_counts.get(t['close_type'], 0) + 1
        print(f'\nResumen:')
        print(f'  Total PL:  ${total_pl:.2f}')
        print(f'  Win %:     {wins/len(trades)*100:.2f}%')
        print(f'  Cierres:   {ct_counts}')


if __name__ == '__main__':
    main()
