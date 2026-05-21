"""
Limpia columns custom NO usadas en NINGUNA databank view.

SQX recalcula cada column custom para cada strategy del databank, así que
tener 194 columns instaladas y sin usar ralentiza muchísimo.

Estrategia segura:
  1. Parsea los 42 .vw para extraer los class names en uso
  2. Compara con los 194 .java instalados
  3. Las que NO están en uso → mueve a backup (NO borra)
  4. Las que SÍ están en uso → quedan tal cual
  5. Comprueba además referencias en MoneyManagement / MonteCarlo / CustomAnalysis snippets

Backup: user/extend/Snippets/SQ/Columns/Databanks_backup_unused_2026-05-18/
"""
import sys
import re
import shutil
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

SQX = Path(r'D:\WuantumBot\Software\SQX_142\SQX_142\SQX_142_Crack')
COLS_DIR = SQX / 'user' / 'extend' / 'Snippets' / 'SQ' / 'Columns' / 'Databanks'
VIEWS_DIR = SQX / 'user' / 'settings' / 'views' / 'databanks'
BACKUP_DIR = SQX / 'user' / 'extend' / 'Snippets' / 'SQ' / 'Columns' / 'Databanks_backup_unused_2026-05-18'


def main():
    if not COLS_DIR.exists():
        print(f'ERROR: {COLS_DIR} no existe')
        return 1
    if not VIEWS_DIR.exists():
        print(f'ERROR: {VIEWS_DIR} no existe')
        return 1

    # 1) Recolectar class names usados en TODOS los .vw
    used_classes = set()
    for vw in VIEWS_DIR.glob('*.vw'):
        text = vw.read_text(encoding='utf-8', errors='ignore')
        for m in re.finditer(r'class="([A-Za-z0-9_]+)"', text):
            used_classes.add(m.group(1))
    print(f'Class names usados en {len(list(VIEWS_DIR.glob("*.vw")))} views: {len(used_classes)}')

    # 2) Listar todos los .java de Databanks
    java_files = list(COLS_DIR.glob('*.java'))
    installed = {f.stem: f for f in java_files}
    print(f'Custom .java instalados en Databanks/: {len(installed)}')

    # 3) Detectar referencias cruzadas en otros snippets (MoneyManagement / MonteCarlo / CustomAnalysis)
    extra_refs = set()
    for snip_dir in [SQX / 'user' / 'extend' / 'Snippets' / 'SQ' / 'MoneyManagement',
                     SQX / 'user' / 'extend' / 'Snippets' / 'SQ' / 'MonteCarlo',
                     SQX / 'user' / 'extend' / 'Snippets' / 'SQ' / 'CustomAnalysis']:
        if not snip_dir.exists():
            continue
        for f in snip_dir.rglob('*.java'):
            text = f.read_text(encoding='utf-8', errors='ignore')
            for name in installed:
                if name in text:
                    extra_refs.add(name)

    # 4) Class names usados que ADEMÁS son custom (no nativos SQX)
    custom_in_use = {name for name in installed if name in used_classes}
    custom_in_use |= extra_refs

    # 5) Custom NO usadas
    unused = sorted(set(installed) - custom_in_use)

    print()
    print(f'  Custom EN USO (no se tocan): {len(custom_in_use)}')
    print(f'  Custom NO usadas (a backup): {len(unused)}')
    print()

    if not unused:
        print('No hay columns custom sin usar. Nada que hacer.')
        return 0

    # 6) Mover a backup
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    print(f'Backup: {BACKUP_DIR}')
    print()
    moved = 0
    for name in unused:
        src = installed[name]
        dst = BACKUP_DIR / src.name
        shutil.move(str(src), str(dst))
        moved += 1
    print(f'✓ {moved} archivos movidos a backup')
    print()
    print('Lista de custom EN USO (que se quedan):')
    for n in sorted(custom_in_use):
        print(f'  - {n}')


if __name__ == '__main__':
    sys.exit(main() or 0)
