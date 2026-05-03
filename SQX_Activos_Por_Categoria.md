# Activos por Categoria de Indicador - SQX Edge Building

> Forex (Majors, Minors, Exotics) + Indices + Oro
> Clasificacion segun tipo de indicador + diferenciacion Long/Short
> L = Long, S = Short, L/S = ambos

---

## ASIMETRIA LONG vs SHORT - Conceptos clave

| Mercado | Comportamiento | Implicacion |
|---------|---------------|-------------|
| **Forex** | Simetrico (comprar EURUSD = vender USDEUR) | L/S indiferente, misma logica |
| **Indices** | Bias alcista estructural. Caidas 3x mas rapidas que subidas | Long: tendencia lenta. Short: momentum rapido y explosivo |
| **Oro** | Bias alcista moderado. Caidas mas bruscas que Forex pero menos que indices | Long: tendencia + S/R. Short: momentum + volatilidad |

---

## 1. BS_Tendencia (EMA, MACD, Ichimoku, SuperTrend...)
> Activos que generan tendencias limpias y sostenidas.

### FOREX (L/S simetrico)
| Activos | Dir | TF | Por que |
|---------|-----|----|--------|
| EURUSD, GBPUSD, USDJPY, USDCHF | L/S | H1, H4, D1 | Tendencias macro por divergencia de politica monetaria |
| EURJPY, GBPJPY | L/S | H1, H4 | JPY-crosses trendan fuerte en ambas direcciones |
| EURGBP | L/S | H4, D1 | Tendencias lentas pero limpias |
| EURCAD, GBPCAD | L/S | H1, H4 | CAD-crosses trendan bien por correlacion con petroleo |
| GBPCHF | L/S | H1, H4 | Tendencias claras, GBP volatil vs CHF estable |
| GBPAUD | L/S | H1, H4 | Tendencias amplias, alta direccionalidad |

### INDICES (Long ≠ Short)
| Activos | Dir | TF | Por que |
|---------|-----|----|--------|
| US500, US30, USTEC | **L** | H1, H4, D1 | Bias alcista estructural, tendencias multi-mes. **Categoria estrella para Long** |
| GER40 (DAX) | **L** | H1, H4 | Tendencia alcista europea, correlacion con US |
| US500, USTEC | **S** | M30, H1 | Solo correcciones profundas. Usar con filtro ADX alto + momentum confirmando. **No recomendado para Short tendencial puro** |

### ORO
| Activos | Dir | TF | Por que |
|---------|-----|----|--------|
| XAUUSD | **L** | H1, H4, D1 | Tendencias fuertes en risk-off/inflacion. **Muy bueno Long** |
| XAUUSD | **S** | H1, H4 | Solo en fases de USD fuerte. Tendencias Short mas cortas y erraticas |

---

## 2. BS_Momentum (RSI, Stochastic, CCI, ROC...)
> Impulsos rapidos y reversiones en zonas de sobrecompra/sobreventa.

### FOREX (L/S simetrico)
| Activos | Dir | TF | Por que |
|---------|-----|----|--------|
| EURUSD, GBPUSD, AUDUSD, NZDUSD | L/S | M15, M30, H1 | Buenas reversiones en extremos RSI/Stoch |
| AUDJPY, NZDJPY, CADJPY | L/S | M30, H1 | Carry trades generan impulsos de momentum claros |
| AUDNZD, EURCHF | L/S | H1, H4 | Baja volatilidad, momentum ciclico predecible |
| AUDCAD | L/S | M30, H1 | Impulsos por divergencia commodities (oro AU vs petroleo CA) |
| EURNZD | L/S | M30, H1 | Momentum amplio por diferencial de tipos EUR vs NZD |

### INDICES (Short destaca aqui)
| Activos | Dir | TF | Por que |
|---------|-----|----|--------|
| USTEC (Nasdaq) | **L** | M30, H1 | Momentum alcista explosivo en tech rallies |
| GER40 (DAX) | **L** | M15, M30 | Ciclos intraday marcados, buen momentum European open |
| USTEC, US500 | **S** | **M5, M15, M30** | **CATEGORIA ESTRELLA PARA SHORT INDICES**. Las caidas son rapidas y con momentum extremo. RSI/CCI en sobreventa se alcanza rapido. Usar TF cortos |
| GER40 | **S** | M15, M30 | Caidas intraday bruscas, momentum short funciona bien |

