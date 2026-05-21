"""
Validador: parsea el .sqx y compara cada trade con el CSV TradelistExport.csv
para verificar que el parser binario es correcto.
"""
import sys
import csv
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from parse_sqx_orders import parse_sqx_orders


def validate(sqx_path, csv_path):
    result = parse_sqx_orders(sqx_path)
    trades_bin = result['trades']

    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter=';')
        trades_csv = list(reader)

    if len(trades_bin) != len(trades_csv):
        print(f'[FAIL] Counts differ: bin={len(trades_bin)} csv={len(trades_csv)}')
        return False

    fields_to_check = [
        ('ticket', 'Ticket', int, lambda a, b: a == b),
        ('size', 'Size', float, lambda a, b: abs(a - b) < 0.01),
        ('open_price', 'Open price', float, lambda a, b: abs(a - b) < 0.05),
        ('close_price', 'Close price', float, lambda a, b: abs(a - b) < 0.05),
        ('pl', 'Profit/Loss', float, lambda a, b: abs(a - b) < 0.05),
        ('mae', 'MAE ($)', float, lambda a, b: abs(a - b) < 0.05),
        ('mfe', 'MFE ($)', float, lambda a, b: abs(a - b) < 0.05),
        ('close_type', 'Close type', str, lambda a, b: a == b),
    ]

    error_count = 0
    for i, (tb, tc) in enumerate(zip(trades_bin, trades_csv)):
        # Times
        csv_open = datetime.strptime(tc['Open time'], '%Y.%m.%d %H:%M:%S').replace(tzinfo=timezone.utc)
        csv_close = datetime.strptime(tc['Close time'], '%Y.%m.%d %H:%M:%S').replace(tzinfo=timezone.utc)
        if tb['open_time'] != csv_open:
            print(f'  Trade {i+1}: open_time {tb["open_time"]} vs {csv_open}')
            error_count += 1
            continue
        if tb['close_time'] != csv_close:
            print(f'  Trade {i+1}: close_time {tb["close_time"]} vs {csv_close}')
            error_count += 1
            continue
        for bin_key, csv_key, conv, cmp in fields_to_check:
            v_bin = tb[bin_key]
            v_csv = conv(tc[csv_key])
            if not cmp(v_bin, v_csv):
                print(f'  Trade {i+1}: {bin_key}={v_bin} vs {csv_key}={v_csv}')
                error_count += 1

    if error_count == 0:
        print(f'[OK] {len(trades_bin)}/{len(trades_csv)} trades validated exactly against CSV')
        return True
    else:
        print(f'[FAIL] {error_count} field mismatches')
        return False


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('Uso: python validate_parser.py <archivo.sqx> <TradelistExport.csv>')
        sys.exit(1)
    ok = validate(sys.argv[1], sys.argv[2])
    sys.exit(0 if ok else 1)
