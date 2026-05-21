"""
CvC test sobre 1 estrategia — replica las métricas del dashboard web.

Aplica desde los trades de la .sqx:
  - 10 bloques OOS (división temporal igual) → NP por bloque
  - Salud temporal: Peak block, DD@close, Recovery Index (avg últ3 / avg hist)
  - 9/9 OOS positivos
  - Worst year (mínimo NP anual) y Best year
  - Arquetipo detector basado en avg_bars + indicators
  - Coherencia direccional simple: trades/mes por año, consistencia
  - Cierres por tipo

NO requiere data de precios. Para EGT v2 (régimes BULL/BEAR/RANGE) sería
necesario data XAUUSD H1, se hace aparte.
"""
import sys
import zipfile
import re
from pathlib import Path
from datetime import datetime, timezone, timedelta

sys.path.insert(0, str(Path(__file__).parent))
from parse_sqx_orders import parse_sqx_orders

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

STARTING_CAPITAL = 100_000.0


def split_into_blocks(trades, n_blocks=None, target_months_per_block=12):
    """Divide trades en N bloques temporales IGUALES (por tiempo, no por trades).

    Si n_blocks=None, calcula N para que cada bloque dure ~target_months_per_block.
    Default: 12 meses/bloque → con 16 años da 16 bloques, con 8 años da 8 bloques.
    """
    if not trades: return []
    first_t = trades[0]['close_time']
    last_t = trades[-1]['close_time']
    total = (last_t - first_t).total_seconds()
    if total <= 0: return [trades]
    if n_blocks is None:
        years = total / (365.25 * 86400)
        # Mínimo 6 bloques (sample muy corto), máximo 20 (sample muy largo)
        n_blocks = max(6, min(20, round(years * 12 / target_months_per_block)))
    block_secs = total / n_blocks
    blocks = [[] for _ in range(n_blocks)]
    for t in trades:
        offset = (t['close_time'] - first_t).total_seconds()
        idx = min(int(offset / block_secs), n_blocks - 1)
        blocks[idx].append(t)
    # Compute block summary
    blocks_info = []
    for i, blk in enumerate(blocks):
        block_start = first_t + timedelta(seconds=block_secs * i)
        block_end = first_t + timedelta(seconds=block_secs * (i + 1))
        np_ = sum(t['pl'] for t in blk)
        blocks_info.append({
            'idx': i + 1,
            'start': block_start,
            'end': block_end,
            'trades': len(blk),
            'np': np_,
        })
    return blocks_info


def compute_yearly(trades):
    """Agrupa trades por año civil y devuelve {year: {trades, np}}."""
    by_year = {}
    for t in trades:
        y = t['close_time'].year
        if y not in by_year:
            by_year[y] = {'trades': 0, 'np': 0.0}
        by_year[y]['trades'] += 1
        by_year[y]['np'] += t['pl']
    return by_year


def compute_temporal_health(blocks_info):
    """Replica cvcComputeTemporalHealth() del dashboard web."""
    if not blocks_info: return None
    n = len(blocks_info)
    # Equity acumulada por bloque
    equity = [STARTING_CAPITAL]
    for b in blocks_info:
        equity.append(equity[-1] + b['np'])
    # Peak block (idx 1-based)
    peak_eq = STARTING_CAPITAL
    peak_block = 0  # 0 = capital inicial
    for i, e in enumerate(equity):
        if e > peak_eq:
            peak_eq = e
            peak_block = i  # 0 = inicial, 1..n = bloque
    final_eq = equity[-1]
    # DD at close
    dd_close = (peak_eq - final_eq) / peak_eq * 100 if peak_eq > 0 else 0
    # Recovery index: avg(últimos 3 NP) / avg(NP histórico)
    nps = [b['np'] for b in blocks_info]
    avg_hist = sum(nps) / len(nps) if nps else 0
    avg_last3 = sum(nps[-3:]) / 3 if len(nps) >= 3 else avg_hist
    recovery = (avg_last3 / avg_hist * 100) if avg_hist > 0 else 0

    # Status
    if peak_block >= n - 2:
        status = 'fresh'
    elif peak_block >= n / 2:
        status = 'recovered'
    elif dd_close > 15:
        status = 'declining'
    else:
        status = 'old_peak'

    return {
        'peak_block': peak_block,
        'dd_close': dd_close,
        'recovery': recovery,
        'status': status,
        'avg_hist': avg_hist,
        'avg_last3': avg_last3,
        'health_ok': peak_block >= n / 2 and dd_close < 15 and recovery >= 70,
    }


