"""
api/server.py — REST API local para SQX Edge Tool.

Lanza Flask en localhost:5050 con CORS abierto (development mode).
El dashboard SQX Edge consume estos endpoints desde el navegador.

Endpoints:
  GET  /api/health            -> {ok: true, version, sqx_path_set}
  GET  /api/config            -> config.json actual
  POST /api/config            -> actualiza config.json (path SQX, output_dir, etc.)
  GET  /api/minings           -> lista de los 14 minings del plan
  GET  /api/templates         -> lista de .cfx en templates/
  POST /api/generate          -> body: {mining: int, capa: 1|2, output?: str} -> genera 1 .cfx
  POST /api/generate-all      -> body: {capa: 1|2} -> genera los 14
  GET  /api/output            -> lista de .cfx en output_dir
  POST /api/open-folder       -> body: {path} -> abre carpeta en Explorer
"""
from __future__ import annotations

import json
import os
import sys
import subprocess
from pathlib import Path

# Permitir ejecución directa o vía -m
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from flask import Flask, jsonify, request, abort, send_from_directory, redirect  # type: ignore

from core import all_minings, generate_project, get_mining
from core.project_generator import resolve_costs
from core.sqx_db import SqxDb
from core.strategy_cleaner import (
    extract_metadata, list_sqx_directory, clean_exit_after_bars,
    institutional_name, rename_sqx, process_files,
)

app = Flask(__name__)

VERSION = "0.4.0"
CONFIG_PATH = ROOT / "config.json"

# Dashboard estático: carpeta padre del módulo sqx-edge-tool/
DASHBOARD_ROOT = ROOT.parent


# ── CORS manual (zero deps) ───────────────────────────────────────
@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


# Flask responde OPTIONS automáticamente para rutas con GET/POST registrados,
# combinado con el @app.after_request de arriba, eso es suficiente para CORS preflight.


# ── Config helpers ────────────────────────────────────────────────
def load_config() -> dict:
    if not CONFIG_PATH.exists():
        return {}
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_config(cfg: dict) -> None:
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2), encoding="utf-8")


def resolve_template(cfg: dict, capa: int) -> str:
    key = f"template_capa{capa}"
    val = cfg.get(key) or ("templates/Capa1_Long.cfx" if capa == 1 else "templates/Capa2_Base.cfx")
    if not os.path.isabs(val):
        val = str(ROOT / val)
    return val


def resolve_output_dir(cfg: dict) -> str:
    val = cfg.get("output_dir") or "output"
    if not os.path.isabs(val):
        val = str(ROOT / val)
    os.makedirs(val, exist_ok=True)
    return val


# ── Endpoints ─────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    cfg = load_config()
    db_path = cfg.get("sqx_data_db", "")
    return jsonify({
        "ok": True,
        "version": VERSION,
        "sqx_path_set": bool(cfg.get("sqx_path")),
        "sqx_path": cfg.get("sqx_path", ""),
        "data_db_set": bool(db_path),
        "data_db_exists": bool(db_path) and os.path.isfile(db_path),
        "templates_capa1_exists": os.path.isfile(resolve_template(cfg, 1)),
        "templates_capa2_exists": os.path.isfile(resolve_template(cfg, 2)),
    })


