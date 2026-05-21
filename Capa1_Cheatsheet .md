# CAPA 1 — Cheatsheet Operativo

**Formato uniforme:** Settings + Filtering + Explicación por cada test

---

## CONFIG BASE BUILDER

### Settings

```
Trade direction: Long-only (oro/índices) | L+S (Forex)
ATM: OFF
Allow conditions: 1-2

Exit Methods:
   ExitAfterBars: 20 fijo
   SL/TP/Trailing: OFF

Money Management:
   Capital: $100,000
   Method: Fixed amount
   RiskedMoney: $200 (0.2%)
   Max lots: 3 (oro) / 5 (Forex Major) / 2 (índices)

Fitness: R Expectancy (Van Tharp)
```

### Filtering Global

```
PF >= 1.10
# trades > 100
R Expectancy > 0.05
```

### Explicación

Capa 1 busca edge puro. Sin SL/TP, las métricas operativas (Sharpe, DD%) se distorsionan. R Expectancy mide ganancia por unidad de riesgo, ideal aquí. Filtros permisivos para no descartar edges válidos.

---

## TEST 1 — RETEST 0 (Período Completo)

### Settings

```
Period: 2017.10 — 2026.04 (rango completo, incluye Forward)
Re-optimize: NO (retest pasivo)
```

### Filtering

```
PF > 1.0
# trades > 100
Ret/DD > 1.0
```

### Explicación

Backtest sobre TODA la historia disponible. Filtros más permisivos que mining (PF>1.0 vs ≥1.10) porque validamos supervivencia.

---

## TEST 2 — RETEST 1 (OOS Hacia Atrás 2010-2017 · Dukascopy)

### Settings

```
Data: Dukascopy (broker distinto al mining IS)
Period: 2010.01 — 2017.12   (~7 años, otro broker, régimes no-cubiertos)
Re-optimize: NO (retest pasivo)
```

### Filtering (práctica real)

```
NP > 0           ← gana algo en otro broker + régime distinto
# trades > 50    ← operó suficiente para confiar
```

**NO se exige** PF/Ret/DD específicos — sample estructuralmente distinto:
otro broker (ticks/spread distintos) + régimes no presentes en mining IS:
  - 2010-2012 BULL extremo oro post-QE
  - 2013-2015 BEAR estructural oro
  - 2016-2017 Brexit + Trump election

### Explicación

Doble validación: **broker distinto Y régime distinto**. Si pasa con NP>0 y operó >50 veces, el edge tiene direccionalidad robusta inter-broker e inter-régime. Esta es la prueba CRÍTICA de no-fragilidad — especialmente importante para XAU LONG (sobrevivir BEAR estructural 2013-2015).

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
☑ Max DD % (HBP, Conf. 80%) <= 200% of Max DD %
```

### Explicación

Re-muestrea bloques de barras manteniendo dependencias temporales. Verifica que el edge no depende de patrones secuenciales muy específicos. Test rápido.

---

## TEST 4 — MC (Monte Carlo Trades)

### Settings

```
Number of simulations: 200
Use Full sample: ON

Métodos a marcar:
   ☑ Randomize trades order, with method Resampling
   ☐ Modified randomize trades order
   ☐ Randomly skip trades, with probability 10%   ← DESACTIVAR

Default Method: Resampling
```

### Filtering

```
☑ Net profit (MC trades, Conf. 80%) >= 50% of Net profit
☑ Max DD % (MC trades, Conf. 80%) <= 200% of Max DD %
```

### Explicación

Reordena los trades aleatoriamente. Si la rentabilidad colapsa al reordenar, el edge depende del orden específico (frágil).

**Skip trades DESACTIVADO** porque en Capa 1 sin SL/TP los trades son "puros" del edge; saltarse 10% descarta estrategias con muestra pequeña pero edge válido.

---

## TEST 5 — MC2 (Monte Carlo Retest Methods) — OPCIONAL

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
   ☐ Randomize slippage
   ☑ Randomize spread
   ☐ Randomize starting bar
   ☐ Randomize strategy parameters   ← DESACTIVAR (lo testa SPP)
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
```

### Filtering

```
☑ CAGR/Max DD % (MC retest, Conf. 100%) >= 0
☑ CAGR/Max DD % (MC retest, Conf. 95%) >= 30% of CAGR/Max DD %
```

### Explicación

Re-ejecuta el backtest con perturbaciones del MERCADO (no del orden). Verifica robustez a slippage, gaps, spreads variables.

**10% (no 20%) y spread 10-25 (no 30-50):** valores realistas en oro Darwinex.
**Randomize parameters DESACTIVADO:** lo testa SPP, aquí solo perturbaciones del mercado.
**30% (no 50%):** umbral realista en Capa 1 sin SL.

**OPCIONAL:** si vas justo de tiempo, desactiva MC2 en Capa 1 (aplica solo en Capa 2).

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

   ☑ Periods                              ← MARCAR (entradas)
   ☑ Constants                            ← MARCAR (entradas)
   ☐ Shifts
   ☐ Other params
   ☐ Entry (levels)
   ☐ Entry (logic)
   ☑ Exit params (SL, PT,...) only used   ← MARCAR (incluye ExitAfterBars=20)
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