def detect_archetype(strategy_xml, trades):
    """Detector simplificado de arquetipo basado en avg_bars + indicators."""
    if not trades: return ('UNKNOWN', 'low')
    avg_dur_hours = sum(t['duration_seconds'] for t in trades) / len(trades) / 3600
    # Aproximación: avg_bars asumiendo TF H1
    # Para H1, 1 bar = 1 hora
    avg_bars = avg_dur_hours

    # Indicators en el XML
    indicators = set(re.findall(r'<Item[^>]*?key="(\w+)"[^>]*categoryType="indicator"', strategy_xml))

    has_supertrend = 'SuperTrend' in indicators or 'EfficiencySuperTrend' in indicators
    has_ma_trend = any(x in indicators for x in ['SMA', 'EMA', 'MACD', 'Ichimoku', 'LinearRegression', 'HMA', 'TEMA'])
    has_mean_revert_ind = any(x in indicators for x in ['RSI', 'Stochastic', 'BollingerBands', 'BollingerBandsPercentB'])
    has_breakout_ind = any(x in indicators for x in ['ATR', 'Highest', 'Lowest', 'DonchianChannels'])

    confidence = 'high'

    if avg_bars > 50 or has_ma_trend:
        return ('TREND_FOLLOWING', confidence)
    if has_supertrend and 5 <= avg_bars <= 30:
        return ('MEAN_REVERT', 'medium')
    if has_mean_revert_ind and avg_bars < 30:
        return ('MEAN_REVERT', 'medium')
    if avg_bars < 5:
        return ('SCALPER', confidence)
    if has_breakout_ind and 10 <= avg_bars <= 100:
        return ('BREAKOUT', 'medium')
    return ('UNKNOWN', 'low')


