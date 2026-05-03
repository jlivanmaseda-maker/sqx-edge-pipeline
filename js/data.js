// ============================================================
// SQX Dashboard — data layer
// CAT_META, ASSETS, FILTROS, STRATEGIES, PLAN, etc.
// ============================================================

const CAT_META = {
  tendencia:   { name:'Tendencia',           icon:'T', color:'#3b82f6', desc:'EMA, MACD, Ichimoku, SuperTrend' },
  momentum:    { name:'Momentum',            icon:'M', color:'#22c55e', desc:'RSI, Stochastic, CCI, ROC' },
  volatilidad: { name:'Volatilidad',         icon:'V', color:'#f97316', desc:'Bollinger, Keltner, Donchian, StdDev' },
  regimen:     { name:'Regimen',             icon:'R', color:'#a855f7', desc:'CSSAMarketRegime, Entropy, Hilbert' },
  volumen:     { name:'Volumen',             icon:'W', color:'#06b6d4', desc:'VWAP, AvgVolume' },
  sr:          { name:'Soporte/Resistencia', icon:'S', color:'#ec4899', desc:'Pivots, Fibo, Fractals, H/L' },
  estadistico: { name:'Estadistico',         icon:'E', color:'#eab308', desc:'ZScore, PercentRank' },
};