@app.get("/api/symbol-info/<asset>")
def symbol_info(asset: str):
    cfg = load_config()
    db_path = cfg.get("sqx_data_db", "")
    if not db_path or not os.path.isfile(db_path):
        return jsonify({"ok": False, "error": "data.db not configured or missing", "asset": asset}), 404
    try:
        db = SqxDb(db_path)
        try:
            info = db.get_symbol_info(asset, alias_override=cfg.get("asset_aliases"))
            return jsonify({"ok": True, "info": info})
        finally:
            db.close()
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.get("/api/suggest-instruments/<asset>")
def suggest_instruments(asset: str):
    cfg = load_config()
    db_path = cfg.get("sqx_data_db", "")
    if not db_path or not os.path.isfile(db_path):
        return jsonify({"ok": False, "error": "data.db not configured", "suggestions": []}), 404
    try:
        db = SqxDb(db_path)
        try:
            suggestions = db.suggest_instruments(asset)
            current = (cfg.get("asset_aliases") or {}).get(asset, "")
            return jsonify({"ok": True, "asset": asset, "current_alias": current, "suggestions": suggestions[:15]})
        finally:
            db.close()
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.get("/api/autodetect-sqx")
def autodetect_sqx():
    """
    Busca instalaciones de StrategyQuant X en ubicaciones típicas.
    Devuelve lista de paths candidatos donde se encontró user/data/data.db.
    """
    candidates = []
    home = Path.home()
    search_roots = [
        Path("C:/StrategyQuantX"),
        Path("D:/StrategyQuantX"),
        Path("C:/Program Files/StrategyQuantX"),
        Path("C:/Program Files (x86)/StrategyQuantX"),
        home / "StrategyQuantX",
        home / "Documents" / "StrategyQuantX",
        Path("C:/SQX"), Path("D:/SQX"), Path("E:/SQX"),
    ]
    # Cracks y custom paths
    for letter in "CDEFGH":
        for v in ("SQX_142", "SQX_141", "SQX_140"):
            p = Path(f"{letter}:/{v}")
            if p.exists():
                # buscar subcarpetas con SQX
                for sub in p.rglob("StrategyQuantX*.exe"):
                    search_roots.append(sub.parent)
    # Dedupe + buscar data.db
    seen = set()
    for root in search_roots:
        if not root.exists() or str(root).lower() in seen:
            continue
        seen.add(str(root).lower())
        db = root / "user" / "data" / "data.db"
        if db.is_file():
            sqx_exe = root / "StrategyQuantX.exe"
            candidates.append({
                "sqx_path": str(root).replace("\\", "/"),
                "data_db": str(db).replace("\\", "/"),
                "projects_dir": str(root / "user" / "projects").replace("\\", "/"),
                "version": "142" if "142" in str(root) else ("141" if "141" in str(root) else "?"),
                "has_exe": sqx_exe.is_file(),
            })
    return jsonify({"ok": True, "found": len(candidates), "candidates": candidates})


@app.post("/api/validate-sqx-path")
def validate_sqx_path():
    """Verifica que un path SQX dado es válido (tiene data.db y projects/)."""
    data = request.get_json(silent=True) or {}
    path = (data.get("path") or "").strip().rstrip("/\\")
    if not path:
        return jsonify({"ok": False, "error": "missing path"}), 400
    base = Path(path)
    db = base / "user" / "data" / "data.db"
    proj = base / "user" / "projects"
    exe = base / "StrategyQuantX.exe"
    return jsonify({
        "ok": True,
        "valid": db.is_file(),
        "checks": {
            "base_exists": base.is_dir(),
            "data_db_exists": db.is_file(),
            "projects_exists": proj.is_dir(),
            "exe_exists": exe.is_file(),
        },
        "resolved": {
            "sqx_path": str(base).replace("\\", "/") if base.is_dir() else None,
            "data_db": str(db).replace("\\", "/") if db.is_file() else None,
            "projects_dir": str(proj).replace("\\", "/") if proj.is_dir() else None,
        }
    })


@app.get("/api/instruments")
def list_instruments():
    cfg = load_config()
    db_path = cfg.get("sqx_data_db", "")
    if not db_path or not os.path.isfile(db_path):
        return jsonify({"ok": False, "error": "data.db not configured", "instruments": []}), 404
    try:
        db = SqxDb(db_path)
        try:
            return jsonify({"ok": True, "instruments": db.list_instruments(), "brokers": db.brokers()})
        finally:
            db.close()
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.get("/api/config")
def get_config():
    return jsonify(load_config())


@app.post("/api/config")
def update_config():
    data = request.get_json(silent=True) or {}
    cfg = load_config()
    # whitelist de claves editables
    allowed = {"sqx_path", "sqx_data_db", "sqx_projects_dir",
               "template_capa1", "template_capa2", "output_dir", "darwinex_suffix",
               "asset_aliases"}
    changes = {k: v for k, v in data.items() if k in allowed}
    cfg.update(changes)
    save_config(cfg)
    return jsonify({"ok": True, "updated_keys": list(changes.keys()), "config": cfg})


