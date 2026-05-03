"""
plan_recommender.py — Reconstruye el plan de minings priorizando data-driven multi-TF.

Algoritmo:
  1. Lee TODAS las (asset, cat, tf) del dashboard editorial (js/data.js)
  2. Resuelve composite percentile en el TF más bajo disponible (lógica modo Auto)
  3. Excluye casos con data parcial (USDJPY post-2018) y categorías sin métrica fiable
  4. Aplica reglas de diversificación + edge mínimo
  5. Devuelve plan recomendado vs plan actual con análisis de diferencias
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).parent
ANALYSIS_DIR = ROOT / "analysis_output"

# Cargar todos los scores
SCORES = {
    "H4":  json.loads((ANALYSIS_DIR / "dashboard_scores_H4.json").read_text(encoding="utf-8")),
    "H1":  json.loads((ANALYSIS_DIR / "dashboard_scores.json").read_text(encoding="utf-8")),
    "M30": json.loads((ANALYSIS_DIR / "dashboard_scores_M30.json").read_text(encoding="utf-8")),
    "M15": json.loads((ANALYSIS_DIR / "dashboard_scores_M15.json").read_text(encoding="utf-8")),
    "M5":  json.loads((ANALYSIS_DIR / "dashboard_scores_M5.json").read_text(encoding="utf-8")),
}

TF_ORDER = ["M5", "M15", "M30", "H1", "H4"]

CAT_TO_BS = {
    "tendencia":   "BS_Tendencia",
    "momentum":    "BS_Momentum",
    "volatilidad": "BS_Volatilidad",
    "regimen":     "BS_Regimen",
    "volumen":     "BS_Volumen",
    "sr":          "BS_SoporteResistencia",
    "estadistico": "BS_Estadistico",
}

# Activos con data parcial / no fiable (excluir o marcar warning)
DATA_PARTIAL = {
    "USDJPY": "Solo data desde 2018 — composites M30/M15/M5 inflados artificialmente",
}

# Plan actual (de core/plan.py del SQX Edge Tool)
CURRENT_PLAN = [
    (1,  "XAUUSD", "H1",  "BS_Tendencia",  "L"),
    (2,  "XAUUSD", "H4",  "BS_Tendencia",  "L"),
    (3,  "XAUUSD", "M30", "BS_Tendencia",  "L"),
    (4,  "EURUSD", "H1",  "BS_Tendencia",  "L/S"),
    (5,  "EURUSD", "H4",  "BS_Tendencia",  "L/S"),
    (6,  "EURUSD", "M30", "BS_Momentum",   "L/S"),
    (7,  "USTEC",  "H1",  "BS_Tendencia",  "L"),
    (8,  "USTEC",  "H1",  "BS_Momentum",   "L"),
    (9,  "USTEC",  "M30", "BS_Momentum",   "L"),
    (10, "GBPUSD", "H1",  "BS_Volatilidad","L/S"),
    (11, "GBPJPY", "H1",  "BS_Volatilidad","L/S"),
    (12, "EURGBP", "H4",  "BS_Regimen",    "L/S"),
    (13, "AUDNZD", "H4",  "BS_Regimen",    "L/S"),
    (14, "EURGBP", "H1",  "BS_Estadistico","L/S"),
]


def parse_assets_from_js() -> dict:
    """Extrae ASSETS del js/data.js."""
    text = (ROOT / "js" / "data.js").read_text(encoding="utf-8")
    m = re.search(r"const ASSETS\s*=\s*\[(.*?)\n\];", text, re.DOTALL)
    if not m:
        return {}
    block = m.group(1)
    out = {}
    asset_re = re.compile(r"id:\s*'([^']+)',\s*type:\s*'([^']+)',\s*sub:\s*'([^']+)',\s*cats:\s*\{(.*?)\}\}", re.DOTALL)
    cat_re = re.compile(r"(\w+)\s*:\s*\{[^{}]*?dir:\s*'([^']+)'[^{}]*?tf:\s*'([^']+)'[^{}]*?rating:\s*'([^']+)'", re.DOTALL)
    for am in asset_re.finditer(block):
        aid, atype, asub, cats_block = am.groups()
        cats = []
        for cm in cat_re.finditer(cats_block):
            cat_key, dir_, tf, rating = cm.groups()
            cats.append({"cat_key": cat_key, "dir": dir_, "tf": tf, "rating": rating})
        out[aid] = {"type": atype, "subtype": asub, "cats": cats}
    return out


def lowest_available_tf(tf_str: str) -> str:
    """Devuelve el TF más bajo disponible del rango editorial."""
    tfs_in = [t.strip().upper() for t in tf_str.split(",")]
    for tf in TF_ORDER:
        if tf in tfs_in and tf in SCORES:
            return tf
    return "H1"


def get_composite(asset: str, cat: str, tf: str) -> float | None:
    base = cat[:-2] if cat.endswith("_S") else cat
    a = SCORES.get(tf, {}).get(asset)
    if not a:
        return None
    e = a.get(base, {})
    return e.get("composite_score")


def build_candidates() -> list[dict]:
    """Construye lista de TODAS las (asset, cat, tf, dir) con composite resuelto."""
    assets = parse_assets_from_js()
    candidates = []
    for aid, info in assets.items():
        for c in info["cats"]:
            cat_base = c["cat_key"][:-2] if c["cat_key"].endswith("_S") else c["cat_key"]
            tfs_in = [t.strip().upper() for t in c["tf"].split(",")]
            # Una entry por TF (no por (asset, cat) combinado)
            for tf in tfs_in:
                if tf not in SCORES:
                    continue  # TF no procesado
                comp = get_composite(aid, cat_base, tf)
                if comp is None:
                    continue
                candidates.append({
                    "asset": aid,
                    "type": info["type"],
                    "subtype": info["subtype"],
                    "cat": cat_base,
                    "bs": CAT_TO_BS[cat_base],
                    "tf": tf,
                    "dir": c["dir"],
                    "composite": round(comp * 100, 1),
                    "editorial_rating": c["rating"],
                    "data_warn": DATA_PARTIAL.get(aid),
                })
    return candidates


def normalize_dir(d: str) -> str:
    """L/S → L+S, L → L, S → S."""
    if d in ("L/S", "L+S", "BOTH", "both"):
        return "L+S"
    return d


def is_excluded_by_macro(c: dict) -> str | None:
    """Reglas de exclusión por contexto macro/editorial. Devuelve razón si excluido."""
    # 1) Short tendencial en índices/oro: contradice bias alcista estructural
    if c["cat"] == "tendencia" and c["dir"] == "S" and c["type"] in ("index", "oro"):
        return "short tendencial en índice/oro contradice bias alcista"
    # 2) Long-only en oro/índices para tendencia (lo que ya tenía el editorial)
    # Long short en oro y índices solo válido para momentum_S/volatilidad_S/etc.
    return None


def recommend_plan(candidates: list[dict], n: int = 14,
                   min_composite: float = 60.0,
                   max_per_asset: int = 2,
                   max_per_asset_cat: int = 1,  # NUEVO: max 1 por (asset, cat) — fuerza diversidad real
                   max_per_cat: int = 4,
                   max_per_subtype: int = 5,
                   include_warn: bool = False,
                   apply_macro_filter: bool = True) -> list[dict]:
    """
    Selecciona TOP n con reglas de diversificación + filtros macro.
    - Solo composite >= min_composite (60%)
    - Excluye activos con data partial salvo include_warn=True
    - max_per_asset=2 (forzar mínimo ~7 activos diferentes)
    - max_per_cat=4 (mínimo 4 categorías representadas)
    - max_per_subtype=5 (no concentrar en Index/Forex/Oro)
    - apply_macro_filter: excluye combinaciones contraintuitivas (short tendencial índices, etc.)
    """
    pool = sorted(candidates, key=lambda x: -x["composite"])
    selected = []
    cnt_asset = defaultdict(int)
    cnt_asset_cat = defaultdict(int)  # nuevo
    cnt_cat = defaultdict(int)
    cnt_subtype = defaultdict(int)
    seen_keys = set()
    excluded_macro = []

    for c in pool:
        if c["composite"] < min_composite:
            continue
        if c["data_warn"] and not include_warn:
            continue
        if apply_macro_filter:
            reason = is_excluded_by_macro(c)
            if reason:
                excluded_macro.append((c, reason))
                continue
        key = (c["asset"], c["cat"], c["tf"], c["dir"])
        if key in seen_keys:
            continue
        if cnt_asset[c["asset"]] >= max_per_asset:
            continue
        if cnt_asset_cat[(c["asset"], c["cat"])] >= max_per_asset_cat:
            continue
        if cnt_cat[c["cat"]] >= max_per_cat:
            continue
        if cnt_subtype[c["subtype"]] >= max_per_subtype:
            continue
        seen_keys.add(key)
        cnt_asset[c["asset"]] += 1
        cnt_asset_cat[(c["asset"], c["cat"])] += 1
        cnt_cat[c["cat"]] += 1
        cnt_subtype[c["subtype"]] += 1
        selected.append(c)
        if len(selected) >= n:
            break

    # Imprimir top 5 excluidos por macro filter (para transparencia)
    if excluded_macro and len(selected) < n:
        print(f"\n[Excluidos por filtro macro: {len(excluded_macro)}, top 5]")
        for c, reason in excluded_macro[:5]:
            print(f"  - {c['asset']}/{c['tf']}/{c['bs']}/{c['dir']} ({c['composite']}%) — {reason}")

    return selected


def annotate_current_plan(candidates: list[dict]) -> list[dict]:
    """Para cada mining del plan actual, busca su composite."""
    by_key = {(c["asset"], c["cat"], c["tf"], normalize_dir(c["dir"])): c for c in candidates}
    annotated = []
    for num, asset, tf, bs, dir_ in CURRENT_PLAN:
        # invertir BS → cat
        cat = next((k for k, v in CAT_TO_BS.items() if v == bs), bs)
        norm_dir = normalize_dir(dir_)
        c = by_key.get((asset, cat, tf, norm_dir))
        annotated.append({
            "num": num, "asset": asset, "tf": tf, "bs": bs, "dir": dir_,
            "composite": c["composite"] if c else None,
            "found": c is not None,
            "warn": c["data_warn"] if c else None,
        })
    return annotated


def main():
    candidates = build_candidates()
    print(f"Total candidatos cross-TF: {len(candidates)}")
    print()

    # Plan actual con composites
    print("=" * 95)
    print("PLAN ACTUAL (14 minings) — annotated con composite del TF correspondiente")
    print("=" * 95)
    print(f"{'#':>3} {'Asset':<8} {'TF':<5} {'BS':<22} {'Dir':<5} {'Composite':>10} {'Veredicto':<25}")
    print("-" * 95)
    annotated = annotate_current_plan(candidates)
    for a in annotated:
        comp = a["composite"]
        if comp is None:
            verdict = "[!] NO match en data"
            comp_str = "—"
        elif comp >= 80:
            verdict = "[OK] MAXIMA"; comp_str = f"{comp}%"
        elif comp >= 60:
            verdict = "[OK] ALTA"; comp_str = f"{comp}%"
        elif comp >= 40:
            verdict = "[~] SECUNDARIA"; comp_str = f"{comp}%"
        else:
            verdict = "[X] BAJA — reemplazar"; comp_str = f"{comp}%"
        if a["warn"]:
            verdict += " (data partial)"
        print(f"{a['num']:>3} {a['asset']:<8} {a['tf']:<5} {a['bs']:<22} {a['dir']:<5} {comp_str:>10} {verdict:<25}")

    # Plan recomendado
    print()
    print("=" * 95)
    print("PLAN RECOMENDADO (TOP 14, data-driven, diversificado)")
    print("=" * 95)
    print(f"{'#':>3} {'Asset':<8} {'TF':<5} {'BS':<22} {'Dir':<5} {'Composite':>10} {'Subtype':<12}")
    print("-" * 95)
    rec = recommend_plan(candidates)
    for i, c in enumerate(rec, 1):
        print(f"{i:>3} {c['asset']:<8} {c['tf']:<5} {c['bs']:<22} {c['dir']:<5} {c['composite']:>9}% {c['subtype']:<12}")

    # Diff
    print()
    print("=" * 95)
    print("DIFERENCIAS plan actual vs recomendado")
    print("=" * 95)
    cur_keys = {(a["asset"], a["tf"], a["bs"], normalize_dir(a["dir"])) for a in annotated}
    rec_keys = {(c["asset"], c["tf"], c["bs"], normalize_dir(c["dir"])) for c in rec}

    keep = cur_keys & rec_keys
    drop = cur_keys - rec_keys
    add = rec_keys - cur_keys

    print(f"\nMantener ({len(keep)}):")
    for k in sorted(keep):
        print(f"  [OK] {k[0]}/{k[1]}/{k[2]}/{k[3]}")
    print(f"\nQuitar del plan actual ({len(drop)}):")
    for k in sorted(drop):
        a = next((x for x in annotated if (x["asset"], x["tf"], x["bs"], normalize_dir(x["dir"])) == k), None)
        comp = f"{a['composite']}%" if a and a["composite"] is not None else "—"
        print(f"  [X] {k[0]}/{k[1]}/{k[2]}/{k[3]}  (composite {comp})")
    print(f"\nAñadir nuevos del recomendado ({len(add)}):")
    for k in sorted(add):
        c = next((x for x in rec if (x["asset"], x["tf"], x["bs"], normalize_dir(x["dir"])) == k), None)
        comp = f"{c['composite']}%" if c else "—"
        print(f"  [+] {k[0]}/{k[1]}/{k[2]}/{k[3]}  (composite {comp})")


if __name__ == "__main__":
    main()
