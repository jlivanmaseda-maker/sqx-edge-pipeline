"""Verifica el día de triple swap para WS30, NDX, AUDCAD, XAUUSD."""
import MetaTrader5 as mt5

if not mt5.initialize():
    print(f"ERROR: {mt5.last_error()}")
    exit(1)

# swap_rollover3days: día de la semana donde se aplica triple swap
# 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
days = {0:'SUNDAY', 1:'MONDAY', 2:'TUESDAY', 3:'WEDNESDAY', 4:'THURSDAY', 5:'FRIDAY', 6:'SATURDAY'}

symbols = ['WS30', 'NDX', 'AUDCAD', 'XAUUSD']
for sym in symbols:
    info = mt5.symbol_info(sym)
    if info:
        triple_day = days.get(info.swap_rollover3days, f'?({info.swap_rollover3days})')
        print(f'{sym:10s}: triple_swap_day={triple_day}, swap_long={info.swap_long}, swap_short={info.swap_short}')
    else:
        print(f'{sym:10s}: no encontrado')

mt5.shutdown()