const ASSETS = [
  { id:'EURUSD', type:'forex', sub:'Major', cats:{
    tendencia:   { dir:'L/S', tf:'H1, H4, D1',  why:'Tendencias macro por divergencia de politica monetaria', rating:'++' },
    momentum:    { dir:'L/S', tf:'M15, M30, H1', why:'Buenas reversiones en extremos RSI/Stoch', rating:'+' },
    regimen:     { dir:'L/S', tf:'H4, D1',       why:'Ciclos claros trending/consolidacion por macro', rating:'+' },
    volumen:     { dir:'L/S', tf:'M5, M15, M30', why:'Mayor tick volume = VWAP representativo', rating:'+' },
    sr:          { dir:'L/S', tf:'H1, H4, D1',  why:'Pivots y Fibos muy respetados por institucionales', rating:'++' },
    estadistico: { dir:'L/S', tf:'M30, H1, H4', why:'Baja kurtosis, distribucion mas normal. ZScore funciona bien', rating:'+' },
  }},
  { id:'GBPUSD', type:'forex', sub:'Major', cats:{
    tendencia:   { dir:'L/S', tf:'H1, H4, D1',  why:'Tendencias macro por divergencia de politica monetaria', rating:'+' },
    momentum:    { dir:'L/S', tf:'M15, M30, H1', why:'Buenas reversiones en extremos RSI/Stoch', rating:'+' },
    volatilidad: { dir:'L/S', tf:'M15, H1, H4', why:'GBP alta volatilidad intrinseca', rating:'++' },
    volumen:     { dir:'L/S', tf:'M5, M15, M30', why:'Mayor tick volume = VWAP representativo', rating:'+' },
    sr:          { dir:'L/S', tf:'H1, H4, D1',  why:'Pivots y Fibos muy respetados por institucionales', rating:'+' },
  }},
  { id:'USDJPY', type:'forex', sub:'Major', cats:{
    tendencia:   { dir:'L/S', tf:'H1, H4, D1',  why:'Tendencias macro por divergencia de politica monetaria', rating:'+' },
    volatilidad: { dir:'L/S', tf:'M15, H1, H4', why:'Volatilidad en sesion asiatica', rating:'+' },
    regimen:     { dir:'L/S', tf:'H4, D1',       why:'Ciclos claros trending/consolidacion por macro', rating:'+' },
    volumen:     { dir:'L/S', tf:'M5, M15, M30', why:'Mayor tick volume = VWAP representativo', rating:'+' },
    sr:          { dir:'L/S', tf:'H1, H4, D1',  why:'Pivots y Fibos muy respetados por institucionales', rating:'+' },
  }},
  { id:'USDCHF', type:'forex', sub:'Major', cats:{
    tendencia:   { dir:'L/S', tf:'H1, H4, D1',  why:'Tendencias macro por divergencia de politica monetaria', rating:'+' },
    sr:          { dir:'L/S', tf:'H1, H4, D1',  why:'Pivots y Fibos respetados', rating:'+' },
    estadistico: { dir:'L/S', tf:'M30, H1, H4', why:'Baja kurtosis, distribucion mas normal', rating:'+' },
  }},
  { id:'AUDUSD', type:'forex', sub:'Major', cats:{
    momentum:    { dir:'L/S', tf:'M15, M30, H1', why:'Buenas reversiones en extremos RSI/Stoch', rating:'+' },
    regimen:     { dir:'L/S', tf:'H4, D1',       why:'Ciclos claros trending/consolidacion por macro', rating:'+' },
  }},
  { id:'NZDUSD', type:'forex', sub:'Major', cats:{
    momentum:    { dir:'L/S', tf:'M15, M30, H1', why:'Buenas reversiones en extremos RSI/Stoch', rating:'+' },
  }},
  { id:'USDCAD', type:'forex', sub:'Major', cats:{
    volatilidad: { dir:'L/S', tf:'M15, H1, H4', why:'Correlacion con petroleo genera expansion de volatilidad', rating:'+' },
  }},
  { id:'EURGBP', type:'forex', sub:'Minor', cats:{
    tendencia:   { dir:'L/S', tf:'H4, D1',  why:'Tendencias lentas pero limpias', rating:'+' },
    regimen:     { dir:'L/S', tf:'H4, D1',  why:'Alterna semanas en rango y breakout', rating:'++' },
    sr:          { dir:'L/S', tf:'H1, H4',  why:'S/R claros en rango', rating:'+' },
    estadistico: { dir:'L/S', tf:'H1, H4',  why:'Par ideal para mean-reversion. ZScore extremo = reversion', rating:'++' },
  }},
  { id:'EURJPY', type:'forex', sub:'Minor', cats:{
    tendencia:   { dir:'L/S', tf:'H1, H4',  why:'JPY-crosses trendan fuerte en ambas direcciones', rating:'+' },
    sr:          { dir:'L/S', tf:'H1, H4',  why:'JPY-crosses respetan pivots', rating:'+' },
  }},
  { id:'EURCAD', type:'forex', sub:'Minor', cats:{
    tendencia:   { dir:'L/S', tf:'H1, H4',  why:'CAD-crosses trendan bien por correlacion con petroleo', rating:'+' },
    sr:          { dir:'L/S', tf:'H1, H4',  why:'Respeta bien pivots diarios y niveles Fibo', rating:'+' },
  }},
  { id:'EURCHF', type:'forex', sub:'Minor', cats:{
    momentum:    { dir:'L/S', tf:'H1, H4',      why:'Baja volatilidad, momentum ciclico predecible', rating:'+' },
    estadistico: { dir:'L/S', tf:'M30, H1, H4', why:'Baja kurtosis, buena para ZScore', rating:'+' },
  }},
  { id:'EURAUD', type:'forex', sub:'Minor', cats:{
    volatilidad: { dir:'L/S', tf:'M15, H1', why:'High-vol cross, expansion de bandas predecible', rating:'+' },
  }},
  { id:'EURNZD', type:'forex', sub:'Minor', cats:{
    momentum:    { dir:'L/S', tf:'M30, H1', why:'Momentum amplio por diferencial de tipos EUR vs NZD', rating:'+' },
    volatilidad: { dir:'L/S', tf:'H1, H4',  why:'Spread amplio de volatilidad, buenas expansiones', rating:'+' },
  }},
  { id:'GBPJPY', type:'forex', sub:'Minor', cats:{
    tendencia:   { dir:'L/S', tf:'H1, H4',  why:'JPY-crosses trendan fuerte en ambas direcciones', rating:'+' },
    momentum:    { dir:'L/S', tf:'M30, H1', why:'Carry trades generan impulsos de momentum claros', rating:'+' },
    volatilidad: { dir:'L/S', tf:'M15, H1', why:'High-vol cross, expansion de bandas predecible', rating:'++' },
    sr:          { dir:'L/S', tf:'H1, H4',  why:'JPY-crosses respetan pivots', rating:'+' },
  }},
  { id:'GBPNZD', type:'forex', sub:'Minor', cats:{
    volatilidad: { dir:'L/S', tf:'M15, H1', why:'High-vol cross, expansion de bandas predecible', rating:'+' },
  }},
  { id:'GBPAUD', type:'forex', sub:'Minor', cats:{
    tendencia:   { dir:'L/S', tf:'H1, H4',  why:'Tendencias amplias, alta direccionalidad', rating:'+' },
    volatilidad: { dir:'L/S', tf:'M15, H1', why:'GBP-cross de alta volatilidad, bandas anchas', rating:'+' },
  }},
  { id:'GBPCAD', type:'forex', sub:'Minor', cats:{
    tendencia:   { dir:'L/S', tf:'H1, H4',  why:'CAD-crosses trendan bien por correlacion con petroleo', rating:'+' },
    volatilidad: { dir:'L/S', tf:'M15, H1', why:'GBP-cross de alta volatilidad, bandas anchas', rating:'+' },
  }},
  { id:'GBPCHF', type:'forex', sub:'Minor', cats:{
    tendencia:   { dir:'L/S', tf:'H1, H4',  why:'Tendencias claras, GBP volatil vs CHF estable', rating:'+' },
    sr:          { dir:'L/S', tf:'H1, H4',  why:'Respeta bien pivots diarios y niveles Fibo', rating:'+' },
  }},
  { id:'AUDJPY', type:'forex', sub:'Minor', cats:{
    momentum:    { dir:'L/S', tf:'M30, H1', why:'Carry trades generan impulsos de momentum claros', rating:'+' },
  }},
  { id:'NZDJPY', type:'forex', sub:'Minor', cats:{
    momentum:    { dir:'L/S', tf:'M30, H1', why:'Carry trades generan impulsos de momentum claros', rating:'+' },
  }},
  { id:'CADJPY', type:'forex', sub:'Minor', cats:{
    momentum:    { dir:'L/S', tf:'M30, H1', why:'Carry trades generan impulsos de momentum claros', rating:'+' },
  }},
  { id:'CHFJPY', type:'forex', sub:'Minor', cats:{
    regimen:     { dir:'L/S', tf:'H4, D1', why:'Safe-haven vs safe-haven, regimenes marcados por risk-on/risk-off', rating:'+' },
    estadistico: { dir:'L/S', tf:'H1, H4', why:'Par de rango con distribucion estadistica predecible', rating:'+' },
  }},
  { id:'AUDNZD', type:'forex', sub:'Minor', cats:{
    momentum:    { dir:'L/S', tf:'H1, H4', why:'Baja volatilidad, momentum ciclico predecible', rating:'+' },
    regimen:     { dir:'L/S', tf:'H4, D1', why:'Alterna semanas en rango y breakout', rating:'++' },
    estadistico: { dir:'L/S', tf:'H1, H4', why:'Par ideal para mean-reversion. ZScore extremo = reversion', rating:'++' },
  }},
  { id:'AUDCAD', type:'forex', sub:'Minor', cats:{
    momentum:    { dir:'L/S', tf:'M30, H1', why:'Impulsos por divergencia commodities (oro AU vs petroleo CA)', rating:'+' },
    regimen:     { dir:'L/S', tf:'H4, D1',  why:'Cambios de regimen claros por fundamentales commodity', rating:'+' },
    estadistico: { dir:'L/S', tf:'H1, H4',  why:'Par de rango con distribucion estadistica predecible', rating:'+' },
  }},
  { id:'NZDCAD', type:'forex', sub:'Minor', cats:{
    regimen:     { dir:'L/S', tf:'H4, D1', why:'Alterna semanas en rango y breakout', rating:'+' },
    estadistico: { dir:'L/S', tf:'H1, H4', why:'Par ideal para mean-reversion', rating:'+' },
  }},
  { id:'CADCHF', type:'forex', sub:'Minor', cats:{
    regimen:     { dir:'L/S', tf:'H4, D1', why:'Cambios de regimen claros por fundamentales commodity/safe-haven', rating:'+' },
    estadistico: { dir:'L/S', tf:'H1, H4', why:'Par de rango con distribucion estadistica predecible', rating:'+' },
  }},
  { id:'USDMXN', type:'forex', sub:'Exotic', cats:{
    volatilidad: { dir:'L/S', tf:'H1, H4', why:'Volatilidad extrema, breakout de bandas', rating:'+' },
  }},
  { id:'USDZAR', type:'forex', sub:'Exotic', cats:{
    volatilidad: { dir:'L/S', tf:'H1, H4', why:'Volatilidad extrema, breakout de bandas', rating:'+' },
  }},
  { id:'US500', type:'index', sub:'SP500', cats:{
    tendencia:     { dir:'L', tf:'H1, H4, D1',  why:'Bias alcista estructural, tendencias multi-mes', rating:'++' },
    tendencia_S:   { dir:'S', tf:'M30, H1',      why:'Solo correcciones profundas. No recomendado Short tendencial puro', rating:'-' },
    momentum:      { dir:'L', tf:'M30, H1',      why:'Momentum alcista en rallies', rating:'+' },
    momentum_S:    { dir:'S', tf:'M5, M15, M30', why:'ESTRELLA SHORT: caidas rapidas con momentum extremo', rating:'++' },
    volatilidad:   { dir:'L', tf:'H1, H4',       why:'Breakout alcista de Bollinger/Keltner', rating:'+' },
    volatilidad_S: { dir:'S', tf:'M15, M30',     why:'VIX sube en caidas = expansion masiva. Donchian breakout Short', rating:'++' },
    regimen:       { dir:'L', tf:'H4, D1',       why:'Regimen trending alcista = comprar', rating:'+' },
    regimen_S:     { dir:'S', tf:'H1, H4',       why:'Solo Short cuando regimen confirma bearish', rating:'+' },
    volumen:       { dir:'L', tf:'M5, M15, M30', why:'Volumen real. Reclaim VWAP = Long intraday', rating:'+' },
    volumen_S:     { dir:'S', tf:'M5, M15',      why:'Rechazo en VWAP desde abajo = Short intraday', rating:'+' },
    sr:            { dir:'L', tf:'H1, H4, D1',  why:'Rebote en soporte (Pivots S1/S2, Fibos 61.8%)', rating:'+' },
    sr_S:          { dir:'S', tf:'H1, H4',       why:'Rechazo en resistencia. Funciona bien en techo de rango', rating:'+' },
    estadistico:   { dir:'L', tf:'H1, H4',       why:'ZScore muy negativo (>-2) = Long por reversion', rating:'+' },
    estadistico_S: { dir:'S', tf:'M15, M30',     why:'ZScore >+2 menos fiable Short por bias alcista. Con confirmacion', rating:'~' },
  }},
  { id:'USTEC', type:'index', sub:'Nasdaq', cats:{
    tendencia:     { dir:'L', tf:'H1, H4, D1',  why:'Bias alcista estructural, tech rallies', rating:'++' },
    tendencia_S:   { dir:'S', tf:'M30, H1',      why:'No recomendado Short tendencial puro', rating:'-' },
    momentum:      { dir:'L', tf:'M30, H1',      why:'Momentum alcista explosivo en tech rallies', rating:'++' },
    momentum_S:    { dir:'S', tf:'M5, M15, M30', why:'ESTRELLA SHORT: caidas rapidas con momentum extremo', rating:'++' },
    volatilidad:   { dir:'L', tf:'H1, H4',       why:'Breakout alcista de Bollinger/Keltner', rating:'+' },
    volatilidad_S: { dir:'S', tf:'M15, M30',     why:'VIX sube en caidas = expansion masiva', rating:'++' },
    regimen:       { dir:'L', tf:'H4, D1',       why:'Regimen trending alcista', rating:'+' },
    regimen_S:     { dir:'S', tf:'H1, H4',       why:'Solo Short cuando regimen bearish confirmado', rating:'+' },
    volumen:       { dir:'L', tf:'M5, M15, M30', why:'Volumen real. Reclaim VWAP = Long', rating:'+' },
    volumen_S:     { dir:'S', tf:'M5, M15',      why:'Rechazo VWAP = Short intraday', rating:'+' },
    sr:            { dir:'L', tf:'H1, H4, D1',  why:'Rebote en soporte', rating:'+' },
    sr_S:          { dir:'S', tf:'H1, H4',       why:'Rechazo en resistencia', rating:'+' },
    estadistico:   { dir:'L', tf:'H1, H4',       why:'ZScore negativo extremo = Long', rating:'+' },
    estadistico_S: { dir:'S', tf:'M15, M30',     why:'ZScore positivo menos fiable Short', rating:'~' },
  }},
  { id:'GER40', type:'index', sub:'DAX', cats:{
    tendencia:     { dir:'L', tf:'H1, H4',       why:'Tendencia alcista europea', rating:'+' },
    tendencia_S:   { dir:'S', tf:'M30, H1',      why:'No recomendado Short tendencial', rating:'-' },
    momentum:      { dir:'L', tf:'M15, M30',     why:'Ciclos intraday marcados, European open', rating:'+' },
    momentum_S:    { dir:'S', tf:'M15, M30',     why:'Caidas intraday bruscas', rating:'+' },
    volatilidad_S: { dir:'S', tf:'M15, M30',     why:'Expansion vol en gap-downs y crisis europeas', rating:'+' },
    regimen:       { dir:'L', tf:'H4, D1',       why:'Regimen trending alcista', rating:'+' },
    regimen_S:     { dir:'S', tf:'H1, H4',       why:'Regimen bearish confirmado', rating:'+' },
    volumen:       { dir:'L', tf:'M5, M15, M30', why:'Volumen real', rating:'+' },
    sr:            { dir:'L', tf:'H1, H4, D1',  why:'Niveles psicologicos (18000, 20000)', rating:'+' },
    sr_S:          { dir:'S', tf:'H1, H4',       why:'Rechazo en resistencia', rating:'+' },
    estadistico:   { dir:'L', tf:'M30, H1',      why:'Reversion intraday sesion europea', rating:'+' },
  }},
  { id:'US30', type:'index', sub:'Dow Jones', cats:{
    tendencia:     { dir:'L', tf:'H1, H4, D1',  why:'Bias alcista estructural', rating:'++' },
    tendencia_S:   { dir:'S', tf:'M30, H1',      why:'No recomendado', rating:'-' },
    momentum:      { dir:'L', tf:'M30, H1',      why:'Momentum en rallies', rating:'+' },
    momentum_S:    { dir:'S', tf:'M15, M30',     why:'Momentum Short en caidas', rating:'+' },
    volumen:       { dir:'L', tf:'M5, M15, M30', why:'Volumen real', rating:'+' },
    volumen_S:     { dir:'S', tf:'M5, M15',      why:'Short intraday VWAP', rating:'+' },
    sr:            { dir:'L', tf:'H1, H4, D1',  why:'Niveles redondos + pivots', rating:'+' },
    sr_S:          { dir:'S', tf:'H1, H4',       why:'Rechazo en resistencia', rating:'+' },
  }},
  { id:'XAUUSD', type:'oro', sub:'Oro', cats:{
    tendencia:     { dir:'L',   tf:'H1, H4, D1', why:'Tendencias fuertes en risk-off/inflacion. Muy bueno Long', rating:'++' },
    tendencia_S:   { dir:'S',   tf:'H1, H4',     why:'Solo en fases USD fuerte. Tendencias Short cortas y erraticas', rating:'~' },
    momentum:      { dir:'L',   tf:'M30, H1',    why:'Impulsos Long en datos macro (CPI, NFP, FOMC)', rating:'+' },
    momentum_S:    { dir:'S',   tf:'M15, M30',   why:'Caidas por USD fuerte son rapidas. Momentum Short en TF cortos', rating:'++' },
    volatilidad:   { dir:'L',   tf:'H1, H4',     why:'Expansion vol en crisis = Oro sube rompiendo bandas superiores', rating:'+' },
    volatilidad_S: { dir:'S',   tf:'M30, H1',    why:'Expansion vol en USD fuerte, bandas inferiores se rompen rapido', rating:'+' },
    regimen:       { dir:'L',   tf:'H4, D1',     why:'Fases acumulacion a expansion muy marcadas', rating:'+' },
    regimen_S:     { dir:'S',   tf:'H4',         why:'Detectar regimen bearish (USD rally) antes de operar Short', rating:'+' },
    volumen:       { dir:'L/S', tf:'M15, M30',   why:'VWAP como pivot intraday, ambas direcciones', rating:'+' },
    sr:            { dir:'L',   tf:'H1, H4, D1', why:'Niveles redondos (2000, 2500, 3000) + Fibo historicos', rating:'++' },
    sr_S:          { dir:'S',   tf:'H1, H4',     why:'Rechazo en resistencia / Highest. Short en techo de rango', rating:'+' },
    estadistico:   { dir:'L/S', tf:'H1, H4',     why:'ZScore sobre ATR detecta movimientos anomalos', rating:'+' },
  }},
];

