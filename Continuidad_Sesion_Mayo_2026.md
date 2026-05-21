# Reformia Algotrading SQX — Continuidad de Sesión (Mayo 2026)

**Documento de transferencia entre sesiones de Claude.**

Adjuntar al inicio de la próxima conversación con instrucción:
> "Continúo proyecto Reformia Algotrading SQX. Adjunto documento de continuidad."

---

## 1. CONTEXTO DEL PROYECTO

### Operador

- **Livan**, autónomo en Pamplona/Mutilva (Aranguren), Navarra, España
- **Reformia brand** (servicios de reformas como negocio principal)
- **Reformia Algotrading** (proyecto paralelo, este documento)
- Cuenta REAL: **Darwinex MT5 ~$100,000** (objetivo despliegue)
- Cuenta de pruebas: **Capital Point Trading ~$3,000** (River Balke EAs)

### Setup técnico

- Servidor Windows 2022 Xeon (128GB RAM, IP 192.168.68.52)
- Claude Max + multiple Claude Code sessions
- VS Code Remote SSH
- StrategyQuant X (SQX) instalado
- Datos: **Darwinex high-quality tick data** en SQX

### Stack del proyecto

- Python 3.11+, FastAPI, React, PyQt5, pandas, Docker
- Variables snake_case y código en español
- Estilo directo y pragmático (Livan no quiere over-engineering)

### Plan de 14 minings priorizado

**FASE 1 — Oro (3):** XAUUSD H1, H4, M30 con BS_Tendencia (Long-only)
**FASE 2 — EURUSD (3):** H1, H4 BS_Tendencia, M30 BS_Momentum (L+S)
**FASE 3 — USTEC (2):** H1, M30 BS_Tendencia/Momentum (Long-only)
**FASE 4 — Volatilidad (2):** GBPUSD H1, GBPJPY H1 BS_Volatilidad (L+S)
**FASE 5 — Mean reversion (4):** EURGBP H4, AUDNZD H4 BS_Regimen, EURGBP H1 BS_Estadistico, AUDCAD H4 (L+S)

---

## 2. METODOLOGÍA ESTABLECIDA (NO CAMBIAR)

### 2 capas (Tomas Nesnidal-style)

**CAPA 1 — Edge puro:**
- Edge: random
- Filtros: 0
- SL/TP/Trailing: NO
- Exit: ExitAfterBars=20 fijo
- Fitness: R Expectancy
- Filtros mining: PF≥1.10, #trades>100, R Exp>0.05

**CAPA 2 — Edge fijo + Filtros random + Gestión:**
- Edge: FIJO del template Capa 1
- Filtros random: 1-2 condiciones
- SL/TP/Trailing: random ATR-based
- ExitAfterBars: opcional o 20
- Fitness: Weighted Fitness con 5 métricas (peso 1 cada una)
- Filtros mining: PF≥1.20, #trades>100

### Decisión: NO añadir Capa 3

**Considerada:** descomposición en 3 capas (edge / edge+filtros / edge+filtros+gestión)

**Decisión final:** mantener 2 capas. Razones:
- Validada en literatura
- Eficiencia computacional (50% menos tiempo que 3 capas)
- Permite interacciones legítimas filtros+gestión
- Plan actual 14 minings consistente

### Alternativa adoptada: Champion vs Challenger

**Concepto:** documentar Capa 1 como "Champion". Solo adoptar ganadoras Capa 2 si superan Champion en criterios cuantitativos.

**Criterios (5):**
- PF >= Champion × 1.05
- Ret/DD >= Champion × 0.95
- DD% <= Champion × 1.20
- # trades >= Champion × 0.7
- Forward 2024-2026: todos años positivos

**Decisión:** pasa 5/5 → adoptar Challenger. Pasa <5/5 → mantener Champion.

**Implicación:** una estrategia robusta de Capa 1 ES OPERABLE si su Champion no es superado en Capa 2.

### Direcciones por activo

