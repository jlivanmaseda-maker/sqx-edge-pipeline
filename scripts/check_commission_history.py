"""Verifica comisión real cobrada en operaciones de XAUUSD desde el histórico."""
import MetaTrader5 as mt5
from datetime import datetime, timedelta

if not mt5.initialize():
    print(f"ERROR: {mt5.last_error()}")
    exit(1)

# Histórico amplio: 2 años
since = datetime.now() - timedelta(days=730)

for sym in ['XAUUSD', 'AUDCAD', 'NDX', 'WS30']:
    print(f"\n=== {sym} histórico (último 2 años) ===")
    deals = mt5.history_deals_get(since, datetime.now(), group=f'*{sym}*')
    if not deals:
        print(f"  Sin deals de {sym}")
        continue
    # Filter actual deals (no balance/credit operations)
    real_deals = [d for d in deals if d.symbol == sym and d.type in (0, 1)]
    if not real_deals:
        print(f"  Sin deals reales de {sym}")
        continue
    print(f"  Total deals: {len(real_deals)}")
    # Comisiones agregadas
    total_volume = sum(d.volume for d in real_deals)
    total_commission = sum(d.commission for d in real_deals)
    if total_volume > 0:
        avg_commission_per_lot = abs(total_commission) / total_volume
        print(f"  Total volume:        {total_volume:.2f} lots")
        print(f"  Total commission:    ${total_commission:.2f}")
        print(f"  Commission/lot/leg:  ${avg_commission_per_lot:.4f}")
        print(f"  Commission/lot RT:   ${avg_commission_per_lot * 2:.4f}")
    # Ejemplos
    print(f"  Sample deals (primeros 3):")
    for d in real_deals[:3]:
        print(f"    volume={d.volume:5.2f} | price={d.price:.2f} | commission={d.commission:+.4f} | swap={d.swap:+.4f}")

mt5.shutdown()