const FILTROS = [
  { id:'ADX',        name:'ADX',                desc:'Fuerza de tendencia (Average Directional Index)',
    long:'> 25 (confirmar tendencia real)', short:'> 30 en indices (necesita tendencia bajista fuerte)' },
  { id:'ATR',        name:'ATR',                desc:'Rango verdadero promedio — filtrar volatilidad',
    long:'ATR min (evitar mercados planos)', short:'ATR min MAS ALTO que Long (necesita volatilidad para Short rentable)' },
  { id:'Choppiness', name:'Choppiness Index',   desc:'Trending vs Ranging (bajo = trending)',
    long:'< 45 (trending)', short:'< 38 en indices (Short solo en tendencia bajista clara)' },
  { id:'Hurst',      name:'Hurst Exponent',     desc:'Persistencia del movimiento (>0.5 = trending)',
    long:'> 0.5 (persistencia)', short:'> 0.55 en indices (mayor umbral para confirmar persistencia bajista)' },
  { id:'KER',        name:'Kaufman Eff. Ratio', desc:'Eficiencia del movimiento (0-1)',
    long:'> 0.3 (eficiencia)', short:'> 0.4 en indices (movimiento bajista debe ser mas eficiente)' },
  { id:'AvgVolume',  name:'Average Volume',     desc:'Filtro de liquidez',
    long:'> media (liquidez)', short:'> 1.2x media en indices (volumen alto confirma sell-off real)' },
];