- **Oro / Índices: Long-only** (sesgo secular alcista)
- **Forex Majors / Minors: L+S** (sin sesgo secular)
- **Verificación post-mining:** si en L+S una dirección aporta <30% del NP o es negativa, convertir a direccional pura

---

## 3. BLOCKSETTINGS (versión actual: v6)

### Evolución v3 → v6

**v3 (todos los blocksettings):**
- AlwaysTrue REACTIVADO (era use="false", ahora use="true")
- IsLowerPercentil/IsGreaterPercentil: Bars step=100, Percentile step=5

**v4 (general):**
- 46 ajustes en `<Generated>` para steps redondeados
- 10 ajustes en Default Sets SuperTrend ATR
- 36 desactivaciones (indicadores exóticos, Indicators.Number)
- ExitAfterBars defaultValue=20 fijo

**v5 (BS_Filtros solo):**
- v4 + TrailingStop limpio
- TrailingStop ATR Value: 1.0..5.0 step=0.5
- TrailingStop ATR Period: 20..200 step=20
- Fixed value desactivado

**v6 (BS_Filtros, generado en sesión Mayo 2026):**
- v5 + extender limpieza a SL y TP
- StopLoss: ATR-based ON, Value 1.0..5.0 step=0.5, AtrPeriod 20..200 step=20
- ProfitTarget: igual configuración que SL
- PctValue desactivado en SL y TP

**Archivo:** `/mnt/user-data/outputs/BS_Filtros_v6.sqb` (generado en esta sesión)

### Aclaración técnica importante

**`Indicators.LowestInRange` ≠ `IsLowerPercentil`** (bloques distintos):

```
IsLowerPercentil: parámetros Bars (100..1000 step=100) + Percentile (5..95 step=5)
   Ejemplo: "X is lower than 70% of values over 500 bars"

Indicators.LowestInRange: parámetros TimeFrom + TimeTo (0..2359 step=30)
   Los valores son HORAS DEL DÍA (HHMM), NO periodos
   Ejemplo: LowestInRange(1830, 2330) = mínimo entre 18:30 y 23:30
```

**Esto explicó por qué la 3.46.41 tenía valores 1830, 2330, 1730, 830** en LowestInRange (eran horas, no barras).

---

## 4. CHEATSHEET CAPA 1

**Documento completo:** `/mnt/user-data/outputs/CLAUDE_Capa1_Cheatsheet.md` (577 líneas)

### Resumen de cross-checks

| # | Test | Settings clave | Filter clave |
|---|---|---|---|
| 1 | RETEST 0 | Período completo 2017-2026 | PF>1.0, #trades>100 |
| 2 | RETEST 1 | OOS 2010-2017 | PF>1.0, #trades>50 |
| 3 | HBP | 100 sims | NetProfit>0, MaxDD<=200% al 80% |
| 4 | MC | 200 sims, sin Skip trades | NetProfit>=50%, MaxDD<=200% |
| 5 | MC2 | OPCIONAL, history 10%, spread 10-25, sin params | CAGR/DD>=30% al 95% |
| 6 | Sequential | Up130/Down70/Steps12, Apply OFF | 80% pass, 5 stable, 25% range |
| 7 | Monkey Test | 100 sims, 80% conf | NetProfit>0 vs random |
| 8 | Synthetic V2 | 100 sims, preserve 85%, warmup 200 | NetProfit>=50% al 80% |
| 9 | SPP | 3000 tests, Up20/Down20 | Net>=40%, profitable>30%, BestOpt OFF |
| 10 | WFM | Simulated fastest, OOS 20-36 step 2 | Robustness>=60%, 6 conds |
| 11 | FOWARD | 2024-2026 sin re-optimize | PF>1.0, #trades>30, Ret/DD>0.5 |

### Decisiones clave Capa 1