@app.get("/api/minings")
def minings():
    return jsonify([
        {
            "num": m.num, "phase": m.phase, "asset": m.asset, "asset_type": m.asset_type,
            "tf": m.tf, "bs": m.bs, "dir": m.dir, "name": m.name,
            "sqx_config": m.sqx_config,
        }
        for m in all_minings()
    ])


@app.get("/api/templates")
def templates():
    tdir = ROOT / "templates"
    if not tdir.exists():
        return jsonify([])
    items = []
    for f in sorted(tdir.glob("*.cfx")):
        items.append({
            "name": f.name,
            "path": str(f),
            "size_kb": round(f.stat().st_size / 1024, 1),
            "mtime": f.stat().st_mtime,
        })
    return jsonify(items)


@app.get("/api/output")
def list_output():
    cfg = load_config()
    out_dir = Path(resolve_output_dir(cfg))
    items = []
    for f in sorted(out_dir.glob("*.cfx"), key=lambda p: p.stat().st_mtime, reverse=True):
        items.append({
            "name": f.name,
            "path": str(f),
            "size_kb": round(f.stat().st_size / 1024, 1),
            "mtime": f.stat().st_mtime,
        })
    return jsonify({"output_dir": str(out_dir), "files": items})


@app.post("/api/generate")
def generate_one():
    data = request.get_json(silent=True) or {}
    if "mining" not in data:
        return jsonify({"ok": False, "error": "missing 'mining'"}), 400
    capa = int(data.get("capa", 1))
    if capa not in (1, 2):
        return jsonify({"ok": False, "error": "capa must be 1 or 2"}), 400

    cfg = load_config()
    template = data.get("template") or resolve_template(cfg, capa)
    output = data.get("output") or resolve_output_dir(cfg)

    try:
        mining = get_mining(int(data["mining"]))
    except KeyError as e:
        return jsonify({"ok": False, "error": str(e)}), 404

    if not os.path.isfile(template):
        return jsonify({"ok": False, "error": f"template not found: {template}"}), 404

    db_path = cfg.get("sqx_data_db") or None
    postfix = cfg.get("darwinex_suffix") or "_darwinex"
    aliases = cfg.get("asset_aliases") or {}
    try:
        out_path = generate_project(
            mining, template_path=template, output_dir=output, capa=capa,
            sqx_db_path=db_path, broker_postfix=postfix, alias_override=aliases,
        )
        # Mostrar al cliente qué fuente de costos se usó
        costs = resolve_costs(mining, db_path, postfix, alias_override=aliases)
        return jsonify({
            "ok": True, "mining": mining.num, "capa": capa,
            "output_path": out_path, "filename": os.path.basename(out_path),
            "costs_source": costs["source"], "symbol": costs["symbol"],
            "spread": costs["spread"], "swap_long": costs["swap_long"], "swap_short": costs["swap_short"],
        })
    except Exception as e:
        return jsonify({"ok": False, "error": f"{type(e).__name__}: {e}"}), 500


@app.post("/api/generate-all")
def generate_all():
    data = request.get_json(silent=True) or {}
    capa = int(data.get("capa", 1))
    if capa not in (1, 2):
        return jsonify({"ok": False, "error": "capa must be 1 or 2"}), 400

    cfg = load_config()
    template = data.get("template") or resolve_template(cfg, capa)
    output = data.get("output") or resolve_output_dir(cfg)

    if not os.path.isfile(template):
        return jsonify({"ok": False, "error": f"template not found: {template}"}), 404

    db_path = cfg.get("sqx_data_db") or None
    postfix = cfg.get("darwinex_suffix") or "_darwinex"
    aliases = cfg.get("asset_aliases") or {}
    results = []
    for m in all_minings():
        try:
            out_path = generate_project(
                m, template_path=template, output_dir=output, capa=capa,
                sqx_db_path=db_path, broker_postfix=postfix, alias_override=aliases,
            )
            costs = resolve_costs(m, db_path, postfix, alias_override=aliases)
            results.append({
                "mining": m.num, "ok": True,
                "filename": os.path.basename(out_path),
                "costs_source": costs["source"],
            })
        except Exception as e:
            results.append({"mining": m.num, "ok": False, "error": str(e)})

    ok = sum(1 for r in results if r["ok"])
    return jsonify({"ok": ok == len(results), "ok_count": ok, "fail_count": len(results) - ok, "results": results})


