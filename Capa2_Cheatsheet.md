# CAPA 2 — Cheatsheet Operativo

**Formato uniforme:** Settings + Filtering + Explicación por cada test

**Objetivo de Capa 2:** convertir el edge validado en Capa 1 en estrategia OPERABLE añadiendo SL + TP + Trailing optimizados.

---

## CONFIG BASE BUILDER (Capa 2)

### Settings

```
Trade direction: Long-only (oro/índices) | L+S (Forex)
ATM: OFF
Allow conditions: 1-2 random conditions (filtros adicionales)

AlgoWizard:
   Cargar template ganador de Capa 1 como BASE
   Edge: NO RANDOM (fijo del template)
   Random conditions: 1-2 filtros adicionales

Exit Methods:
   ExitAfterBars: 20 (opcional, mantener o desactivar)
   Stop Loss: ATR-based (random)
   Profit Target: ATR-based (random)
   Trailing Stop: ATR-based (random)

Building blocks:
   Cargar BS_Filtros_v5.sqb (con Trailing limpio)

Money Management:
   Capital: $100,000
   Method: Fixed amount
   RiskedMoney: $200 (0.2%)
   Max lots: 3 (oro) / 5 (Forex Major) / 2 (índices)

Fitness: Weighted Fitness con 5 métricas peso=1
```

### Strategy Quality (Fitness)

```
● Weighted Fitness (multiple goals)

Métricas (todas peso 1):
   ☑ CAGR/Max DD %       Maximize
   ☑ Profit Factor       Maximize
   ☑ R Expectancy        Maximize
   ☑ # of Trades         Maximize
   ☑ Avg. % Drawdown     Minimize
```

### Filtering Global durante mining

```
PF >= 1.20
# trades > 100
(Sharpe y SQN QUITADOS — descartan estrategias buenas)
```

### Explicación

Capa 2 mantiene el edge fijo del template (no toca KER, LinReg, etc.) y solo varía:
- 1-2 filtros adicionales random
- SL/TP/Trailing optimizados con ATR-based

Weighted Fitness con 5 métricas porque ya hay gestión completa, optimizamos múltiples dimensiones operativas. Filtros más estrictos que Capa 1 (PF≥1.20 vs ≥1.10) porque ahora exigimos calidad operativa.

---

## TEST 1 — RETEST 0 (Período Completo)

### Settings

```
Period: 2017.10 — 2026.04 (rango completo)
Re-optimize: NO
```

### Filtering

```
PF > 1.0
# trades > 100
Ret/DD > 1.0
```

### Explicación

Igual que Capa 1. Validación temporal sobre todo el histórico disponible. Filtros permisivos para no descartar estrategias con métricas correctas pero menos brillantes que en IS.

---

## TEST 2 — RETEST 1 (OOS Hacia Atrás 2010-2017 · Dukascopy)

### Settings

```
Data: Dukascopy (broker distinto al mining IS = Darwinex)
Period: 2010.01 — 2017.12   (~7 años, otro broker, régimes no-cubiertos)
Re-optimize: NO
```

### Filtering (práctica real, más permisivo que el original)

```
NP > 0              ← gana algo en otro broker + régime distinto
# trades > 50       ← operó suficiente para confiar
```

**NO se exige** PF/Ret/DD específicos del mining — el sample es estructuralmente distinto:
- Otro broker (ticks/spread distintos)
- Régime 2010-2017 incluye:
  - 2010-2012: BULL extremo oro post-QE ($1200→$1900)
  - 2013-2015: **BEAR estructural oro** ($1900→$1050)
  - 2016-2017: turbulencia Brexit + Trump election
- DD esperado naturalmente mayor que en el sample principal

### Explicación

Doble validación: **broker distinto Y régime distinto**. Si pasa con NP>0 y operó >50 veces, el edge tiene direccionalidad robusta inter-broker e inter-régime.

