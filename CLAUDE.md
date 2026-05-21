# CLAUDE.md — Reformia Algotrading SQX

**Proyecto:** generación y validación de estrategias algorítmicas en StrategyQuant X para despliegue en MT5 Darwinex.

**Operador:** Livan, Pamplona/Navarra, España.

**Cuenta destino:** Darwinex MT5 ~$100,000 (real).

**Estado:** Mayo 2026 — 10 estrategias adoptadas (4 NASDAQ H1 + 2 NASDAQ H4 + 3 XAUUSD + 1 AUDCAD M30). Política consolidada de 5 filtros con Salud Temporal contextual (sustituye Stagnation hard). Blocksettings v7 generados por TF (M5/M15/M30/H1/H4) con R:R razonable garantizado.

---

## METODOLOGÍA

### 2 capas (Tomas Nesnidal-style) — NO CAMBIAR

**CAPA 1 — Edge puro:**
- Edge: random
- Filtros: 0
- SL/TP/Trailing: NO
- Exit: ExitAfterBars=20 fijo
- Fitness: R Expectancy
- Filtros mining: PF≥1.10, #trades>100, R Exp>0.05

**CAPA 2 — Edge fijo + Filtros + Gestión:**
- Edge: FIJO del template Capa 1
- Filtros random: 1-2 condiciones
- SL/TP/Trailing: random ATR-based (**BS_Filtros_v7_<TF>**, según TF del proyecto)
- Fitness: Weighted Fitness (5 métricas peso=1)
- Filtros mining: PF≥1.20, #trades>100

### Reglas críticas

- **Apply optimized parameters: SIEMPRE OFF** (Sequential, WFM, SPP)
- **Walk-Forward type: SIEMPRE Simulated (fastest)** — Exact es 10-20x más lento sin beneficio
- **NO marcar Periods/Constants en Capa 2** (rompe template fijo)
- **Sequential/WFM/SPP en Capa 2:** marcar solo Entry levels + Exit params
- **Sequential/WFM/SPP en Capa 1:** marcar Periods + Constants + Entry levels + Exit params (Your own settings, NO Recommended)

### Direcciones por activo

```
Oro / Índices: Long-only (sesgo secular alcista)
Forex Majors: L+S
Forex Minors: L+S
USDJPY: cuidado con sesgo, verificar
```

**Verificación post-mining:** si en L+S una dirección aporta <30% del NP o es negativa, convertir a direccional pura.

---

## METODOLOGÍA DE PERÍODOS (mayo 2026 — regla de 3 períodos)

**Problema resuelto:** distintos activos tienen distinta calidad de data Dukascopy
(forex/oro limpio desde 2010, índices CFD solo desde 2019). Usar 2 métodos de
mining distintos creaba 2 sets de filtros incompatibles. La regla de 3 períodos
unifica el criterio.

### Los 3 períodos con roles distintos

```
1. MINING (buscar el edge) — mejor data disponible por activo
   Forex/Oro:  Dukas 2010-2023 IS  +  OOS 2024-2026   (sample 14y = robustez)
   Índices:    Darwinex 2018-2023 IS + OOS 2024-2026  (data limpia disponible)
   Add Market: Darwinex como mercado adicional en el mining (cross-broker in-mining)

2. FILTROS CAPA 2 (la VARA DE MEDIR — única para todos) — período común 2018-2026
   TODOS los activos se evalúan sobre 2018-01 → 2026, sin importar el broker
   de mining. Filtros ACTUALES sin cambios:
       PF≥1.5 · Ret/DD≥5 · RExp≥0.30 · Stag<25% · #trades>150 · R:R≥0.6
   Razón: comparar 16y (con BEAR estructural) vs 8y (solo BULL) es injusto.
   El mismo período de evaluación = comparación manzana-con-manzana.

3. CvC / ROBUSTEZ HISTÓRICA (bonus informativo, NO filtro hard) — sample completo
   Forex/Oro:  sample Dukas completo 2010-2026 (16y) → valida BEAR estructural 2013-15
   Índices:    sample Darwinex 8.5y
   El plus de robustez histórica suma en el veredicto pero NO descarta por filtro.
```

### Por qué esta regla funciona

- **Un solo set de filtros** para forex-Dukas e índices-Darwinex (no 2 calibraciones)
- **Vara de medir justa**: evaluar siempre 2018-2026 elimina el sesgo sample-length
- **El sample largo Dukas NO se desperdicia**: se usa en mining (selecciona edges
  robustos a 14 años) y en CvC (el bloque BEAR FUERTE 2013-15 valida el peor régime)
- **Validación cross-broker confirmada empíricamente**: las 14 estrategias del lote
  SSL XAUUSD, evaluadas en período común 2018-2026, dieron métricas Dukas≈Darwinex
  (PF disc <6%, Win% disc <4%, 0/14 DRIFT) → el edge no depende del feed.

### Caso validado — lote SSL XAUUSD H1 (mayo 2026)

Mining Dukas 2010-2023 produjo 14 estrategias con edge `SSL crosses SessionHigh`:
- Evaluadas sobre 2018-2026 (período común): **1 de 14** pasa 5/5 filtros (`0.125931`)
- CvC de `0.125931` sobre sample Dukas 16y: **PIERDE -$1,310 en BEAR estructural 2014**
- Veredicto: lote descartado — edge breakout alcista estructuralmente frágil a BEAR oro
- **Lección:** el método viejo (Darwinex 2018+) habría adoptado `0.125931` con falsa
  confianza (se ve 5/5 perfecta en 2018+). El sample Dukas 16y reveló la fragilidad
  real. El método nuevo descartó correctamente un mining entero antes de arriesgar capital.

### Scripts de soporte

- `scripts/analyze_dukas_csv_quality.py` — calidad data Dukas por activo+TF+año
- `scripts/compare_cross_broker.py` — comparación DK/DW + filtros sobre período común
- `scripts/cvc_single_strategy.py` — CvC con auto-N bloques (~12 meses/bloque)

---

## CHAMPION VS CHALLENGER

**Antes de Capa 2:** documentar métricas de Capa 1 como "Champion".

**Adoptar ganadoras Capa 2 ("Challengers") solo si superan 5 criterios:**

```
PF >= Champion × 1.05
Ret/DD >= Champion × 0.95
DD% <= Champion × 1.20
# trades >= Champion × 0.7
Forward 2024-2026: todos años positivos
```

**Pasa 5/5 → adoptar Challenger.**
**Pasa <5/5 → mantener Champion.**

**Implicación:** una Capa 1 robusta ES OPERABLE si su Champion no es superado **Y** la prop firm permite operar sin SL/TP.

---

## POLÍTICA CONSOLIDADA DE 5 FILTROS PARA ADOPCIÓN CAPA 2

**Hard filters: una estrategia debe pasar los 5 para ser adoptada. Si NINGUNA del mining los pasa, descartar el mining entero.**