@app.post("/api/sqx-list")
def sqx_list():
    """Lista .sqx en una carpeta con metadata extraída.
    body: {dir: str, recursive: bool=true}
    """
    data = request.get_json(silent=True) or {}
    directory = (data.get("dir") or "").strip()
    recursive = data.get("recursive", True)
    if not directory or not os.path.isdir(directory):
        return jsonify({"ok": False, "error": "invalid dir", "files": []}), 400
    files = list_sqx_directory(directory, recursive=recursive)
    return jsonify({"ok": True, "dir": directory, "count": len(files),
                    "files": [f.to_dict() for f in files]})


@app.post("/api/sqx-clean")
def sqx_clean():
    """Procesa selección de .sqx con opciones.
    body: {files: [path,...], options: {remove_exit_bars, rename_institutional, rename_pattern}}
    """
    data = request.get_json(silent=True) or {}
    files = data.get("files") or []
    options = data.get("options") or {}
    if not files:
        return jsonify({"ok": False, "error": "no files"}), 400
    # Validar paths
    valid = [p for p in files if isinstance(p, str) and os.path.isfile(p) and p.lower().endswith(".sqx")]
    if not valid:
        return jsonify({"ok": False, "error": "no valid .sqx in selection"}), 400
    results = process_files(valid, options)
    ok = sum(1 for r in results if r["ok"])
    return jsonify({"ok": ok == len(results), "ok_count": ok, "fail_count": len(results) - ok,
                    "results": results})


@app.post("/api/sqx-preview-rename")
def sqx_preview_rename():
    """Preview de nombres institucionales para una lista de .sqx.
    body: {files: [path,...], pattern: '{asset}_{tf}_{dir}_{id}'}
    """
    data = request.get_json(silent=True) or {}
    files = data.get("files") or []
    pattern = data.get("pattern") or "{asset}_{tf}_{dir}_{id}"
    out = []
    for p in files:
        if not (isinstance(p, str) and os.path.isfile(p)):
            continue
        try:
            m = extract_metadata(p)
            new_name = institutional_name(m, pattern)
            out.append({"path": p, "current": m.name, "new_name": new_name + ".sqx",
                        "asset": m.asset, "tf": m.timeframe, "dir": m.direction})
        except Exception as e:
            out.append({"path": p, "error": str(e)})
    return jsonify({"ok": True, "previews": out})


@app.post("/api/open-folder")
def open_folder():
    """Abre una carpeta en Windows Explorer."""
    data = request.get_json(silent=True) or {}
    path = data.get("path", "")
    if not path or not os.path.isdir(path):
        return jsonify({"ok": False, "error": "invalid path"}), 400
    try:
        subprocess.Popen(["explorer", os.path.abspath(path)])
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ── State backup endpoints ────────────────────────────────────────
# Backup automático del localStorage del dashboard a disco (para no perder
# tracking si se vacía el browser). Carpeta: analysis_output/state_backup_*.json
import datetime as _dt

BACKUP_DIR = DASHBOARD_ROOT / "analysis_output"
BACKUP_RETENTION = 30  # mantener máximo N backups (rotación FIFO)


def _list_state_backups() -> list[dict]:
    if not BACKUP_DIR.exists():
        return []
    files = sorted(BACKUP_DIR.glob("state_backup_*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    return [{"name": p.name, "size_kb": round(p.stat().st_size / 1024, 1),
             "mtime": int(p.stat().st_mtime)} for p in files]


