"""
Genera BS_Filtros_v7.1 para los 5 TFs (M5, M15, M30, H1, H4)
Edita los rangos de ProfitTarget, StopLoss, TrailingStop, TrailingActivation
Adicionalmente:
  - Fuerza Trailing y TrailingActivation siempre juntos (probability=100)
  - Deshabilita FixedValue (pips fijos) en TrailingActivation (solo ATR-based)
Mantiene el resto del XML intacto.
"""
import zipfile
import re
import os
import shutil
from pathlib import Path

V6_PATH = Path(r"C:\Users\Livan\OneDrive\Documentos\EDGE\Block Settings\v4\BS_Filtros_v6.sqb")
OUTPUT_DIR = Path(r"C:\Users\Livan\OneDrive\Documentos\EDGE\Block Settings\v7")

# Configuracion por TF: (tp_min, tp_max, sl_min, sl_max, ts_min, ts_max, tact_min, tact_max, ts_step)
TF_CONFIGS = {
    "M5": (1.5, 3.5, 0.5, 1.5, 0.3, 0.8, 0.3, 0.8, 0.1),
    "M15": (1.5, 4.0, 0.5, 1.5, 0.3, 1.0, 0.3, 1.0, 0.1),
    "M30": (2.0, 4.5, 0.5, 2.0, 0.4, 1.2, 0.4, 1.2, 0.1),
    "H1": (2.0, 5.0, 1.0, 3.0, 0.5, 2.0, 0.5, 2.0, 0.5),
    "H4": (1.5, 3.0, 0.5, 1.5, 0.3, 1.0, 0.3, 1.0, 0.1),
}


def patch_atr_block(xml: str, block_name: str, value_path: str, min_val: float, max_val: float, step: float = None) -> str:
    """
    Encuentra el bloque (ProfitTarget/StopLoss/etc) y dentro su ATRBasedValue,
    modifica minValue, maxValue y step del Param 'Value'.
    """
    # Localizar el bloque
    block_pattern = re.compile(
        rf'(<Block key="{block_name}"[^>]*>.*?<Value key="{value_path}"[^>]*>.*?<Param key="#Value#"[^/]*?)minValue="[^"]*"\s+maxValue="[^"]*"(\s+step="[^"]*")?',
        re.DOTALL,
    )

    def replace(m):
        prefix = m.group(1)
        if step is not None:
            return f'{prefix}minValue="{min_val}" maxValue="{max_val}" step="{step}"'
        else:
            # Mantener step existente si no se especifica
            existing_step = m.group(2) or ' step="0.5"'
            return f'{prefix}minValue="{min_val}" maxValue="{max_val}"{existing_step}'

    new_xml, n = block_pattern.subn(replace, xml)
    if n == 0:
        print(f"   AVISO: no se modifico {block_name}/{value_path}")
    return new_xml


def apply_filter_settings(xml: str) -> str:
    """
    Politica BS_Filtros_v7 (Capa 2):
    - TrailingStop:        probability=50  (SQX explora con/sin trailing)
    - TrailingActivation:  probability=100 (siempre acoplada cuando hay trailing)
    - FixedValue de Trailing y TrailingActivation: use="false" (solo ATR-based)
    - MoveSL2BE: ya esta use="false" (Breakeven OFF)
    - ExitAfterBars: use="false" (NO debe estar en Capa 2 — ya hay SL/TP/Trailing)
    """
    # 1. TrailingStop probability: el v6 original tenia 50, lo dejamos en 50
    # (no necesita cambio, pero por si acaso aseguramos)
    xml = re.sub(
        r'(<Block key="TrailingStop\.TrailingStop"[^>]*?probability=")\d+(")',
        r'\g<1>50\g<2>',
        xml,
    )
    # 2. TrailingActivation probability=100 (de 50)
    xml = re.sub(
        r'(<Block key="TrailingStop\.TrailingActivation"[^>]*?probability=")\d+(")',
        r'\g<1>100\g<2>',
        xml,
    )
    # 3. FixedValue use="true" -> use="false" en TrailingActivation
    pattern_act_fixed = re.compile(
        r'(<Block key="TrailingStop\.TrailingActivation"[^>]*>.*?<Value key="SQ\.Formulas\.Range\.FixedValue" use=")true(")',
        re.DOTALL,
    )
    xml = pattern_act_fixed.sub(r'\g<1>false\g<2>', xml)

    # 4. ExitAfterBars deshabilitado (use="true" -> use="false")
    xml = re.sub(
        r'(<Block key="ExitAfterBars\.ExitAfterBars" use=")true(")',
        r'\g<1>false\g<2>',
        xml,
    )
    return xml


def generate_for_tf(tf_name: str, config: tuple) -> Path:
    tp_min, tp_max, sl_min, sl_max, ts_min, ts_max, tact_min, tact_max, ts_step = config

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / f"BS_Filtros_v7_{tf_name}.sqb"

    # Extraer config.xml del v6
    with zipfile.ZipFile(V6_PATH, "r") as z:
        with z.open("config.xml") as f:
            xml = f.read().decode("utf-8")

    # Modificar ProfitTarget ATRBasedValue
    xml = patch_atr_block(
        xml, "ProfitTarget.ProfitTarget", "SQ.Formulas.SLPT.ATRBasedValue",
        tp_min, tp_max, 0.5
    )

    # Modificar StopLoss ATRBasedValue
    xml = patch_atr_block(
        xml, "StopLoss.StopLoss", "SQ.Formulas.SLPT.ATRBasedValue",
        sl_min, sl_max, 0.5
    )

    # Modificar TrailingStop ATRBasedValue
    xml = patch_atr_block(
        xml, "TrailingStop.TrailingStop", "SQ.Formulas.RangeLevel.ATRBasedValue",
        ts_min, ts_max, ts_step
    )

    # Modificar TrailingActivation ATRBasedValue
    xml = patch_atr_block(
        xml, "TrailingStop.TrailingActivation", "SQ.Formulas.Range.ATRBasedValue",
        tact_min, tact_max, ts_step
    )

    # Aplicar config BS_Filtros (Capa 2): trailing 50/activation 100, FixedValue off, ExitAfterBars off
    xml = apply_filter_settings(xml)

    # Re-empaquetar como ZIP
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("config.xml", xml)

    return output_path


def main():
    print(f"BS v6 origen: {V6_PATH}")
    print(f"Salida v7:     {OUTPUT_DIR}")
    print()

    # Backup primero
    backup_dir = Path(r"C:\Users\Livan\OneDrive\Documentos\EDGE\Block Settings\v4\backup_pre_v7_2026-05-09")
    backup_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(V6_PATH, backup_dir / V6_PATH.name)
    print(f"Backup v6: {backup_dir / V6_PATH.name}")
    print()

    # Generar v7 para cada TF
    for tf_name, config in TF_CONFIGS.items():
        path = generate_for_tf(tf_name, config)
        size_kb = path.stat().st_size / 1024
        print(f"[OK] {path.name} ({size_kb:.1f} KB)")
        print(f"     TP: {config[0]}-{config[1]}  SL: {config[2]}-{config[3]}  TS: {config[4]}-{config[5]}")

    print()
    print("Hecho. Sustituye el blocksetting v6 por el v7 correspondiente al TF en cada nuevo proyecto SQX.")


if __name__ == "__main__":
    main()
