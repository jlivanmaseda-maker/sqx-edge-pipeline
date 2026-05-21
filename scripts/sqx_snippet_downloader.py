"""
Descarga automática de snippets desde https://strategyquant.com/codebase/

Mecanismo:
  1. Lee https://strategyquant.com/codebase-sitemap.xml (lista todos los snippets)
  2. Filtra por categoría (Indicators/Signals por defecto)
  3. Para cada snippet: parsea su página detalle y extrae el link .zip
  4. Descarga el .zip y lo extrae a SQX_USER_DIR/extend/Snippets/SQ/Blocks/

Uso típico:
  # Listar todos los disponibles
  python sqx_snippet_downloader.py --list

  # Listar los que aún NO tienes instalados
  python sqx_snippet_downloader.py --list-missing

  # Descargar por nombre (case-insensitive, substring match)
  python sqx_snippet_downloader.py --download "VWAP Bollinger" "Hull Moving Average ATR"

  # Descargar los 5 recomendados de la conversación
  python sqx_snippet_downloader.py --preset reformia-recommended

  # Descargar TODOS los indicators (los 86, OJO: largo)
  python sqx_snippet_downloader.py --all-indicators

  # Dry-run (no descarga, solo muestra qué haría)
  python sqx_snippet_downloader.py --preset reformia-recommended --dry-run
"""
from __future__ import annotations
import argparse
import os
import re
import sys
import time
import zipfile
import io
import shutil
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
import xml.etree.ElementTree as ET

# Forzar UTF-8 stdout en Windows (consola cp1252 no maneja emojis/arrows)
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass


# ==========================================================================
# CONFIGURACIÓN
# ==========================================================================

# Directorio raíz de SQX 142
SQX_ROOT = Path(r'D:\WuantumBot\Software\SQX_142\SQX_142\SQX_142_Crack')

# Subdirectorios de destino (calculados desde SQX_ROOT)
SQX_USER_SNIPPETS = SQX_ROOT / 'user' / 'extend' / 'Snippets' / 'SQ' / 'Blocks'
SQX_USER_TEMPLATES = SQX_ROOT / 'user' / 'extend' / 'Code'
SQX_MT4_INDICATORS = SQX_ROOT / 'custom_indicators' / 'MetaTrader4' / 'Indicators'
SQX_MT5_INDICATORS = SQX_ROOT / 'custom_indicators' / 'MetaTrader5' / 'Indicators'
SQX_TRADESTATION = SQX_ROOT / 'custom_indicators' / 'Tradestation'
SQX_BACKUP_ZIPS = SQX_ROOT / 'user' / 'snippet_originals'  # backup de .zip originales

SITEMAP_URL = 'https://strategyquant.com/codebase-sitemap.xml'

USER_AGENT = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
)

THROTTLE_SECONDS = 0.6  # delay entre requests para ser educado

# Preset Reformia: los 5 recomendados de la conversación
PRESETS = {
    'reformia-recommended': [
        'volume-weighted-average-price-bollinger-bands',  # VWAPBB
        'volume-weighted-average-price-atr-bands',         # VWAPAB
        'hull-moving-average-atr-bands',
        'hull-moving-average-bollinger-bands',
        'atr-percent-rank',
        'atr-percent',
        'ttm-squeeze',
        'slope-direction-line',
        'close-minus-moving-average',
    ],
    'reformia-volatility': [
        'vwap-bollinger-bands',
        'volume-weighted-average-price-atr-bands',
        'hull-moving-average-atr-bands',
        'hull-moving-average-bollinger-bands',
        'logarithmic-average-true-range',
        'donchian-channels',
        'atr-percent-rank',
        'atr-percent',
        'ttm-squeeze',
    ],
    'reformia-regime': [
        'hurst-exponent',
        'choppiness-index',
        'entropy-math',
        'cssa-market-regime',
        'ehlers-hilbert-transform',
        'cusum',
        'autocorrelation',
        'kolmogorov-smirnov-test-kstest',
        'dynamic-time-warping',
        'wasserstein-distance',
    ],
    'reformia-smc': [
        'order-block-detector',
        'break-of-structure',
        'fair-value-gap',
        'simple-liquidity-sweep',
    ],
}


# ==========================================================================
# HTTP helpers
# ==========================================================================