**Sequential:** ☑ Periods + ☑ Constants + ☑ Exit params (3 categorías)
**WFM:** ☑ Periods + ☑ Constants + ☑ Entry levels + ☑ Exit params (4 categorías)
**SPP:** ☑ Periods + ☑ Constants + ☑ Entry levels + ☑ Exit params (4 categorías, "Your own settings", NO Recommended)
**MC:** Resampling sin Skip trades
**MC2:** sin Slippage, sin Randomize parameters

**Walk-Forward type: SIEMPRE Simulated (fastest)**
**Apply optimized parameters: SIEMPRE OFF**

---

## 5. CHEATSHEET CAPA 2

**Documento completo:** `/mnt/user-data/outputs/CLAUDE_Capa2_Cheatsheet.md` (738 líneas)

### Resumen de cross-checks

| # | Test | Diferencia con Capa 1 |
|---|---|---|
| 1 | RETEST 0 | Igual |
| 2 | RETEST 1 | #trades>100 (más estricto) |
| 3 | HBP | MaxDD<=150% (más estricto) |
| 4 | MC | CON Skip trades (a diferencia Capa 1) |
| 5 | MC2 | RECOMENDADO (no opcional), CON Slippage 0-5 |
| 6 | Sequential | Solo Entry levels + Exit params (NO Periods/Const) |
| 7 | Monkey Test | Igual |
| 8 | Synthetic | Igual umbral |
| 9 | SPP | Your own settings (NO Recommended), Net>=50% |
| 10 | WFM | Entry levels + Exit, filtros operativos (Stagnation, Ret/DD≥5, Win% OOS≥70% IS) |
| 11 | FOWARD | Ret/DD>1.0 (más estricto) |

### Filtros estrictos post-Capa 2 (manuales)

```
PF >= 1.5
Ret/DD >= 5
R Expectancy >= 0.30
Stagnation < 25%
# trades > 150
```

### Decisiones clave Capa 2

**Sequential:** ☑ Entry levels + ☑ Exit params (NO Periods, NO Constants)
**WFM:** ☑ Entry levels + ☑ Exit params
**SPP:** ☑ Entry levels + ☑ Exit params (Your own settings)

**Patrón en Capa 2:** los 3 tests de robustez (Sequential, WFM, SPP) marcan **Entry levels + Exit params**. Coherencia metodológica.

---

## 6. TEST DE DESCOMPOSICIÓN (nuevo en sesión Mayo 2026)

### Objetivo

**Detectar y descartar estrategias donde "el todo es mayor que la suma de las partes"** — overfit por interacción de componentes individualmente débiles.

### Procedimiento

Sobre cada estrategia ganadora de Capa 2, hacer 3 backtests adicionales:

**Versión A — Solo edge:**
- Edge: presente
- Filtros random: ELIMINADOS
- SL/TP/Trailing: DESACTIVADOS
- ExitAfterBars=20

**Versión B — Edge + Filtros (sin gestión):**
- Edge: presente
- Filtros random: presentes
- SL/TP/Trailing: DESACTIVADOS
- ExitAfterBars=20

**Versión C — Edge + Gestión (sin filtros random):**
- Edge: presente
- Filtros random: ELIMINADOS
- SL/TP/Trailing: presentes

### Métricas de análisis

**Coeficiente de Emergencia:**
```
PF_esperado = max(PF_solo_edge, PF_edge_filtros, PF_edge_gestion)
PF_real = PF_total

Coef_Emergencia = PF_real / PF_esperado
```

**Aporte de cada componente:**
```
Aporte filtros = PF_B - PF_A
Aporte gestión = PF_C - PF_A
```

### Reglas de descarte

```
Si PF_solo_edge < 1.0 → DESCARTAR
   (edge no funciona sin aditivos)

Si Coef_Emergencia > 1.30 → SOSPECHOSO
   (la combinación supera demasiado a sus partes)

Si aporte_componente < 0.05 → componente es ruido
   (eliminar si simplifica)
```

### Reglas de aceptación

```
PF_solo_edge >= 1.20
Coef_Emergencia <= 1.25
Cada componente aporta >0.10 en PF
```

### Interpretación