### ORO
| Activos | Dir | TF | Por que |
|---------|-----|----|--------|
| XAUUSD | **L** | M30, H1 | Impulsos Long en datos macro (CPI, NFP, FOMC) |
| XAUUSD | **S** | **M15, M30** | Caidas por USD fuerte son rapidas. Momentum Short bueno en TF cortos |

---

## 3. BS_Volatilidad (Bollinger, Keltner, Donchian, StdDev...)
> Expansion/contraccion de volatilidad.

### FOREX (L/S simetrico)
| Activos | Dir | TF | Por que |
|---------|-----|----|--------|
| GBPUSD, USDJPY, USDCAD | L/S | M15, H1, H4 | GBP alta vol intrinseca; JPY sesion asiatica; CAD petroleo |
| GBPJPY, GBPNZD, EURAUD | L/S | M15, H1 | High-vol crosses, expansion de bandas predecible |
| GBPAUD, GBPCAD | L/S | M15, H1 | GBP-crosses de alta volatilidad, bandas anchas |
| EURNZD | L/S | H1, H4 | Spread amplio de volatilidad, buenas expansiones |
| USDMXN, USDZAR | L/S | H1, H4 | Volatilidad extrema, breakout de bandas |

### INDICES (Short = expansion de vol)
| Activos | Dir | TF | Por que |
|---------|-----|----|--------|
| US500, USTEC | **L** | H1, H4 | Breakout alcista de Bollinger/Keltner en bull trends |
| US500, USTEC | **S** | **M15, M30** | **VIX sube en caidas = expansion de volatilidad masiva**. Bandas de Bollinger se abren violentamente. Donchian breakout Short muy efectivo |
| GER40 | **S** | M15, M30 | Expansion de vol en gap-downs y crisis europeas |

### ORO
| Activos | Dir | TF | Por que |
|---------|-----|----|--------|
| XAUUSD | **L** | H1, H4 | Expansion vol en crisis = Oro sube rompiendo bandas superiores |
| XAUUSD | **S** | M30, H1 | Expansion vol en USD fuerte, bandas inferiores se rompen rapido |

---

## 4. BS_Regimen (CSSAMarketRegime, Entropy, Hilbert...)
> Deteccion de fase: trending vs ranging vs ciclico.

### FOREX (L/S simetrico)
| Activos | Dir | TF | Por que |
|---------|-----|----|--------|
| EURUSD, USDJPY, AUDUSD | L/S | H4, D1 | Ciclos claros trending/consolidacion por macro |
| EURGBP, AUDNZD, NZDCAD | L/S | H4, D1 | Alternan semanas en rango y breakout |
| AUDCAD, CADCHF | L/S | H4, D1 | Cambios de regimen claros por fundamentales commodity/safe-haven |
| CHFJPY | L/S | H4, D1 | Safe-haven vs safe-haven, regimenes muy marcados por risk-on/risk-off |

### INDICES (diferente regimen L vs S)
| Activos | Dir | TF | Por que |
|---------|-----|----|--------|
| US500, GER40 | **L** | H4, D1 | Regimen trending alcista = comprar. Regimen ranging = no operar Long |
| US500, USTEC | **S** | **H1, H4** | Regimen trending bajista es raro pero muy rentable. Usar Hurst/Entropy para detectar cambio de regimen a bearish. **Solo Short cuando regimen confirma** |

### ORO
| Activos | Dir | TF | Por que |
|---------|-----|----|--------|
| XAUUSD | **L** | H4, D1 | Fases acumulacion→expansion muy marcadas |
| XAUUSD | **S** | H4 | Detectar regimen bearish (USD rally) antes de operar Short |

---

## 5. BS_Volumen (VWAP)
> Precio ponderado por volumen.

### FOREX (L/S simetrico)
| Activos | Dir | TF | Por que |
|---------|-----|----|--------|
| EURUSD, GBPUSD, USDJPY | L/S | M5, M15, M30 | Mayor tick volume = VWAP representativo. Precio sobre VWAP = Long, bajo = Short |

### INDICES (VWAP institucional)
| Activos | Dir | TF | Por que |
|---------|-----|----|--------|
| US500, US30, USTEC, GER40 | **L** | M5, M15, M30 | Volumen real. Precio reclaim VWAP = Long intraday clasico |
| US500, USTEC | **S** | M5, M15 | Rechazo en VWAP desde abajo = Short intraday. **Muy usado por institucionales** |

