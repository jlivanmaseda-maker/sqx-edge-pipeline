# Clasificacion de Indicadores SQX - BlockSettingsEdge.sqb

> Fuente: `BlockSettingsEdge.sqb` > category="indicators" > solo bloques `Indicators.*`
> Total: 70 indicadores tecnicos + 54 bloques auxiliares (operadores, precios, tiempo)

---

## CATEGORIA 1: TENDENCIA (Trend-Following)
> Identifican la direccion y fuerza de la tendencia dominante.

| # | Indicador SQX Key | Nombre Comun | Notas |
|---|-------------------|--------------|-------|
| 1 | Indicators.ADX | Average Directional Index | Mide fuerza de tendencia (no direccion) |
| 2 | Indicators.Aroon | Aroon | Detecta inicio/fin de tendencias |
| 3 | Indicators.EMA | Exponential Moving Average | Media movil exponencial |
| 4 | Indicators.SMA | Simple Moving Average | Media movil simple |
| 5 | Indicators.SMMA | Smoothed Moving Average | Media movil suavizada |
| 6 | Indicators.LWMA | Linear Weighted Moving Average | Media ponderada lineal |
| 7 | Indicators.TEMA | Triple Exponential Moving Average | Media movil triple exponencial |
| 8 | Indicators.HullMovingAverage | Hull Moving Average | HMA - baja latencia |
| 9 | Indicators.KAMA | Kaufman Adaptive Moving Average | Se adapta a volatilidad |
| 10 | Indicators.LinearRegression | Linear Regression | Regresion lineal sobre precio |
| 11 | Indicators.Ichimoku | Ichimoku Kinko Hyo | Sistema completo tendencial |
| 12 | Indicators.ParabolicSAR | Parabolic SAR | Stop and Reverse, trailing tendencial |
| 13 | Indicators.SuperTrend | SuperTrend | Tendencia basada en ATR |
| 14 | Indicators.GannHiLo | Gann Hi-Lo Activator | Cambio de tendencia via HiLo |
| 15 | Indicators.MACD | MACD | Convergencia/divergencia de medias |
| 16 | Indicators.SchaffTrendCycle | Schaff Trend Cycle | Ciclo de tendencia (MACD+Stoch) |
| 17 | Indicators.Vortex | Vortex Indicator | Tendencia positiva/negativa |
| 18 | Indicators.ATRTrailingStops | ATR Trailing Stops | Trailing stop basado en ATR (tendencial) |
| 19 | Indicators.EhlersMotherOfAdaptiveMovingAverages | Ehlers MAMA | Media adaptativa avanzada |

---

## CATEGORIA 2: MOMENTUM / FUERZA
> Miden la velocidad del cambio de precio y la fuerza del movimiento.

| # | Indicador SQX Key | Nombre Comun | Notas |
|---|-------------------|--------------|-------|
| 1 | Indicators.RSI | Relative Strength Index | Oscilador 0-100, momentum clasico |
| 2 | Indicators.SmoothedRSI | Smoothed RSI | RSI suavizado |
| 3 | Indicators.LaguerreRSI | Laguerre RSI | RSI con filtro Laguerre |
| 4 | Indicators.Stochastic | Stochastic Oscillator | %K/%D, momentum sobre rango |
| 5 | Indicators.Momentum | Momentum | Diferencia de precio simple |
| 6 | Indicators.ROC | Rate of Change | Tasa de cambio porcentual |
| 7 | Indicators.CCI | Commodity Channel Index | Desviacion del precio medio |
| 8 | Indicators.WilliamsPR | Williams %R | Similar a Stochastic invertido |
| 9 | Indicators.AwesomeOscillator | Awesome Oscillator | Momentum de Bill Williams |
| 10 | Indicators.BullsPower | Bulls Power | Fuerza compradora |
| 11 | Indicators.BearsPower | Bears Power | Fuerza vendedora |
| 12 | Indicators.OSMA | OsMA | Histograma MACD - signal |
| 13 | Indicators.RVI | Relative Vigor Index | Vigor relativo del movimiento |
| 14 | Indicators.DeMarker | DeMarker | Agotamiento de tendencia |
| 15 | Indicators.QQE | Quantitative Qualitative Estimation | RSI suavizado con bandas dinamicas |
| 16 | Indicators.DSSBressert | DSS Bressert | Double Smoothed Stochastic |
| 17 | Indicators.KaufmanEfficiencyRatio | Kaufman Efficiency Ratio | Eficiencia del movimiento (0-1) |
| 18 | Indicators.DPO | Detrended Price Oscillator | Oscilador sin tendencia |
| 19 | Indicators.CaseyCPercent | Casey C% | Variante de momentum personalizada |
| 20 | Indicators.Reflex | Reflex Indicator | Momentum adaptativo (Ehlers) |

