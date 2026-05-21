"""
Verifica si Darwinex cobra comisión en WS30.
Busca por:
1. order_calc_margin / order_calc_profit (puede revelar comisión)
2. Histórico de deals en WS30 si los hay
3. Spec extendida
"""
import MetaTrader5 as mt5
from datetime import datetime, timedelta


if not mt5.initialize():
    print(f"ERROR: {mt5.last_error()}")
    exit(1)

print("=== Cuenta info extendida ===")
acc = mt5.account_info()
if acc:
    for k, v in acc._asdict().items():
        print(f"  {k:25s}: {v}")

print("\n=== WS30 spec extendida ===")
info = mt5.symbol_info('WS30')
if info:
    # Atributos relacionados con costes/comisiones
    cost_fields = [
        'session_deals', 'session_buy_orders', 'session_sell_orders',
        'session_turnover', 'session_interest',
        'session_buy_orders_volume', 'session_sell_orders_volume',
        'session_open', 'session_close', 'session_aw', 'session_price_settlement',
        'session_price_limit_min', 'session_price_limit_max',
    ]
    d = info._asdict()
    print(f"Tiene los siguientes atributos: {list(d.keys())}")

print("\n=== Histórico deals en WS30 (último año) ===")
since = datetime.now() - timedelta(days=365)
deals = mt5.history_deals_get(since, datetime.now(), group='*WS30*')
if deals:
    print(f"Encontrados {len(deals)} deals históricos en WS30")
    for d in deals[:5]:
        print(f"  {d.time} | type={d.type} | volume={d.volume} | price={d.price} | commission={d.commission} | swap={d.swap} | profit={d.profit}")
else:
    print("Sin deals históricos en WS30 (cuenta nueva o sin operaciones)")

print("\n=== order_calc — simular comisión ===")
# Margen de 1 lote
try:
    margin = mt5.order_calc_margin(mt5.ORDER_TYPE_BUY, 'WS30', 1.0, info.ask)
    print(f"  Margen para 1.0 lot WS30 BUY @ {info.ask}: ${margin}")
except Exception as e:
    print(f"  margin calc error: {e}")

mt5.shutdown()