def http_get(url: str, max_retries: int = 3, referer: str | None = None) -> bytes:
    """GET con User-Agent + Referer y reintentos."""
    last_err = None
    headers = {'User-Agent': USER_AGENT, 'Accept': '*/*'}
    if referer:
        headers['Referer'] = referer
    for attempt in range(max_retries):
        try:
            req = Request(url, headers=headers)
            with urlopen(req, timeout=30) as resp:
                return resp.read()
        except (URLError, HTTPError) as e:
            last_err = e
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
    raise RuntimeError(f'Failed GET {url}: {last_err}')


# ==========================================================================
# Parsers
# ==========================================================================

def fetch_sitemap() -> list[str]:
    """Devuelve lista de URLs https://strategyquant.com/codebase/<slug>/"""
    print(f'[1/3] Fetching sitemap: {SITEMAP_URL}')
    raw = http_get(SITEMAP_URL)
    root = ET.fromstring(raw)
    ns = {'sm': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
    urls = []
    for url_elem in root.findall('sm:url/sm:loc', ns):
        u = url_elem.text or ''
        # Solo /codebase/<slug>/ (no locale prefixes)
        if re.match(r'^https://strategyquant\.com/codebase/[^/]+/$', u):
            urls.append(u)
    print(f'      → {len(urls)} snippets indexados')
    return sorted(set(urls))


def extract_zip_link(html: str) -> tuple[str | None, str | None]:
    """Extrae (title, zip_url) del HTML de la página detalle del snippet."""
    title_m = re.search(r'<h1[^>]*class="[^"]*documentation__title[^"]*"[^>]*>([^<]+)</h1>', html, re.I)
    if not title_m:
        title_m = re.search(r'<h1[^>]*>([^<]+)</h1>', html)
    title = title_m.group(1).strip() if title_m else None

    # Cualquier <a> con clase bookmark__link y href acabando en .zip
    zip_m = re.search(
        r'<a\s+[^>]*class="[^"]*bookmark__link[^"]*"[^>]*href="([^"]+\.zip)"',
        html, re.I
    )
    if not zip_m:
        # Variante: cualquier .zip dentro de wp-content/uploads
        zip_m = re.search(
            r'href="(https://strategyquant\.com/wp-content/uploads/[^"]+\.zip)"',
            html, re.I
        )
    zip_url = zip_m.group(1) if zip_m else None
    return title, zip_url


def slug_from_url(url: str) -> str:
    m = re.search(r'/codebase/([^/]+)/', url)
    return m.group(1) if m else url


# ==========================================================================
# Install
# ==========================================================================

def is_already_installed(snippet_slug: str) -> str | None:
    """Devuelve el path del .java existente si el snippet ya está instalado."""
    if not SQX_USER_SNIPPETS.exists():
        return None
    # Buscar por nombres aproximados (los .java suelen llamarse igual o sin guiones)
    candidates = [
        snippet_slug.replace('-', '').replace('_', '').lower(),
        snippet_slug.replace('-', '').replace('_', '').replace(' ', '').lower(),
    ]
    for sub in SQX_USER_SNIPPETS.rglob('*.java'):
        name_clean = sub.stem.lower().replace('-', '').replace('_', '').replace(' ', '')
        for cand in candidates:
            if cand in name_clean or name_clean in cand:
                return str(sub)
    return None


def install_zip(zip_bytes: bytes, snippet_title: str, zip_filename: str = '', install_mt: bool = True, install_tpl: bool = True, backup: bool = True) -> tuple[int, dict]:
    """
    Extrae snippets de un .zip oficial de SQX a TODOS los destinos correctos.

    Estructura observada del .zip externo:
      *.sxp   (SQX Extension Package — ZIP interno con .java + .tpl)
      *.ELD   (TradeStation script)
      *.mq4   (MetaTrader 4 source)
      *.mq5   (MetaTrader 5 source)

    Dentro del .sxp:
      extend/Snippets/SQ/Blocks/Indicators/<Name>/<Name>.java
      extend/Code/<MT4|MT5|JForex|EasyLanguage|PseudoCode>/blocks/<Name>.tpl

    Destinos:
      .java   → <SQX>/user/extend/Snippets/SQ/Blocks/<Name>/<Name>.java
                  (sin subcarpeta Indicators/ — coincide con convención usuario)
      .tpl    → <SQX>/user/extend/Code/<lang>/blocks/<Name>.tpl
                  (necesario para exportar EA a MT4/MT5 sin errores)
      .mq4    → <SQX>/custom_indicators/MetaTrader4/Indicators/<Name>.mq4
      .mq5    → <SQX>/custom_indicators/MetaTrader5/Indicators/<Name>.mq5
      .ELD    → <SQX>/custom_indicators/Tradestation/<Name>.ELD (opcional)
      backup  → <SQX>/user/snippet_originals/<original>.zip (preserva original)

    Returns: (total_files, summary_dict)
    """
    outer_zip = zipfile.ZipFile(io.BytesIO(zip_bytes))
    summary = {'java': [], 'tpl': [], 'mq4': [], 'mq5': [], 'eld': []}

    # Preservar .zip original
    if backup and zip_filename:
        SQX_BACKUP_ZIPS.mkdir(parents=True, exist_ok=True)
        with open(SQX_BACKUP_ZIPS / zip_filename, 'wb') as bf:
            bf.write(zip_bytes)

    # 1. Iterar archivos externos: .sxp / .mq4 / .mq5 / .ELD
    for member in outer_zip.namelist():
        ml = member.lower()
        # Skip directorios
        if ml.endswith('/'):
            continue

        if ml.endswith('.sxp'):
            # Extraer .java + .tpl del .sxp
            sxp_bytes = outer_zip.read(member)
            try:
                inner = zipfile.ZipFile(io.BytesIO(sxp_bytes))
            except zipfile.BadZipFile:
                continue
            for inner_member in inner.namelist():
                iml = inner_member.lower()
                if iml.endswith('.java'):
                    _install_java_from_archive(inner, inner_member, summary['java'])
                elif iml.endswith('.tpl') and install_tpl:
                    _install_tpl_from_archive(inner, inner_member, summary['tpl'])

        elif ml.endswith('.mq4') and install_mt:
            _install_mt_indicator(outer_zip, member, SQX_MT4_INDICATORS, summary['mq4'])

        elif ml.endswith('.mq5') and install_mt:
            _install_mt_indicator(outer_zip, member, SQX_MT5_INDICATORS, summary['mq5'])

        elif ml.endswith('.eld'):
            # TradeStation — opcional. Lo guardo en custom_indicators/Tradestation/
            _install_mt_indicator(outer_zip, member, SQX_TRADESTATION, summary['eld'])

    total = sum(len(v) for v in summary.values())
    return total, summary


def _install_java_from_archive(zf: zipfile.ZipFile, member: str, installed: list) -> None:
    """Instala un .java a user/extend/Snippets/SQ/Blocks/<Name>/."""
    parts = member.replace('\\', '/').split('/')
    sub_parts = parts
    if 'Blocks' in parts:
        idx = parts.index('Blocks')
        sub_parts = parts[idx + 1:]
        # Saltar prefijos 'Indicators/'/'Signals/'/'Conditions/' etc.
        if sub_parts and sub_parts[0] in ('Indicators', 'Signals', 'Conditions', 'Functions', 'Comparisons'):
            sub_parts = sub_parts[1:]
    if not sub_parts:
        return
    dest = SQX_USER_SNIPPETS.joinpath(*sub_parts)
    dest.parent.mkdir(parents=True, exist_ok=True)
    with zf.open(member) as src, open(dest, 'wb') as out:
        shutil.copyfileobj(src, out)
    installed.append(str(dest.relative_to(SQX_USER_SNIPPETS)))


def _install_tpl_from_archive(zf: zipfile.ZipFile, member: str, installed: list) -> None:
    """Instala un .tpl a user/extend/Code/<lang>/blocks/."""
    parts = member.replace('\\', '/').split('/')
    # Estructura esperada: extend/Code/<lang>/blocks/<Name>.tpl
    if 'Code' in parts:
        idx = parts.index('Code')
        sub_parts = parts[idx + 1:]
    else:
        sub_parts = parts
    if not sub_parts:
        return
    dest = SQX_USER_TEMPLATES.joinpath(*sub_parts)
    dest.parent.mkdir(parents=True, exist_ok=True)
    with zf.open(member) as src, open(dest, 'wb') as out:
        shutil.copyfileobj(src, out)
    installed.append(str(dest.relative_to(SQX_USER_TEMPLATES)))


def _install_mt_indicator(zf: zipfile.ZipFile, member: str, dest_dir: Path, installed: list) -> None:
    """Copia un archivo .mq4/.mq5/.ELD al directorio destino preservando solo el filename."""
    filename = member.replace('\\', '/').split('/')[-1]
    if not filename:
        return
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / filename
    with zf.open(member) as src, open(dest, 'wb') as out:
        shutil.copyfileobj(src, out)
    installed.append(str(dest.relative_to(SQX_ROOT)))


# ==========================================================================
# Main
# ==========================================================================

def process_snippet(url: str, dry_run: bool = False, force: bool = False,
                    install_mt: bool = True, install_tpl: bool = True, backup: bool = True) -> dict:
    """Procesa un snippet: fetch, parse, download, install."""
    slug = slug_from_url(url)
    result = {'slug': slug, 'url': url, 'status': 'pending', 'title': None,
              'zip_url': None, 'summary': {}}

    if not force and is_already_installed(slug):
        result['status'] = 'skipped (already installed)'
        return result

    try:
        html = http_get(url).decode('utf-8', errors='replace')
    except Exception as e:
        result['status'] = f'error: {e}'
        return result

    title, zip_url = extract_zip_link(html)
    result['title'] = title
    result['zip_url'] = zip_url

    if not zip_url:
        result['status'] = 'no_zip (documentation only)'
        return result

    if dry_run:
        result['status'] = 'dry-run (would download)'
        return result

    try:
        time.sleep(THROTTLE_SECONDS)
        zip_bytes = http_get(zip_url, referer=url)
        zip_filename = zip_url.rsplit('/', 1)[-1]
        count, summary = install_zip(zip_bytes, title or slug, zip_filename=zip_filename,
                                     install_mt=install_mt, install_tpl=install_tpl, backup=backup)
        result['summary'] = summary
        # Resumen compacto: java=X tpl=Y mq4=Z mq5=W
        parts_summary = []
        for k in ['java', 'tpl', 'mq4', 'mq5', 'eld']:
            n = len(summary.get(k, []))
            if n: parts_summary.append(f'{k}={n}')
        result['status'] = f'installed ({", ".join(parts_summary) if parts_summary else "0 files"})' if count > 0 else 'no_useful_files'
    except Exception as e:
        result['status'] = f'install_error: {e}'

    return result


def filter_by_names(all_urls: list[str], names: list[str]) -> list[str]:
    """Filtra URLs por substring case-insensitive match contra el slug."""
    if not names:
        return all_urls
    out = []
    for n in names:
        nl = n.lower().replace(' ', '-').replace('_', '-')
        matched = False
        for u in all_urls:
            slug = slug_from_url(u).lower()
            if nl in slug:
                out.append(u)
                matched = True
        if not matched:
            print(f'  [WARN] No match for: {n}')
    return list(dict.fromkeys(out))  # dedupe preservando orden


def cmd_list_missing(all_urls: list[str]) -> None:
    print('\n=== Snippets NO instalados (de los 182 disponibles) ===\n')
    missing = []
    for u in all_urls:
        slug = slug_from_url(u)
        if not is_already_installed(slug):
            missing.append(slug)
    for s in sorted(missing):
        print(f'  • {s}')
    print(f'\nTotal missing: {len(missing)} / {len(all_urls)}')


def cmd_list(all_urls: list[str]) -> None:
    print('\n=== TODOS los snippets disponibles (182) ===\n')
    for u in all_urls:
        slug = slug_from_url(u)
        installed = '✓' if is_already_installed(slug) else ' '
        print(f'  [{installed}] {slug}')


def main() -> int:
    p = argparse.ArgumentParser(description='Descarga snippets oficiales SQX')
    p.add_argument('--list', action='store_true', help='Listar todos los snippets (✓=ya instalado)')
    p.add_argument('--list-missing', action='store_true', help='Listar solo los no instalados')
    p.add_argument('--download', nargs='+', help='Descargar por nombre (substring match)')
    p.add_argument('--preset', choices=list(PRESETS.keys()), help='Descargar preset Reformia')
    p.add_argument('--all-indicators', action='store_true', help='Descargar TODOS los indicators (~86)')
    p.add_argument('--dry-run', action='store_true', help='No descarga, solo muestra qué haría')
    p.add_argument('--force', action='store_true', help='Reinstalar aunque ya esté presente')
    p.add_argument('--snippets-dir', help='Override SQX_USER_SNIPPETS path')
    p.add_argument('--no-mt', action='store_true', help='No instalar archivos .mq4/.mq5')
    p.add_argument('--no-tpl', action='store_true', help='No instalar templates .tpl')
    p.add_argument('--no-backup', action='store_true', help='No preservar .zip originales')
    args = p.parse_args()

    global SQX_USER_SNIPPETS
    if args.snippets_dir:
        SQX_USER_SNIPPETS = Path(args.snippets_dir)
    print(f'Snippets destination: {SQX_USER_SNIPPETS}')
    if not SQX_USER_SNIPPETS.exists():
        print(f'[WARN] El directorio no existe — se creará al instalar')

    all_urls = fetch_sitemap()

    if args.list:
        cmd_list(all_urls); return 0
    if args.list_missing:
        cmd_list_missing(all_urls); return 0

    # Determinar URLs target
    target_urls = []
    if args.preset:
        target_urls = filter_by_names(all_urls, PRESETS[args.preset])
        print(f'\n[Preset {args.preset}] Matched {len(target_urls)} snippets')
    if args.download:
        target_urls = filter_by_names(all_urls, args.download)
        print(f'\n[Download] Matched {len(target_urls)} snippets')
    if args.all_indicators:
        # Descargar TODOS — sin filtro, pero el sitemap incluye más que indicators (~182).
        # Filtro heurístico: incluir todos los slugs sin filtrar (el usuario lo pidió)
        target_urls = all_urls
        print(f'\n[All] Procesando los {len(target_urls)} snippets del sitemap')
    if not target_urls:
        print('Nada que hacer. Usa --list, --list-missing, --download, --preset o --all-indicators')
        return 1

    print(f'\n[2/3] Procesando {len(target_urls)} snippets...\n')
    print(f'  Destinos:')
    print(f'    .java → {SQX_USER_SNIPPETS}')
    print(f'    .tpl  → {SQX_USER_TEMPLATES}   {"(skip)" if args.no_tpl else ""}')
    print(f'    .mq4  → {SQX_MT4_INDICATORS}   {"(skip)" if args.no_mt else ""}')
    print(f'    .mq5  → {SQX_MT5_INDICATORS}   {"(skip)" if args.no_mt else ""}')
    print(f'    backup→ {SQX_BACKUP_ZIPS}   {"(skip)" if args.no_backup else ""}')
    print()

    results = []
    for i, url in enumerate(target_urls, 1):
        print(f'  [{i}/{len(target_urls)}] {slug_from_url(url):<55}', end=' ')
        r = process_snippet(url, dry_run=args.dry_run, force=args.force,
                          install_mt=not args.no_mt, install_tpl=not args.no_tpl,
                          backup=not args.no_backup)
        results.append(r)
        print(f'→ {r["status"]}')
        time.sleep(THROTTLE_SECONDS)

    print('\n[3/3] Resumen:\n')
    installed = sum(1 for r in results if r['status'].startswith('installed'))
    skipped = sum(1 for r in results if 'skipped' in r['status'])
    errors = sum(1 for r in results if 'error' in r['status'])
    no_zip = sum(1 for r in results if 'no_zip' in r['status'])
    dry = sum(1 for r in results if 'dry-run' in r['status'])

    print(f'  ✓ Instalados:        {installed}')
    print(f'  ⊘ Ya instalados:     {skipped}')
    print(f'  ⚠ Sin .zip (doc):    {no_zip}')
    print(f'  ✗ Errores:           {errors}')
    if dry: print(f'  ▷ Dry-run (sim.):    {dry}')

    if errors:
        print('\nErrores detallados:')
        for r in results:
            if 'error' in r['status']:
                print(f'  ✗ {r["slug"]}: {r["status"]}')

    if installed:
        print('\n⚠ Reinicia SQX para compilar los snippets nuevos.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
