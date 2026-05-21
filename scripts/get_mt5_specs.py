"""
Lee las specs de un símbolo desde el MT5 desktop abierto del usuario.
Uso: python get_mt5_specs.py [SYMBOL]
Default: WS30
"""
import sys
import json
import MetaTrader5 as mt5


def fmt(v):
    """Format value for display."""
    if v is None: return 'None'
    if isinstance(v, float):
        if abs(v) < 0.0001 and v != 0:
            return f'{v:.10f}'
        return f'{v}'
    return str(v)


def main():
    symbol = sys.argv[1] if len(sys.argv) > 1 else 'WS30'

    # Initialize MT5 connection (conecta al MT5 desktop abierto)
    if not mt5.initialize():
        print(f"ERROR: initialize() failed. Code: {mt5.last_error()}")
        return 1

    print(f"=== Conexión MT5 ===")
    terminal = mt5.terminal_info()
    if terminal:
        print(f"Terminal:  {terminal.name}")
        print(f"Build:     {terminal.build}")
        print(f"Path:      {terminal.path}")
        print(f"Connected: {terminal.connected}")
    account = mt5.account_info()
    if account:
        print(f"Cuenta:    {account.login} ({account.company})")
        print(f"Server:    {account.server}")
        print(f"Currency:  {account.currency}")
        print(f"Leverage:  1:{account.leverage}")
        print(f"Balance:   {account.balance} {account.currency}")

    # Buscar variantes del símbolo
    print(f"\n=== Buscando símbolo '{symbol}' (y variantes) ===")
    all_symbols = mt5.symbols_get()
    if not all_symbols:
        print("ERROR: no se pudieron leer símbolos")
        mt5.shutdown()
        return 1

    candidates = [s.name for s in all_symbols if symbol.upper() in s.name.upper()]
    print(f"Candidatos encontrados: {candidates}")

    if not candidates:
        print(f"NO se encontró ningún símbolo que contenga '{symbol}'")
        # listar primeros 30 símbolos para referencia
        print(f"\nPrimeros símbolos disponibles:")
        for s in all_symbols[:30]:
            print(f"  - {s.name}")
        mt5.shutdown()
        return 1

    # Para cada candidato, mostrar specs completas
    for sym_name in candidates:
        print(f"\n{'='*60}")
        print(f"SPECS: {sym_name}")
        print(f"{'='*60}")
        info = mt5.symbol_info(sym_name)
        if not info:
            print(f"  no se pudo leer info de {sym_name}")
            continue

        # Convertir el namedtuple a dict para imprimir todo
        d = info._asdict()

        # Campos clave para trading
        key_fields = [
            ('Description',        'description'),
            ('Symbol path',        'path'),
            ('Currency base',      'currency_base'),
            ('Currency profit',    'currency_profit'),
            ('Currency margin',    'currency_margin'),
            ('Digits',             'digits'),
            ('Spread (current)',   'spread'),
            ('Spread float',       'spread_float'),
            ('Stops level',        'trade_stops_level'),
            ('Freeze level',       'trade_freeze_level'),
            ('Contract size',      'trade_contract_size'),
            ('Tick size',          'trade_tick_size'),
            ('Tick value',         'trade_tick_value'),
            ('Tick value profit',  'trade_tick_value_profit'),
            ('Tick value loss',    'trade_tick_value_loss'),
            ('Volume min',         'volume_min'),
            ('Volume max',         'volume_max'),
            ('Volume step',        'volume_step'),
            ('Volume limit',       'volume_limit'),
            ('Margin initial',     'margin_initial'),
            ('Margin maintenance', 'margin_maintenance'),
            ('Margin hedged',      'margin_hedged'),
            ('Swap long',          'swap_long'),
            ('Swap short',         'swap_short'),
            ('Swap mode',          'swap_mode'),
            ('Trade mode',         'trade_mode'),
            ('Trade calc mode',    'trade_calc_mode'),
            ('Trade exemode',      'trade_exemode'),
            ('Filling mode',       'filling_mode'),
            ('Expiration mode',    'expiration_mode'),
            ('Time current',       'time'),
            ('Bid',                'bid'),
            ('Ask',                'ask'),
            ('Point',              'point'),
        ]
        for label, key in key_fields:
            if key in d:
                print(f"  {label:25s}: {fmt(d[key])}")

        # Calcular tick value en USD para 1 lote (para confirmación)
        try:
            tv = d.get('trade_tick_value', 0)
            cs = d.get('trade_contract_size', 0)
            ts = d.get('trade_tick_size', 0)
            print(f"\n  Tick value (1 lot):   {tv} (cuenta currency)")
            print(f"  1 punto del índice:   {ts * cs if ts and cs else '?'} (cuenta currency × 1 lot)")
            spread_pips = d.get('spread', 0)
            print(f"  Spread actual:        {spread_pips} ticks = {spread_pips * ts if ts else '?'} unidades del índice")
        except Exception as e:
            print(f"  (no se pudo calcular: {e})")

    mt5.shutdown()
    return 0


if __name__ == '__main__':
    sys.exit(main())