---

## CATEGORIA 3: VOLATILIDAD
> Miden la amplitud y dispersion del movimiento de precio.

| # | Indicador SQX Key | Nombre Comun | Notas |
|---|-------------------|--------------|-------|
| 1 | Indicators.ATR | Average True Range | Rango verdadero promedio |
| 2 | Indicators.LogATR | Log ATR | ATR en escala logaritmica |
| 3 | Indicators.MTATR | Multi-Timeframe ATR | ATR multi-temporalidad |
| 4 | Indicators.TrueRange | True Range | Rango verdadero (single bar) |
| 5 | Indicators.StdDev | Standard Deviation | Desviacion estandar |
| 6 | Indicators.BollingerBands | Bollinger Bands | Bandas de volatilidad (SMA+StdDev) |
| 7 | Indicators.KeltnerChannel | Keltner Channel | Canal de volatilidad (EMA+ATR) |
| 8 | Indicators.MTKeltnerChannel | Multi-TF Keltner Channel | Keltner multi-temporalidad |
| 9 | Indicators.DonchianChannels | Donchian Channels | Canal de maximos/minimos |
| 10 | Indicators.HullMovingAverageATRBands | HMA ATR Bands | HMA con bandas ATR |
| 11 | Indicators.HullMovingAverageBollingerBands | HMA Bollinger Bands | HMA con bandas Bollinger |
| 12 | Indicators.VWAPATRBands | VWAP ATR Bands | VWAP con bandas ATR |
| 13 | Indicators.VWAPBollingerBands | VWAP Bollinger Bands | VWAP con bandas Bollinger |
| 14 | Indicators.UlcerIndex | Ulcer Index | Volatilidad a la baja (drawdown) |

---

## CATEGORIA 4: REGIMEN DE MERCADO / CICLICIDAD
> Detectan el estado o fase actual del mercado (trending vs ranging, ciclos).

| # | Indicador SQX Key | Nombre Comun | Notas |
|---|-------------------|--------------|-------|
| 1 | Indicators.ChoppinessIndex | Choppiness Index | Ranging (alto) vs Trending (bajo) |
| 2 | Indicators.CSSAMarketRegime | CSSA Market Regime | Clasificacion de regimen estadistica |
| 3 | Indicators.HurstExponent | Hurst Exponent | Persistencia: >0.5 trending, <0.5 mean-revert |
| 4 | Indicators.EntropyMath | Entropy (Math) | Entropia informacional del precio |
| 5 | Indicators.EhlersHilbertTransform | Ehlers Hilbert Transform | Deteccion de ciclo dominante |

---

## CATEGORIA 5: VOLUMEN / VWAP
> Indicadores basados en volumen y precio ponderado por volumen.

| # | Indicador SQX Key | Nombre Comun | Notas |
|---|-------------------|--------------|-------|
| 1 | Indicators.VWAP | Volume Weighted Average Price | Precio medio ponderado por volumen |
| 2 | Indicators.AvgVolume | Average Volume | Volumen promedio |

---

## CATEGORIA 6: SOPORTE / RESISTENCIA / ESTRUCTURA
> Identifican niveles de precio clave y estructura del mercado.