const RATING_ORDER = { '++':3, '+':2, '~':1, '-':0 };
const CAT_KEYS = Object.keys(CAT_META);

const SQX_CONFIG_DESC = {
  A: { label:'Both + Entry Sym',  desc:'<strong>Forex simétrico</strong>Reglas L/S espejadas en la entrada. SQX optimiza un lado y replica al otro.' },
  B: { label:'Both sin Symmetry', desc:'<strong>Long ≠ Short</strong>Índices y oro — SQX optimiza Long y Short por separado (reglas distintas).' },
  C: { label:'Only Long',         desc:'<strong>Ideas Long puras</strong>Filtra activos con ≥1 categoría sólo-Long (índices/oro). Para correr SQX en modo Only Long.' },
  D: { label:'Only Short',        desc:'<strong>Ideas Short puras</strong>Filtra activos con ≥1 categoría sólo-Short (índices/oro). Para correr SQX en modo Only Short.' },
};

// ============================================================
// HISTORICAL CHART — datos reales mensuales descargados de Darwinex MT5
// ============================================================
const MACRO_EVENTS = [
  { date: '2008-09', label: 'Lehman / Crisis',     color: '#ef4444' },
  { date: '2012-07', label: 'Draghi QE',           color: '#f97316' },
  { date: '2016-06', label: 'Brexit',              color: '#06b6d4' },
  { date: '2020-03', label: 'COVID',               color: '#a855f7' },
  { date: '2022-02', label: 'Ucrania / Inflación', color: '#eab308' },
  { date: '2025-01', label: 'Trump II',            color: '#3b82f6' },
];