Varía cada parámetro ±30% (Up 130 / Down 70) en 12 pasos. Busca "zona estable" (plateau de Fitness) alrededor del valor original.

**Periods + Constants:** testa robustez del edge (KER 27, LinReg 40, ATR 14).
**Exit params:** incluye ExitAfterBars=20 (técnicamente Exit param).
**Apply optimized OFF:** Sequential testa robustez, NO produce mejores parámetros.

**Filtros:**
- 80% pass: estándar profesional
- 5 valores consecutivos en stable area = 5/12 = 42% del rango estable
- 25% fitness range: el plateau no puede caer más del 25% del máximo

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

Genera estrategias con entradas ALEATORIAS y compara con tu estrategia. Si una random produce más profit, tu edge no es real.

**Z-score >= 2:** tu estrategia al menos 2 desviaciones estándar por encima del random (95% significancia).

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

**Preserve 85%:** mantiene 85% de propiedades estadísticas.
**Warmup 200:** primeras 200 barras para estabilizar indicadores.

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
   ● Your own settings              ← consistencia con Sequential y WFM

   ☑ Periods                        ← MARCAR (entradas)
   ☑ Constants                      ← MARCAR (entradas)
   ☐ Shifts
   ☐ Other params
   ☑ Entry (levels)                 ← MARCAR (niveles de filtros)
   ☐ Entry (logic)
   ☑ Exit params only used          ← MARCAR (incluye ExitAfterBars=20)
   ☐ Exit params unused
   ☐ Boolean params
```

### Filtering

```
Optimization Profile conditions:
   ☑ % of Profitable Optimizations >  30
   ☑ Average profit (in $) of all optimizations is > $ 0
   ☑ Uniform distribution - less than 10 changes from positive to negative
   ☐ Best Optimization profit < 1 StDev of average profit   ← DESACTIVAR

System Parameters Permutation conditions:
   ☑ 80% of Net profit (Median ≥) >= 40% of Net profit
   ☑ 80% of Max DD % (Median ≤) <= 200% of Max DD %
```

### Explicación

Optimiza la estrategia 3000 veces permutando parámetros marcados (Periods + Constants + Entry levels + Exit params). Construye distribución estadística de resultados.

**Your own settings (no Recommended):** control explícito sobre qué se optimiza. Consistencia con Sequential y WFM de Capa 1 (que también usan Your own settings con las mismas marcas excepto Entry levels).

**Periods + Constants + Entry levels + Exit params:** en Capa 1 queremos validar TODO el sistema (entradas + niveles + ExitAfterBars).

**% Profitable > 30:** al menos 30% de permutaciones rentables (permisivo para Capa 1).
**Uniform distribution < 10:** no más de 10 cambios + → - en la curva de profits permutados.
**Best Optimization < 1 StDev DESACTIVADO:** filtro contra-intuitivo, descarta estrategias con pico claro pero válidas.
**40% Net profit (no 50%):** Capa 1 sin SL/TP es más volátil, umbral realista.

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
   Start: 5
   Stop: 8
   Step: 1

Maximum tests: 3000

Value distribution:
   Up: 20
   Down: 20
   Max steps: 8

What to parametrize:
   ● Your own settings

   ☑ Periods                              ← MARCAR
   ☑ Constants                            ← MARCAR
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

Robustness conditions (6 activas):
   ☑ WF Net profit (OOS) > 0
   ☑ WF Stability of Net profit > 60 %
   ☑ WF Special - Percentage of profitable runs > 60 %
   ☑ WF Special - Max profit in one run as % of total < 50 %
   ☑ WF Special - Min trades in one run > 20
   ☑ WF Special - Max % Drawdown in one run <= 50 %

   ☐ WF Stability of Drawdown < 130 %
   ☐ WF Stability of Ret/DD Ratio > 60 %
```

### Explicación

Divide el periodo en N ventanas rolling, optimiza en mini-IS, testa en mini-OOS. Repite con N×M configuraciones (9 OOS% × 4 runs = 36 combinaciones).

**Walk-Forward type Simulated (fastest):** Exact tarda 10-20x más sin beneficio. CRÍTICO usar fastest.
**Periods + Constants + Entry levels + Exit params:** testa robustez completa del edge.
**Apply optimized OFF:** WFM testa robustez, NO produce mejores parámetros.

**Filtros:**
- Robustness score 60% (no 80%): Capa 1 sin SL es más volátil
- Profitable runs 60% (no 70%): acomoda mayor volatilidad
- Max DD 50% (no 25%): sin SL los DD son inherentemente mayores
- Max profit in one run < 50%: anti curve-fitting (no concentrar profit en una ventana)
- Min trades > 20: muestra mínima por ventana

---

## TEST 11 — FOWARD (Forward 2024-2026)