| # | Indicador SQX Key | Nombre Comun | Notas |
|---|-------------------|--------------|-------|
| 1 | Indicators.Pivots | Pivot Points | Niveles pivot clasicos |
| 2 | Indicators.Fibo | Fibonacci | Niveles Fibonacci |
| 3 | Indicators.Fractal | Fractals | Fractales de Bill Williams |
| 4 | Indicators.Highest | Highest Value | Valor maximo en periodo |
| 5 | Indicators.HighestInRange | Highest In Range | Maximo en rango especifico |
| 6 | Indicators.Lowest | Lowest Value | Valor minimo en periodo |
| 7 | Indicators.LowestInRange | Lowest In Range | Minimo en rango especifico |

---

## CATEGORIA 7: ESTADISTICO / CUANTITATIVO
> Indicadores de naturaleza puramente estadistica o de ranking.

| # | Indicador SQX Key | Nombre Comun | Notas |
|---|-------------------|--------------|-------|
| 1 | Indicators.ZScore | Z-Score | Desviaciones sobre la media |
| 2 | Indicators.SRPercentRank | SR Percent Rank | Ranking percentil |
| 3 | Indicators.Number | Number (Constante) | Valor numerico fijo para comparaciones |

---

## BLOQUES AUXILIARES (No son indicadores tecnicos propiamente)

### Operadores Logicos / Comparadores
> Usados para construir condiciones en las estrategias.

| Key | Funcion |
|-----|---------|
| CrossesAbove | Cruce al alza |
| CrossesBelow | Cruce a la baja |
| IsGreater / IsGreaterOrEqual | Mayor / Mayor o igual |
| IsLower / IsLowerOrEqual | Menor / Menor o igual |
| IsGreaterCount / IsLowerCount | Conteo de veces mayor/menor |
| IsGreaterPercentil / IsLowerPercentil | Comparacion percentil |
| Equals / NotEquals | Igualdad / Desigualdad |
| IsRising / IsFalling | Esta subiendo / bajando |
| Not | Negacion logica |
| IndicatorAboveMA / IndicatorBelowMA | Indicador sobre/bajo su MA |
| IndicatorCrossesAboveMA / IndicatorCrossesBelowMA | Indicador cruza su MA |

### Datos de Precio (Prices.*)
> Valores de precio crudos, multi-timeframe y Heiken Ashi.

| Grupo | Keys |
|-------|------|
| Precio actual | Close, High, Low, Open |
| Diario (D) | CloseD, HighD, LowD, OpenD |
| Semanal (W) | CloseW, HighW, LowW, OpenW |
| Mensual (M) | CloseM, HighM, LowM, OpenM |
| Heiken Ashi | HeikenAshiClose, HeikenAshiHigh, HeikenAshiLow, HeikenAshiOpen |
| Sesion | SessionClose, SessionHigh, SessionLow, SessionOpen |
| Bid/Ask | Bid, Ask |

### Filtros Temporales
> Filtrado por momento del dia/semana/mes.

| Key | Funcion |
|-----|---------|
| BarHour / BarMinute / BarDayOfWeek / BarDayOfMonth / BarMonth | Tiempo de la barra |
| CurrentHour / CurrentMinute / CurrentDayOfWeek / CurrentMonth | Tiempo actual del servidor |

---

## RESUMEN POR CATEGORIA

| Categoria | Cantidad | Ejemplo Principal |
|-----------|----------|-------------------|
| Tendencia | 19 | EMA, MACD, Ichimoku, SuperTrend |
| Momentum/Fuerza | 20 | RSI, Stochastic, CCI, ROC |
| Volatilidad | 14 | ATR, Bollinger, Keltner, StdDev |
| Regimen de Mercado | 5 | ChoppinessIndex, Hurst, Entropy |
| Volumen/VWAP | 2 | VWAP, AvgVolume |
| Soporte/Resistencia | 7 | Pivots, Fibo, Fractal, Highest/Lowest |
| Estadistico | 3 | ZScore, PercentRank |
| **Total Indicadores** | **70** | |
| Operadores logicos | 15 | CrossesAbove, IsGreater... |
| Precios | 26 | Close, HighD, HeikenAshi... |
| Temporales | 10 | BarHour, CurrentMonth... |
| **Total auxiliares** | **54** | |
| **TOTAL GENERAL** | **124** | |