```
Coef < 1.0:    bug o configuración rara
Coef 1.0-1.10: bueno (mejora marginal por combinación, normal)
Coef 1.10-1.25: aceptable (interacción razonable)
Coef 1.25-1.50: sospechoso (mucha emergencia, posible overfit)
Coef > 1.50:    ALARMA ROJA
```

### Tiempo de aplicación

- Manual: ~15-30 min por estrategia
- Aplicar sobre TIER 1/2 (no necesariamente todas)

---

## 7. CONCEPTO DE EDGE (clarificado en sesión Mayo 2026)

### Definición

**Edge = condición de ENTRADA que predice movimiento direccional del precio.**

En código de la estrategia: las líneas de **Trading Signals → Long Entry / Short Entry**.

### Distinción entre componentes

```
EDGE = predice dirección del precio
   Ejemplos: CloseW > Highest(14), RSI < 30, LinearRegression cruza Close

FILTRO = condición que dice CUÁNDO el edge debe activarse
   No predice dirección, solo filtra
   Ejemplos: ADX > 25, ATR > X, hora del día = sesión NY

GESTIÓN = reglas de SALIDA del trade
   No predice dirección, solo gestiona posición
   Ejemplos: SL, TP, Trailing, ExitAfterBars
```

### Test rápido para identificar edge

**Pregunta:** "¿Esta condición predice dirección probable del precio?"
- SÍ → es edge
- NO (solo dice cuándo o cómo salir) → es filtro o gestión

### Aplicación al test de descomposición

En la versión "solo edge" del test, mantienes solo las condiciones que **predicen dirección** y eliminas las que **filtran o gestionan**.

### Ejemplo aplicado a la 0.5287260 (XAUUSD H4)

```
Long Entry Signal:
   CloseW[1] crosses above Highest(14)[1]    ← EDGE
   AND Always True                            ← COMODÍN (no aplica)
   AND KER(48) >= 25% percentile of 700 bars  ← FILTRO (no es edge)

Versión "solo edge" para test:
   CloseW[1] crosses above Highest(14)[1]
   Exit: ExitAfterBars=20
   SL/TP/Trailing: ninguno
```

---

## 8. ESTADO ACTUAL DEL PROYECTO

### Mining 1: XAUUSD H1 BS_Tendencia (TEMPLATE LINEAR Capa 2) — COMPLETADO ✓

**Embudo:** 1000 → 388 → 21 → 17 → 17 → 8 → 6 → 4 → 4 → 4 → 3 PASSED WFM

**3 ganadoras finales (Capa 2 LINEAR):**

| Strategy | Indicators | PF | Sharpe | Ret/DD | DD% | # Trades | TIER |
|---|---|---|---|---|---|---|---|
| 0.621529 | ATR + LinReg | 1.94 | 1.42 | 12.32 | 0.76% | 315 | TIER 1 |
| 0.920817 | KER + LinReg | 2.13 | 1.33 | 15.56 | 0.50% | 226 | TIER 1.5 |
| 0.553059 | LinReg solo | 1.86 | - | 8.56 | 1.34% | - | TIER 2 |

### Mining 2: XAUUSD H4 BS_Tendencia (Capa 1 con cross-checks completos) — COMPLETADO ✓

**Embudo:** 1000 → 680 → 680 → 680 → 496 → 115 → 115 → 115 → 48 → 9 → 8 → 3 PASSED FORWARD

**3 ganadoras finales (Capa 1 H4):**

| Strategy | Indicators | NP | DD% | PF | Sharpe | Ret/DD | # Trades | TIER |
|---|---|---|---|---|---|---|---|---|
| 0.713168 | AvgVolume+Close | $4,758 | 0.42% | 2.01 | 0.71 | 11.11 | 210 | TIER 2 conservadora |
| **0.5287260** | **CloseW+Highest+KER** | **$16,523 ⭐** | **1.18%** | **1.76** | **1.29** | **13.3** | **250** | **TIER 1 ABSOLUTA** |
| 0.4718752 | Close+CloseW+Highest | $9,053 | 0.9% | 1.91 | 0.79 | 9.75 | 232 | TIER 2 balanceada |