### Settings

```
Period: 2024.01 — 2026.04 (~2.5 años)
Re-optimize: NO (retest pasivo)
Direction: igual al mining
```

### Filtering

```
PF > 1.0
# trades > 30      ← más bajo por periodo corto
Ret/DD > 0.5       ← muy permisivo (Forward es validación)
```

### Explicación

Datos completamente intocados durante mining. Última prueba antes de Capa 2.

**# trades > 30 (no 100):** proporcional al periodo (~2.5 años).
**Ret/DD > 0.5 (no 1.0):** Forward es supervivencia, no excelencia.
**CRÍTICO:** sin pasar Forward NO se debe ir a Capa 2.

---

## TESTS NO RECOMENDADOS EN CAPA 1

### Backtests on additional markets

**Recomendación: DESACTIVAR**

Probar oro H1 en otro activo (ej. AUDCAD D1) compara peras con manzanas. Casi todas las estrategias fallan.

### Higher backtest precision (1 minute tick simulation)

**Recomendación: OPCIONAL** (muy lento)

Simulación tick-by-tick es más precisa pero MUY lenta. Reservar para Capa 2 sobre finalistas.

### Walk-Forward Optimization (WFO)

**Recomendación: DESACTIVAR** (redundante con WFM)

WFM es superior y hace lo mismo. Tener ambos es redundante.

---

## ORDEN DE EJECUCIÓN

```
1.  Mining IS 2017-2023        (con cross-checks activos)
2.  RETEST 0 período completo  (validación temporal)
3.  RETEST 1 OOS 2010-2017     (validación retroactiva)
4.  HBP                        (rápido)
5.  MC                         (Resampling, sin Skip)
6.  MC2                        (opcional)
7.  Sequential                 (Periods + Const + Exit)
8.  Monkey Test                (vs random)
9.  Synthetic Bootstrap V2     (preserve 85%)
10. SPP                        (Recommended, Net 40%)
11. WFM                        (Simulated, robustness 60%)
12. FOWARD 2024-2026           (CRÍTICO último)
```

---

## EMBUDO ESPERADO

```
Mining IS:                ~700-1000 estrategias
   ↓
RETEST 0:                 ~250-400
   ↓
retest 1 OOS:             ~30-100
   ↓
HBP:                      ~25-80
   ↓
MC:                       ~10-50
   ↓
MC2 (si activo):          ~8-30
   ↓
Sequential:               ~5-20
   ↓
Monkey Test:              ~5-15
   ↓
Synthetic:                ~3-10
   ↓
SPP:                      ~2-8
   ↓
WFM:                      ~1-5
   ↓
FOWARD:                   ~1-3 ⭐ ganadoras

Tasa supervivencia: 0.1-0.5% del mining inicial
```

---

## CHECKLIST DE APLICACIÓN

```
Antes de lanzar el mining:
   ☐ Money Management configurado ($200, max lots)
   ☐ Fitness: R Expectancy
   ☐ Filtros mining: PF≥1.10, #trades>100, R Exp>0.05
   ☐ ExitAfterBars=20, sin SL/TP/Trailing
   ☐ Cross-checks activos: HBP, MC, Sequential, Synthetic, SPP, WFM, FOWARD
   ☐ MC sin Skip trades
   ☐ MC2: opcional, si lo activas con config conservadora
   ☐ Sequential: Periods + Constants + Exit params, Apply OFF
   ☐ SPP: Recommended parameters, Best Opt < 1 StDev DESACTIVADO
   ☐ WFM: Simulated (fastest), Periods + Const + Entry + Exit, Apply OFF
   ☐ Filtros WFM: robustness 60%, Max DD 50%, profitable 60%

Durante el mining:
   ☐ Monitorear progreso
   ☐ Verificar números intermedios coherentes con embudo

Después del mining:
   ☐ Aplicar filtros estrictos sobre databank
   ☐ Filter by correlation 0.7
   ☐ Identificar templates únicos
   ☐ Validar Forward (si no aplicado en pipeline)
   ☐ Templates ganadores → Capa 2
```

---

## REGLAS DE ORO CAPA 1

✅ **HACER:**
- Apply optimized parameters: SIEMPRE OFF (Sequential, WFM, SPP)
- Walk-Forward type: Simulated (fastest)
- Filtros del retest más permisivos que mining
- Marcar Periods + Constants + Exit params en Sequential/WFM
- Recommended parameters en SPP
- Aplicar TODOS los tests en orden

❌ **NO HACER:**
- Aplicar valores optimizados (rompe metodología)
- Backtests on additional markets en activos muy distintos
- Filtros estrictos en retest (descarta estrategias robustas)
- Randomize parameters en MC2 (lo cubre SPP)
- Walk-Forward Exact (10-20x más lento sin beneficio)
- Saltarse FOWARD (datos intocados son críticos)

---

**Documento operativo:** Mayo 2026
**Estado:** Configuración validada en mining XAUUSD H1 (743 → 2 estrategias supervivientes)