### ORO
| Activos | Dir | TF | Por que |
|---------|-----|----|--------|
| XAUUSD | L/S | M15, M30 | VWAP como pivot intraday, funciona bien ambas direcciones |

**Nota**: Evitar pares exoticos - tick volume poco fiable para VWAP.

---

## 6. BS_SoporteResistencia (Pivots, Fibo, Fractals, Highest/Lowest)
> Niveles de precio clave.

### FOREX (L/S simetrico)
| Activos | Dir | TF | Por que |
|---------|-----|----|--------|
| EURUSD, GBPUSD, USDJPY, USDCHF | L/S | H1, H4, D1 | Pivots y Fibos muy respetados por institucionales |
| EURJPY, GBPJPY, EURGBP | L/S | H1, H4 | JPY-crosses respetan pivots; EURGBP S/R claros en rango |
| EURCAD, GBPCHF | L/S | H1, H4 | Respetan bien pivots diarios y niveles Fibo |

### INDICES (niveles psicologicos)
| Activos | Dir | TF | Por que |
|---------|-----|----|--------|
| US500, US30, USTEC, GER40 | **L** | H1, H4, D1 | Rebote en soporte (Pivots S1/S2, Fibos 61.8%) = Long. Niveles redondos (5000, 20000) |
| US500, USTEC | **S** | H1, H4 | Rechazo en resistencia (Pivot R1/R2, Highest) = Short. **Funciona bien en techo de rango** |

### ORO
| Activos | Dir | TF | Por que |
|---------|-----|----|--------|
| XAUUSD | **L** | H1, H4, D1 | Niveles redondos (2000, 2500, 3000) como soporte + Fibo historicos |
| XAUUSD | **S** | H1, H4 | Rechazo en resistencia / Highest. Short en techo de rango lateral |

---

## 7. BS_Estadistico (ZScore, PercentRank)
> Mean-reversion y deteccion de extremos estadisticos.

### FOREX (L/S simetrico - mean reversion natural)
| Activos | Dir | TF | Por que |
|---------|-----|----|--------|
| EURUSD, EURCHF, USDCHF | L/S | M30, H1, H4 | Baja kurtosis, distribucion mas normal. ZScore funciona bien |
| EURGBP, AUDNZD, NZDCAD | L/S | H1, H4 | **Pares ideales para mean-reversion**. ZScore extremo = reversion |
| AUDCAD, CADCHF, CHFJPY | L/S | H1, H4 | Pares de rango con distribucion estadistica predecible |

### INDICES (asimetria estadistica)
| Activos | Dir | TF | Por que |
|---------|-----|----|--------|
| GER40 (DAX) | **L** | M30, H1 | Reversion intraday en sesion europea. ZScore negativo extremo = Long |
| US500, USTEC | **L** | H1, H4 | ZScore muy negativo (>-2) = sobrevendido, Long por reversion al mean |
| US500, USTEC | **S** | **M15, M30** | ZScore muy positivo (>+2) menos fiable para Short porque el bias es alcista. **Usar solo con confirmacion de otro indicador** |

### ORO
| Activos | Dir | TF | Por que |
|---------|-----|----|--------|
| XAUUSD | L/S | H1, H4 | ZScore sobre ATR detecta movimientos anomalos. Funciona ambas direcciones |

---

## 8. BS_Filtros (ADX, ATR, Choppiness, Hurst, KER, AvgVolume)
> Segunda fase - se aplica a TODOS los activos. Ajustes Long vs Short:

| Filtro | Long | Short |
|--------|------|-------|
| **ADX** | > 25 (confirmar tendencia) | > 30 en indices (necesita tendencia bajista fuerte) |
| **ATR** | ATR min (evitar mercados planos) | ATR min MAS ALTO que Long (necesita volatilidad para Short rentable) |
| **Choppiness** | < 45 (trending) | < 38 en indices (Short solo en tendencia bajista clara, no en chop) |
| **Hurst** | > 0.5 (persistencia) | > 0.55 en indices (mayor umbral para confirmar persistencia bajista) |
| **KER** | > 0.3 (eficiencia) | > 0.4 en indices (movimiento bajista debe ser mas eficiente) |
| **AvgVolume** | > media (liquidez) | > 1.2x media en indices (volumen alto confirma sell-off real) |