const APPROACH_HINTS = {
  tendencia:   'Trend follow · EMA cross · MACD · SuperTrend',
  momentum:    'RSI / Stoch reversal · ROC reversal',
  volatilidad: 'Bollinger / Donchian breakout · Keltner',
  regimen:     'ADX / Hurst / SMA200 filter',
  volumen:     'VWAP rejection · AvgVolume filter',
  sr:          'Pivot / Fibo / Round number bounce',
  estadistico: 'ZScore / OU mean-reversion · PercentRank',
};

const CAT_TO_BS = {
  tendencia:   'BS_Tendencia_v4',
  momentum:    'BS_Momentum_v4',
  volatilidad: 'BS_Volatilidad_v4',
  regimen:     'BS_Regimen_v4',
  volumen:     'BS_Volumen_v4',
  sr:          'BS_SoporteResistencia_v4',
  estadistico: 'BS_Estadistico_v4',
};

const STRATEGIES = [
  {
    id: "0.621529",
    name: "ATR + LinearRegression",
    mining: 1,
    asset: "XAUUSD",
    tf: "H1",
    blocksetting: "BS_Tendencia",
    template: "LINEAR",
    direction: "L",
    indicators: "ATR + LinearRegression",
    exits: "ATR-based PT/SL/TS",
    metrics: { net_profit: 9412, wfm_profit: 6304, pf: 1.94, sharpe: 1.42, ret_dd: 12.32, dd_pct: 0.76, trades: 315, win_pct: 49.84, r_exp: 0.47 },
    tier: "1",
    status: "PASSED",
    tests_passed: ["OOS","Forward","HBP","MC","MC2","Sequential","Synthetic","SPP","WFM"],
    tests_failed: [],
    notes: "Pasa TODOS los tests sin excepciones. Candidata #1 absoluta del template LINEAR.",
    added: "2026-05-01"
  },
  {
    id: "0.920817",
    name: "KER + LinearRegression",
    mining: 1,
    asset: "XAUUSD",
    tf: "H1",
    blocksetting: "BS_Tendencia",
    template: "LINEAR",
    direction: "L",
    indicators: "KaufmanEfficiencyRatio + LinearRegression",
    exits: "ATR-based PT/SL/TS",
    metrics: { net_profit: 8303, wfm_profit: 6458, pf: 2.13, sharpe: 1.33, ret_dd: 15.56, dd_pct: 0.50, trades: 225, win_pct: 53.54, r_exp: 0.42 },
    tier: "1.5",
    status: "PASSED_ASTERISK",
    tests_passed: ["OOS","Forward","HBP","MC","MC2","Sequential","SPP","WFM"],
    tests_failed: ["Synthetic (4.2%)"],
    notes: "Excepcional — PF y Ret/DD mejores del grupo. Falló Synthetic por 4.2% (margen estrecho), por eso TIER 1.5.",
    added: "2026-05-01"
  },
  {
    id: "0.553059",
    name: "LinearRegression solo",
    mining: 1,
    asset: "XAUUSD",
    tf: "H1",
    blocksetting: "BS_Tendencia",
    template: "LINEAR",
    direction: "L",
    indicators: "LinearRegression (sin filtro adicional)",
    exits: "ATR-based PT/SL/TS",
    metrics: { net_profit: 11841, wfm_profit: 7894, pf: 1.86, sharpe: 1.06, ret_dd: 8.56, dd_pct: 1.34, trades: 228, win_pct: 42.98, r_exp: 0.30 },
    tier: "2",
    status: "PASSED",
    tests_passed: ["OOS","Forward","HBP","MC","MC2","Sequential","Synthetic","SPP","WFM"],
    tests_failed: [],
    notes: "Edge LinReg puro sin filtro adicional. NetProfit más alto del grupo pero números más optimistas vs mediana.",
    added: "2026-05-01"
  },
  {
    id: "0.1497964",
    name: "MACD + ADX dual",
    mining: 1,
    asset: "XAUUSD",
    tf: "H1",
    blocksetting: "BS_Tendencia",
    template: "MACD",
    direction: "L",
    indicators: "MACD(8,17,9) Signal[1] crosses above 2.7 + ADX(40,+DI)[1] >= ADX(30,Main)[1]",
    exits: "PT 10*ATR / SL 45*ATR / TS 60*ATR",
    metrics: { net_profit: 14822.64, pf: 1.62, sharpe: 1.12, ret_dd: 9.11, dd_pct: 1.58, dd: 1626.58, trades: 273, win_pct: 44.69, r_exp: 0.34, r_exp_score: 10.99, sqn: 0.58, cagr: 1.74, stagnation_days: 451, stagnation_pct: 14.58, z_probability: 1.16, exposure: 9.69 },
    tier: "tentativa",
    status: "CANDIDATA",
    tests_passed: [],
    tests_failed: [],
    notes: "Candidata tentativa template MACD. Pendiente WFM, MC, correlación con LINEAR ganadoras. Threshold MACD '2.7' y ADX dual (40/30) huelen a overfitting — verificar en Sequential. Stagnation 451d alta.",
    added: "2026-05-02"
  }
];