**Detalle 0.5287260 (estrella):**
- Edge: `CloseW crosses above Highest(14) AND AlwaysTrue AND KER(48) >= 25% percentile of 700 bars`
- R Expectancy: 0.41
- Stagnation %: 9.01%
- 9/9 años positivos incluyendo Forward 2024-2025

### Total stock actual de oro: 6 estrategias

```
H1 (Capa 2 LINEAR):
   0.621529 (ATR+LinReg)
   0.920817 (KER+LinReg)
   0.553059 (LinReg)

H4 (Capa 1):
   0.713168 (AvgVolume+Close)
   0.5287260 (CloseW+Highest+KER) ⭐
   0.4718752 (Close+CloseW+Highest)
```

### Mining 2 ya cerrado oficialmente con FORWARD aplicado

---

## 9. DECISIONES OPERATIVAS PENDIENTES

### Inmediatas

1. **Test de Descomposición sobre 0.5287260** (la estrella)
   - Determinar si edge solo (CloseW > Highest) es robusto
   - O si depende del filtro KER

2. **Filter by correlation entre las 3 ganadoras H4** (threshold 0.7)
   - Confirmar diversidad estructural
   - Esperado: las 3 son únicas

3. **Verificar asimetría direccional Long vs Short** en las 3 ganadoras H4
   - Trade Analysis NP por dirección
   - Si Short < 30% del Long o negativo, convertir a Long-only

4. **Cross-TF correlation** entre 3 ganadoras H1 (LINEAR) y 3 ganadoras H4
   - Predicción: 6 estrategias diversas
   - Resultado esperado: portfolio de 6 estrategias de oro

### Próximos minings (orden recomendado)

5. **Capa 2 sobre 4 templates restantes XAUUSD H1**
   - TEMPLATE ICHIMOKU
   - TEMPLATE ICHIMOKU 2
   - TEMPLATE MACD
   - TEMPLATE SUPER
   - **Usar BS_Filtros_v6.sqb (no v5)**

6. **Mining 3: XAUUSD M30 BS_Tendencia**
   - Completa FASE 1 oro

7. **Pre-check antes de cualquier mining nuevo activo:**
   - Workflow 2-3 horas
   - Paso 1: verificar datos Darwinex (15 min)
   - Paso 2: backtest manual con RSI clásico (30 min)
   - Paso 3: mini-mining 100 estrategias (1-2 horas)
   - Decisión: continuar o saltar a otro activo

### Alternativas tras FASE 1

- **AUDCAD H4** (con pre-check obligatorio)
- **EURGBP H4** (más fiable según dashboard ratings)
- **EURUSD H1 BS_Tendencia** (FASE 2)

### Crítico antes de operativa real

8. **Verificación final en MT5 Darwinex** sobre las 6 ganadoras
   - Export EA desde SQX
   - Backtest en MT5 con datos REALES del bróker
   - Comparar métricas SQX vs MT5
   - Discrepancia <10% en Net Profit, PF, DD% → desplegar
   - Discrepancia >10% → investigar timezone/spread

9. **Verificar timezone Darwinex**
   - Algunos usuarios reportan USA DST en lugar de Europa
   - Verificar antes de operar estrategias con LowestInRange (horarios)

10. **Despliegue gradual MT5**
    - Demo 30 días con sizing real
    - Real con sizing pequeño (0.05-0.1 lots)
    - Escalar a 8-12 estrategias en portfolio si funciona

---

## 10. DOCUMENTOS GENERADOS EN ESTA SESIÓN

Todos en `/mnt/user-data/outputs/`:

| Documento | Contenido | Líneas |
|---|---|---|
| **BS_Filtros_v6.sqb** | Blocksetting con SL+TP+Trailing limpios | binario |
| **CLAUDE_Capa1_Cheatsheet.md** | Cheatsheet operativo Capa 1 (Settings + Filter + Explicación) | 577 |
| **CLAUDE_Capa2_Cheatsheet.md** | Cheatsheet operativo Capa 2 | 738 |

### Documentos de sesiones anteriores (referencia)

```
CLAUDE.md                            ← contexto general proyecto
CLAUDE_Blocksettings_Detalle.md      ← detalle técnico v3-v6
CLAUDE_Capa1_Configuracion.md        ← configuración general Capa 1
Workflow_SQX_Pipeline_Completo.md    ← workflow completo
SQX_Workflow_Dashboard.html          ← dashboard interactivo 10 pestañas
```

---

## 11. PROTOCOLOS Y REGLAS DE ORO

### Champion vs Challenger
- Documentar Champion antes de Capa 2
- Solo adoptar Challenger si supera 5/5 criterios
- Una Capa 1 robusta es OPERABLE

### Verificación direccional post-mining
- En L+S, verificar NP Long vs NP Short
- Si Short < 30% del Long o negativo → convertir a Long-only

### NO HACER
- Apply optimized parameters (Sequential/WFM/SPP) — SIEMPRE OFF
- Walk-Forward type Exact — SIEMPRE Simulated (fastest)
- Backtests on additional markets en activos muy distintos
- Filtros estrictos en retest (descarta estrategias robustas)
- Marcar Periods/Constants en Capa 2 (rompe template fijo)
- Saltarse FOWARD (datos intocados son críticos)
- Operar real sin verificación en MT5 con datos del bróker

### Activos sin L+S
- Oro, Índices: Long-only por sesgo secular
- USDJPY largo plazo: cuidado con sesgo
- Pares forex sin sesgo: L+S OK con verificación

### Filtros del retest
- Más permisivos que mining
- FORWARD muy permisivos (período corto)
- Validamos supervivencia, no excelencia

---

## 12. CONSIDERACIONES TÉCNICAS DARWINEX

**Basado en artículo StrategyQuant + foros:**

1. **Datos Darwinex tienen calidad alta pero histórico más corto que Dukascopy**
2. **Timezone:** algunos usuarios reportan USA DST (+7/+8) en lugar de Europa (+2)
3. **TFs altos minimizan ruido entre brokers** (H4, D1 > H1, M30)
4. **Verificación obligatoria en MT5** con datos reales del bróker antes de real
5. **Para estrategias con LowestInRange (horarios):** verificar timezone primero

### Workflow de validación final

```
1. SQX mining + tests robustez
2. Export EA desde SQX
3. Backtest en MT5 Darwinex con datos del bróker
4. Comparar:
   - Net Profit: discrepancia <10% OK
   - Profit Factor: <10% OK
   - Drawdown: <15% OK
   - # Trades: <5% OK
5. Si todos <umbrales: validada
6. Demo 30 días con sizing real
7. Real con sizing pequeño
8. Escalar gradualmente
```

---

## INSTRUCCIÓN PARA NUEVA SESIÓN

Cuando empiece la próxima conversación con Claude, decir:

```
"Continúo proyecto Reformia Algotrading SQX desde sesión anterior.
Adjunto este documento de continuidad.

Estado: 6 ganadoras de oro confirmadas (3 LINEAR H1 Capa 2 + 3 H4 Capa 1).
Metodología: 2 capas + Champion/Challenger + Test de Descomposición.

Siguiente paso quiero hacer: [DECIDIR]
   - Test de Descomposición sobre 0.5287260
   - Capa 2 sobre templates restantes XAUUSD H1 con BS_Filtros_v6
   - Mining XAUUSD M30 BS_Tendencia
   - Pre-check AUDCAD H4
   - Verificación MT5 sobre las 6 ganadoras
"
```

---

**Fecha del documento:** Mayo 2026
**Versión:** 1.0
**Autor:** Sesión Claude Reformia Algotrading
**Próxima revisión:** según necesidad operativa
