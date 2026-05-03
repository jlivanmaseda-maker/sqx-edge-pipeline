"""Análisis cuantitativo de los 32+ activos del dashboard usando OHLC Dukascopy/Darwinex.

Multi-TF: por defecto H1, pero soporta --tf {H1,M30,M15,M5}.
Output:
  asset_metrics.json       (H1, default — compat con código existente)
  asset_metrics_<TF>.json   (otros TFs)

Ratings editoriales se extraen de js/data/assets.js (refactor C3) o del HTML legacy.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).parent
CSV_DIR = ROOT / "csv_for_sqx"

# Cap para Ornstein-Uhlenbeck half-life en barras (~3.4 años en cada TF)
OU_CAP_BARS = {
    "M5":  360_000,
    "M15": 120_000,
    "M30":  60_000,
    "H1":   30_000,
    "H4":    7_500,
    "D1":    1_250,
}

# Look bars para VWAP rejection (representa ~6h temporales en cualquier TF)
VWAP_LOOK_BARS = {
    "M5":  72,
    "M15": 24,
    "M30": 12,
    "H1":   6,
    "H4":   2,
    "D1":   1,
}

RATING_ORDER = {"++": 3, "+": 2, "~": 1, "-": 0}


# ============================================================ INDICATORS

def adx(df: pd.DataFrame, period: int = 14) -> float:
    h, l, c = df["High"], df["Low"], df["Close"]
    up = h.diff()
    dn = -l.diff()
    plus_dm = up.where((up > dn) & (up > 0), 0.0)
    minus_dm = dn.where((dn > up) & (dn > 0), 0.0)
    tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
    atr_v = tr.ewm(alpha=1 / period, adjust=False).mean()
    plus_di = 100 * (plus_dm.ewm(alpha=1 / period, adjust=False).mean() / atr_v.replace(0, np.nan))
    minus_di = 100 * (minus_dm.ewm(alpha=1 / period, adjust=False).mean() / atr_v.replace(0, np.nan))
    dx = 100 * ((plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan))
    return float(dx.ewm(alpha=1 / period, adjust=False).mean().dropna().mean())


def trend_efficiency(close: pd.Series, period: int = 200) -> float:
    direction = close.diff(period).abs()
    volatility = close.diff().abs().rolling(period).sum()
    return float((direction / volatility.replace(0, np.nan)).dropna().mean())


def hurst(close: pd.Series, max_lag: int = 20) -> float:
    log_p = np.log(close.dropna().values)
    if len(log_p) < max_lag * 5:
        return float("nan")
    lags = range(2, max_lag)
    tau = [np.std(log_p[lag:] - log_p[:-lag]) for lag in lags]
    if min(tau) <= 0:
        return float("nan")
    return float(np.polyfit(np.log(lags), np.log(tau), 1)[0])


def autocorr_lag1(close: pd.Series) -> float:
    return float(close.pct_change().dropna().autocorr(lag=1))


def atr_pct_mean(df: pd.DataFrame, period: int = 14) -> float:
    h, l, c = df["High"], df["Low"], df["Close"]
    tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
    atr_v = tr.rolling(period).mean()
    return float((atr_v / df["Close"]).dropna().mean() * 100)


def vol_of_vol(df: pd.DataFrame, period: int = 14) -> float:
    h, l, c = df["High"], df["Low"], df["Close"]
    tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
    atr_v = tr.rolling(period).mean().dropna()
    return float(atr_v.std() / atr_v.mean()) if atr_v.mean() else float("nan")


def ou_half_life_bars(close: pd.Series, cap: float = 30000.0) -> float:
    """Half-life Ornstein-Uhlenbeck en barras. Lower = mean reversion más rápida.
    Capped a 'cap' bars para activos sin reversion clara (≈3.4 años en cada TF)."""
    p = np.log(close.dropna().values)
    if len(p) < 1000:
        return cap
    p_lag = p[:-1]
    delta = p[1:] - p_lag
    a, _ = np.polyfit(p_lag, delta, 1)
    if a >= 0:
        return cap
    hl = -np.log(2) / a
    return float(min(hl, cap))


def kurtosis_returns(close: pd.Series, winsor_pct: float = 0.001) -> float:
    """Kurtosis con winsorización al 0.1% por cola para excluir shocks outlier (ej. SNB 2015)."""
    r = close.pct_change().dropna()
    lo, hi = r.quantile(winsor_pct), r.quantile(1 - winsor_pct)
    return float(r.clip(lo, hi).kurt())


def pct_above_sma(close: pd.Series, period: int = 200) -> float:
    sma = close.rolling(period).mean()
    return float((close > sma).dropna().mean())


def sma_persistence(close: pd.Series, period: int = 200) -> float:
    """Average run length on each side of SMA. Higher = más persistencia de régimen."""
    sma = close.rolling(period).mean()
    side = (close > sma).astype(int).dropna()
    if len(side) < 2:
        return 0.0
    flips = (side.diff() != 0).sum()
    return float(len(side) / max(flips, 1))


def rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    avg_gain = gain.ewm(alpha=1 / period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - 100 / (1 + rs)


def rsi_reversal_edge(df: pd.DataFrame, period: int = 14, lookforward: int = 12,
                     low_thr: float = 30, high_thr: float = 70) -> dict[str, float]:
    """Mide el edge real de "comprar RSI<30 / vender RSI>70".

    Devuelve dict con avg forward return tras señal, normalizado por ATR%
    (en múltiplos de ATR) — comparable entre activos.
    """
    close = df["Close"]
    r = rsi(close, period)
    fwd_ret = close.pct_change(lookforward).shift(-lookforward) * 100  # %

    # ATR% promedio para normalizar
    h, l, c = df["High"], df["Low"], df["Close"]
    tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
    atr_v = (tr.rolling(14).mean() / df["Close"]).dropna() * 100
    atr_avg = atr_v.mean() if len(atr_v) else 1.0

    oversold = r < low_thr
    overbought = r > high_thr

    n_os = int(oversold.sum())
    n_ob = int(overbought.sum())

    long_edge = float(fwd_ret[oversold].mean()) if n_os >= 50 else 0.0
    short_edge = float(-fwd_ret[overbought].mean()) if n_ob >= 50 else 0.0

    return {
        "rsi_long_edge_pct":   round(long_edge, 4),
        "rsi_short_edge_pct":  round(short_edge, 4),
        "rsi_combined_edge":   round((long_edge + short_edge) / 2, 4),
        "rsi_edge_in_atrs":    round((long_edge + short_edge) / 2 / max(atr_avg, 0.01), 3),
        "rsi_n_oversold":      n_os,
        "rsi_n_overbought":    n_ob,
    }


def vwap_rejection_rate(df: pd.DataFrame, look: int = 6) -> float:
    """% de bars donde el precio toca VWAP diaria y rebota dentro de `look` bars.

    Higher = VWAP funciona como S/R = mejor edge de volumen.
    `look` debe representar ~6h temporales:
      H1 → 6, M30 → 12, M15 → 24, M5 → 72
    """
    if len(df) < 1000:
        return 0.0
    # VWAP diaria recalculada cada día
    df = df.copy()
    df["date"] = df.index.date
    typical = (df["High"] + df["Low"] + df["Close"]) / 3
    df["pv"] = typical * df["Volume"]
    df["cum_pv"] = df.groupby("date")["pv"].cumsum()
    df["cum_v"] = df.groupby("date")["Volume"].cumsum()
    df["vwap"] = df["cum_pv"] / df["cum_v"].replace(0, np.nan)

    side = np.sign(df["Close"] - df["vwap"])
    crosses = (side != side.shift()).fillna(False)
    cross_idx = np.flatnonzero(crosses.values)
    if len(cross_idx) < 50:
        return 0.0

    bounces = 0
    total = 0
    for i in cross_idx:
        if i + look >= len(df):
            continue
        original_side = side.iloc[i - 1] if i > 0 else 0
        if original_side == 0:
            continue
        # ¿Volvió al lado original dentro de 6 barras?
        future = side.iloc[i + 1 : i + 1 + look]
        if (future == original_side).any():
            bounces += 1
        total += 1
    return round(bounces / total, 3) if total else 0.0


def round_number_bounce_rate(df: pd.DataFrame, round_steps: int = 100) -> float:
    """% de touches a niveles redondos donde el precio rebota.

    Para forex: niveles cada 0.0050 (Major) o 0.0100. Para índices: cada 50.
    Heurística: rounded grid = (max-min)/round_steps.
    """
    if len(df) < 500:
        return 0.0
    close = df["Close"]
    px_range = close.max() - close.min()
    grid = px_range / round_steps  # ~50-100 niveles distribuidos en el range
    if grid <= 0:
        return 0.0

    # Marcar bars cercanas a un nivel redondo (dentro del 5% del grid)
    levels = (close / grid).round() * grid
    near = (close - levels).abs() < (grid * 0.05)
    near_idx = np.flatnonzero(near.values)
    if len(near_idx) < 100:
        return 0.0

    bounces = 0
    total = 0
    look = 10
    for i in near_idx[:5000]:  # cap to keep fast
        if i + look >= len(close):
            continue
        ref = close.iloc[i]
        approach_dir = np.sign(close.iloc[i] - close.iloc[max(0, i - 5)])
        if approach_dir == 0:
            continue
        # Bounce = en las próximas 'look' bars el precio se aleja en dirección opuesta
        future = close.iloc[i + 1 : i + 1 + look]
        max_move_against = (ref - future.min()) if approach_dir > 0 else (future.max() - ref)
        max_move_with = (future.max() - ref) if approach_dir > 0 else (ref - future.min())
        if max_move_against > max_move_with * 1.2:
            bounces += 1
        total += 1
    return round(bounces / total, 3) if total else 0.0


# ============================================================ DATA LOADING

def load_csv(asset: str, tf: str) -> pd.DataFrame | None:
    p = CSV_DIR / f"{asset}_{tf}.csv"
    if not p.exists():
        return None
    df = pd.read_csv(p, parse_dates=["Date"])
    return df.set_index("Date")


def extract_dashboard_ratings() -> dict[str, dict]:
    """Lee ASSETS desde js/data.js (refactor C3) o desde HTML legacy.
    Devuelve { asset_id: { 'subtype': str, 'type': str, 'ratings': { cat_key: rating } } }
    """
    candidates = [
        ROOT / "js" / "data.js",
        ROOT / "SQX_Dashboard_v6.html",
        ROOT / "SQX_Activos_Dashboard_v5.html",
    ]
    text = None
    for p in candidates:
        if p.exists():
            text = p.read_text(encoding="utf-8")
            break
    if text is None:
        return {}
    m = re.search(r"const ASSETS\s*=\s*\[(.*?)\n\];", text, re.DOTALL)
    if not m:
        return {}
    block = m.group(1)
    out: dict[str, dict] = {}
    asset_re = re.compile(r"id:\s*'([^']+)',\s*type:\s*'([^']+)',\s*sub:\s*'([^']+)',\s*cats:\s*\{(.*?)\}\}", re.DOTALL)
    cat_re = re.compile(r"(\w+)\s*:\s*\{[^{}]*?rating:\s*'([^']+)'", re.DOTALL)
    for am in asset_re.finditer(block):
        aid, atype, asub, cats_block = am.groups()
        cats = {cm.group(1): cm.group(2) for cm in cat_re.finditer(cats_block)}
        out[aid] = {"type": atype, "subtype": asub, "ratings": cats}
    return out


# ============================================================ MAIN

def main(tf: str = "H1", out_path: Path | None = None) -> None:
    """Procesa todos los activos para el TF dado. Si out_path es None, default según TF."""
    assets = sorted({p.stem.replace(f"_{tf}", "") for p in CSV_DIR.glob(f"*_{tf}.csv") if not p.stem.startswith("_")})
    if not assets:
        print(f"No CSVs *_{tf}.csv en {CSV_DIR}")
        return

    if out_path is None:
        # H1 mantiene el nombre canónico para compat (asset_metrics.json)
        out_dir = ROOT / "analysis_output"
        out_dir.mkdir(exist_ok=True)
        out_path = out_dir / ("asset_metrics.json" if tf == "H1" else f"asset_metrics_{tf}.json")

    ou_cap = OU_CAP_BARS.get(tf, 30000)
    vwap_look = VWAP_LOOK_BARS.get(tf, 6)
    bars_key = f"bars_{tf.lower()}"
    hl_key   = f"ou_half_life_{tf.lower()}"

    print(f"Analizando {len(assets)} activos sobre {tf} (OU cap={ou_cap:,} barras)...")
    print(f"{'ASSET':10s} {'BARS':>9s} {'ADX':>5s} {'EFF':>5s} {'HURST':>6s} {'ATR%':>6s} {'HL':>8s} {'KURT':>6s} {'PERS':>6s} {'RSI_e':>6s} {'VWAPR':>6s} {'SR_b':>5s}")

    results: dict[str, dict] = {}
    for a in assets:
        df = load_csv(a, tf)
        if df is None or len(df) < 1000:
            continue
        c = df["Close"]
        rsi_metrics = rsi_reversal_edge(df)
        metrics = {
            bars_key: len(df),
            "from": str(df.index[0].date()),
            "to": str(df.index[-1].date()),
            "adx_mean": round(adx(df), 2),
            "trend_efficiency_200": round(trend_efficiency(c, 200), 4),
            "hurst": round(hurst(c), 3),
            "autocorr_lag1": round(autocorr_lag1(c), 4),
            "atr_pct_mean": round(atr_pct_mean(df), 4),
            "vol_of_vol": round(vol_of_vol(df), 3),
            hl_key: round(ou_half_life_bars(c, cap=ou_cap), 1),
            "kurtosis": round(kurtosis_returns(c), 2),
            "pct_above_sma200": round(pct_above_sma(c, 200), 3),
            "sma200_persistence_bars": round(sma_persistence(c, 200), 1),
            "vwap_rejection_rate": round(vwap_rejection_rate(df, look=vwap_look), 3),
            "round_bounce_rate": round(round_number_bounce_rate(df), 3),
            **rsi_metrics,
        }
        results[a] = metrics
        print(
            f"{a:10s} {len(df):>9,} "
            f"{metrics['adx_mean']:>5.1f} "
            f"{metrics['trend_efficiency_200']:>5.2f} "
            f"{metrics['hurst']:>6.3f} "
            f"{metrics['atr_pct_mean']:>6.3f} "
            f"{metrics[hl_key]:>8.0f} "
            f"{metrics['kurtosis']:>6.1f} "
            f"{metrics['sma200_persistence_bars']:>6.1f} "
            f"{metrics['rsi_edge_in_atrs']:>+6.2f} "
            f"{metrics['vwap_rejection_rate']:>6.2f} "
            f"{metrics['round_bounce_rate']:>5.2f}"
        )

    # ── Rankings por categoría ──
    df = pd.DataFrame(results).T
    print("\n=== TOP 5 / BOTTOM 5 por categoría ===\n")

    rankings = {
        "TENDENCIA (ADX mean — alto = trendier)":      ("adx_mean", False),
        "TENDENCIA (Trend Efficiency 200)":            ("trend_efficiency_200", False),
        "RÉGIMEN (Hurst — lejos de 0.5 = persistente)":("hurst_dist", False),
        "RÉGIMEN (SMA200 persistence — alto)":         ("sma200_persistence_bars", False),
        "MOMENTUM REVERSAL (autocorr lag1 — negativo)":("autocorr_lag1", True),
        "VOLATILIDAD (ATR% — alto)":                   ("atr_pct_mean", False),
        "VOLATILIDAD (Vol of vol — alto)":             ("vol_of_vol", False),
        f"ESTADÍSTICO (OU half-life {tf} — bajo = reverte)": (hl_key, True),
        "ESTADÍSTICO (Kurtosis — alta = colas)":       ("kurtosis", False),
    }
    df["hurst_dist"] = (df["hurst"] - 0.5).abs()

    for title, (col, asc) in rankings.items():
        s = df[col].sort_values(ascending=asc)
        print(f"\n{title}")
        for i, (a, v) in enumerate(s.head(5).items(), 1):
            print(f"  TOP{i}    {a:10s} {v:.3f}")
        for i, (a, v) in enumerate(s.tail(5).items(), 1):
            print(f"  BOT{6-i} {a:10s} {v:.3f}")

    # ── Subtype + ratings editoriales ──
    eds = extract_dashboard_ratings()
    if eds:
        print(f"\n\nRatings editoriales extraídos para {len(eds)} activos.")
        for a, info in eds.items():
            if a in results:
                results[a]["type"] = info["type"]
                results[a]["subtype"] = info["subtype"]
                results[a]["editorial_ratings"] = info["ratings"]

    # Guardar JSON
    out_path.write_text(json.dumps(results, indent=2))
    print(f"\nGuardado: {out_path}  ({out_path.stat().st_size:,} bytes)")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--tf", default="H1", choices=["M5", "M15", "M30", "H1", "H4", "D1"],
                   help="Timeframe a analizar (default: H1)")
    p.add_argument("--out", help="Path output JSON (default: asset_metrics[_TF].json)")
    args = p.parse_args()
    main(tf=args.tf, out_path=Path(args.out) if args.out else None)
