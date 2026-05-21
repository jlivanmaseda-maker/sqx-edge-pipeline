"""
Análisis profundo trade-by-trade desde CSV de SQX Trade List Export.
Genera: distribuciones, performance por hora/día/sample, MAE/MFE, R-multiples.
"""
import sys
import csv
from datetime import datetime
from collections import defaultdict
from pathlib import Path


def parse_csv(path):
    trades = []
    with open(path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter=';')
        for row in reader:
            try:
                t = {
                    'ticket': int(row['Ticket']),
                    'symbol': row['Symbol'],
                    'type': row['Type'],
                    'open_time': datetime.strptime(row['Open time'], '%Y.%m.%d %H:%M:%S'),
                    'open_price': float(row['Open price']),
                    'size': float(row['Size']),
                    'close_time': datetime.strptime(row['Close time'], '%Y.%m.%d %H:%M:%S'),
                    'close_price': float(row['Close price']),
                    'pl': float(row['Profit/Loss']),
                    'balance': float(row['Balance']),
                    'sample': row['Sample type'],
                    'close_type': row['Close type'],
                    'mae': float(row['MAE ($)']),
                    'mfe': float(row['MFE ($)']),
                    'time_in_trade': row['Time in trade'],
                    'comment': row.get('Comment', ''),
                }
                # Computed: R-multiple = PL / abs(MAE) (con MAE como estimator de risk)
                if t['mae'] != 0:
                    t['r_multiple'] = t['pl'] / abs(t['mae'])
                else:
                    t['r_multiple'] = 0
                # Duration in hours
                t['duration_h'] = (t['close_time'] - t['open_time']).total_seconds() / 3600
                trades.append(t)
            except Exception as e:
                print(f'Skip row: {e}')
    return trades