---

## RESUMEN - MATRIZ ACTIVO x CATEGORIA x DIRECCION

### FOREX (L/S simetrico en todas las categorias)
| Activo | Tendencia | Momentum | Volatilidad | Regimen | Volumen | S/R | Estadistico |
|--------|-----------|----------|-------------|---------|---------|-----|-------------|
| EURUSD | L/S | L/S | - | L/S | L/S | L/S | L/S |
| GBPUSD | L/S | L/S | L/S | - | L/S | L/S | - |
| USDJPY | L/S | - | L/S | L/S | L/S | L/S | - |
| USDCHF | L/S | - | - | - | - | L/S | L/S |
| AUDUSD | - | L/S | - | L/S | - | - | - |
| NZDUSD | - | L/S | - | - | - | - | - |
| USDCAD | - | - | L/S | - | - | - | - |
| EURGBP | L/S | - | - | L/S | - | L/S | L/S |
| EURJPY | L/S | - | - | - | - | L/S | - |
| EURCAD | L/S | - | - | - | - | L/S | - |
| EURCHF | - | L/S | - | - | - | - | L/S |
| EURAUD | - | - | L/S | - | - | - | - |
| EURNZD | - | L/S | L/S | - | - | - | - |
| GBPJPY | L/S | L/S | L/S | - | - | L/S | - |
| GBPNZD | - | - | L/S | - | - | - | - |
| GBPAUD | L/S | - | L/S | - | - | - | - |
| GBPCAD | L/S | - | L/S | - | - | - | - |
| GBPCHF | L/S | - | - | - | - | L/S | - |
| AUDJPY | - | L/S | - | - | - | - | - |
| NZDJPY | - | L/S | - | - | - | - | - |
| CADJPY | - | L/S | - | - | - | - | - |
| CHFJPY | - | - | - | L/S | - | - | L/S |
| AUDNZD | - | L/S | - | L/S | - | - | L/S |
| AUDCAD | - | L/S | - | L/S | - | - | L/S |
| NZDCAD | - | - | - | L/S | - | - | L/S |
| CADCHF | - | - | - | L/S | - | - | L/S |
| USDMXN | - | - | L/S | - | - | - | - |
| USDZAR | - | - | L/S | - | - | - | - |

### INDICES (Long ≠ Short)
| Activo | Tendencia | Momentum | Volatilidad | Regimen | Volumen | S/R | Estadistico |
|--------|-----------|----------|-------------|---------|---------|-----|-------------|
| US500 L | **++** | + | + | + | + | + | + |
| US500 S | - | **++** | **++** | + | + | + | ~ |
| USTEC L | **++** | **++** | + | + | + | + | + |
| USTEC S | - | **++** | **++** | + | + | + | ~ |
| GER40 L | + | + | - | + | + | + | + |
| GER40 S | - | + | + | + | - | + | - |
| US30 L | **++** | + | - | - | + | + | - |
| US30 S | - | + | - | - | + | + | - |

`++` = categoria estrella, `+` = funciona bien, `~` = con precaucion, `-` = no recomendado

### ORO
| Activo | Tendencia | Momentum | Volatilidad | Regimen | Volumen | S/R | Estadistico |
|--------|-----------|----------|-------------|---------|---------|-----|-------------|
| XAUUSD L | **++** | + | + | + | + | **++** | + |
| XAUUSD S | ~ | **++** | + | + | + | + | + |

---

## RECOMENDACION DE ACTIVOS PARA EMPEZAR POR DIRECCION

### Para estrategias LONG:
1. **EURUSD** (Forex) - versatil en todas las categorias
2. **US500/USTEC** (Indices) - tendencia estrella
3. **XAUUSD** (Oro) - tendencia + S/R

### Para estrategias SHORT:
1. **EURUSD** (Forex) - simetrico, funciona igual
2. **USTEC/US500** (Indices) - **usar Momentum + Volatilidad, TF cortos (M5-M30)**
3. **XAUUSD** (Oro) - momentum Short en TF cortos

### Regla general para Short en Indices/Oro:
- Usar TF mas cortos que Long (M5-M30 vs H1-D1)
- Requiere filtros mas estrictos (ADX>30, Hurst>0.55, Vol alta)
- Preferir Momentum y Volatilidad sobre Tendencia
- Las operaciones Short duran menos tiempo = exits mas rapidos