def _rotate_state_backups() -> int:
    """Borra backups viejos (>= BACKUP_RETENTION). Devuelve cuántos borró."""
    files = sorted(BACKUP_DIR.glob("state_backup_*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    if len(files) <= BACKUP_RETENTION:
        return 0
    to_delete = files[BACKUP_RETENTION:]
    for p in to_delete:
        try: p.unlink()
        except OSError: pass
    return len(to_delete)


@app.route("/api/state/backup", methods=["POST"])
def api_state_backup():
    """Recibe el state completo del dashboard y lo guarda timestamped.
    Body: {priority_progress, pipeline_state, strategies_user, plan_user}
    """
    try:
        body = request.get_json(force=True) or {}
        if not isinstance(body, dict):
            return jsonify({"ok": False, "error": "body debe ser dict"}), 400
        BACKUP_DIR.mkdir(exist_ok=True)
        ts = _dt.datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
        out = BACKUP_DIR / f"state_backup_{ts}.json"
        # Wrapper con metadata
        payload = {
            "_meta": {"created_at": _dt.datetime.now().isoformat(timespec="seconds"),
                      "version": VERSION, "keys": sorted(body.keys())},
            "data": body,
        }
        out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        rotated = _rotate_state_backups()
        return jsonify({"ok": True, "filename": out.name, "size_kb": round(out.stat().st_size / 1024, 1),
                        "rotated": rotated})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/state/backups", methods=["GET"])
def api_state_backups():
    """Lista backups disponibles (más reciente primero)."""
    return jsonify({"ok": True, "backups": _list_state_backups()})


@app.route("/api/state/restore/<path:filename>", methods=["GET"])
def api_state_restore(filename: str):
    """Devuelve el contenido de un backup concreto para restaurar en el browser."""
    if not filename.startswith("state_backup_") or not filename.endswith(".json"):
        abort(404)
    p = BACKUP_DIR / filename
    if not p.exists() or not p.is_file():
        abort(404)
    # Validar que el path no escape de BACKUP_DIR
    try:
        p.resolve().relative_to(BACKUP_DIR.resolve())
    except ValueError:
        abort(403)
    return jsonify({"ok": True, "filename": filename,
                    "payload": json.loads(p.read_text(encoding="utf-8"))})


# ── Static dashboard server ───────────────────────────────────────
# Sirve el HTML, JS, CSS y los JSON de analysis_output/ desde la carpeta padre,
# eliminando la necesidad de abrir el HTML como file:// (CORS-friendly para fetch).
_STATIC_OK_DIRS = {"js", "css", "analysis_output", "csv_for_sqx"}


@app.route("/")
def _root_redirect():
    return redirect("/SQX_Dashboard_v6.html", code=302)


@app.route("/<path:filename>")
def _serve_static(filename: str):
    # Bloquea acceso fuera de DASHBOARD_ROOT y a directorios sensibles
    safe = (DASHBOARD_ROOT / filename).resolve()
    try:
        safe.relative_to(DASHBOARD_ROOT.resolve())
    except ValueError:
        abort(403)
    # Permitir solo HTML/MD root + carpetas whitelisted
    parts = Path(filename).parts
    if len(parts) == 1:
        if not (filename.endswith(".html") or filename.endswith(".md")):
            abort(404)
    elif parts[0] not in _STATIC_OK_DIRS:
        abort(404)
    if not safe.exists() or not safe.is_file():
        abort(404)
    return send_from_directory(DASHBOARD_ROOT, filename)


# ── Entrypoint ────────────────────────────────────────────────────
def main(host: str = "127.0.0.1", port: int = 5050) -> None:
    print(f"\n[SQX Edge Tool] API server starting...")
    print(f"  URL: http://{host}:{port}")
    print(f"  Project root: {ROOT}")
    print(f"  Dashboard root: {DASHBOARD_ROOT}")
    print(f"  Templates: {ROOT / 'templates'}")
    print(f"  Output: {resolve_output_dir(load_config())}")
    print(f"\n  Dashboard:    http://{host}:{port}/SQX_Dashboard_v6.html")
    print(f"  Health check: http://{host}:{port}/api/health")
    print(f"  Press Ctrl+C to stop\n")
    app.run(host=host, port=port, debug=False, threaded=True)


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=5050)
    args = p.parse_args()
    main(args.host, args.port)