def analyze(trades):
    n = len(trades)
    total_pl = sum(t['pl'] for t in trades)
    wins = [t for t in trades if t['pl'] > 0]
    losses = [t for t in trades if t['pl'] < 0]
    n_wins = len(wins)
    n_losses = len(losses)
    win_pct = (n_wins / n * 100) if n else 0
    gross_profit = sum(t['pl'] for t in wins)
    gross_loss = abs(sum(t['pl'] for t in losses))
    pf = (gross_profit / gross_loss) if gross_loss else float('inf')
    avg_win = (gross_profit / n_wins) if n_wins else 0
    avg_loss = (gross_loss / n_losses) if n_losses else 0
    payoff = (avg_win / avg_loss) if avg_loss else 0

    print(f"\n{'='*60}")
    print(f"RESUMEN GENERAL — {n} trades")
    print(f"{'='*60}")
    print(f"Total P/L:         ${total_pl:>10.2f}")
    print(f"# Wins / Losses:   {n_wins} / {n_losses}")
    print(f"Win %:             {win_pct:.2f}%")
    print(f"Profit Factor:     {pf:.2f}")
    print(f"Avg Win:           ${avg_win:.2f}")
    print(f"Avg Loss:          ${avg_loss:.2f}")
    print(f"Payoff Ratio:      {payoff:.2f}")
    print(f"Final Balance:     ${trades[-1]['balance']:.2f}")

    # Distribución por close_type
    print(f"\n--- Cierres por tipo ---")
    close_types = defaultdict(lambda: {'count': 0, 'pl': 0.0, 'wins': 0, 'losses': 0})
    for t in trades:
        ct = t['close_type']
        close_types[ct]['count'] += 1
        close_types[ct]['pl'] += t['pl']
        if t['pl'] > 0:
            close_types[ct]['wins'] += 1
        elif t['pl'] < 0:
            close_types[ct]['losses'] += 1
    for ct, data in sorted(close_types.items()):
        avg_per = data['pl'] / data['count']
        print(f"  {ct:<10s}: {data['count']:>3d} trades ({data['count']/n*100:>5.1f}%) | PL ${data['pl']:>10.2f} | Avg ${avg_per:>7.2f} | W/L {data['wins']}/{data['losses']}")

    # Por sample type (OOS)
    print(f"\n--- Performance por OOS bloque ---")
    samples = defaultdict(lambda: {'count': 0, 'pl': 0.0, 'wins': 0, 'losses': 0, 'pt': 0, 'sl': 0})
    for t in trades:
        s = t['sample']
        samples[s]['count'] += 1
        samples[s]['pl'] += t['pl']
        if t['pl'] > 0:
            samples[s]['wins'] += 1
        elif t['pl'] < 0:
            samples[s]['losses'] += 1
        if t['close_type'] == 'PT':
            samples[s]['pt'] += 1
        elif t['close_type'] == 'SL':
            samples[s]['sl'] += 1
    for s in sorted(samples.keys()):
        d = samples[s]
        win_p = (d['wins'] / d['count'] * 100) if d['count'] else 0
        print(f"  {s}: {d['count']:>3d} trades | PL ${d['pl']:>9.2f} | Win% {win_p:>5.1f}% | PT/SL {d['pt']}/{d['sl']}")

    # Por hora del día (open_time)
    print(f"\n--- Performance por HORA del día (open) ---")
    hours = defaultdict(lambda: {'count': 0, 'pl': 0.0, 'wins': 0})
    for t in trades:
        h = t['open_time'].hour
        hours[h]['count'] += 1
        hours[h]['pl'] += t['pl']
        if t['pl'] > 0:
            hours[h]['wins'] += 1
    print(f"  {'Hour':<6} {'Trades':<8} {'Win%':<8} {'TotalPL':<12} {'AvgPL':<10}")
    for h in sorted(hours.keys()):
        d = hours[h]
        winp = (d['wins'] / d['count'] * 100) if d['count'] else 0
        avgpl = d['pl'] / d['count']
        bar = '#' * int(d['pl'] / 100) if d['pl'] > 0 else ''
        print(f"  {h:02d}:00 {d['count']:>6d}   {winp:>5.1f}%   ${d['pl']:>9.2f}   ${avgpl:>7.2f} {bar}")

    # Por día de semana
    print(f"\n--- Performance por DÍA de semana ---")
    days_names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    days = defaultdict(lambda: {'count': 0, 'pl': 0.0, 'wins': 0})
    for t in trades:
        d = t['open_time'].weekday()
        days[d]['count'] += 1
        days[d]['pl'] += t['pl']
        if t['pl'] > 0:
            days[d]['wins'] += 1
    for di in sorted(days.keys()):
        d = days[di]
        winp = (d['wins'] / d['count'] * 100) if d['count'] else 0
        print(f"  {days_names[di]}: {d['count']:>3d} trades | PL ${d['pl']:>9.2f} | Win% {winp:>5.1f}%")

    # Distribución de duración
    print(f"\n--- Distribución de duración ---")
    duration_buckets = {'<1h': 0, '1-4h': 0, '4-12h': 0, '12-24h': 0, '1-3d': 0, '>3d': 0}
    for t in trades:
        h = t['duration_h']
        if h < 1: duration_buckets['<1h'] += 1
        elif h < 4: duration_buckets['1-4h'] += 1
        elif h < 12: duration_buckets['4-12h'] += 1
        elif h < 24: duration_buckets['12-24h'] += 1
        elif h < 72: duration_buckets['1-3d'] += 1
        else: duration_buckets['>3d'] += 1
    for bucket, cnt in duration_buckets.items():
        pct = cnt / n * 100
        print(f"  {bucket:<8s}: {cnt:>3d} ({pct:>5.1f}%)")

    # MAE/MFE
    print(f"\n--- Análisis MAE/MFE ---")
    avg_mae = sum(t['mae'] for t in trades) / n
    avg_mfe = sum(t['mfe'] for t in trades) / n
    max_mae = min(t['mae'] for t in trades)
    max_mfe = max(t['mfe'] for t in trades)
    # Trades que tocaron MAE significativo (>50% del SL típico ~200)
    deep_mae = [t for t in trades if t['mae'] < -150]
    # Trades que tocaron MFE alto pero cerraron en pérdida
    wasted_mfe = [t for t in trades if t['pl'] < 0 and t['mfe'] > 100]
    print(f"  Avg MAE:           ${avg_mae:>8.2f}")
    print(f"  Avg MFE:           ${avg_mfe:>8.2f}")
    print(f"  Max MAE (worst):   ${max_mae:>8.2f}")
    print(f"  Max MFE (best):    ${max_mfe:>8.2f}")
    print(f"  Deep MAE (<-$150): {len(deep_mae)} ({len(deep_mae)/n*100:.1f}%)")
    print(f"  Wasted MFE (>$100 unrealized → loss): {len(wasted_mfe)} ({len(wasted_mfe)/n*100:.1f}%)")

    # R-multiples
    print(f"\n--- R-multiples (PL / MAE) ---")
    r_buckets = {'>3R': 0, '2-3R': 0, '1-2R': 0, '0-1R': 0, '-1-0R': 0, '<-1R': 0}
    for t in trades:
        r = t['r_multiple']
        if r > 3: r_buckets['>3R'] += 1
        elif r > 2: r_buckets['2-3R'] += 1
        elif r > 1: r_buckets['1-2R'] += 1
        elif r > 0: r_buckets['0-1R'] += 1
        elif r > -1: r_buckets['-1-0R'] += 1
        else: r_buckets['<-1R'] += 1
    for b, cnt in r_buckets.items():
        print(f"  {b:<8s}: {cnt:>3d} ({cnt/n*100:>5.1f}%)")
    avg_r = sum(t['r_multiple'] for t in trades) / n
    print(f"  Avg R:    {avg_r:.3f}")

    # Position sizing
    print(f"\n--- Position sizing (lots) ---")
    sizes = [t['size'] for t in trades]
    avg_size = sum(sizes) / n
    print(f"  Min:   {min(sizes):.2f} lots")
    print(f"  Max:   {max(sizes):.2f} lots")
    print(f"  Avg:   {avg_size:.2f} lots")
    print(f"  → Money management: variable, target risk ~$200 per trade")

    # Streaks
    print(f"\n--- Streaks ---")
    cur_win_streak = 0
    cur_loss_streak = 0
    max_win_streak = 0
    max_loss_streak = 0
    for t in trades:
        if t['pl'] > 0:
            cur_win_streak += 1
            cur_loss_streak = 0
            max_win_streak = max(max_win_streak, cur_win_streak)
        else:
            cur_loss_streak += 1
            cur_win_streak = 0
            max_loss_streak = max(max_loss_streak, cur_loss_streak)
    print(f"  Max win streak:    {max_win_streak}")
    print(f"  Max loss streak:   {max_loss_streak}")


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else None
    if not path:
        print('Uso: python analyze_trades_csv.py <archivo.csv>', file=sys.stderr)
        sys.exit(1)
    trades = parse_csv(path)
    print(f'\nLoaded {len(trades)} trades from {Path(path).name}')
    analyze(trades)


if __name__ == '__main__':
    main()