Veredicto:
- **PASA (NP>0 + #trd>50)**: `cross-validated` — edge robusto en régimes históricos adversos
- **FALLA**: el edge puede ser específico de régime 2018+; degradar adopción o descartar
- Para XAU LONG: pasar BEAR estructural 2013-2015 es la prueba CRÍTICA de no-fragilidad

---

## TEST 3 — HBP (History Bootstrap Performance)

### Settings

```
Number of simulations: 100
Use Full sample: ON
```

### Filtering

```
☑ Net profit (HBP, Conf. 80%) > 0
☑ Max DD % (HBP, Conf. 80%) <= 150% of Max DD %
```

### Explicación

Igual configuración que Capa 1. Filtro Max DD más estricto (150% vs 200%) porque en Capa 2 con SL/TP el DD debe estar más controlado.

---

## TEST 4 — MC (Monte Carlo Trades)

### Settings

```
Number of simulations: 200
Use Full sample: ON

Métodos a marcar:
   ☑ Randomize trades order, with method Resampling
   ☐ Modified randomize trades order
   ☑ Randomly skip trades, with probability 10%   ← ACTIVAR en Capa 2

Default Method: Resampling
```

### Filtering

```
☑ Net profit (MC trades, Conf. 80%) >= 50% of Net profit
☑ Max DD % (MC trades, Conf. 80%) <= 150% of Max DD %
```

### Explicación

Reordena trades. Si la rentabilidad colapsa al reordenar, el edge depende del orden específico.

**Skip trades ACTIVADO en Capa 2 (a diferencia de Capa 1):** simula errores de ejecución reales (slippage, conexión perdida) que en operativa real con SL/TP sí pueden ocurrir. En Capa 1 lo desactivamos porque sin SL/TP descartaba estrategias válidas con muestra pequeña.

**Max DD <= 150% (no 200%):** en Capa 2 con SL/TP el DD debe estar más controlado.

---

## TEST 5 — MC2 (Monte Carlo Retest Methods) — RECOMENDADO en Capa 2

### Settings

```
Number of simulations: 100
Use Full sample: ON
Backtest precision: Selected timeframe only (fastest)

Métodos a marcar:
   ☑ Randomize history data (by tick)
   ☐ Modified randomize history data
   ☐ Randomize OHLC history data
   ☐ Randomize min distance from price
   ☑ Randomize slippage                        ← ACTIVAR en Capa 2
   ☑ Randomize spread
   ☐ Randomize starting bar
   ☐ Randomize strategy parameters             ← DESACTIVAR (lo testa SPP)
   ☐ Customizable Randomize strategy parameters
   ☐ Real Monkey Test (PyRE)
   ☐ Synthetic Bootstrap V2

Default — Randomize history data:
   Probability up: 10
   Max up change: 10
   Probability down: 10
   Max change down: 10
   Keep connected: ON

Default — Randomize spread:
   Min: 10
   Max: 25

Default — Randomize slippage:
   Min: 0
   Max: 5
```

### Filtering

```
☑ CAGR/Max DD % (MC retest, Conf. 100%) >= 0
☑ CAGR/Max DD % (MC retest, Conf. 95%) >= 30% of CAGR/Max DD %
```

### Explicación

Re-ejecuta backtest con perturbaciones del MERCADO (no del orden de trades). En Capa 2 sí es recomendado porque las estrategias con SL/TP deben sobrevivir slippage real.

**Slippage 0-5 ACTIVADO en Capa 2:** simula slippage real en ejecución de SL/TP. En Capa 1 no aplicaba (sin SL/TP).
**Probability 10% y spread 10-25:** valores realistas en oro Darwinex.
**Randomize parameters DESACTIVADO:** lo testa SPP. Aquí solo testamos perturbaciones de mercado.
**30% al 95% confianza:** umbral realista para estrategias robustas.

---

## TEST 6 — SEQUENTIAL OPTIMIZATION

### Settings

```
Value distribution:
   Up: 130
   Down: 70
   Steps: 12

Apply optimized parameters to strategy: OFF ⚠️ CRÍTICO

What to parametrize:
   ● Your own settings

   ☐ Periods                              ← NO MARCAR (vienen del template fijo)
   ☐ Constants                            ← NO MARCAR
   ☐ Shifts
   ☐ Other params
   ☑ Entry (levels)                       ← MARCAR (niveles de filtros random)
   ☐ Entry (logic)
   ☑ Exit params (SL, PT,...) only used   ← MARCAR (SL+TP+Trailing+ExitAfterBars)
   ☐ Exit params unused
   ☐ Boolean params

   ☐ Symmetric variables for Long / Short
```

### Filtering

```
Sequential Optimization conditions:
   Percentage of parameters to pass the stability test: 80 %

Stability check:
   Number of results in stable area: 5
   Fitness stability range: 25 %
```

### Explicación

**Diferencia clave con Capa 1:** SOLO se marcan Entry levels + Exit params. Las entradas (Periods, Constants) vienen del template fijo de Capa 1 y NO se tocan.

**¿Qué optimiza Sequential en Capa 2?**
- Niveles de filtros random añadidos en Capa 2 (ej. si hay ADX > 25, se optimiza el "25")
- LongStopLossCef / ShortStopLossCef (multiplicadores SL)
- LongProfitTargetCef / ShortProfitTargetCef (multiplicadores TP)
- LongTrailingStopCef / ShortTrailingStopCef (multiplicadores Trailing)
- ExitAfterBars (si lo mantienes)

**Entry (levels) MARCADO:** consistencia con WFM y SPP de Capa 2. Si el filtro random tiene niveles numéricos (ADX > X, RSI > X), se testa robustez. Si NO tiene niveles (ATR >= ATR), Sequential no optimiza nada ahí pero no daña.

**Apply optimized OFF:** Sequential testa robustez, NO produce mejores parámetros. Aplicarlo rompe la metodología.

**Filtros idénticos a Capa 1:** 80% pass, plateau de 5 valores, 25% fitness range. Probadamente eficaces.

---

## TEST 7 — MONKEY TEST

### Settings

```
Number of simulations: 100
Confidence level: 80%
```

### Filtering

```
☑ Net profit (Monkey, Conf. 80%) > 0
   o alternativamente:
☑ Z-score >= 2
```

### Explicación

Igual que Capa 1. Compara con estrategias random. Si una random produce más profit que la tuya, tu edge no es real.

En Capa 2 con SL/TP el test es más exigente porque las estrategias random también tienen SL/TP, así que pasar este test demuestra edge genuino.

---

## TEST 8 — SYNTHETIC BOOTSTRAP V2

### Settings

```
Number of simulations: 100
Synthetic Bootstrap V2: ON
Warmup: 200
Preserve: 85%
```

### Filtering

```
☑ Net profit (Synthetic, Conf. 80%) >= 50% of Net profit
```

### Explicación

Genera versiones SINTÉTICAS del histórico (similares estadísticamente pero distintas) y testa la estrategia. Si depende del orden específico del histórico, falla.

**Mismo umbral que Capa 1 (50% al 80% confianza)** porque mide algo intrínseco al edge: si funciona con orden distinto del histórico.

---

## TEST 9 — SPP (System Parameter Permutation)

### Settings

```
Maximum tests: 3000

Value distribution (% from original value):
   Up: 20
   Down: 20
   Max steps: 25

What to parametrize:
   ☐ Recommended parameters
   ● Your own settings              ← CAMBIO vs Capa 1

   ☐ Periods                        ← NO (template fijo)
   ☐ Constants
   ☐ Shifts
   ☐ Other params
   ☑ Entry (levels)                 ← MARCAR (niveles de filtros random añadidos)
   ☐ Entry (logic)
   ☑ Exit params only used          ← MARCAR (SL+TP+Trailing+ExitAfterBars)
   ☐ Exit params unused
   ☐ Boolean params
```

### Filtering

```
Optimization Profile conditions:
   ☑ % of Profitable Optimizations >  50    ← más estricto que Capa 1 (era 30)
   ☑ Average profit (in $) of all optimizations is > $ 0
   ☑ Uniform distribution - less than 10 changes from positive to negative
   ☐ Best Optimization profit < 1 StDev of average profit   ← DESACTIVAR

System Parameters Permutation conditions:
   ☑ 80% of Net profit (Median ≥) >= 50% of Net profit     ← 50% (no 40%)
   ☑ 80% of Max DD % (Median ≤) <= 150% of Max DD %        ← 150% (no 200%)
```

### Explicación

**Diferencia clave con Capa 1:** "Your own settings" en lugar de "Recommended parameters". Solo testa Entry levels (niveles de filtros random) + Exit params (SL/TP/Trailing/ExitAfterBars).

**Por qué NO Recommended:** en Capa 2 las entradas (Periods, Constants) son del template fijo. Si Recommended las toca, rompes la metodología.

**Por qué Entry levels SÍ:** los filtros random añadidos en Capa 2 (ej. ADX > 25) tienen niveles que sí queremos validar.

**Filtros más estrictos en Capa 2:**
- % Profitable > 50 (vs 30): exigimos más calidad
- Net profit ≥ 50% (vs 40%): con SL/TP debe mantener mejor
- Max DD ≤ 150% (vs 200%): con SL el DD debe estar más controlado

---

## TEST 10 — WFM (Walk-Forward Matrix)

### Settings

```
Walk-Forward type: Simulated IS, Simulated OOS (fastest) ⚠️ CRÍTICO
Period type: Percent + Floating

Out of Sample %:
   Start: 20
   Stop: 36
   Step: 2

Walk Forward runs:
   Start: 4
   Stop: 8
   Step: 1

Maximum tests: 3000

Value distribution:
   Up: 20
   Down: 20
   Max steps: 8

What to parametrize:
   ● Your own settings

   ☐ Periods                              ← NO (template fijo)
   ☐ Constants
   ☐ Shifts
   ☐ Other params
   ☑ Entry (levels)                       ← MARCAR
   ☐ Entry (logic)
   ☑ Exit params (SL, PT,...) only used   ← MARCAR
   ☐ Exit params unused
   ☐ Boolean params

   ☐ Symmetric variables for Long / Short

Apply optimized parameters: OFF ⚠️ CRÍTICO
```

### Filtering

```
WF Matrix Filter:
   Filter passes when it finds an area of:
      3 rows  AND  3 columns
   where at least 7 results have robustness score >= 60 %

Robustness conditions (6 activas — DISTINTAS a Capa 1):
   ☑ WF Winning Percent (OOS) >= 70% of WF Winning Percent (IS)
   ☑ WF Stability of Net profit >= 60 %
   ☑ WF Special - Percentage of profitable runs >= 70 %
   ☑ WF Special - Max profit in one run < 50 %
   ☑ WF Stagnation <= 365 días
   ☑ WF Ret/DD Ratio >= 5
```

### Explicación

**Diferencia clave con Capa 1:** SOLO Entry levels + Exit params. Las entradas del template no se tocan.

**Walk-Forward Runs Start: 4 (no 5):** ligeramente más permisivo en Capa 2 porque las estrategias con SL/TP son más sensibles a configuraciones extremas.

**Filtros DISTINTOS a Capa 1 (más operativos):**
- **WF Winning % OOS >= 70% IS:** el % de aciertos OOS debe ser al menos 70% del IS (consistencia)
- **WF Profitable runs >= 70%:** mayoría de ventanas rentables (más estricto que Capa 1)
- **WF Stagnation <= 365 días:** no más de 1 año sin nuevo equity high
- **WF Ret/DD Ratio >= 5:** umbral profesional para estrategias operables (filtro fuerte)
- **Max profit in one run < 50%:** anti curve-fitting

**Robustness score 60% (no 80%):** mismo que Capa 1, deja pasar estrategias robustas pero no perfectas.

---

## TEST 11 — FOWARD (Forward 2024-2026)

### Settings

```
Period: 2024.01 — 2026.04 (~2.5 años)
Re-optimize: NO
Direction: igual al mining
```

### Filtering

```
PF > 1.0
# trades > 30
Ret/DD > 1.0          ← más estricto que Capa 1 (era 0.5)
```

### Explicación

Datos completamente intocados durante mining y todos los tests anteriores.

**Ret/DD > 1.0 (no 0.5):** en Capa 2 con SL/TP exigimos al menos Ret/DD operativo. Si en Forward el Ret/DD baja por debajo de 1, la estrategia no es operable en datos nuevos.

**CRÍTICO:** sin pasar Forward NO se debe desplegar en MT5. Una estrategia que falla Forward es un overfit.

---

## FILTROS ESTRICTOS POST-CAPA 2 (manual sobre databank)

Aplicar antes de los tests de robustez para reducir el universo:

```
PF >= 1.5
Ret/DD >= 5
R Expectancy >= 0.30
Stagnation < 25%
# trades > 150
```

### Explicación

Estos son filtros de **calidad operativa**. Una estrategia que pasa estos filtros tiene métricas profesionales:
- PF ≥ 1.5: rentable con margen amplio
- Ret/DD ≥ 5: ganancia 5x el peor DD histórico
- R Expectancy ≥ 0.30: edge significativo por unidad de riesgo
- Stagnation < 25%: menos de 1/4 del tiempo sin progresar
- # trades > 150: significancia estadística sólida

---

## TESTS NO RECOMENDADOS EN CAPA 2

### Backtests on additional markets

**Recomendación: DESACTIVAR**

Mismo razonamiento que Capa 1. Probar oro H1 en otro activo es comparar peras con manzanas.

### Higher backtest precision

**Recomendación: OPCIONAL solo sobre finalistas**

Sobre 3-5 estrategias finales puede tener sentido para validación última. Sobre cientos es prohibitivo.

### Walk-Forward Optimization (WFO)

**Recomendación: DESACTIVAR** (redundante con WFM)

WFM hace lo mismo y más.

---

## ORDEN DE EJECUCIÓN CAPA 2

```
1.  Mining IS 2017-2023 sobre template Capa 1
    (Weighted Fitness, PF≥1.20, #trades>100)
2.  RETEST 0 período completo
3.  Filtros estrictos post-Capa 2 manuales
    (PF≥1.5, Ret/DD≥5, R Exp≥0.30, Stagnation<25%, #trades>150)
4.  RETEST 1 OOS 2010-2017
5.  HBP
6.  MC (con Skip trades activado)
7.  MC2 (con Slippage activado)
8.  Sequential (solo Exit params)
9.  Monkey Test
10. Synthetic Bootstrap V2
11. SPP (Your own settings, Entry levels + Exit params)
12. WFM (Entry levels + Exit params, filtros operativos)
13. FOWARD 2024-2026
14. Filter by correlation (threshold 0.7)
15. 1-3 ganadoras por template
```

---

## EMBUDO ESPERADO CAPA 2

```
Mining inicial:           ~500-2000 estrategias por template
   ↓
Filtros automáticos:      ~100-500
   ↓
RETEST 0:                 ~80-400
   ↓
Filtros estrictos manual: ~30-100
   ↓
retest 1 OOS:             ~10-30
   ↓
HBP:                      ~10-25
   ↓
MC:                       ~5-20
   ↓
MC2:                      ~5-15
   ↓
Sequential:               ~3-10
   ↓
Monkey Test:              ~3-10
   ↓
Synthetic:                ~2-7
   ↓
SPP:                      ~2-5
   ↓
WFM:                      ~1-4
   ↓
FOWARD:                   ~1-3 ⭐ ganadoras del template

Tasa supervivencia: 0.05-0.3% del mining inicial
```

---

## DIFERENCIAS CLAVE CAPA 1 vs CAPA 2

### Tabla comparativa

| Aspecto | Capa 1 | Capa 2 |
|---|---|---|
| Edge | Variable (mining) | Fijo (template) |
| SL/TP/Trailing | NO | SÍ (random ATR-based) |
| ExitAfterBars | 20 fijo | Variable o mantener 20 |
| Filtros mining | PF≥1.10 | PF≥1.20 |
| Fitness | R Expectancy | Weighted (5 métricas) |
| MC Skip trades | DESACTIVADO | ACTIVADO |
| MC2 Slippage | DESACTIVADO | ACTIVADO |
| MC2 estado | OPCIONAL | RECOMENDADO |
| Sequential parametrize | Periods + Const + Exit | Entry levels + Exit |
| WFM parametrize | Periods + Const + Entry + Exit | Entry + Exit |
| WFM filtros | DD-focused | Stagnation, Ret/DD, Win% |
| SPP modo | Recommended | Your own settings |
| SPP Net profit | ≥ 40% | ≥ 50% |
| Forward Ret/DD | > 0.5 | > 1.0 |
| Tasa supervivencia | 0.1-0.5% | 0.05-0.3% |

### Diferencias específicas en cross-checks

**Sequential:**
- Capa 1: Periods + Constants + Exit params (3 categorías)
- Capa 2: Entry levels + Exit params (2 categorías)

**WFM:**
- Capa 1: Periods + Constants + Entry levels + Exit params (4 categorías)
- Capa 2: Entry levels + Exit params (2 categorías)

**SPP:**
- Capa 1: Recommended parameters (cubre todo automáticamente)
- Capa 2: Your own settings con Entry levels + Exit params

**MC:**
- Capa 1: Solo Randomize order (sin Skip)
- Capa 2: Randomize order + Skip trades

**MC2:**
- Capa 1: Solo history + spread (Skip slippage)
- Capa 2: history + spread + slippage

---

## CHECKLIST DE APLICACIÓN CAPA 2

### Antes del mining

```
☐ Template Capa 1 seleccionado y validado
☐ AlgoWizard configurado con template como base
☐ Edge: NO RANDOM
☐ Random conditions: 1-2
☐ SL/TP/Trailing: ATR-based random
☐ BS_Filtros_v5.sqb cargado
☐ Money Management: $200, max lots correcto
☐ Fitness: Weighted Fitness con 5 métricas
☐ Filtros mining: PF≥1.20, #trades>100
☐ Cross-checks activos (todos los relevantes)
```

### Durante el mining

```
☐ Monitorear progreso
☐ Verificar coherencia con embudo esperado
☐ Si pasan 0 estrategias por algún test, considerar relajar filtros
```

### Después del mining

```
☐ Aplicar filtros estrictos sobre databank
☐ Filter by correlation 0.7
☐ Validar Forward sobre supervivientes
☐ Identificar 1-3 ganadoras por template
☐ Documentar TIER 1 / TIER 2 / TIER 3 según margen de pase
```

---

## REGLAS DE ORO CAPA 2

✅ **HACER:**
- Edge FIJO del template, NO tocar entradas
- Apply optimized parameters: SIEMPRE OFF
- Walk-Forward type: Simulated (fastest)
- Sequential/WFM/SPP: SOLO marcar Entry levels + Exit params
- MC con Skip trades activado
- MC2 con Slippage activado
- Filtros más estrictos que Capa 1
- WFM con filtros operativos (Ret/DD, Stagnation, Win%)

❌ **NO HACER:**
- Marcar Periods/Constants en Capa 2 (rompe template)
- Aplicar valores optimizados (rompe metodología)
- "Recommended parameters" en SPP Capa 2 (toca entradas)
- Filtros laxos en Capa 2 (objetivo es excelencia operativa)
- Saltarse FOWARD (datos intocados son críticos)
- Aplicar optimizaciones del WFM (degrada NetProfit ~30% sin beneficio)

---

## CONFIGURACIONES OPCIONALES SEGÚN OBJETIVO

### Si quieres más estrategias supervivientes (umbral medio)

```
SPP: Net profit >= 40% (en lugar de 50%)
WFM: Robustness 50% (en lugar de 60%)
WFM: Profitable runs 60% (en lugar de 70%)
MC: Max DD <= 200% (en lugar de 150%)
```

### Si quieres pocas pero excepcionales (umbral alto)

```
SPP: Net profit >= 60%, Profitable >= 70%
WFM: Robustness 70%, Profitable runs 80%
WFM: Ret/DD >= 7
Filtros estrictos: PF >= 1.7, Ret/DD >= 7
```

### Si tienes prisa (test reducido)

```
DESACTIVAR: MC2, Synthetic, SPP
MANTENER: HBP, MC, Sequential, WFM, FOWARD
WFM: Out of Sample 25-35 step 5 (3 valores)
WFM: WF runs 5-7 step 1 (3 valores)
```

---

**Documento operativo:** Mayo 2026
**Estado:** Capa 2 validada en TEMPLATE LINEAR (1000 → 3 ganadoras)
**Estrategias confirmadas:** 0.621529 (TIER 1), 0.920817 (TIER 1.5), 0.553059 (TIER 2)
