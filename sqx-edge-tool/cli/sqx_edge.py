"""
sqx_edge.py — CLI para SQX Edge Tool.

Comandos:
  list                                    Lista los 14 minings del plan
  generate --mining N [--template PATH]   Genera un .cfx para el mining N
  generate-all [--template PATH]          Genera los 14 .cfx de golpe
  info                                    Muestra config + paths

Uso típico:
  python -m cli.sqx_edge list
  python -m cli.sqx_edge generate --mining 2
  python -m cli.sqx_edge generate-all
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Optional

# Permitir ejecución directa o vía -m
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core import all_minings, generate_project, get_mining


def load_config() -> dict:
    cfg_path = ROOT / "config.json"
    if not cfg_path.exists():
        return {}
    try:
        return json.loads(cfg_path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"[warn] config.json invalid: {e}", file=sys.stderr)
        return {}


def cmd_list(args) -> int:
    print(f"{'#':>3}  {'Phase':>5}  {'Asset':<8}  {'TF':<4}  {'Blocksetting':<22}  Dir")
    print("-" * 60)
    for m in all_minings():
        print(f"{m.num:>3}  {m.phase:>5}  {m.asset:<8}  {m.tf:<4}  {m.bs:<22}  {m.dir}")
    return 0


def _resolve_template(cli_arg: Optional[str], cfg: dict, capa: int) -> str:
    if cli_arg:
        return cli_arg
    key = f"template_capa{capa}"
    cfg_val = cfg.get(key)
    if cfg_val:
        # Resolver paths relativos al ROOT
        if not os.path.isabs(cfg_val):
            cfg_val = str(ROOT / cfg_val)
        return cfg_val
    default = ROOT / "templates" / ("Capa1_Long.cfx" if capa == 1 else "Capa2_Base.cfx")
    return str(default)


def cmd_generate(args) -> int:
    cfg = load_config()
    template = _resolve_template(args.template, cfg, args.capa)
    output = args.output or cfg.get("output_dir") or str(ROOT / "output")
    if not os.path.isabs(output):
        output = str(ROOT / output)

    if not os.path.isfile(template):
        print(f"[error] template not found: {template}", file=sys.stderr)
        return 1

    try:
        mining = get_mining(args.mining)
    except KeyError as e:
        print(f"[error] {e}", file=sys.stderr)
        return 2

    print(f"Generating {mining.name} (Capa {args.capa}) from {os.path.basename(template)} -> {output}")
    out_path = generate_project(
        mining, template_path=template, output_dir=output, capa=args.capa,
        sqx_db_path=cfg.get("sqx_data_db"), broker_postfix=cfg.get("darwinex_suffix") or "_darwinex",
    )
    print(f"  [OK] {out_path}")
    return 0


def cmd_generate_all(args) -> int:
    cfg = load_config()
    template = _resolve_template(args.template, cfg, args.capa)
    output = args.output or cfg.get("output_dir") or str(ROOT / "output")
    if not os.path.isabs(output):
        output = str(ROOT / output)

    if not os.path.isfile(template):
        print(f"[error] template not found: {template}", file=sys.stderr)
        return 1

    print(f"Generating ALL minings (Capa {args.capa}) from {os.path.basename(template)} -> {output}\n")
    ok, fail = 0, 0
    for m in all_minings():
        try:
            out_path = generate_project(
                m, template_path=template, output_dir=output, capa=args.capa,
                sqx_db_path=cfg.get("sqx_data_db"), broker_postfix=cfg.get("darwinex_suffix") or "_darwinex",
            )
            print(f"  [OK] M{m.num:02d} {m.asset}/{m.tf}/{m.bs}/{m.dir} -> {os.path.basename(out_path)}")
            ok += 1
        except Exception as e:
            print(f"  [FAIL] M{m.num:02d} ERROR: {e}", file=sys.stderr)
            fail += 1
    print(f"\nDone: {ok} ok, {fail} failed.")
    return 0 if fail == 0 else 3


def cmd_info(args) -> int:
    cfg = load_config()
    print(f"SQX Edge Tool v0.1")
    print(f"  Project root: {ROOT}")
    print(f"  Config: {ROOT / 'config.json'} ({'present' if (ROOT / 'config.json').exists() else 'missing'})")
    print(f"  SQX path: {cfg.get('sqx_path', '(not set)')}")
    print(f"  Output dir: {cfg.get('output_dir', str(ROOT / 'output'))}")
    print(f"  Templates dir: {ROOT / 'templates'}")
    for tpl in (ROOT / "templates").glob("*.cfx"):
        print(f"    - {tpl.name}")
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="sqx-edge", description="SQX Edge Tool — Custom Project generator")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list", help="List 14 minings")

    g = sub.add_parser("generate", help="Generate one .cfx for a mining")
    g.add_argument("--mining", type=int, required=True, help="Mining number (1-14)")
    g.add_argument("--capa", type=int, choices=[1, 2], default=1, help="Capa 1 (default) o 2")
    g.add_argument("--template", help="Override template path (default: templates/Capa{N}_*.cfx)")
    g.add_argument("--output", help="Override output dir")

    a = sub.add_parser("generate-all", help="Generate .cfx for all 14 minings")
    a.add_argument("--capa", type=int, choices=[1, 2], default=1, help="Capa 1 (default) o 2")
    a.add_argument("--template", help="Override template path")
    a.add_argument("--output", help="Override output dir")

    sub.add_parser("info", help="Show config + paths")

    args = p.parse_args(argv)
    return {
        "list": cmd_list,
        "generate": cmd_generate,
        "generate-all": cmd_generate_all,
        "info": cmd_info,
    }[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