| # | Filtro | Detecta |
|---|--------|---------|
| 1 | **CvC 4/4** (PF×1.05, Ret/DD×0.95, DD%×1.20, #trades×0.7) | Calidad histórica formal |
| 2 | **EGT v2 ≥ DEFENSIVE** (STRONG / COMPLIANT / DEFENSIVE) — método Miguel Jiménez refinado | Robustez por régimen del subyacente |
| 3 | **Salud temporal OK** (peak en 2ª mitad + DD@close <15% + Recovery ≥70%) | Estancamiento contextual (sustituye al Stag<365d hard) |
| 4 | **Supervivencia por régime ≥ DEFENSIVO** (Filtro #4 v2 — ver abajo) | Edge frágil a régimen adverso |
| 5 | **avg(últimos 3 OOS) ≥ 70% × avg(histórico)** | Adaptación al régimen actual |

**Filtro adicional R:R (post-mining a partir del v7):** TP_value / SL_value ≥ 0.6 (descarta combinaciones de gestión catastróficas).

### Filtro #4 v2 — Supervivencia por régime (mayo 2026)

**Reemplaza** el antiguo "9/9 OOS bloques positivos" que era irreal en sample largo
(16 años incluyen BULL + BEAR estructural + RANGE — pedir que un edge gane en TODOS
los régimes = pedir overfit).

**Filosofía:** *"domina en tu régime propio + sobrevive en los adversos"*. Una
estrategia ES un edge específico (breakout gana en BULL, mean-revert en RANGE, etc.);
no se le exige ganar en todo, se le exige no romperse en lo adverso.

**Régime propio** = detectado por arquetipo + dirección:
- breakout/trend-following long → BULL · short → BEAR
- mean-revert / scalper → RANGE

**2 variantes auto-seleccionadas por nº de bloques en régime adverso:**

```
ESTADÍSTICA  (≥3 bloques adversos — oro/forex sample largo 16y):
   avg(bloques adversos) ≥ −30% × avg(propio)  → ROBUSTO
   avg(bloques adversos) −30% a −50%           → DEFENSIVO
   avg(bloques adversos) < −50%                → FRÁGIL (edge roto en adversos)

POR-EVENTO   (<3 bloques adversos — índices CFD sample corto 8y):
   cada bloque adverso pierde < 1.5% capital   → ROBUSTO
   algún bloque adverso entre 1.5% y 2%        → DEFENSIVO
   algún bloque adverso pierde > 2% capital    → CATASTRÓFICO
```

**Componentes comunes (4A/4C/4D):**
- 4A: ≥80% de bloques del régime propio son positivos + avg propio > 0
- 4C: ningún bloque pierde > 2% capital (worst block)
- 4D: suma total claramente positiva

**Veredictos:** ROBUSTO ✓ · DEFENSIVO ⚠ (ambos = filtro #4 superado) · FRÁGIL ✗ · CATASTRÓFICO ✗✗

**Por qué 2 variantes:** los índices CFD no tienen historia BEAR suficiente (Dukas
malo pre-2019, solo BEAR 2022 + shock COVID 2020 en el sample). Con 1-2 bloques
adversos un test estadístico (avg) no es fiable → se evalúa cada bloque adverso
individualmente. El oro/forex con Dukas 16y sí tiene 4-6 bloques BEAR → test estadístico.

**El discriminante NO es el nombre del activo** sino el nº real de bloques adversos.
Un forex minado solo 8y usaría por-evento automáticamente. `detectAssetClass()`
solo etiqueta el contexto (INDEX/METAL/FOREX) para el reporte.

**Implementación:** `cvcFilter4v2()` + `detectAssetClass()` + `detectOwnRegime()` en
`js/sqxTradeAnalysis.js`. Integrado en `compute5Filters()`. El veredicto consolidado
muestra "✓ #4 ROBUSTO (14/16 OOS+)" con tooltip del modo y detalle.

**Caso validado:** `0.125931` (SSL XAUUSD) — el viejo filtro la descartaba por 11/16
OOS; el v2 la evalúa por su edge breakout-long → régime propio BULL, mide pérdida en
BEAR estructural → FRÁGIL si avg adverso < −50% propio. La estrategia que el método
viejo "adoptaba" con falsa confianza queda correctamente clasificada.

**Caso real validado:** mining USTEC H1 SMA — solo `0.4066882` pasa los 5 filtros (mining grande con 18 candidatas 4/4 CvC). Mining USTEC H1 SuperTrend — NINGUNA pasa (descartado entero, todas tienen R:R 1:2 desfavorable).

### Salud temporal contextual (filtro #3 detallado)

**Sustituye al filtro hard "Stagnation < X días"** que era engañoso (descartaba estrategias con Stag pasado ya superado).

3 sub-métricas calculadas sobre la equity acumulada por bloque OOS:

```
Peak Block:     en qué bloque OOS está el equity máximo
                  ≥ 2ª mitad del backtest → ✓ (estrategia activa en régimen reciente)
                  < 2ª mitad → ✗ (peak antiguo no superado)

DD at Close:    (peak_value - close_value) / peak_value
                  < 5%   → ✓ near peak (operacional sano)
                  5-15%  → ⚠ in pullback (bache controlado)
                  > 15%  → ✗ deep DD (no iniciar real ahora)

Recovery Index: avg(últimos 3 OOS) / avg(histórico)
                  ≥ 100% → ✓ accelerating
                  ≥ 70%  → ✓ steady
                  < 70%  → ✗ declining
```

**Status global:**
- `fresh` — peak en últimos 3 bloques (estrategia activa al cierre)
- `recovered` — peak en 2ª mitad, no en últimos 3 (tuvo bache pero recuperó)
- `old_peak` — peak en 1ª mitad, no superado después
- `declining` — DD del peak > 15% al cierre

**Implementación:** función `cvcComputeTemporalHealth(name)` en `js/cvcAnalysis.js`. Pills visuales en la columna "Salud temporal" de la tabla CvC: P:OOS#, R:%, DD:% con color verde/amarillo/rojo según umbrales. Filtro "Solo Salud temporal OK" disponible en la UI.

**Caso de uso (NASDAQ H4 CLOSE 0.3709379):**
- Stag 521d formal ❌ (>365d)
- PERO peak OOS8 (2ª mitad) ✓ + DD@close 2.65% ✓ + Recovery 112% ✓ → SALUD OK ✓
- Adoptada como #10 del stock pese a fallar el filtro Stag formal.

### Bloques OOS con fechas reales (mayo 2026)

Cada bloque OOS muestra:
- **Periodo real:** `YYYY-MM → YYYY-MM` calculado desde `regimeStartDate` → `regimeEndDate` / N bloques
- **Antigüedad:** pill `actual` / `-1a` / `-2a` / ... según años desde el final del bloque
  - Verde (recent): bloques de los últimos 1 año
  - Amarillo (mid): 2-4 años
  - Gris (old): ≥5 años

**Defaults inteligentes por activo** (función `cvcDefaultMiningRange`):
- Índices (NDX, US30, US500, GER40, SPX, USTEC, DAX, etc.): **2018-01-01 → 2026-04-01**
- Forex Majors/Minors + Oro: **2017-01-01 → 2026-04-01**

Los defaults se aplican automáticamente al cargar el Champion (símbolo auto-detectado). El usuario puede sobreescribir en los inputs y persiste en localStorage.

**Tooltip OOS enriquecido en el ranking:** distingue bloques negativos antiguos vs recientes:
```
Bloques negativos ANTIGUOS (>=5a): OOS1 (2017-01→2018-01, -8a), OOS2 (2018-01→2019-02, -7a)
⚠ Bloques negativos RECIENTES (<5a): OOS7 (2023-03→2024-03, -2a)
```
Esto evita descartar estrategias por baches del régime pre-2019 cuando los OOS recientes están limpios. **Solo los baches recientes (<5a) son banderas rojas reales.**

**Implementación:** funciones `cvcDefaultMiningRange(symbol)`, `cvcMonthLabel(idx, startStr)`, columnas "Periodo" y "Antig." en la tabla de régime. CSS `cvc-age-tag` con variantes `cvc-age-old/mid/recent`.

### EGT v2 (Miguel Jiménez refinado)

**Reemplaza** los 3 veredictos antiguos (COMPLIANT / RISK / FLAT) por **5 veredictos** con lógica por dirección y régimen:

```
Umbrales por dirección (configurables en UI, auto-detectados por # trades L/S del CSV):

Long-only (índices/oro long, forex long puro):
  BULL  pass=1.5  strong=2.5     ← régimen propio
  BEAR  pass=0.0  strong=1.0
  RANGE pass=0.0  strong=1.0

Short-only (forex short puro, índices short puro):
  BULL  pass=0.0  strong=1.0
  BEAR  pass=1.5  strong=2.5     ← régimen propio (espejo de long_only)
  RANGE pass=0.0  strong=1.0

Long+Short (forex L+S):
  BULL  pass=1.0  strong=2.0
  BEAR  pass=1.0  strong=2.0
  RANGE pass=0.5  strong=1.5

Min bloques por régimen: 2 (configurable). Si n<2 → INSUFFICIENT (no descarta).
```

**Auto-detección de dirección:** la web detecta la dirección del bot desde las columnas `# of trades (Long)` / `# of trades (Short)` del CSV (DETERMINISTA, confidence high). Si faltan, fallback a `np_long`/`np_short`, luego regex en nombre, luego símbolo del activo, finalmente default. Selecciona automáticamente el bloque de thresholds correcto.

**Caso real validado (AUDCAD M30 SHORT):** con thresholds `long_short` (incorrectos), 0.717084 salía STRONG. Con thresholds `short_only` correctos (BEAR pass=1.5), 0.717084 pasa a **RISK** porque BEAR avg 0.94 < 1.5 → confirma que NO es edge SHORT real (es fade de RANGE). Solo 0.1250791 sobrevive como STRONG SHORT genuino.

**5 veredictos:**

| Veredicto | Condición |
|-----------|-----------|
| **STRONG** ⭐ | Pasa todos los regímenes evaluados Y régimen dominante ≥ strong |
| **COMPLIANT** ✓ | Pasa todos los regímenes evaluados, alguno (no dominante) es strong |
| **DEFENSIVE** ⚠ | Pasa todos los regímenes evaluados pero ninguno llega a strong |
| **INSUFFICIENT** ❓ | Algún régimen importante tiene n<2 (no validable) |
| **RISK** ❌ | Pierde en algún régimen evaluado |

**Ventaja sobre EGT v1:** captura como DEFENSIVE estrategias que el v1 marcaba FLAT (erróneamente, eran "robustas defensivas" no rotas).

**Caso real validado (NASDAQ H4 CLOSE):**
- 0.3709379 (la adoptada): EGT v2 = DEFENSIVE (BULL avg 2.13, n=7) ✓
- 0.3501716 (alternativa descartada): EGT v2 = **RISK** (BULL avg 1.40 < 1.5) → confirma el descarte
- 0.4433912 / 0.1632183: STRONG (BULL avg 4.98 / 2.82) — pero fallan otros filtros (Stagnation extremo)

**Implementación:** `cvcComputeEGT(name)` en `js/cvcAnalysis.js` devuelve objeto con `verdict`, `dominantRegime`, `passByRegime`, `strongByRegime`, `insufficientRegimes`, `failedRegimes`. UI: tabla con celdas por régimen mostrando avg + icono (⭐/✓/❌/❓), tooltip enriquecido con detalles. Configurable: dirección (long_only/long_short) + min bloques.

**Tiebreakers para elegir entre veredictos iguales:**
1. Mayor avg en régimen dominante (más bloques, más representativo)
2. Menor avg en peor régimen evaluado (consistencia defensiva)
3. Menor varianza entre regímenes (consistencia entre régimenes)

### Coherencia Direccional (complementa a EGT v2)

Mientras EGT v2 usa **CAGR/Max DD %** (eficiencia ajustada), la **Coherencia Direccional** usa **Net Profit absoluto por bloque** para verificar que el bot realmente se comporta como su dirección declara. Veredictos:

| Veredicto | Significado |
|-----------|-------------|
| **OK** ✓ | trend-following coherente: gana en régimen propio (BULL para LONG, BEAR para SHORT) |
| **OK_MEAN_REVERT** 🌊 | **mean-reversion coherente:** gana sistemáticamente en RANGE (no en régimen direccional). Edge tipo fade de rebotes técnicos en lateralidad. |
| **SUSPICIOUS** ⚠ | patrón mixto, datos contradictorios |
| **WEAK** ⚠ | gana menos en régimen propio que en contrario |
| **BROKEN** ❌ | pierde sistemáticamente en su régimen propio → descarta hard |
| **N/A / INSUFFICIENT** ❓ | datos insuficientes |

**Criterio OK_MEAN_REVERT (SHORT-only):**
```
RANGE n >= 4 bloques
RANGE pos% >= 80% (gana en al menos 4/5 de los RANGE)
RANGE avg > 0 (positivo absoluto)
RANGE avg > BEAR avg (RANGE es el régime dominante real)
BEAR adverso no catastrófico:
   - si BEAR n>=2: BEAR avg >= 0 (no pierde sistemáticamente)
   - si BEAR n=1:  pérdida BEAR > -50% del avgAnnual del bot
Veredicto base != BROKEN, != SUSPICIOUS
```

Espejo para LONG-only (sustituye BEAR↔BULL).

**Distinción trend-following vs mean-reversion:**
- **Trend-following SHORT** → sigue tendencia bajista, régime propio = BEAR
- **Mean-reversion SHORT** → fade de rebotes técnicos, régime propio = RANGE (y BULL suave)
- El sistema antiguo solo validaba trend-following; el nuevo veredicto OK_MEAN_REVERT 🌊 captura el segundo tipo. Bots con SuperTrend `is rising` + filtros de volatilidad reciente típicamente son mean-revert.

**Implementación:** `cvcComputeDirectionalCoherence(name)` en `js/cvcAnalysis.js`. CSS `cvc-coh-mean-revert` (azul) distingue visualmente. Score Consolidado: OK +10, OK_MEAN_REVERT +5, WEAK -3, SUSPICIOUS -15, BROKEN descarta hard.

### Workflow recomendado para bloques OOS con fechas reales

1. Cargar Champion, Challengers y OOS separado.
2. **Ajustar `Inicio backtest` con la fecha REAL del Equity Chart de SQX** (no confiar en los defaults). Ej: si SQX dice "2017-10-02 → 2026-04-05", poner `2017-10-01` → `2026-04-01`.
3. Pulsar Aplicar. La tabla de bloques mostrará el periodo real y la antigüedad de cada OOS.
4. Verificar coherencia: la composición de regímenes (BULL/BEAR/RANGE) debe ser plausible para el activo.
5. Si BEAR n=1 (común en activos laterales como AUDCAD), el sistema acepta mean-revert con pérdida BEAR controlada.

### Detección de Arquetipo del Edge (mayo 2026 — v4.6)

Resuelve un sesgo conceptual del framework: la Coherencia Direccional asumía implícitamente trend-following, lo que descalificaba edges mean-revert legítimos. Ahora el sistema detecta automáticamente el arquetipo del bot y **adapta el filtrado HARD**.

**Función `cvcDetectArchetype(strategy)`** clasifica en uno de 5 arquetipos:

| Arquetipo | Detector | Régime propio real |
|---|---|---|
| **📈 TREND_FOLLOWING** | avg_bars > 50 OR MA/MACD/Ichimoku/LinReg | BULL (long) / BEAR (short) |
| **🌊 MEAN_REVERT** | SuperTrend + avg_bars 5-30 OR RSI/Stoch/Bollinger | RANGE |
| **⚡ SCALPER** | avg_bars < 5 + >30 trades/mes | Vol intradía (régime macro irrelevante) |
| **💥 BREAKOUT** | ATR + Highest/Lowest + avg_bars 10-100 | Alta vol |
| **❓ UNKNOWN** | no clasificable | — |

**Función `cvcComputeVolatilityCoherence(name)`** complementa a Coherencia Direccional midiendo correlación entre NP por bloque y vol_anual del bloque. Veredictos:

| Veredicto | Correlación NP/Vol | Significado |
|---|---|---|
| **↑ VOL_POSITIVE** | > +0.3 | gana más en alta vol (coherente con scalper/breakout/mean-revert fade) |
| **↓ VOL_NEGATIVE** | < -0.3 | gana más en baja vol (coherente con carry/mean-revert tranquilo) |
| **~ VOL_NEUTRAL** | -0.3 a +0.3 | sin patrón claro |

**Filtros HARD adaptativos según arquetipo:**
- **TREND_FOLLOWING:** Coherencia BROKEN y EGT-RISK descalifican (estricto, como antes).
- **MEAN_REVERT / SCALPER / BREAKOUT:** Coherencia BROKEN y EGT-RISK NO descalifican (informativos). Lo que importa es Coh. Vol intradía coherente con el arquetipo.

**Bonuses Score Consolidado adaptativos:**
- Coherencia OK / OK_MEAN_REVERT pesa al 100% si TREND_FOLLOWING, al 50% si mean-revert/scalper.
- Vol-coherence VOL_POSITIVE pesa al 100% si SCALPER/BREAKOUT, al 50% si MEAN_REVERT, al 30% si TREND_FOLLOWING.

**Implementación:** `cvcDetectArchetype()` + `cvcComputeVolatilityCoherence()` en `js/cvcAnalysis.js`. Render: columnas "Arquetipo" (📈/🌊/⚡/💥) y "Coh. Vol intradía" (↑/↓/~) en el ranking. CSS `cvc-arch-*` y `cvc-vol-*`.

**Caso validado AUDCAD M30 SHORT 0.1250791:**
- avg_bars=10,54 + indicators ATR+SuperTrend → arquetipo **MEAN_REVERT (medium confidence)**
- Coherencia Direccional: 🌊 OK_MEAN_REVERT (RANGE pos% 83%, BEAR loss controlada -32% avg)
- Coh. Vol intradía: **↑ VOL_POSITIVE (corr +0,33)** → gana en alta vol intradía
- Source code confirmado: `SuperTrend rising AND ATR(80) <= ATR(10)` → fade de breakouts de volatilidad reciente
- **Coherencia interna perfecta:** edge es vol-positive porque ATR(10)>ATR(80) requiere alta vol reciente para activarse.

---

## TEST DE DESCOMPOSICIÓN

**Objetivo:** detectar estrategias donde "el todo es mayor que la suma de las partes" (overfit por interacción de componentes).

### Procedimiento

Sobre cada ganadora de Capa 2, hacer 3 backtests:

```
Versión A (solo edge): edge + ExitAfterBars=20, sin filtros, sin SL/TP/Trailing
Versión B (edge+filtros): edge + filtros + ExitAfterBars=20, sin SL/TP/Trailing
Versión C (edge+gestión): edge + ExitAfterBars=opcional + SL/TP/Trailing, sin filtros
Versión total: estrategia completa
```

### Análisis

```
Coeficiente_Emergencia = PF_total / max(PF_componentes)

Aporte filtros = PF_B - PF_A
Aporte gestión = PF_C - PF_A
```

### Reglas de descarte

```
PF_solo_edge < 1.0 → DESCARTAR (edge no funciona solo)
Coef_Emergencia > 1.30 → SOSPECHOSO (descartar o investigar)
Aporte componente < 0.05 → componente es ruido (eliminar)
```

### Reglas de aceptación

```
PF_solo_edge >= 1.20
Coef_Emergencia <= 1.25
Cada componente aporta >0.10 en PF
```

### Interpretación Coef

```
< 1.0:    bug
1.0-1.10: bueno
1.10-1.25: aceptable
1.25-1.50: sospechoso
> 1.50:    alarma roja
```

---

## CONCEPTO DE EDGE

**Edge = condición de ENTRADA que predice movimiento direccional del precio.**

### Distinción

```
EDGE = predice dirección (CloseW > Highest, RSI < 30, MA cruce)
FILTRO = filtra cuándo el edge actúa (ADX > 25, hora del día)
GESTIÓN = reglas de salida (SL, TP, Trailing, ExitAfterBars)
```

### Test rápido

"¿Esta condición predice dirección probable del precio?"
- SÍ → es edge
- NO → es filtro o gestión

---

## BLOCKSETTINGS

### Versión actual: v7 (Mayo 2026 — un blocksetting por TF)

**Carpeta:** `Block Settings/v7/`

**Archivos:**
- `BS_Filtros_v7_M5.sqb`
- `BS_Filtros_v7_M15.sqb`
- `BS_Filtros_v7_M30.sqb`
- `BS_Filtros_v7_H1.sqb`
- `BS_Filtros_v7_H4.sqb`

**Compatibilidad:** los 5 sirven para Forex Majors/Minors, Índices y Oro indistintamente (el ATR es relativo al activo).

### Configuración de bloques de salida (idéntica en los 5 TFs)

| Bloque | use | probability | FixedValue (pips) | Notas |
|--------|-----|-------------|-------------------|-------|
| ProfitTarget | ✓ true | 100 | ❌ false | siempre, solo ATR-based |
| StopLoss | ✓ true | 100 | ❌ false | siempre, solo ATR-based |
| **TrailingStop** | ✓ true | **50** | ❌ false | **opcional** (50% strats con trailing) |
| **TrailingActivation** | ✓ true | **100** | ❌ false | siempre presente (efectiva solo cuando hay trailing) |
| MoveSL2BE | ❌ false | 50 | — | **OFF — sin Breakeven** |
| **ExitAfterBars** | ❌ **false** | 100 | — | **OFF — incompatible con SL/TP/Trailing** |

### Rangos ATR de SL/TP/Trailing por TF

| TF | TP | SL | TS | TActivation |
|-----|-----|-----|-----|-------------|
| **M5** | 1.5-3.5 | 0.5-1.5 | 0.3-0.8 | 0.3-0.8 |
| **M15** | 1.5-4.0 | 0.5-1.5 | 0.3-1.0 | 0.3-1.0 |
| **M30** | 2.0-4.5 | 0.5-2.0 | 0.4-1.2 | 0.4-1.2 |
| **H1** | 2.0-5.0 | 1.0-3.0 | 0.5-2.0 | 0.5-2.0 |
| **H4** | 1.5-3.0 | 0.5-1.5 | 0.3-1.0 | 0.3-1.0 |

`AtrPeriod` = 20..200 step 20 en todos los casos.

### Lo que esto significa operativamente

**SQX generará 2 tipos de estrategias en cada mining:**

**Tipo A — Sin Trailing (~50% del mining):**
- SL fijo ATR + TP fijo ATR
- Sin trailing, sin BE, sin ExitAfterBars
- R:R formal = R:R real (claro y predecible)

**Tipo B — Con Trailing+Activation (~50% del mining):**
- SL fijo ATR (protege fase inicial REAL gracias a Activation)
- TP fijo ATR
- Trailing ATR se activa solo después del umbral Activation
- R:R formal = R:R real (no SL placebo)

SQX explora ambos tipos, fitness selecciona la mejor combinación.

### Por qué v7 (lecciones aprendidas en mayo 2026)

1. **R:R catastrófico evitado:** v6 permitía TP=1, SL=5 (R:R 1:5). v7 limita rangos por TF para garantizar R:R razonable (peor caso 1:1, típico 2:1).
2. **TrailingActivation acoplada a Trailing:** sin Activation, el SL fijo era decoración (siempre cerraba el Trailing primero). Con Activation a probability=100, el SL fijo cobra sentido real.
3. **FixedValue (pips fijos) deshabilitado en TrailingActivation:** estaba habilitado por error en v6, generaba combinaciones inconsistentes (Trailing en ATR + Activation en pips). Ahora todos los exits solo en ATR.
4. **ExitAfterBars OFF en Capa 2:** forzar cierre a 20 barras es para Capa 1 puro (sin SL/TP). En Capa 2 con SL/TP/Trailing, ExitAfterBars cortaba trades buenos antes de desarrollar y creaba ambigüedad sobre qué cerraba el trade.
5. **Breakeven OFF (decisión consciente):** Trailing+Activation ya cubre la función de proteger ganancias dinámicamente.

### Evolución histórica

```
v3: AlwaysTrue REACTIVADO, IsLowerPercentil/IsGreaterPercentil con steps redondeados
v4: 46 ajustes <Generated>, 36 desactivaciones, ExitAfterBars=20 fijo
v5: TrailingStop limpio (Value 1.0..5.0 step=0.5, AtrPeriod 20..200 step=20)
v6: SL + TP también limpios — ABANDONADO por R:R catastrófico + ExitAfterBars+Activation FixedValue bug
v7: 5 archivos por TF + Trailing 50%/Activation 100% + FixedValue OFF + ExitAfterBars OFF + R:R garantizado
```

### Fix Indicators.Number overfitting (mayo 2026)

**Problema descubierto:** el bloque `Indicators.Number` (constante numérica que SQX usa como fallback en comparadores) tenía rango `-999.999.999..+999.999.999 step=1`. Aunque marcado `use="false"` en el blocksetting, **SQX lo usa de todos modos como argumento de comparadores `IsGreater/IsLower`** (es feature interna del motor, no se puede desactivar via blocksetting).

Resultado: SQX optimizaba constantes absolutas absurdas tipo `AvgVolume(50) > 278.500` (overfitting puro — el 278.500 no tiene significado de trading, es brute-force a los datos del activo específico).

**Fix aplicado (script `scripts/fix_bs_number.py`):**

1. `IsLowerPercentil`   `use="false"` → `use="true"` (acepta señales tipo "AvgVolume está en top 30% últimos 500 bars")
2. `IsGreaterPercentil` `use="false"` → `use="true"` (idem)
3. `Indicators.Number`  rango `-999M..+999M step=1` → `0..10 step=0.5` (acotado a rango razonable para multiplicadores tipo ATR/percent)

**Archivos modificados (mayo 2026) — 15 blocksettings:**

Edges v4 (10 archivos):
- `Block Settings/v4/BS_Volumen_v4.sqb` ✓ + intraday_v5 ✓
- `Block Settings/v4/BS_Tendencia_v4.sqb` ✓
- `Block Settings/v4/BS_Momentum_v4.sqb` ✓
- `Block Settings/v4/BS_Volatilidad_v4.sqb` ✓ + intraday_v5 ✓
- `Block Settings/v4/BS_Regimen_v4.sqb` ✓
- `Block Settings/v4/BS_Estadistico_v4.sqb` ✓
- `Block Settings/v4/BS_SoporteResistencia_v4.sqb` ✓ + intraday_v5 ✓

Filtros v7 (5 archivos):
- `Block Settings/v7/BS_Filtros_v7_M5.sqb` ✓
- `Block Settings/v7/BS_Filtros_v7_M15.sqb` ✓
- `Block Settings/v7/BS_Filtros_v7_M30.sqb` ✓
- `Block Settings/v7/BS_Filtros_v7_H1.sqb` ✓
- `Block Settings/v7/BS_Filtros_v7_H4.sqb` ✓

**NOTAS:**
- Algunos blocksettings ya tenían `IsLowerPercentil/IsGreaterPercentil` con `use="true"` (Estadistico, Momentum, Regimen, Volatilidad, todos los v7). En esos casos solo se acotó `Indicators.Number`.
- Los archivos antiguos `BS_Filtros_v5_D1.sqb` y `BS_Filtros_v6.sqb` NO se modificaron (versiones obsoletas según evolución histórica).

**Backup originales:**
- `Block Settings/v4/backup_pre_fix_2026-05-11/` (10 archivos, pre-fix Number)
- `Block Settings/v7/backup_pre_fix_2026-05-11/` (5 archivos, pre-fix Number)

### Fix v2 — probability="0" en exits + triple-negación Number (mayo 2026)

**Descubrimiento clave:** SQX **NO respeta `use="false"` para exits** (ExitAfterBars, MoveSL2BE). El control real es `probability`. Configuración previa equivocada:

```xml
<Block key="ExitAfterBars.ExitAfterBars" use="false" probability="100">
   ↑ technically "disabled"    ↑ but applied 100% of the time ⚠
```

Esto explicaba por qué las estrategias del stock Capa 2 (las 11 adoptadas) tienen ExitAfterBars=20 activo a pesar de que el CLAUDE.md decía "ExitAfterBars OFF en Capa 2". El SL/TP es **parcialmente decorativo** en esas estrategias — muchos trades cierran por ExitAfterBars antes de que SL/TP se ejecuten.

**Fix v2 aplicado (script `scripts/fix_bs_v2.py`) — los 15 blocksettings:**

1. **Triple negación en `Indicators.Number`** (todos los 15):
   - `weight="1" use="false"` → `weight="0" use="false" probability="0"`
   - Más el rango acotado del fix v1 (0..10 step=0.5)
   - Si SQX respeta cualquiera de los 3 atributos, Number queda blindado

2. **probability="0" en exits OFF** (todos los 15, aplica donde había use="false"):
   - `ExitAfterBars.ExitAfterBars`: probability 100 → **0**
   - `MoveSL2BE.MoveSL2BE`: probability 50 → **0**
   - `MoveSL2BE.SL2BEAddPips`: probability 50 → **0**

**Estado final correcto de exits en v7 (después de fix v2):**

| Block | use | probability | Resultado |
|---|---|---|---|
| ExitAfterBars | false | **0** | OFF real ✓ |
| MoveSL2BE | false | **0** | OFF real ✓ |
| MoveSL2BE.SL2BEAddPips | false | **0** | OFF real ✓ |
| ProfitTarget | true | 100 | 100% strategies ✓ |
| StopLoss | true | 100 | 100% strategies ✓ |
| TrailingStop | true | 50 | 50% strategies (opcional) ✓ |
| TrailingActivation | true | 100 | 100% (cuando hay Trailing) ✓ |

**Backup intermedio (post-fix v1, pre-fix v2):**
- `Block Settings/v4/backup_v2_pre_2026-05-11/` (10 archivos)
- `Block Settings/v7/backup_v2_pre_2026-05-11/` (5 archivos)

**Regla clave para futuras ediciones de blocksettings:**

Comportamiento empírico confirmado de SQX (mayo 2026):

| Bloque | ¿`use="false"` se respeta? | Control real |
|---|---|---|
| `Indicators.Number` | ❌ NO | `weight="0"` + rango acotado (0..10) |
| `ExitAfterBars.ExitAfterBars` | ❌ NO | `probability="0"` |
| `ProfitTarget.ProfitTarget` | ✓ SÍ | `use="false"` basta |
| `StopLoss.StopLoss` | ✓ SÍ | `use="false"` basta |
| `TrailingStop.TrailingStop` | ✓ SÍ | `use="false"` basta |
| `TrailingStop.TrailingActivation` | ✓ SÍ | `use="false"` basta |
| `MoveSL2BE.MoveSL2BE` | ❓ (no observado, asumimos sí) | `use="false"` + `probability="0"` por seguridad |
| Indicators normales (ADX, ATR, etc.) | ✓ SÍ | `use="false"` basta |

**Resumen práctico:**
- Para indicators OFF: `use="false"` basta (excepto `Indicators.Number` que necesita `weight="0"` + rango acotado).
- Para exits OFF: `use="false"` basta excepto **ExitAfterBars** que necesita `probability="0"`.
- Para exits ON: `use="true"` + `probability="N"` (N% strategies aplicarán el exit).

**Estado actual del proyecto (v4 edges Capa 1):**
- ExitAfterBars `use=true prob=100` → ON al 100% (correcto, Capa 1 puro requiere exit forzoso)
- ProfitTarget/StopLoss/TrailingStop `use=false prob=50` → OFF al 100% (porque SQX respeta `use=false` para estos)
- MoveSL2BE `use=false prob=0` → OFF al 100% (doble seguridad)
- Empíricamente: estrategias generadas de Capa 1 solo tienen ExitAfterBars=20 (✓ confirmado por Livan, mayo 2026)

**Estado actual del proyecto (v7 filtros Capa 2):**
- ExitAfterBars `use=false prob=0` → OFF al 100% (correcto post-fix v2)
- ProfitTarget/StopLoss `use=true prob=100` → ON al 100% ✓
- TrailingStop `use=true prob=50` → ON al 50% (opcional)
- TrailingActivation `use=true prob=100` → ON al 100% (cuando hay Trailing)
- MoveSL2BE `use=false prob=0` → OFF al 100% ✓

**Impacto sobre el stock de 11 estrategias adoptadas (decisión: NO re-minar):**
- Las que están en stock se quedan operando con ExitAfterBars=20 activo
- Su SL/TP es parcialmente efectivo (no controla todos los cierres)
- Los próximos minings (a partir de mayo 2026) generan exits limpios sin ExitAfterBars

**Impacto operativo:** los nuevos minings generan señales **escala-invariante** (Percentiles + ratios entre indicadores) en lugar de constantes absolutas. Funcionan en cualquier activo (NDX, US500, AUDCAD, oro) sin overfitting numérico.

**Nota sobre las 11 estrategias ya adoptadas:** se minaron con la versión pre-fix. **No se re-validan ni re-minan** (decisión Livan, mayo 2026). Caución: si alguna tiene reglas con `Number > X` absoluto, puede romperse si el activo cambia su nivel base de volumen/precio. La única auditada por source code es #11 (0.1250791, limpia, sin Number absoluto).

### Fix v4 — `indicatorMin/Max/Step` de AvgVolume (CAUSA RAÍZ REAL del overfitting)

**Descubrimiento final (mayo 2026):** los fixes v1+v2+v3 sobre `Indicators.Number` NO eran la causa raíz. El verdadero culpable era el rango automático del propio `Indicators.AvgVolume`.

**Problema:** el bloque tenía:
```xml
<Block key="Indicators.AvgVolume" use="true"
       indicatorMin="999999999" indicatorMax="999999999" indicatorStep="0">
```

→ `999999999` indica a SQX "calcula tú mismo el rango del histórico del activo". SQX calculaba valores como Min=-230000 Max=900000 Step=56500 y generaba comparativas tipo `AV(30) >= 561000` con valor random en ese rango. **Overfitting puro** (la constante 561000 no tiene significado de trading, solo es brute-force al backtest).

**Fix v4 aplicado (script `scripts/fix_bs_v4.py`):**
```xml
indicatorMin="0" indicatorMax="10" indicatorStep="0.5"
```

**Mecanismo:** ningún activo tiene `AvgVolume` entre 0-10. Comparativas `AV > N` con N∈[0,10] son **siempre true** → SQX las descarta (no aportan edge). Resultado: **SQX se ve forzado a usar comparativas escala-invariante**:
- `AV(20) is greater or equal than 98.7% of values over 457 bars` ← Percentil ✓
- `AV(14) crosses below AV(20)` ← ratio entre 2 AVs ✓

Funcionan en cualquier activo (NDX, US500, AUDCAD, EURUSD, oro).

**Validación empírica (Livan, mayo 2026):** mini-mining de 20 strategies con BS_Volumen post-fix v4 → todas las reglas con AvgVolume usan Percentiles o ratios entre AVs. Ninguna constante mágica.

**Archivos modificados (7 — solo los que tienen AvgVolume con `use="true"`):**

Edges v4:
- `v4/BS_Volumen_v4.sqb`
- `v4/BS_Volumen_v4_intraday_v5.sqb`

Filtros v7 (los 5):
- `v7/BS_Filtros_v7_M5.sqb`
- `v7/BS_Filtros_v7_M15.sqb`
- `v7/BS_Filtros_v7_M30.sqb`
- `v7/BS_Filtros_v7_H1.sqb`
- `v7/BS_Filtros_v7_H4.sqb`

**NO se modifican** (AvgVolume está `use="false"` o son obsoletos):
- BS_Tendencia, BS_Momentum, BS_Volatilidad (+intraday), BS_Regimen, BS_Estadistico, BS_SoporteResistencia (+intraday) — los 8 v4 restantes
- BS_Filtros_v5_D1, BS_Filtros_v6 — obsoletos

**Backups originales (pre-fix v4):**
- `v4/backup_v4_pre_2026-05-11/` (2 archivos)
- `v7/backup_v4_pre_2026-05-11/` (5 archivos)

**Regla práctica para futuras ediciones del .sqb:**

Para indicators con magnitud variable por activo (AvgVolume, Volume, custom indicators), **NO dejar `indicatorMin/Max=999999999, step=0`** (que es "auto-calcular"). Forzar un rango estrecho matemáticamente imposible (ej. 0/10/0.5) para obligar a SQX a usar Percentiles/ratios escala-invariante.

Comportamiento de SQX confirmado para distintos indicators:
- **Indicators con rango natural conocido** (RSI 0-100, ADX 0-100, KER 0-1, etc.): definir `indicatorMin/Max` con el rango real → SQX usa valores absolutos sensatos.
- **Indicators con magnitud variable por activo** (AvgVolume, Volume, precios crudos): **forzar rango 0/10/0.5** → SQX usa Percentiles/ratios.
- **Indicators normalizados** (ATR como % del precio, indicators custom acotados): definir rango real.

### Fix v5 — Redondeo de Percentile y Bars en IsLowerPercentil/IsGreaterPercentil (mayo 2026)

**Descubrimiento post-fix v4:** aunque SQX ya usa Percentiles (escala-invariante), los parámetros del Percentil estaban con step finos que permitían overfit decimal:

```xml
<Param name="Percentile" minValue="0.1" maxValue="99.9" step="0.1" />   ← genera 90.8%, 98.7%
<Param name="Bars"       minValue="2"   maxValue="1000" step="1"   />   ← genera 167, 621, 700
```

Mining con post-fix v4 generaba reglas tipo `AV(30) is greater or equal than 90.8% of values over 167 bars` — el 90.8 y el 167 son valores **brute-forceados** que maximizan fitness en ese backtest específico.

**Fix v5 aplicado (script `scripts/fix_bs_v5.py`):**

```xml
<Param name="Percentile" minValue="5"   maxValue="95"   step="5"   />   ← 5,10,15,...,95 (19 valores)
<Param name="Bars"       minValue="100" maxValue="1000" step="100" />   ← 100,200,...,1000 (10 valores)
```

**Resultado:** SQX genera reglas con **niveles redondos** (90%, 95%, 80%, etc.) y **bars en saltos sensatos** (200, 500, 1000). Menos espacio de búsqueda → menos overfit numérico, edges más robustos.

**Aplicado a los 15 blocksettings** (todos los que tienen `IsLowerPercentil`/`IsGreaterPercentil` activos):
- 10 v4 (Tendencia, Momentum, Volatilidad +intraday, Regimen, Estadistico, SoporteResistencia +intraday, Volumen +intraday)
- 5 v7 (Filtros M5/M15/M30/H1/H4)

**Backups originales (pre-fix v5):**
- `v4/backup_v5_pre_2026-05-11/` (10 archivos)
- `v7/backup_v5_pre_2026-05-11/` (5 archivos)

**Resumen acumulado de fixes a blocksettings (mayo 2026):**

| Fix | Cambio | Archivos afectados |
|---|---|---|
| **v1** | Activar IsLowerPercentil/IsGreaterPercentil + rango Number 0..10 | 12 archivos |
| **v2** | weight=0/prob=0 en Number + prob=0 en ExitAfterBars/MoveSL2BE | 15 archivos |
| **v4** | indicatorMin/Max/Step de AvgVolume = 0/10/0.5 (CAUSA RAÍZ REAL) | 7 archivos |
| **v5** | Percentile step=5 (5..95) + Bars step=100 (100..1000) | 15 archivos |
| **v6** | Indicator values universales para 24 indicadores (Cat A 0/10/0.5 + Cat B rangos convencionales) | 13 archivos |

Los 5 fixes son **acumulativos** y todos están aplicados al estado actual de los blocksettings.

### Fix v6 — Indicator values universales (mayo 2026)

**Problema:** los Indicator values (rangos de output usados por SQX para generar comparaciones absolutas tipo `RSI > 70` o `ATR > 0.0025`) estaban con valores calibrados específicos del activo. Algunos generaban overfitting (`ATR > 0.0025` solo funciona en forex), otros estaban con steps decimales finos que permitían overfit numérico.

**Fix v6 aplicado (script `scripts/fix_bs_v6.py`)** — distingue 2 categorías:

**Categoría A — Magnitudes variables (depende del precio/escala del activo):** forzar `indicatorMin/Max/Step = 0/10/0.5`. Como ningún activo tiene estos indicadores entre 0-10, SQX se ve forzado a usar Percentiles o ratios entre indicadores (escala-invariante).

```
ATR, LogATR, MTATR, StdDev, TrueRange         (5 indicadores de volatilidad)
MACD, OSMA, AwesomeOscillator, EhlersHilbertTransform  (4 indicadores momentum/cycle)
UlcerIndex                                     (1 indicador de pérdida sostenida)
AvgVolume                                      (ya aplicado en fix v4)
```

→ Total: **11 indicadores en Cat A**.

**Categoría B — Oscillators con rango natural conocido (universal, no depende del activo):** rangos convencionales con steps redondos. Mantiene los **edges clásicos del análisis técnico**:

| Indicador | Rango | Niveles convencionales |
|---|---|---|
| RSI | 20-80 step=10 | genera 30 (sobreventa), 70 (sobrecompra) |
| Stochastic | 20-80 step=10 | genera 20, 80 |
| WilliamsPR | -80 a -20 step=10 | genera -80, -20 |
| ADX | 10-50 step=5 | genera 25 (tendencia incipiente), 30 (fuerte) |
| CCI | -100 a 100 step=25 | genera ±100 (overbought/oversold) |
| ChoppinessIndex | 30-70 step=10 | genera 40 (trend), 60 (lateral) |
| HurstExponent | 0.4-0.7 step=0.05 | genera 0.5 (random walk) |
| KER | 0.1-0.7 step=0.1 | rango natural completo |
| ZScore | -2 a 2 step=0.5 | genera ±2 (extremos) |
| Momentum | 98-102 step=1 | cerca de 100 |
| ROC | -0.5 a 0.5 step=0.1 | rango natural ±50% |
| CSSAMarketRegime | 10-90 step=10 | rango natural |
| SRPercentRank | 10-90 step=10 | rango natural |
| EntropyMath | 100-200 step=20 | rango natural |

→ Total: **14 indicadores en Cat B**.

**Archivos modificados (13 — solo los que tienen ≥1 indicador del mapa activo):**

Edges v4 (8): BS_Estadistico, BS_Momentum, BS_Regimen, BS_Tendencia, BS_Volatilidad (+intraday), BS_Volumen (+intraday)
Filtros v7 (5): BS_Filtros_v7_M5/M15/M30/H1/H4

**NO modificados (2):** BS_SoporteResistencia_v4 (+intraday) — no usan ningún indicador del mapa activo (solo HighestInRange/LowestInRange/DonchianChannels que tienen uso especial).

**Backup originales (pre-fix v6):**
- `v4/backup_v6_pre_2026-05-11/` (10 archivos)
- `v7/backup_v6_pre_2026-05-11/` (5 archivos)

### ⚠️ ADVERTENCIA OPERATIVA — NO CALIBRAR

**SQX sobreescribe `indicatorMin/Max/Step` cuando ejecutas "Calibrate"** en la UI. Eso devolvería el overfitting al estado pre-fix.

**Regla práctica:**
- **NO ejecutar "Calibrate" en SQX** después de cargar el blocksetting
- Los rangos universales del fix v6 cubren todos los activos del proyecto (FX, índices, oro)
- Si necesitas calibrar puntualmente (ej. activo exótico nuevo), **re-ejecuta** después:
  ```
  python scripts/fix_bs_v6.py <blocksetting.sqb>
  ```

Esto restaura los rangos universales preservados.

### Cómo regenerar v7

Script: `scripts/generate_bs_v7.py`. Edita los rangos en `TF_CONFIGS` o la lógica en `apply_filter_settings()`, vuelve a ejecutar.

### Aclaración importante: ¿blocksetting o What to Build?

**TODOS los rangos y configuraciones de exits están en el BLOCKSETTING (.sqb interno = ZIP con `config.xml`).**

El What to Build solo HABILITA los exits (Required/Optional) y muestra los rangos heredados del blocksetting cargado. Si quieres cambiar rangos o probabilidades, edita el blocksetting (no el What to Build).

### Aclaración técnica

**`Indicators.LowestInRange` ≠ `IsLowerPercentil`** (bloques distintos):

```
IsLowerPercentil:
   Bars: 100..1000 step=100
   Percentile: 5..95 step=5
   Ejemplo: "X is lower than 70% of values over 500 bars"

Indicators.LowestInRange:
   TimeFrom: 0..2359 step=30 (HORAS DEL DÍA HHMM)
   TimeTo: 0..2359 step=30
   Ejemplo: LowestInRange(1830, 2330) = mínimo entre 18:30 y 23:30
```

---

## CHEATSHEETS DE CROSS-CHECKS

### Capa 1 — resumen rápido

| Test | Settings clave | Filter |
|---|---|---|
| RETEST 0 | Período completo | PF>1.0, #trades>100 |
| RETEST 1 | Dukas 2010-2017 (broker+régime distinto) | NP>0, #trades>50 |
| HBP | 100 sims | NetProfit>0 al 80% |
| MC | 200 sims, sin Skip | NetProfit>=50%, MaxDD<=200% |
| MC2 (opcional) | history 10%, spread 10-25 | CAGR/DD>=30% al 95% |
| Sequential | Up130/Down70/Steps12, Apply OFF | 80% pass, 5 stable, 25% range |
| Monkey | 100 sims | NetProfit>0 vs random |
| Synthetic V2 | preserve 85% | NetProfit>=50% |
| SPP | 3000 tests, Your own | Net>=40%, profitable>30% |
| WFM | Simulated, OOS 20-36 | Robustness>=60%, MaxDD<=50% |
| FOWARD | 2024-2026 | PF>1.0, #trades>30, Ret/DD>0.5 |

**Documentación completa:** `docs/CLAUDE_Capa1_Cheatsheet.md`

### Capa 2 — diferencias con Capa 1

```
MC: CON Skip trades (Capa 1 sin)
MC2: RECOMENDADO (no opcional), CON Slippage
Sequential: solo Entry levels + Exit (no Periods/Const)
WFM: Entry levels + Exit, filtros operativos (Stagnation, Ret/DD≥5)
SPP: Your own settings con Entry levels + Exit, Net>=50%
FOWARD: Ret/DD>1.0 (más estricto)
```

**Filtros estrictos post-Capa 2 (manuales):**

```
PF >= 1.5
Ret/DD >= 5
R Expectancy >= 0.30
Stagnation < 25%
# trades > 150
```

**Documentación completa:** `docs/CLAUDE_Capa2_Cheatsheet.md`

---

## ESTADO ACTUAL DEL PROYECTO

### Stock adoptado: 14 estrategias

> **Estado validación:** Todas las 14 han pasado el flujo completo:
> 1. Mining IS (Darwinex 2018-2023 según activo)
> 2. **FOWARD 2024-2026** (Darwinex, OOS reservado intocado, PF>1.0)
> 3. **RETEST 1 Dukas 2010-2017** (broker + régime distintos, NP>0 + #trd>50)
>
> El paso 3 valida supervivencia en régimes adversos no presentes en el sample principal:
> BULL extremo post-QE (2010-2012), **BEAR estructural oro** (2013-2015), Brexit/Trump (2016-2017).
> Las XAU LONG del stock (#1, #2, #3, #14) están cross-validated en BEAR oro estructural.

| # | Mining | Strategy | Edge | NP | Ret/DD | R Exp |
|---|--------|----------|------|------|--------|-------|
| 1 | XAUUSD H1 LINEAR | 0.621529 | ATR+LinReg | — | 12.32 | — |
| 2 | XAUUSD H1 LINEAR | 0.920817 | KER+LinReg | — | 15.56 | — |
| 3 | XAUUSD H4 (Capa 1) | 0.5287260 | CloseW+Highest+KER | $16,523 | 13.3 | — |
| 4 | AUDCAD M30 MOMENTUM | 0.2536854 | AvgVolume+KER+RSI | $8,558 | 9.92 | 0.35 |
| 5 | NASDAQ H1 LINEAR | 0.1073797 | LinearRegression+Low+LowD | — | 11.40 | 0.31 |
| 6 | NASDAQ H1 MACD | 0.2172315 | ADX+MACD | $8,480 | 11.00 | 0.43 |
| 7 | NASDAQ H1 SMA | 0.4066882 | KER+OpenD+SMA | $5,477 | 12.66 | 0.47 |
| 8 | NASDAQ H4 ADX | 0.1917454 | ADX+KER | $5,805 | 10.72 | 0.35 |
| 9 | NASDAQ H1 SUPERTREND | 0.2126635 | KER+LowD+SuperTrend | $5,851 | 9.83 | 0.29 |
| 10 | NASDAQ H4 CLOSE | 0.3709379 | AvgVolume+Close+Open | $8,095 | 11.19 | 0.40 |
| 11 | AUDCAD M30 SHORT SuperTrend | 0.2282445 | ADX+ATR+SuperTrend (SHORT-only) | $15,404 | 9.66 | 0.29 |
| 12 | SP500 M30 LONG AvgVolumen | 0.58054 | AvgVolume(95% pct) + Close rising | $9,637 | 7.05 | 0.16 |
| 13 | SP500 M30 LONG CLOSE | 0.333026 | Close(60% pct 900) + Open(40% pct 1000) | $14,900 | 10.25 | 0.42 |
| **14** | **XAUUSD H1 LONG Fibo** | **0.8883321** | **Fibo>Highest + LowD>SessionLow** | **$8,412** | **12.98** | **0.39** |

**#11 detalles (AUDCAD M30 SHORT 0.2282445) — versión MEJORADA con filtro ADX:**

> **Nota histórica:** el #11 inicial era `0.1250791` (ATR+SuperTrend). En mayo 2026 se sustituyó por `0.2282445` (ADX+ATR+SuperTrend) — **MISMA edge mean-revert SHORT pero con filtro ADX adicional**: mejores métricas en todos los aspectos. La estructura conceptual del edge es idéntica (fade de rebotes con vol-breakout) por lo que se considera "iteración mejorada" del mismo edge, no un cambio de estrategia.

- DD% 1,45% | PF **1,60** | Sharpe 1,13 | 306 trades | Stagnation 322d | Win 51,31% | R Exp **0,29**
- Edge SHORT-only auto-detectado por # trades L/S del CSV (L:0 / S:306)
- **Edge real (del source code):**
  ```
  ShortEntry = SuperTrend(Basic, 50, 5.0)[1] is rising
               AND ADX(30, Main)[1] > 15.6
               AND ATR(20)[1] >= ATR(80)[1]
  ```
  → 3 condiciones:
  1. SuperTrend SUBIENDO + dirección SHORT = fade del rebote técnico
  2. ADX > 15,6 = **filtro de calidad** que excluye mercados completamente muertos (mejora vs #11 inicial)
  3. ATR(20) ≥ ATR(80) = volatilidad reciente alta (breakout de vol)
  → Edge **mean-reversion SHORT con filtro de tendencia mínima + vol breakout**.
- **Exits:** ExitAfterBars=20 ✓ + ProfitTarget 4,5×ATR(80) + StopLoss 2×ATR(140). R:R formal ≈ 2,25.
- **Régime favorable: RANGE** (no BEAR). 7/9 bloques OOS positivos.
- **Coherencia direccional: 🌊 OK_MEAN_REVERT** (con fechas correctas del mining 2017-10-01 → 2026-04-05).
- **Coh. Vol intradía: ↑ VOL_POSITIVE (correlación +0,46)** → gana en alta vol intradía (más fuerte que #11 inicial 0,33).
- **Arquetipo: MEAN_REVERT (medium confidence)** — avg_bars 13,56 + SuperTrend + ADX/ATR filters.
- EGT v2 = STRONG SHORT (con thresholds short_only correctos).
- Salud temporal: peak OOS9 ✓ · DD@close 0% ✓ · **Recovery 104% (accelerating)** — mejora significativa vs 78% del #11 inicial.
- **Performance mensual:** 2018-2026 todos los años positivos excepto **2023 (-$280)** — bache reciente pero controlado vs ganancias anuales típicas de ~$2K. 2017 -$391 (4 meses iniciales, incompleto).
- ⚠ Caución operativa: AUDCAD ha sido lateral histórica (no BEAR fuerte sostenido). **Si AUDCAD entra en BEAR fuerte (caída >15% sostenida en >6 meses), descartar inmediatamente** — el edge mean-revert se rompe en BEAR direccional.

**Lecciones del workflow validado en este adopción:**
1. **Auto-detección de dirección** desde # trades L/S del CSV (DETERMINISTA).
2. **Thresholds EGT correctos por dirección** (long_only / short_only / long_short).
3. **Fechas exactas del mining MANUALES:** los defaults inteligentes (2017-01 / 2018-01) son aproximados. **Para validar bloques OOS correctamente, ajustar `cvc-regime-start` con la fecha REAL de inicio del backtest** (visible en Equity Chart de SQX). Diferencia de meses cambia la asignación de bloques a régimes.
4. **OK_MEAN_REVERT 🌊** es válido cuando: RANGE n>=4, pos% >= 80%, RANGE avg > otros régimes, y BEAR/BULL adverso no catastrófico (pérdida <50% del avg anual). Distingue trend-following falso de mean-reversion genuino.
5. **Iteración del mismo edge:** cuando un mining produce una versión mejorada del mismo edge (mismo concepto base + filtro de calidad adicional), tiene sentido **reemplazar** la versión anterior (no añadir como nueva entrada del stock). Caso AUDCAD M30 SHORT SuperTrend: `0.1250791` (ATR+ST) → `0.2282445` (ADX+ATR+ST). Misma familia de edge, mejor métrica, mejor coherencia interna.

**#12 detalles (SP500 M30 LONG AvgVolumen 0.58054) — PRIMERA estrategia POST-fix blocksettings:**

> **Hito histórico:** PRIMERA estrategia del proyecto adoptada después de los fixes v1-v6 a blocksettings. Es la única del stock con **exits completamente limpios** (sin ExitAfterBars contaminando) y reglas de entrada con **Percentile escala-invariante** (sin Number absoluto).

- DD% **1,32%** | PF **1,55** | Sharpe 1,10 | 306 trades | Stagnation 446d | Win 71,24% | R Exp 0,16
- Direction LONG-only auto-detectada (L:306 / S:0)
- **Edge real (del source code):**
  ```
  LongEntry = AV(30)[1] is greater or equal than 95% of values over 100 bars
              AND Close[1] is rising
  ```
  → 2 condiciones:
  1. **Spike de volumen** — AvgVolume(30) está en el TOP 5% de los últimos 100 bars (Percentile alto = volumen excepcional)
  2. **Momentum confirmado** — el último cierre fue ascendente
  → Edge **breakout LONG con confirmación de volumen institucional**. Clásico patrón de acumulación.
- **Exits (FIRST POST-FIX, sin ExitAfterBars):**
  ```
  ✗ ExitAfterBars (DESACTIVADO ⭐ por fix v2)
  ✓ ProfitTarget: 3 × ATR(140)
  ✓ StopLoss:     2 × ATR(60)
  ✓ TrailingStop: 0.7 × ATR(120)
  ✓ TS Activation: 0.9 × ATR(90)
  R:R formal = 1.5
  ```
  → Sin ExitAfterBars contaminando, los cierres son SL/TP/Trailing REALES.
- **Régime resiliente:** 9/9 bloques OOS positivos:
  ```
  BULL FUERTE (5): +$489, +$967, +$1.501, +$904, +$544
  BULL SUAVE  (1): +$1.422
  BEAR SUAVE  (2): +$598, +$2.016  ← gana en BEAR siendo LONG ⭐
  RANGE       (1): +$193
  ```
- **Coherencia direccional: OK** (trend-following coherente).
- **Vol-coherence: NEUTRAL** (no es estructuralmente vol+ ni vol-).
- **Arquetipo:** UNKNOWN (low) — no encaja en ningún arquetipo del detector (avg_bars 11.64 sin SuperTrend ni MA clásicos).
- **EGT v2 = COMPLIANT** (estable en todos los régimes).
- **Salud temporal:** peak OOS9 ✓ · DD@close 0% ✓ · Recovery **100%** ✓.
- ⚠ **WorstYear -$837** en OOS4 (2020-COVID) — evento atípico documentado, no descalifica.
- ✅ **PRIMERA estrategia con blocksettings POST-fix v6** — referencia técnica para validar que los fixes funcionan en operativa real.

**Lecciones del adopción #12:**
1. **Validación empírica fix v2:** la estrategia NO tiene ExitAfterBars activo → confirma que `probability="0"` en blocksetting funciona.
2. **Validación empírica fix v6:** reglas usan `AV(30) is greater than 95% of 100 bars` (Percentile) — confirma que indicatorMin/Max=0/10/0.5 fuerza Percidentes.
3. **Edge volumen+momentum simple es robusto** — gana en TODOS los régimes US500 (incluso BEAR suave).
4. **Diversificación real de activo:** primera US500 del stock (antes solo NASDAQ, oro, AUDCAD).

**#13 detalles (SP500 M30 LONG CLOSE 0.333026) — la más robusta del stock:**

> **Hito histórico:** estrategia con **MÁS robustez estadística del stock** — único caso con 9/9 OOS positivos Y 9/9 Worst Year positivos (no perdió un solo año civil en 9 años de backtest). Análisis profundo realizado **directamente desde el .sqx** (no solo CSV).

- DD% **1,32%** | PF **1,82** | Sharpe 1,31 | 174 trades | Stagnation 260d | Win 48,85% | R Exp **0,42**
- Direction LONG-only auto-detectada
- **Edge real (del source code del .sqx):**
  ```
  LongEntry = Close[1] is greater or equal than 60% of values over 900 bars
              AND Open[1]  is lower or equal than 40% of values over 1000 bars
  ```
  → 2 condiciones percentiles puros:
  1. **Close en zona alta** — el último cierre está en top 40% de los últimos 900 bars
  2. **Open en zona baja** — el último open está en bottom 40% de los últimos 1000 bars
  → Edge **"vela alcista de reversal"** (patrón hammer/martillo: open bajo + close alto = barra de reversal alcista).
- **Exits (extraídos del .sqx):**
  ```
  ✗ ExitAfterBars (DESACTIVADO ⭐ fix v2)
  ✓ ProfitTarget: 4 × ATR(120)
  ✓ StopLoss:     2 × ATR(160)
  ✗ TrailingStop (OFF)
  ✗ TS Activation (OFF)
  R:R formal = 2.00
  ```
- **Régime resilencia ÚNICA:** 9/9 OOS positivos en TODOS los régimes US500:
  ```
  BEAR SUAVE (2):  +$2.557, +$321
  BULL FUERTE (5): +$363, +$3.565, +$1.268, +$1.942, +$148
  RANGE (1):       +$2.488
  BULL SUAVE (1):  +$2.247
  ```
- **9/9 Worst Year positivos** — NO hay año civil perdedor en ningún OOS (la única del stock con esta característica).
- **Coherencia direccional: OK** (trend-following coherente con patrón alcista).
- **Vol-coherence: NEUTRAL** (-0.05) — no estructural.
- **Arquetipo:** UNKNOWN (low) — patrón candle reversal no encaja en clasificación clásica.
- **EGT v2 = COMPLIANT** (estable en BULL y BEAR, RANGE insuficiente).
- **Salud temporal:** peak OOS9 ✓ · DD@close 0% ✓ · Recovery **87%** ✓.
- ⚠ **174 trades (vs 306 del #12)** — sample size menor, requiere más cautela operativa. 1.85 trades/mes.
- ✅ **Edge complementario al #12** (volumen vs price-pattern) — diversifica el SP500 LONG.

**Lecciones del adopción #13:**
1. **Análisis directo del .sqx más profundo que CSV:** permite ver source code exacto, parámetros precisos de exits, auditoría de overfit automática.
2. **Patrón candle reversal escala-invariante:** usa solo Percentiles (sin Number absoluto), funcional en cualquier activo (validado en US500 pero portable).
3. **9/9 Worst Year positivos es excepcional:** primera estrategia del proyecto sin años civiles negativos.
4. **Trade-off muestra vs métricas:** 174 trades es menos que ideal (>300), pero las métricas son tan robustas que compensa.
5. **Mismo activo+TF que #12 pero edges ortogonales:** validar correlación con SQX Filter by Correlation antes de operar AMBAS en paralelo. Si correlación >0.7, mantener solo #13.

**#14 detalles (XAUUSD H1 LONG Fibo 0.8883321) — mejor CvC del stock:**

> **Hito histórico:** segunda estrategia del proyecto con **10/10 OOS positivos Y 10/10 años civiles positivos** (la primera fue #13). PRIMERA estrategia adoptada XAUUSD H1 con BS_Filtros post-fix. PRIMERA con CvC 6/6 perfecto desde el script `cvc_single_strategy.py`. Adoptada tras filtrado riguroso: mining 80 estrategias → 9 pasan los 6 filtros → 3 ortogonales (daily 0.7) → 1 ortogonal (**monthly 0.3 estricto**).

- DD% **0,62** | PF **2,12** | Sharpe 1,51 | 282 trades | Stagnation 512d (16,5%) | Win 65,6% | R Exp 0,39
- Direction LONG-only · Capital base $100,000 · Backtest 8,51 años (2017-10 → 2026-04)
- **Edge real (del source code):**
  ```
  LongEntry = Fibo[1] > Highest[1]
              AND LowD[1] > SessionLow[1]
  ```
  → 2 condiciones:
  1. **Fibo > Highest** — nivel Fibonacci proyectado supera el máximo previo (señal alcista clásica de extensión)
  2. **LowD > SessionLow** — mínimo diario por encima del mínimo de la sesión actual (sin breakout bajista intra-día)
  → Edge **mean-revert + breakout híbrido**: entra cuando hay rotura alcista pero el día no ha hecho mínimo inferior (filtro de no-pánico).
- **Exits (extraídos del .sqx):**
  ```
  ✗ ExitAfterBars (DESACTIVADO ⭐ fix v7 confirmado en mining real)
  ✓ ProfitTarget: 4,0 × ATR(200)
  ✓ StopLoss:     2,5 × ATR(15)
  ✓ TrailingStop: 0,5 × ATR(45)
  ✓ TS Activation: 70,0 pips fijos
  R:R formal = 1,60
  ```
  ⚠ **TSAct=70 pips fijos** (viejo formato, no ATR-based). Funcional pero rompe la "escala-invariante" del fix v7. Aceptable porque el resto del exit set es ATR.
- **CvC v2 perfecto (6/6 criterios):**
  - 10/10 OOS positivos ⭐ (incluso OOS1 +$1,346)
  - 10/10 años civiles positivos ⭐ (incluso 2020 COVID +$105, 2022 BEAR oro +$311, 2025 +$2,271)
  - Salud temporal: **fresh** (peak en OOS10)
  - DD@close 0%, Recovery 142% (accelerating)
  - Worst year 2020 +$105 (peor año aún positivo)
  - Best year 2025 +$2,271
- **Cierres: 83% por Trailing** (233/282) — trailing pilla movimientos largos del oro
- **Arquetipo:** UNKNOWN (low) — Fibo+SessionLow no encaja en clasificación clásica (no es trend-following puro, no es mean-revert puro)
- **AvgDur intra-trade: 7,3h** (≈ 7 barras H1) — perfil intra-día medio
- **Filter by Correlation contundente:**
  - Daily threshold 0,7: 3 estrategias ortogonales (queda con 0.12492329 + 0.7397269)
  - Daily threshold 0,3: 1 estrategia (solo 0.8883321)
  - **Monthly threshold 0,3 (SQX clásico): 1 estrategia (solo 0.8883321)** ← criterio adoptado
  - Las otras 8 del top comparten edge `Fibo > Highest` → correlación mensual 0,33-0,42 → redundantes
- **Correlación con stock actual:** validar post-adopción contra #1-#3 (XAUUSD H1 LINEAR) por activo común. Si corr mensual ≥ 0,3 con alguna, mantener solo la mejor.

**Lecciones del adopción #14:**
1. **Magic marker `04 02 03 01` (variante F)** descubierto en orders.bin de SQX 142 — actualizado `parse_sqx_orders.py` y `sqxParser.js`. Sin este fix, 14 de 80 estrategias del mining quedaban sin parsear.
2. **Filter by Correlation con criterio MENSUAL (no diario)** revela redundancias estructurales. Diario muestra correlación 0,34-0,40 (engañoso bajo); mensual revela correlación 0,33-0,42 que excede 0,3 → mismo edge familia.
3. **9 estrategias pasan filtros métricos pero solo 1 aporta diversificación real.** Lección: PF/Ret/DD/Sharpe son condición necesaria pero NO suficiente — Filter by Correlation mensual estricto es el filtro de portfolio.
4. **CvC 6/6 perfecto + Monthly Filter 0,3** = criterio ORO para adopción individual. Cada estrategia del stock debe pasar AMBOS independientemente.
5. **Stock pasa de 13 → 14** — XAUUSD H1 ahora también tiene un edge Capa 2 (antes solo había XAUUSD H1 Capa 1 #1-2 y XAUUSD H4 Capa 1 #3).

**Stock antiguo XAUUSD H4 Capa 1 (FORWARD aplicado, NO operables en prop firms con SL/TP obligatorio):**
- 0.713168: AvgVolume+Close, NP $4,758, Ret/DD 11.11, DD% 0.42%, 210 trades
- 0.4718752: Close+CloseW+Highest, NP $9,053, Ret/DD 9.75, DD% 0.9%

### USTEC H1 BS_Tendencia — Capa 1 Champion validado

**Champion:** TEMPLATENASDAQLONGH1 ICHIMOKU 1.45.38 (NDXm_darwinex H1)
```
NP $14,325 | DD 2.11% | PF 1.47 | Sharpe 1.12 | Ret/DD 6.32
533 trades | 58.16% win | Avg Trades 5.67
Entry indicators: Ichimoku, LowD
Estado: PASSED los 11 cross-checks Capa 1 → operable per se en cuentas sin restricción SL/TP
```

### Plan de 14 minings priorizado (data-driven, composite score)

```
FASE 1 — TOP data-driven (Composite ≥95%, edge estructural máximo):
   1. AUDCAD M30 BS_Momentum L/S (templates LINEAR, MACD)  [100%]
   2. USTEC H1 BS_Tendencia L                              [100%]
   3. US30 H4 BS_Volumen L                                 [100%]  ← ajustado de M5 a H4 (12/05/2026)
   4. USTEC H4 BS_Regimen L                                [99%]
   5. US500 M30 BS_Volumen L                               [97%]
   6. XAUUSD H1 BS_Volatilidad L                           [95%]

FASE 2 — Diversificación Major (Composite 90-94%, Forex Major + más índices):
   7. USDCHF H4 BS_SoporteResistencia L/S                  [94%]
   8. US500 H4 BS_Regimen L                                [94%]
   9. XAUUSD H1 BS_SoporteResistencia L                    [94%]
   10. US30 H1 BS_Tendencia L                              [92%]
   11. EURUSD H1 BS_Tendencia L/S                          [90%]

FASE 3 — Cruces + Intraday (Composite 87-91%, mean-revert + short vol intradía):
   12. EURCHF H4 BS_Momentum L/S                           [91%]
   13. EURGBP H4 BS_SoporteResistencia L/S                 [89%]
   14. GER40 M15 BS_Volatilidad S (direccional Short)      [88%]
```

**Nota:** este plan reemplaza la jerarquía anterior por familia de activo (oro→EURUSD→USTEC→...). La nueva priorización es por composite score (ratings data-driven). El dashboard auto-sincroniza desde SQX Priority salvo overrides manuales.

### Pendientes inmediatos

**Test de Descomposición sobre las adoptadas Capa 2 (5 estrategias):**
1. AUDCAD M30 0.2536854 (AvgVolume+KER+RSI)
2. NASDAQ H1 LINEAR 0.1073797
3. NASDAQ H1 MACD 0.2172315
4. NASDAQ H1 SMA 0.4066882
5. NASDAQ H4 ADX 0.1917454
6. NASDAQ H1 SUPERTREND 0.2126635

**Filter by Correlation:**
- Cross-TF NASDAQ H1 vs H4 (5 strategies en H1 + 1 en H4)
- Cross-edge NASDAQ H1 (LINEAR vs MACD vs SMA vs SUPERTREND)
- Cross-asset (NASDAQ vs XAUUSD vs AUDCAD)

**Próximos minings con BS_Filtros_v7 + política consolidada:**
- US500 M30 BS_Volumen L (97%) — usar `BS_Filtros_v7_M30.sqb`
- **US30 H4 BS_Volumen L (100%)** — usar `BS_Filtros_v7_H4.sqb` ← ajustado de M5 a H4 (12/05/2026)
- XAUUSD H1 BS_Volatilidad L (95%) — usar `BS_Filtros_v7_H1.sqb`
- USDCHF H4 BS_SoporteResistencia L/S (94%) — usar `BS_Filtros_v7_H4.sqb`

**Razonamiento del cambio US30 M5 → H4:**
1. Composite Volumen H4 = **1.00** (vs 0.955 en M5) — científicamente óptimo
2. US30 es CFD, no futuros → "volumen" en SQX = tick volume. En M5 es ruido microestructura (HFT, spreads, market makers). En H4 la agregación (5K-20K ticks/barra) lo convierte en proxy razonable de actividad institucional.
3. Reduce riesgo de overfit (~18K barras H4 vs ~750K barras M5).
4. Coherencia con la teoría: edge "volumen" tiene sentido cuando refleja convicción institucional sostenida, lo cual requiere agregación temporal ≥M30.

**Verificación PROP FIRM:**
- Confirmar si Darwinex Capital exige SL/TP en estrategias automáticas
- Si SÍ exige: 4 estrategias del stock (Capa 1 puras XAUUSD H4) NO son operables — separar portfolios o reemplazar
- Si NO exige: stock completo de 9 + extras Capa 1 (Champion SuperTrend $18K NP, Champion Ichimoku $14K NP) operables

**Crítico antes de operativa real:**
- Verificación final en MT5 Darwinex sobre todas las ganadoras consolidadas (discrepancia <10% NP/PF/DD%)
- Demo MT5 30 días con sizing real

**Scripts pendientes (TODO):**
- `scripts/test_descomposicion.py`
- `scripts/filter_by_correlation.py`

### Crítico antes de operativa real

- Verificación final en MT5 Darwinex (datos reales del bróker)
- Verificar timezone Darwinex (algunos reportan USA DST en lugar de Europa)
- Demo MT5 30 días antes de real
- Despliegue gradual (sizing pequeño primero)

---

## PRE-CHECK ANTES DE NUEVO MINING

**Workflow obligatorio para nuevo activo (2-3 horas):**

```
Paso 1 (15 min): Verificar datos en Darwinex
   - Rango temporal disponible
   - Calidad y gaps
   - Timezone correcto

Paso 2 (30 min): Backtest manual control
   - Edge clásico (RSI 30/70 o MA cruce)
   - Verificar # trades, PF, DD% en periodo IS
   - Si edge clásico no funciona: NO MINES

Paso 3 (1-2 horas): Mini-mining 100 estrategias
   - Solo HBP + MC como cross-checks (rápidos)
   - Verificar si pasan filtros mínimos

Paso 4: Decisión
   - 0 supervivientes: descartar activo
   - 1-5: dudoso, probar otro TF/blocksetting
   - 5-20: hacer mining completo
   - 20+: confianza alta
```

---

## VALIDACIÓN FINAL EN MT5

**Workflow obligatorio antes de real:**

```
1. SQX mining + tests robustez (completados)
2. Export EA desde SQX a MT5
3. Backtest en MT5 con datos REALES Darwinex
4. Comparar métricas SQX vs MT5:
   - Net Profit: discrepancia <10%
   - Profit Factor: <10%
   - Drawdown: <15%
   - # Trades: <5%
5. Si todos <umbrales → validada
6. Demo 30 días con sizing real
7. Real con sizing pequeño (0.05-0.1 lots)
8. Escalar gradualmente a 8-12 estrategias
```

---

## ESTRUCTURA DEL PROYECTO

```
/proyecto_sqx/
   CLAUDE.md                              ← este archivo
   docs/
      CLAUDE_Capa1_Cheatsheet.md          ← Settings + Filter + Explicación
      CLAUDE_Capa2_Cheatsheet.md
      CLAUDE_Blocksettings_Detalle.md
      Continuidad_Sesion_Mayo_2026.md     ← resumen sesión Mayo 2026
   Block Settings/
      v4/                                 ← blocksettings de edge (Tendencia, Momentum, etc)
         BS_Tendencia_v4.sqb
         BS_Momentum_v4.sqb
         BS_Volatilidad_v4.sqb
         BS_Regimen_v4.sqb
         BS_Estadistico_v4.sqb
         backup_pre_v7_2026-05-09/
            BS_Filtros_v6.sqb             ← backup
      v7/                                 ← versión actual para Capa 2 (por TF)
         BS_Filtros_v7_M5.sqb
         BS_Filtros_v7_M15.sqb
         BS_Filtros_v7_M30.sqb
         BS_Filtros_v7_H1.sqb
         BS_Filtros_v7_H4.sqb
   minings/
      XAUUSD_H1_LINEAR_Capa2/
         resultados.csv
         estrategias_ganadoras/
      ...
   scripts/
      generate_bs_v7.py                   ← generador de blocksettings por TF
      test_descomposicion.py              ← TODO
      filter_by_correlation.py            ← TODO
```

---

## REGLAS DE INTERACCIÓN PARA CLAUDE

### Estilo de comunicación

- Español
- Directo y pragmático (no over-engineering)
- Snake_case en variables Python
- Comentarios en español

### Cuando modifique blocksettings

- Documentar cambios en `CLAUDE_Blocksettings_Detalle.md`
- Mantener versionado claro (v4 → v5 → v6 → v7 → ...)
- No romper compatibilidad con minings anteriores
- **A partir de v7: blocksetting por TF** (M5/M15/M30/H1/H4) en lugar de uno único
- **Rangos SL/TP/Trailing son del blocksetting** (NO del What to Build) — están en config.xml interno
- Usar `scripts/generate_bs_v7.py` para regenerar editando `TF_CONFIGS`

### Cuando configure cross-checks

- Aplicar exactamente cheatsheet correspondiente (Capa 1 o Capa 2)
- Apply optimized: SIEMPRE OFF
- Walk-Forward Simulated (fastest)
- Documentar cualquier desviación

### Antes de operar real

- Verificación MT5 obligatoria
- Demo 30+ días
- Sizing pequeño inicial

### Test de Descomposición

- Aplicar sobre TIER 1/2 (no necesariamente todas)
- Documentar Coef_Emergencia para cada ganadora
- Descartar si Coef > 1.30 o PF_solo_edge < 1.0

---

## REFERENCIAS

- **Tomas Nesnidal:** metodología 2 capas (libro y blog)
- **StrategyQuant blog:** preparing accurate data, broker differences
- **Foros SQX:** discusión Darwinex timezone (USA DST vs Europa)
- **Van Tharp:** R Expectancy concept

---

**Última actualización:** 2026-05-22
**Versión:** v5.7 — **Filtro #4 v2 "Supervivencia por régime"** reemplaza el antiguo "9/9 OOS positivos" (irreal en sample largo 16y — pedir que un edge gane en todos los régimes = overfit). Nueva filosofía: "domina en tu régime propio + sobrevive en los adversos". 2 variantes auto-seleccionadas por nº de bloques adversos: ESTADÍSTICA (≥3 adversos, oro/forex 16y — avg adversos ≥ −30%/−50% del propio) y POR-EVENTO (<3 adversos, índices CFD 8y — cada bloque adverso < 1.5%/2% capital). Veredictos ROBUSTO/DEFENSIVO/FRÁGIL/CATASTRÓFICO. Implementado en `cvcFilter4v2()` + `detectAssetClass()` + `detectOwnRegime()`, integrado en `compute5Filters()`. 7/7 tests unitarios pasan.

**Versión:** v5.6 — **Metodología de 3 períodos** (MINING / FILTROS / CvC) para unificar el criterio entre activos con data Dukas buena (forex/oro 2010+) y activos solo Darwinex (índices CFD). Regla clave: **los filtros Capa 2 se evalúan SIEMPRE sobre el período común 2018-2026**, sin importar el broker de mining → un solo set de filtros, vara de medir justa. + **Validación cross-broker empírica**: lote SSL XAUUSD H1 (14 estrategias mismo edge, backtesteadas en Dukas + Darwinex) → 0/14 DRIFT, métricas Dukas≈Darwinex en período común. + **Caso `0.125931`**: pasa 5/5 filtros en 2018-2026 pero CvC sobre Dukas 16y revela pérdida -$1,310 en BEAR estructural 2014 → lote SSL descartado (edge breakout alcista frágil a BEAR oro). El método nuevo descartó correctamente un mining que el método viejo habría adoptado. + Scripts nuevos: `analyze_dukas_csv_quality.py`, `compare_cross_broker.py`, auto-N bloques en `cvc_single_strategy.py` y web. + Stock se mantiene en 14 (lote SSL no aporta adoptables).

**Versión:** v5.5 — **Stock pasa de 13 a 14** con adopción de **#14 XAUUSD H1 LONG Fibo 0.8883321** (`Fibo[1] > Highest[1] AND LowD[1] > SessionLow[1]`): edge breakout-mean-revert híbrido. **10/10 OOS positivos + 10/10 años civiles positivos** (incluso 2020 COVID +$105, 2022 BEAR oro +$311). PF 2.12, Ret/DD 12.98 ⭐, DD% 0.62, Sharpe 1.51, R Exp 0.39. PRIMERA con CvC 6/6 perfecto. + Mining XAUUSD H1 80 estrategias procesadas: **magic marker `04 02 03 01` (variante F) descubierto** en orders.bin (sin este fix, 14/80 sin parsear) — actualizado `parse_sqx_orders.py` y `sqxParser.js`. + **Filter by Correlation con threshold MENSUAL 0,3 (criterio SQX clásico)** — 9 estrategias que pasan filtros métricos colapsan a 1 ortogonal real (las otras 8 comparten edge `Fibo > Highest` → corr mensual 0,33-0,42). + Stock pasa de 13 a 14 estrategias.
