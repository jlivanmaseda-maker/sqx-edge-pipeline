# SQX Edge Tool

Generador de Custom Projects (`.cfx`) para SQX adaptado a la metodología SQX Edge (Capa 1 / Capa 2 / 14 minings).

## Requisitos

- Python 3.10+ (probado con 3.12)
- StrategyQuant X 142 instalado
- Plantilla seed `.cfx` validada en SQX (incluida: `templates/Capa1_Long.cfx`)

## Setup

1. Edita `config.json` con tu path SQX (ya pre-configurado para `D:/WuantumBot/.../SQX_142_Crack`).
2. Verifica que `templates/Capa1_Long.cfx` existe (es la semilla — copia limpia de `EDGE LONG.cfx`).

## Uso

```bash
# Listar los 14 minings del plan
run.bat list

# Generar 1 proyecto (Mining 2 = XAUUSD H4 BS_Tendencia L)
run.bat generate --mining 2

# Generar los 14 de golpe
run.bat generate-all

# Ver config + paths
run.bat info
```

Los `.cfx` generados quedan en `output/` con nombres tipo `Mining02_XAUUSD_H4_BS_Tendencia.cfx`.

## Cómo cargarlo en SQX

1. Abre StrategyQuant X.
2. File → Open Project → selecciona el `.cfx` generado.
3. **Importante**: en el Builder, vuelve a seleccionar `templateFile` y `strategyFile` con los paths de tu instalación (las rutas absolutas se limpian al generar para evitar referenciar PCs ajenos).

## Arquitectura

```
sqx-edge-tool/
├── core/
│   ├── cfx_editor.py       — abre/modifica/guarda .cfx (zip+xml)
│   ├── xml_patcher.py      — patches: symbol, TF, dates, direction, swap
│   ├── plan.py             — los 14 minings del plan
│   └── project_generator.py — orquesta el pipeline de generación
├── cli/
│   └── sqx_edge.py         — CLI entry point
├── templates/
│   └── Capa1_Long.cfx      — semilla validada (copia de EDGE LONG.cfx)
├── output/                 — .cfx generados
├── config.json             — paths SQX + defaults
└── run.bat                 — launcher Windows
```

## Roadmap

- [x] **F1**: CLI mínimo + plantilla seed + generación por mining
- [ ] **F2**: leer `data.db` para spreads/swaps/fechas reales por símbolo
- [ ] **F3**: API REST Flask en `localhost:5050`
- [ ] **F4**: Tab "Project Generator" en SQX Edge Dashboard
- [ ] **F5**: `strategy_cleaner.py` (limpia `.sqx` post-mining)
- [ ] **F6**: Plantilla Capa 2 + UI específica
- [ ] **F7**: Empaquetar Python embebido (como Hobbiecode)