// Plan v2 (2026-05) — reconstruido data-driven con métricas multi-TF (M5/M15/M30/H1/H4)
// Reglas: composite ≥87%, max 1 mining por (asset, cat), max 2 por activo, mix categorías,
// excluye short tendencial índices/oro (bias alcista) y USDJPY (data parcial Dukas post-2018).
// sqx_config: A=Forex L/S simétrico · B=Índice/oro L+S · C=Índice/oro Long puro · D=Short puro
const PLAN_MININGS = [
  // ── FASE 1 — TOP DATA-DRIVEN (composite ≥95%, edge estructural confirmado) ──
  { num:1,  phase:1, asset:'AUDCAD', asset_type:'forex', tf:'M30', bs:'BS_Momentum',          dir:'L/S', sqx_config:'A', composite:100 },
  { num:2,  phase:1, asset:'USTEC',  asset_type:'index', tf:'H1',  bs:'BS_Tendencia',         dir:'L',   sqx_config:'C', composite:100 },
  { num:3,  phase:1, asset:'USTEC',  asset_type:'index', tf:'H4',  bs:'BS_Regimen',           dir:'L',   sqx_config:'C', composite:99  },
  { num:4,  phase:1, asset:'US500',  asset_type:'index', tf:'M30', bs:'BS_Volumen',           dir:'L',   sqx_config:'C', composite:97  },
  { num:5,  phase:1, asset:'US30',   asset_type:'index', tf:'M5',  bs:'BS_Volumen',           dir:'L',   sqx_config:'C', composite:95  },
  { num:6,  phase:1, asset:'XAUUSD', asset_type:'oro',   tf:'H1',  bs:'BS_Volatilidad',       dir:'L',   sqx_config:'C', composite:95  },

  // ── FASE 2 — DIVERSIFICACIÓN MAJOR + cross-categoría (composite 90-94%) ──
  { num:7,  phase:2, asset:'USDCHF', asset_type:'forex', tf:'H4',  bs:'BS_SoporteResistencia',dir:'L/S', sqx_config:'A', composite:94  },
  { num:8,  phase:2, asset:'US500',  asset_type:'index', tf:'H4',  bs:'BS_Regimen',           dir:'L',   sqx_config:'C', composite:94  },
  { num:9,  phase:2, asset:'XAUUSD', asset_type:'oro',   tf:'H1',  bs:'BS_SoporteResistencia',dir:'L',   sqx_config:'C', composite:94  },
  { num:10, phase:2, asset:'US30',   asset_type:'index', tf:'H1',  bs:'BS_Tendencia',         dir:'L',   sqx_config:'C', composite:92  },
  { num:11, phase:2, asset:'EURUSD', asset_type:'forex', tf:'H1',  bs:'BS_Tendencia',         dir:'L/S', sqx_config:'A', composite:90  },

  // ── FASE 3 — CRUCES + INTRADAY corto (composite 87-91%, requiere BS_intraday) ──
  { num:12, phase:3, asset:'EURCHF', asset_type:'forex', tf:'H4',  bs:'BS_Momentum',          dir:'L/S', sqx_config:'A', composite:91  },
  { num:13, phase:3, asset:'EURGBP', asset_type:'forex', tf:'H4',  bs:'BS_SoporteResistencia',dir:'L/S', sqx_config:'A', composite:89  },
  { num:14, phase:3, asset:'GER40',  asset_type:'index', tf:'M15', bs:'BS_Volatilidad',       dir:'S',   sqx_config:'D', composite:88  },
];

