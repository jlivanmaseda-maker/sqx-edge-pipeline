"""Asigna ratings objetivos (++/+/~/-) a cada activo×categoría usando las métricas
calculadas en asset_metrics[_TF].json y los compara con los ratings editoriales del dashboard.

Multi-TF: --tf {H1,M30,M15,M5}.
Output:
  dashboard_scores.json       — H1 (default, compat con código existente)
  dashboard_scores_<TF>.json  — otros TFs

El bloque <script id="scores-data[-TF]"> se inyecta en el HTML (un script por TF).
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).parent

RATING_ORDER = {"++": 3, "+": 2, "~": 1, "-": 0}
ORDER_RATING = {v: k for k, v in RATING_ORDER.items()}


def _ou_metric(tf: str) -> str:
    """Nombre dinámico de la métrica OU half-life según TF."""
    return f"ou_half_life_{tf.lower()}"


def category_metrics_for(tf: str) -> dict[str, list[tuple[str, bool, str]]]:
    """Definición de métricas por categoría, parametrizada por TF (usa ou_half_life dinámico).

    Volatilidad cambiada a `global` (era `subtype`) — el scope subtype inflaba
    artificialmente activos Minor/Exotic compitiendo solo entre ellos. Con `global`
    AUDCAD/USDMXN/etc. compiten contra TODOS y se ranquean realista.
    """
    return {
        "tendencia":   [("adx_mean", True, "global"),
                        ("trend_efficiency_200", True, "global"),
                        ("sma200_persistence_bars", True, "global")],
        "momentum":    [("rsi_edge_in_atrs", True, "global")],
        "volatilidad": [("atr_pct_mean", True, "global"),
                        ("vol_of_vol", True, "global")],
        "regimen":     [("sma200_persistence_bars", True, "global"),
                        ("hurst_dist", True, "global")],
        "estadistico": [(_ou_metric(tf), False, "global"),
                        ("kurtosis", True, "global")],
        "volumen":     [("vwap_rejection_rate", True, "global")],
        "sr":          [("round_bounce_rate", True, "global")],
    }


# Compat: variable global para scripts/tests que la importan
CATEGORY_METRICS = category_metrics_for("H1")


def consolidate_subtype(sub: str) -> str:
    """Agrupa los subtipos de índices en uno solo para tener grupos de tamaño razonable."""
    if sub in ("SP500", "Nasdaq", "DAX", "Dow Jones"):
        return "Index"
    return sub


def percentile_rank(series: pd.Series, ascending: bool = True) -> pd.Series:
    """Rank → percentil [0,1]. ascending=True: valor alto → percentil alto."""
    return series.rank(ascending=ascending, pct=True)


def score_to_rating(score: float) -> str:
    if score >= 0.75: return "++"
    if score >= 0.50: return "+"
    if score >= 0.25: return "~"
    return "-"


def main(tf: str = "H1", metrics_path: Path | None = None, out_path: Path | None = None) -> None:
    out_dir = ROOT / "analysis_output"
    out_dir.mkdir(exist_ok=True)
    if metrics_path is None:
        metrics_path = out_dir / ("asset_metrics.json" if tf == "H1" else f"asset_metrics_{tf}.json")
    if out_path is None:
        out_path = out_dir / ("dashboard_scores.json" if tf == "H1" else f"dashboard_scores_{tf}.json")
    if not metrics_path.exists():
        raise FileNotFoundError(f"{metrics_path} no existe — corre `python analyze_assets.py --tf {tf}` primero")

    print(f"Scoring TF={tf} · input={metrics_path.name} · output={out_path.name}")
    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    df = pd.DataFrame(metrics).T

    cat_metrics = category_metrics_for(tf)
    ou_col = _ou_metric(tf)
    numeric_cols = ["adx_mean", "trend_efficiency_200", "hurst", "autocorr_lag1",
                    "atr_pct_mean", "vol_of_vol", ou_col, "kurtosis",
                    "pct_above_sma200", "sma200_persistence_bars",
                    "rsi_edge_in_atrs", "rsi_combined_edge",
                    "vwap_rejection_rate", "round_bounce_rate"]
    for c in numeric_cols:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")

    df["hurst_dist"] = (df["hurst"] - 0.5).abs()
    df["subtype_group"] = df["subtype"].fillna("unknown").apply(consolidate_subtype)

    out: dict[str, dict] = {a: {"metrics": {}, "subtype": str(df.at[a, "subtype_group"])} for a in df.index}

    for cat, metric_list in cat_metrics.items():
        ranks: dict[str, pd.Series] = {}
        for m, higher_better, scope in metric_list:
            if m not in df.columns:
                continue
            if scope == "subtype":
                # Rank dentro de cada subtype_group
                grouped = df.groupby("subtype_group")[m]
                rank_series = grouped.rank(ascending=higher_better, pct=True)
                # Si grupo tiene <3 activos, fallback a rank global (no es discriminativo)
                small_groups = df["subtype_group"].value_counts()
                small_groups = small_groups[small_groups < 3].index.tolist()
                if small_groups:
                    mask = df["subtype_group"].isin(small_groups)
                    rank_series.loc[mask] = percentile_rank(df.loc[mask, m], ascending=higher_better)
                ranks[m] = rank_series
            else:
                ranks[m] = percentile_rank(df[m], ascending=higher_better)

        if not ranks:
            continue
        composite = pd.concat(ranks.values(), axis=1).mean(axis=1)

        for asset in df.index:
            comp = float(composite[asset]) if not pd.isna(composite[asset]) else None
            rating = score_to_rating(comp) if comp is not None else None
            ed = metrics.get(asset, {}).get("editorial_ratings", {})
            ed_L = ed.get(cat)
            ed_S = ed.get(cat + "_S")
            ed_best_v = max((RATING_ORDER[r] for r in [ed_L, ed_S] if r), default=None)
            diff = (RATING_ORDER[rating] - ed_best_v) if (rating and ed_best_v is not None) else None

            out[asset][cat] = {
                "editorial_L": ed_L,
                "editorial_S": ed_S,
                "objective": rating,
                "composite_score": round(comp, 3) if comp is not None else None,
                "diff_vs_best_editorial": diff,
                "scope": metric_list[0][2] if metric_list else "global",
            }
            metric_vals = {m: float(df.at[asset, m]) for m, _, _ in metric_list
                           if m in df.columns and not pd.isna(df.at[asset, m])}
            out[asset]["metrics"][cat] = {k: round(v, 4) for k, v in metric_vals.items()}

    # ── Imprimir tabla de discrepancias ──
    print("=" * 90)
    print(f"DISCREPANCIAS editorial vs data-driven (|diff| >= 1) · TF={tf}")
    print("=" * 90)
    print(f"{'ASSET':10s} {'CAT':12s} {'ED_L':5s} {'ED_S':5s} {'OBJ':4s} {'DIFF':>5s}  COMPOSITE")
    print("-" * 90)
    discrepancies = []
    for asset in sorted(out.keys()):
        for cat in cat_metrics.keys():
            entry = out[asset].get(cat)
            if not entry: continue
            d = entry.get("diff_vs_best_editorial")
            if d is not None and abs(d) >= 1:
                discrepancies.append((asset, cat, entry))
                arrow = "+" if d > 0 else "-"
                print(f"{asset:10s} {cat:12s} {entry['editorial_L'] or '-':5s} {entry['editorial_S'] or '-':5s} {entry['objective']:4s} {arrow}{abs(d):>3d}  {entry['composite_score']:.2f}")

    print(f"\nTotal discrepancias: {len(discrepancies)} de {sum(1 for a in out for c in cat_metrics if c in out[a])} celdas analizadas")

    # ── Estadísticas resumen ──
    print("\n=== RESUMEN POR CATEGORÍA ===")
    for cat in cat_metrics:
        vals = [out[a][cat] for a in out if cat in out[a] and out[a][cat].get("diff_vs_best_editorial") is not None]
        if not vals: continue
        diffs = [v["diff_vs_best_editorial"] for v in vals]
        agree = sum(1 for d in diffs if abs(d) == 0)
        up = sum(1 for d in diffs if d >= 1)
        down = sum(1 for d in diffs if d <= -1)
        print(f"  {cat:12s}  agreement={agree:2d}/{len(vals)}  data dice MEJOR={up:2d}  data dice PEOR={down:2d}")

    # Guardar
    out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False))
    print(f"\nGuardado: {out_path}")

    inject_into_html(out_path, tf=tf)


def inject_into_html(json_path: Path, tf: str = "H1") -> None:
    """Inyecta JSON en <script id='scores-data[-TF]'>. H1 mantiene el id legacy 'scores-data'.
    Para otros TF crea/actualiza un script id='scores-data-<TF>'."""
    targets = [
        json_path.parent / "SQX_Dashboard_v6.html",
        json_path.parent / "SQX_Activos_Dashboard_v5.html",
        json_path.parent / "SQX_Workflow_Dashboard.html",
    ]
    data = json_path.read_text(encoding="utf-8").strip()
    script_id = "scores-data" if tf == "H1" else f"scores-data-{tf}"
    pattern = r'(<script id="' + re.escape(script_id) + r'" type="application/json">)(.*?)(</script>)'

    for html_path in targets:
        if not html_path.exists():
            continue
        html = html_path.read_text(encoding="utf-8")
        new_html, n = re.subn(pattern, lambda m: m.group(1) + data + m.group(3), html, count=1, flags=re.DOTALL)
        if n == 0:
            # No existe el script ID → lo añadimos justo después del scores-data legacy (H1)
            insert_pattern = r'(<script id="scores-data" type="application/json">.*?</script>)'
            new_block = f'\n<script id="{script_id}" type="application/json">{data}</script>'
            new_html, n = re.subn(insert_pattern,
                                   lambda m: m.group(1) + new_block,
                                   html, count=1, flags=re.DOTALL)
            if n == 0:
                print(f"  WARN: no pude insertar {script_id} en {html_path.name}")
                continue
            print(f"  Insertado nuevo {script_id} en {html_path.name}")
        else:
            print(f"  Reemplazado {script_id} en {html_path.name}")
        html_path.write_text(new_html, encoding="utf-8")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--tf", default="H1", choices=["M5", "M15", "M30", "H1", "H4", "D1"])
    p.add_argument("--metrics", help="Path a asset_metrics[_TF].json (default: auto)")
    p.add_argument("--out", help="Path output JSON (default: dashboard_scores[_TF].json)")
    args = p.parse_args()
    main(
        tf=args.tf,
        metrics_path=Path(args.metrics) if args.metrics else None,
        out_path=Path(args.out) if args.out else None,
    )
