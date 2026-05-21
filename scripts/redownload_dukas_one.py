"""Re-descarga un activo específico desde Dukas MT5.

Uso: python redownload_dukas_one.py <ASSET_ID> [tf1 tf2 ...]
Ej:  python redownload_dukas_one.py USDJPY M5 M15 M30 H1 H4
"""
import sys
import time
from datetime import datetime
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

import MetaTrader5 as mt5
import pandas as pd

DUKAS_PATH = r"C:\Program Files\Dukascopy MetaTrader 5\terminal64.exe"
START = datetime(2010, 1, 1)
END = datetime(2026, 5, 20)
OUT_DIR = Path(r"C:\Users\Livan\OneDrive\Documentos\EDGE\Categorias Activos\csv_for_sqx")

SYMBOL_MAP = {
    "EURUSD": "EURUSD", "GBPUSD": "GBPUSD", "USDJPY": "USDJPY", "USDCHF": "USDCHF",
    "AUDUSD": "AUDUSD", "NZDUSD": "NZDUSD", "USDCAD": "USDCAD",
    "EURGBP": "EURGBP", "EURJPY": "EURJPY", "EURCAD": "EURCAD", "EURCHF": "EURCHF",
    "EURAUD": "EURAUD", "EURNZD": "EURNZD",
    "GBPJPY": "GBPJPY", "GBPNZD": "GBPNZD", "GBPAUD": "GBPAUD", "GBPCAD": "GBPCAD", "GBPCHF": "GBPCHF",
    "AUDJPY": "AUDJPY", "NZDJPY": "NZDJPY", "CADJPY": "CADJPY", "CHFJPY": "CHFJPY",
    "AUDNZD": "AUDNZD", "AUDCAD": "AUDCAD", "NZDCAD": "NZDCAD", "CADCHF": "CADCHF",
    "USDMXN": "USDMXN", "USDZAR": "USDZAR",
    "US500": "USA500.IDX", "USTEC": "USATECH.IDX", "GER40": "DEU.IDX", "US30": "USA30.IDX",
    "XAUUSD": "XAUUSD",
}

TF_MAP = {
    "M5":  mt5.TIMEFRAME_M5,
    "M15": mt5.TIMEFRAME_M15,
    "M30": mt5.TIMEFRAME_M30,
    "H1":  mt5.TIMEFRAME_H1,
    "H4":  mt5.TIMEFRAME_H4,
}


def fetch_with_retry(symbol, tf_code, retries=5, delay=4.0):
    for attempt in range(retries):
        rates = mt5.copy_rates_range(symbol, tf_code, START, END)
        if rates is not None and len(rates) > 100:
            return rates
        if attempt < retries - 1:
            print(f'    retry {attempt+1}/{retries-1} (got {len(rates) if rates is not None else 0} bars)')
            time.sleep(delay)
    return rates


def main():
    if len(sys.argv) < 2:
        print('Usage: python redownload_dukas_one.py <ASSET_ID> [tf1 tf2 ...]')
        return 1
    asset = sys.argv[1]
    tfs = sys.argv[2:] if len(sys.argv) > 2 else ['M5', 'M15', 'M30', 'H1', 'H4']
    sym = SYMBOL_MAP.get(asset, asset)

    if not mt5.initialize(path=DUKAS_PATH, portable=False):
        print(f'MT5 init failed: {mt5.last_error()}')
        return 1
    info = mt5.account_info()
    print(f'Conectado a: {info.server} (login {info.login})')

    mt5.symbol_select(sym, True)
    time.sleep(3)  # warm cache

    OUT_DIR.mkdir(exist_ok=True)
    for tf in tfs:
        tf_code = TF_MAP[tf]
        out_path = OUT_DIR / f'{asset}_{tf}.csv'
        print(f'Descargando {asset} {tf} ({sym})...')
        t0 = time.time()
        rates = fetch_with_retry(sym, tf_code)
        elapsed = time.time() - t0
        if rates is None or len(rates) == 0:
            print(f'  ⚠ Sin data después de retries')
            continue
        df = pd.DataFrame(rates)
        df["Date"] = pd.to_datetime(df["time"], unit="s")
        df = df.rename(columns={
            "open": "Open", "high": "High", "low": "Low", "close": "Close", "tick_volume": "Volume",
        })
        df = df[["Date", "Open", "High", "Low", "Close", "Volume"]]
        df.to_csv(out_path, index=False)
        mb = out_path.stat().st_size / 1024 / 1024
        first = df["Date"].iloc[0].strftime("%Y-%m-%d")
        last = df["Date"].iloc[-1].strftime("%Y-%m-%d")
        print(f'  ✓ {len(df):,} bars  {first} → {last}  {mb:.1f} MB  ({elapsed:.1f}s)')

    mt5.shutdown()


if __name__ == '__main__':
    sys.exit(main() or 0)