const PHASE_META = {
  1: { name:'TOP data-driven',        desc:'Composite ≥95% — edge estructural máximo' },
  2: { name:'Diversificación Major',  desc:'Composite 90-94% — Forex Major + más índices' },
  3: { name:'Cruces + Intraday',      desc:'Composite 87-91% — mean-revert + short vol intradía' },
};

const FUNNEL_STAGES_DEFAULT = [
  { id:'mining',     name:'Mining inicial',          terminal:false },
  { id:'retest0',    name:'Retest 0 (período completo)', terminal:false },
  { id:'retest_oos', name:'Retest 1 (OOS 2010-2017)',terminal:false },
  { id:'retest_fwd', name:'Retest 2 (Forward 2024-26)', terminal:false },
  { id:'hbp',        name:'HBP',                     terminal:false },
  { id:'mc',         name:'MC Trades',               terminal:false },
  { id:'mc2',        name:'MC2 Historical',          terminal:false },
  { id:'sequential', name:'Sequential',              terminal:false },
  { id:'synthetic',  name:'Synthetic',               terminal:false },
  { id:'spp',        name:'SPP',                     terminal:false },
  { id:'wfm',        name:'WFM ⭐ Final',            terminal:true  },
];

// Datos pre-cargados Mining 1 LINEAR (del CLAUDE.md canónico)
const FUNNEL_PRELOAD = {
  '1|LINEAR': { mining:1000, retest0:388, retest_oos:21, retest_fwd:null, hbp:17, mc:17, mc2:8, sequential:6, synthetic:4, spp:4, wfm:3 }
};

const BS_TO_PRIORITY_CAT = {
  'BS_Tendencia':         'tendencia',
  'BS_Momentum':          'momentum',
  'BS_Volatilidad':       'volatilidad',
  'BS_Regimen':           'regimen',
  'BS_Volumen':           'volumen',
  'BS_SoporteResistencia':'sr',
  'BS_Estadistico':       'estadistico',
};
// Mapping directo cat → BS (para promover orphans del Priority al plan)
const PRIORITY_CAT_TO_BS = {
  tendencia:   'BS_Tendencia',
  momentum:    'BS_Momentum',
  volatilidad: 'BS_Volatilidad',
  regimen:     'BS_Regimen',
  volumen:     'BS_Volumen',
  sr:          'BS_SoporteResistencia',
  estadistico: 'BS_Estadistico',
};