def main():
    if len(sys.argv) < 2:
        print('Usage: cvc_single_strategy.py <file.sqx>')
        return 1
    sqx_path = Path(sys.argv[1])

    parsed = parse_sqx_orders(sqx_path)
    trades = parsed['trades']
    h = parsed['header']

    with zipfile.ZipFile(sqx_path) as z:
        strat_xml = z.read('strategy_Portfolio.xml').decode('utf-8', errors='ignore')

    n = len(trades)
    pls = [t['pl'] for t in trades]
    np_total = sum(pls)
    first_t = trades[0]['close_time']
    last_t = trades[-1]['close_time']
    years = (last_t - first_t).total_seconds() / (365.25 * 86400)
    avg_dur_hours = sum(t['duration_seconds'] for t in trades) / n / 3600
    avg_dur_days = avg_dur_hours / 24

    # 10 bloques OOS
    # Auto-N bloques: target ~12 meses/bloque → con 8y=8, 16y=16
    blocks = split_into_blocks(trades)
    n_blocks = len(blocks)

    # Salud temporal
    health = compute_temporal_health(blocks)

    # Yearly
    yearly = compute_yearly(trades)

    # Worst/best year
    if yearly:
        worst_y = min(yearly, key=lambda y: yearly[y]['np'])
        best_y = max(yearly, key=lambda y: yearly[y]['np'])
    else:
        worst_y = best_y = None

    # Arquetipo
    arch, conf = detect_archetype(strat_xml, trades)

    # Print
    print('═' * 100)
    print(f'CvC TEST — {sqx_path.stem}')
    print(f'{h["symbol"]} · {h["chart_name"]}')
    print('═' * 100)
    print(f'  NP=${np_total:,.0f}  #trd={n}  Years={years:.2f}  Avg/trade={np_total/n:.2f}')
    print(f'  AvgDur={avg_dur_hours:.1f}h = {avg_dur_days:.1f}d  → Arquetipo: {arch} ({conf})')
    print()

    # Bloques OOS
    print(f'  BLOQUES OOS ({n_blocks} segmentos temporales, {(years/n_blocks*12):.1f} meses/bloque):')
    print(f'  {"#":<3} {"Periodo":<22} {"#trd":>5} {"NP $":>10} {"Cumul $":>10}')
    print('  ' + '─' * 60)
    cum = 0
    pos_blocks = 0
    for b in blocks:
        cum += b['np']
        if b['np'] > 0: pos_blocks += 1
        period = f'{b["start"].strftime("%Y-%m")} → {b["end"].strftime("%Y-%m")}'
        marker = '✓' if b['np'] > 0 else '✗'
        print(f'  {b["idx"]:<3} {period:<22} {b["trades"]:>5} ${b["np"]:>9,.0f} ${cum:>9,.0f}  {marker}')
    print()
    print(f'  → {pos_blocks}/{n_blocks} OOS positivos ' +
          ('✓' if pos_blocks >= n_blocks else f'({n_blocks - pos_blocks} negativos)'))

    # Salud temporal
    if health:
        print()
        print('  SALUD TEMPORAL:')
        print(f'  - Peak block: OOS{health["peak_block"]} de {n_blocks} '
              f'({"✓ 2ª mitad" if health["peak_block"] >= n_blocks/2 else "✗ 1ª mitad"})')
        print(f'  - DD@close:  {health["dd_close"]:.2f}% '
              f'({"✓ near peak" if health["dd_close"] < 5 else "⚠ in pullback" if health["dd_close"] < 15 else "✗ deep DD"})')
        print(f'  - Recovery:  {health["recovery"]:.0f}% '
              f'({"✓ accelerating" if health["recovery"] >= 100 else "✓ steady" if health["recovery"] >= 70 else "✗ declining"})')
        print(f'  - Status:    {health["status"]}')
        print(f'  - Health OK: {"✓ SÍ" if health["health_ok"] else "✗ NO"}')

    # Año por año
    print()
    print('  RENDIMIENTO ANUAL:')
    print(f'  {"Year":<6} {"#trd":>5} {"NP $":>10}')
    print('  ' + '─' * 28)
    for y in sorted(yearly):
        d = yearly[y]
        marker = '✓' if d['np'] > 0 else '✗'
        print(f'  {y:<6} {d["trades"]:>5} ${d["np"]:>9,.0f}  {marker}')
    pos_years = sum(1 for y in yearly if yearly[y]['np'] > 0)
    n_years = len(yearly)
    print(f'  → {pos_years}/{n_years} años positivos')
    if worst_y is not None:
        print(f'  → Worst year: {worst_y} (${yearly[worst_y]["np"]:,.0f})')
        print(f'  → Best year:  {best_y} (${yearly[best_y]["np"]:,.0f})')

    # Source code
    print()
    print('  EDGE (source code):')
    # Re-usar parsing del CAPA2 script
    from analyze_capa2_metrics import parse_signal, extract_variables, resolve_rule, parse_exits
    vars_ = extract_variables(strat_xml)
    for rule in parse_signal(strat_xml, 'long'):
        rs = resolve_rule(rule, vars_)
        if rs != 'AlwaysTrue':
            print(f'    AND  {rs}')
    for rule in parse_signal(strat_xml, 'short'):
        rs = resolve_rule(rule, vars_)
        if rs != 'AlwaysTrue':
            print(f'    SHORT AND  {rs}')

    # Cierres
    ct = {}
    for t in trades:
        ct[t['close_type']] = ct.get(t['close_type'], 0) + 1
    ct_str = ', '.join(f'{k}={v}({v/n*100:.0f}%)' for k, v in sorted(ct.items()))
    print()
    print(f'  Cierres por tipo: {ct_str}')

    # Veredicto final
    print()
    print('═' * 100)
    print('  VEREDICTO CvC')
    print('═' * 100)
    score = 0
    checks = []
    pos_blocks_ok = pos_blocks == n_blocks
    pos_years_ok = pos_years == n_years
    health_ok = health['health_ok'] if health else False

    checks.append(('9/9 OOS positivos', pos_blocks_ok, f'{pos_blocks}/{n_blocks}'))
    checks.append(('Todos años positivos', pos_years_ok, f'{pos_years}/{n_years}'))
    checks.append(('Salud temporal OK', health_ok, health['status'] if health else '-'))
    checks.append(('Peak en 2ª mitad', health['peak_block'] >= n_blocks/2 if health else False,
                   f'OOS{health["peak_block"]}' if health else '-'))
    checks.append(('Recovery ≥ 70%', (health['recovery'] >= 70) if health else False,
                   f'{health["recovery"]:.0f}%' if health else '-'))
    checks.append(('DD@close < 15%', (health['dd_close'] < 15) if health else False,
                   f'{health["dd_close"]:.2f}%' if health else '-'))

    for label, ok, val in checks:
        mark = '✓' if ok else '✗'
        print(f'  {mark}  {label:<25} → {val}')
        if ok: score += 1

    print()
    if score >= 5:
        print(f'  RESULTADO: ✓ PASA CvC ({score}/{len(checks)} criterios)')
    elif score >= 4:
        print(f'  RESULTADO: ⚠ MARGINAL ({score}/{len(checks)} criterios)')
    else:
        print(f'  RESULTADO: ✗ FALLA ({score}/{len(checks)} criterios)')


if __name__ == '__main__':
    sys.exit(main() or 0)
