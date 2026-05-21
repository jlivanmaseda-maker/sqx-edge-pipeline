"""
Limpieza post-instalación masiva de snippets en SQX 142.

Problemas detectados:
  1. Duplicados nativos: snippets que existen tanto en internal/ como en user/
     → SQX da "duplicate class" al compilar
  2. WhatIf_Leverage.java: depende de packages no presentes en SQX 142
     → No compila
  3. Snippets de columns (Databanks) mal ubicados:
     → Mi instalador los puso bajo Blocks/extend/Snippets/SQ/Columns/Databanks/
     → Deben ir a SQ/Columns/Databanks/ directamente
"""
import sys
import shutil
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

SQX_ROOT = Path(r'D:\WuantumBot\Software\SQX_142\SQX_142\SQX_142_Crack')
USER_BLOCKS = SQX_ROOT / 'user' / 'extend' / 'Snippets' / 'SQ' / 'Blocks'
USER_SNIPPETS_ROOT = SQX_ROOT / 'user' / 'extend' / 'Snippets'
INTERNAL_BLOCKS = SQX_ROOT / 'internal' / 'extend' / 'Snippets' / 'SQ' / 'Blocks'

BACKUP_DIR = SQX_ROOT / 'user' / 'cleanup_backup_2026-05-17'


def backup_and_remove(path: Path, reason: str):
    """Mueve un archivo o carpeta al backup en lugar de borrarlo definitivamente."""
    if not path.exists():
        print(f'  ⊘ {path.relative_to(SQX_ROOT)} — no existe, saltado')
        return False
    rel = path.relative_to(SQX_ROOT)
    dest = BACKUP_DIR / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(path), str(dest))
    print(f'  ✓ {rel} → backup ({reason})')
    return True


def main():
    print('=' * 80)
    print('LIMPIEZA POST-INSTALACIÓN SNIPPETS SQX 142')
    print('=' * 80)
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    print(f'Backup: {BACKUP_DIR}\n')

    # ─── 1. Duplicados de Indicators nativos en user/ ───
    print('1. ELIMINAR DUPLICADOS DE INDICATORS NATIVOS')
    print('-' * 80)
    duplicated_indicators = ['ROC', 'SchaffTrendCycle', 'VWAP']
    for name in duplicated_indicators:
        folder = USER_BLOCKS / name
        if folder.exists():
            backup_and_remove(folder, f'duplica internal/SQ/Blocks/Indicators/{name}/')

    # ─── 2. Duplicados de Comparisons nativos ───
    print('\n2. ELIMINAR DUPLICADOS DE COMPARISONS')
    print('-' * 80)
    duplicated_comparisons = [
        'IsGreaterPercentil.java',
        'IsLowerPercentil.java',
        'IsOneComparisonBlockAbstractPercentil.java',
    ]
    for fname in duplicated_comparisons:
        f = USER_BLOCKS / 'Comparisons' / fname
        if f.exists():
            backup_and_remove(f, f'duplica internal/SQ/Blocks/Comparisons/{fname}')

    # ─── 3. WhatIf_Leverage incompatible con 142 ───
    print('\n3. ELIMINAR WhatIf_Leverage (incompatible con SQX 142)')
    print('-' * 80)
    wif_paths = [
        USER_BLOCKS / 'WhatIf_Leverage.java',
        USER_BLOCKS / 'WhatIf_Leverage',
    ]
    for p in wif_paths:
        if p.exists():
            backup_and_remove(p, 'incompatible con SQX 142')

    # ─── 4. Mover snippets de Columns/Databanks mal ubicados ───
    print('\n4. REUBICAR snippets de Columns/Databanks/')
    print('-' * 80)
    misplaced_root = USER_BLOCKS / 'extend' / 'Snippets'
    if misplaced_root.exists():
        # Mover todo desde user/extend/Snippets/SQ/Blocks/extend/Snippets/
        # hacia user/extend/Snippets/
        count = 0
        for src_dir in misplaced_root.rglob('*'):
            if src_dir.is_file():
                rel = src_dir.relative_to(misplaced_root)
                dest = USER_SNIPPETS_ROOT / rel
                if not dest.exists():
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(src_dir), str(dest))
                    count += 1
        print(f'  ✓ {count} archivos reubicados desde Blocks/extend/Snippets/ → user/extend/Snippets/')
        # Limpiar carpeta vacía
        try:
            shutil.rmtree(misplaced_root)
            print(f'  ✓ Carpeta vacía Blocks/extend/ eliminada')
        except Exception as e:
            print(f'  ⊘ No se pudo eliminar Blocks/extend/: {e}')

    # ─── 5. Verificación final ───
    print('\n' + '=' * 80)
    print('VERIFICACIÓN FINAL')
    print('=' * 80)
    n_blocks = len([d for d in USER_BLOCKS.iterdir() if d.is_dir()])
    n_columns = 0
    cols_dir = USER_SNIPPETS_ROOT / 'SQ' / 'Columns'
    if cols_dir.exists():
        n_columns = len(list(cols_dir.rglob('*.java')))
    print(f'  Snippets en SQ/Blocks/:           {n_blocks}')
    print(f'  Snippets en SQ/Columns/Databanks: {n_columns}')
    print()
    print('Próximos pasos:')
    print('  1. Reiniciar SQX 142')
    print('  2. Tools → Custom Blocks → Build All Sources')
    print('  3. Si hay errores, reportarlos')


if __name__ == '__main__':
    main()
