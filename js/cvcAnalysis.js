// =============================================================================
// CHAMPION vs CHALLENGER — análisis automático de finalistas Capa 2 vs Champion
// Sin hardcoded: todo se calcula a partir de los CSV subidos por el usuario
// =============================================================================

// ---------- CSV column mapping (flexible: acepta variaciones del export SQX) ----------
const CVC_COLS = {
  name:    ['Strategy Name', 'Name', 'Strategy'],
  np:      ['Net profit', 'NetProfit', 'NP'],
  np_pct:  ['Net profit in %', 'NetProfitPct'],
  pf:      ['Profit factor', 'ProfitFactor', 'PF'],
  sharpe:  ['Sharpe Ratio', 'SharpeRatio', 'Sharpe'],
  ret_dd:  ['Ret/DD Ratio', 'RetDDRatio', 'Return/DD Ratio'],
  dd_abs:  ['Drawdown', 'MaxDrawdown'],
  dd_pct:  ['Max DD %', 'MaxDDPct', 'Drawdown %', 'Max Drawdown %'],
  trades:  ['# of trades', 'NumTrades', 'Trades', 'Number of trades'],
  trades_long:  ['# of trades Long', '# of Trades Long', 'NumberOfTrades Long', '# trades Long', 'Trades Long'],
  trades_short: ['# of trades Short', '# of Trades Short', 'NumberOfTrades Short', '# trades Short', 'Trades Short'],
  np_long:      ['Net profit Long', 'NetProfit Long', 'NP Long'],
  np_short:     ['Net profit Short', 'NetProfit Short', 'NP Short'],
  win_pct: ['Winning Percent', 'Winning Percentage', 'WinPct'],
  r_exp:   ['R Expectancy', 'RExpectancy'],
  stag:    ['Stagnation', 'StagnationDays', 'Stagnation in Days'],
  stag_pct:['Stagnation %', 'StagnationPct'],
  tf:      ['TimeFrame', 'Timeframe', 'TF'],
  symbol:  ['Symbol'],
  filters: ['Filters result', 'FiltersResult'],
  indicators: ['Entry indicators', 'EntryIndicators', 'Indicators'],
  fitness: ['Fitness'],
  avg_trade: ['Average Trade', 'AvgTrade'],
  exposure: ['Exposure Position', 'Exposure'],
  payout: ['Payout ratio', 'Payout Ratio', 'PayoutRatio'],
};

// ---------- Familias de indicadores (detección por substring, ampliable) ----------
const CVC_INDICATOR_FAMILIES = [
  { id: 'KER',       label: 'KER (Kaufman Efficiency)', match: ['KaufmanEfficiency', 'KER'] },
  { id: 'ADX',       label: 'ADX',                      match: ['ADX'] },
  { id: 'AvgVolume', label: 'AvgVolume',                match: ['AvgVolume', 'AverageVolume'] },
  { id: 'ATR',       label: 'ATR',                      match: ['ATR'] },
  { id: 'RSI',       label: 'RSI',                      match: ['RSI'] },
  { id: 'MA',        label: 'Moving Avg',               match: ['MA(', 'EMA', 'SMA', 'WMA'] },
  { id: 'MACD',      label: 'MACD',                     match: ['MACD'] },
  { id: 'Bollinger', label: 'Bollinger',                match: ['Bollinger', 'BBands'] },
  { id: 'Ichimoku',  label: 'Ichimoku',                 match: ['Ichimoku', 'TenkanSen', 'KijunSen'] },
  { id: 'Stoch',     label: 'Stochastic',               match: ['Stoch'] },
  { id: 'CCI',       label: 'CCI',                      match: ['CCI'] },
  { id: 'Volume',    label: 'Volume (raw)',             match: ['Volume'], excludeIfMatched: ['AvgVolume'] },
];

// ---------- Mapeo Symbol del CSV → ticker del catálogo (regex + diccionario, no hardcoded por activo) ----------
// Reglas en orden: las más específicas primero, regex genéricas al final.
const CVC_SYMBOL_MAP = [
  // Mapeos específicos (alias broker-side de índices)
  { test: /^(NDXm|NDX|NAS100|USTEC).*/i,    target: 'USTEC' },
  { test: /^(SPX500|SPX|SP500|US500).*/i,    target: 'US500' },
  { test: /^(DJ30|DJI|US30|US30Cash).*/i,    target: 'US30' },
  { test: /^(GER40|DAX|GER30|DE40).*/i,      target: 'GER40' },
  { test: /^(XAUUSD|GOLD).*/i,               target: 'XAUUSD' },
  // Forex con sufijo _darwinex / _xxx → toma los primeros 6 chars
  { test: /^([A-Z]{6})(_.*)?$/i, target: (s) => s.match(/^([A-Z]{6})/i)[1].toUpperCase() },
];

function cvcResolveAsset(symbolStr, catalogKeys) {
  const s = (symbolStr || '').trim();
  if (!s) return null;
  if (catalogKeys.indexOf(s.toUpperCase()) !== -1) return s.toUpperCase();
  for (const rule of CVC_SYMBOL_MAP) {
    if (rule.test.test(s)) {
      const t = typeof rule.target === 'function' ? rule.target(s) : rule.target;
      if (catalogKeys.indexOf(t) !== -1) return t;
    }
  }
  return null;
}

// ---------- Clasificador de régimen ----------
// Devuelve la etiqueta de régimen dado %change y volatilidad anualizada
const CVC_REGIME_DEFAULTS = {
  bullStrong:  15,   // %change >= 15 → BULL FUERTE
  bullSoft:     5,   // 5..15 → BULL SUAVE
  bearSoft:    -5,   // -5..-15 → BEAR SUAVE
  bearStrong: -15,   // <= -15 → BEAR FUERTE
  // -5..5 → RANGE
};

function cvcClassifyRegime(pctChange) {
  const t = CVC_REGIME_DEFAULTS;
  if (pctChange >= t.bullStrong) return 'BULL FUERTE';
  if (pctChange >= t.bullSoft)   return 'BULL SUAVE';
  if (pctChange >  t.bearSoft)   return 'RANGE';
  if (pctChange >  t.bearStrong) return 'BEAR SUAVE';
  return 'BEAR FUERTE';
}

// Agrupador 3-niveles: BULL / RANGE / BEAR (para análisis EGT)
function cvcRegimeGroup(label) {
  if (!label) return null;
  if (label.startsWith('BULL')) return 'BULL';
  if (label.startsWith('BEAR')) return 'BEAR';
  return 'RANGE';
}

// ---------- Estado del módulo ----------
const CVC_STATE = {
  champion: null,         // objeto métricas champion
  challengers: [],        // array de objetos challenger
  rawHeaders: [],         // headers del CSV de challengers
  oosByStrategy: {},      // { 'Strategy 0.x': { blocks, positive, total, minCagr, ... } } por nombre
  oosLoaded: false,
  // Régime Analysis
  regimeAsset: null,      // ticker del catálogo (USTEC, EURUSD, etc.) auto-detectado
  regimeStartDate: '',    // 'YYYY-MM-DD'
  regimeEndDate: '',      // 'YYYY-MM-DD'
  regimeBlocks: [],       // [{idx, regime, pctChange, vol, group}, ...]
  regimeReady: false,
  // EGT (Miguel Jiménez)
  // EGT v2: umbrales por régimen y dirección
  // - direction='long_only' para índices/oro long, 'long_short' para forex L+S
  // - umbrales por régimen (BULL, BEAR, RANGE) tipo MIN_PASS y MIN_STRONG
  // - minBlocksPerRegime: si un régimen tiene menos bloques, se marca INSUFFICIENT (no descarta)
  // - Compatibilidad: strong/weak conservados para no romper LS antiguo
  egtThresholds: {
    strong: 3.0, weak: 0.0,                 // legacy
    direction: 'long_only',
    minBlocksPerRegime: 2,
    long_only: {
      BULL:  { pass: 1.5, strong: 2.5 },
      BEAR:  { pass: 0.0, strong: 1.0 },
      RANGE: { pass: 0.0, strong: 1.0 },
    },
    long_short: {
      BULL:  { pass: 1.0, strong: 2.0 },
      BEAR:  { pass: 1.0, strong: 2.0 },
      RANGE: { pass: 0.5, strong: 1.5 },
    },
  },
  egtMinTradesPerBlock: 0,                    // bloques con < N trades se ignoran del cálculo
  multipliers: { pf: 1.05, ret_dd: 0.95, dd_pct: 1.20, trades: 0.70 },
  filters: { minScore: 0, family: 'all', search: '', oosStableOnly: false, egtCompliantOnly: false, noNegWorstYear: false, healthOK: false },
  sortKey: 'score',
  sortDir: 'desc',
  forwardAssumePassed: true, // asumir que "PASSED" en CSV implica forward positivo
  useDDPctCriterion: false,  // % son métricas relativas problemáticas — desactivado por defecto
};

// ---------- localStorage para persistir ajustes Régime Analysis entre sesiones ----------
const CVC_LS_KEY = 'cvc_regime_settings_v1';
function cvcLoadLS() {
  try {
    const s = JSON.parse(localStorage.getItem(CVC_LS_KEY) || '{}');
    if (s.regimeAsset) CVC_STATE.regimeAsset = s.regimeAsset;
    if (s.regimeStartDate) CVC_STATE.regimeStartDate = s.regimeStartDate;
    if (s.regimeEndDate) CVC_STATE.regimeEndDate = s.regimeEndDate;
    if (s.egtThresholds) CVC_STATE.egtThresholds = Object.assign(CVC_STATE.egtThresholds, s.egtThresholds);
  } catch(e) {}
}
function cvcSaveLS() {
  try {
    localStorage.setItem(CVC_LS_KEY, JSON.stringify({
      regimeAsset: CVC_STATE.regimeAsset,
      regimeStartDate: CVC_STATE.regimeStartDate,
      regimeEndDate: CVC_STATE.regimeEndDate,
      egtThresholds: CVC_STATE.egtThresholds,
    }));
  } catch(e) {}
}

// ===================================================================
// CSV PARSER — robusto: soporta ; o , como separador, comillas, escape
// ===================================================================
function cvcParseCSV(text) {
  // Detectar separador (basado en primera línea)
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const sepCounts = { ';': (firstLine.match(/;/g) || []).length, ',': (firstLine.match(/,/g) || []).length };
  const sep = sepCounts[';'] >= sepCounts[','] ? ';' : ',';

  const rows = [];
  let row = [], cur = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i+1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === sep) { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (ch === '\r') { /* ignore */ }
      else cur += ch;
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].trim()));
}

// Resolver índice de una columna lógica dado el header del CSV.
// Soporta sufijos comunes (IS) / (OOS) — prioridad: exact > IS > OOS.
function cvcFindCol(headers, logicalKey) {
  const candidates = CVC_COLS[logicalKey] || [];
  const lcHeaders = headers.map(h => (h || '').trim().toLowerCase());
  // 1. Exact match
  for (const c of candidates) {
    const idx = lcHeaders.indexOf(c.toLowerCase());
    if (idx !== -1) return idx;
  }
  // 2. Con sufijo " (IS)"
  for (const c of candidates) {
    const idx = lcHeaders.indexOf((c + ' (IS)').toLowerCase());
    if (idx !== -1) return idx;
  }
  // 3. Con sufijo " (OOS)"
  for (const c of candidates) {
    const idx = lcHeaders.indexOf((c + ' (OOS)').toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

function cvcParseNum(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(/%/g, '').replace(',', '.');
  if (s === '' || s.toLowerCase() === 'n/a') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// ===================================================================
// DETECCIÓN DE DIRECCIÓN (long-only / short-only / long+short)
// ===================================================================
// Jerarquía de fuentes (de más fiable a menos):
//   1. trades_long / trades_short del CSV (DETERMINISTA)
//   2. np_long / np_short del CSV (CASI DETERMINISTA, fallback si falta trades split)
//   3. Regex sobre el nombre del Champion ('LONG', 'SHORT', 'LS', etc) (heurística)
//   4. Por símbolo del activo (long_only para índices/oro, long_short para forex)
//   5. Default: long_only
function cvcDetectDirection(strategy) {
  if (!strategy) return { dir: 'long_only', source: 'default', confidence: 'low' };

  // 1. Por trades split (DETERMINISTA)
  const tL = strategy.trades_long, tS = strategy.trades_short;
  if (tL != null && tS != null) {
    if (tL > 0 && tS === 0) return { dir: 'long_only',  source: 'trades_split', confidence: 'high', tradesL: tL, tradesS: tS };
    if (tL === 0 && tS > 0) return { dir: 'short_only', source: 'trades_split', confidence: 'high', tradesL: tL, tradesS: tS };
    if (tL > 0 && tS > 0) {
      // Detectar L+S desequilibrado (una dirección <30% de los trades)
      const total = tL + tS;
      const lsRatio = tL / total;
      let imbalance = null;
      if (lsRatio > 0.7) imbalance = 'long_dominated';
      else if (lsRatio < 0.3) imbalance = 'short_dominated';
      return { dir: 'long_short', source: 'trades_split', confidence: 'high', tradesL: tL, tradesS: tS, lsRatio, imbalance };
    }
    if (tL === 0 && tS === 0) return { dir: 'unknown', source: 'trades_split', confidence: 'low' };
  }

  // 2. Por NP split (casi determinista pero un trade en BE puede confundir)
  const npL = strategy.np_long, npS = strategy.np_short;
  if (npL != null && npS != null) {
    if (npL !== 0 && npS === 0) return { dir: 'long_only',  source: 'np_split', confidence: 'medium' };
    if (npL === 0 && npS !== 0) return { dir: 'short_only', source: 'np_split', confidence: 'medium' };
    if (npL !== 0 && npS !== 0) return { dir: 'long_short', source: 'np_split', confidence: 'medium' };
  }

  // 3. Por nombre (regex). Sin word boundary porque los templates SQX
  // típicos pegan letras: "NASDAQLONGH4", "EURUSDLS_Tendencia". Excluyo
  // falsos positivos comunes: LONGEST, SHORTER/EST/AGE.
  const name = (strategy.name || '').toUpperCase();
  const hasLS = /L\+S|L\/S|\bLS[\s_]|[\s_]LS\b|\bBOTH\b/.test(name);
  const hasLong = /LONG(?!EST)/.test(name);
  const hasShort = /SHORT(?!ER|EST|AGE)/.test(name);
  if (hasLS || (hasLong && hasShort)) return { dir: 'long_short', source: 'name', confidence: 'medium' };
  if (hasLong)  return { dir: 'long_only',  source: 'name', confidence: 'medium' };
  if (hasShort) return { dir: 'short_only', source: 'name', confidence: 'medium' };

  // 4. Por símbolo (heurística)
  const sym = (strategy.symbol || '').toUpperCase();
  if (/NDX|NAS100|USTEC|SPX|SP500|US500|US30|DJ30|GER40|DAX|XAUUSD|GOLD|XAG/.test(sym)) {
    return { dir: 'long_only', source: 'symbol', confidence: 'low' };
  }
  if (/EUR|GBP|AUD|NZD|JPY|CHF|CAD|USD/.test(sym)) {
    return { dir: 'long_short', source: 'symbol', confidence: 'low' };
  }

  // 5. Default
  return { dir: 'long_only', source: 'default', confidence: 'low' };
}

// Convierte una fila CSV en objeto strategy
function cvcRowToStrategy(headers, row) {
  const get = (key) => {
    const idx = cvcFindCol(headers, key);
    return idx === -1 ? null : row[idx];
  };
  const obj = {
    name:       get('name') || '',
    tf:         get('tf') || '',
    symbol:     get('symbol') || '',
    np:         cvcParseNum(get('np')),
    np_pct:     cvcParseNum(get('np_pct')),
    pf:         cvcParseNum(get('pf')),
    sharpe:     cvcParseNum(get('sharpe')),
    ret_dd:     cvcParseNum(get('ret_dd')),
    dd_abs:     cvcParseNum(get('dd_abs')),
    dd_pct:     cvcParseNum(get('dd_pct')),
    trades:     cvcParseNum(get('trades')),
    trades_long:  cvcParseNum(get('trades_long')),
    trades_short: cvcParseNum(get('trades_short')),
    np_long:      cvcParseNum(get('np_long')),
    np_short:     cvcParseNum(get('np_short')),
    win_pct:    cvcParseNum(get('win_pct')),
    r_exp:      cvcParseNum(get('r_exp')),
    stag:       cvcParseNum(get('stag')),
    stag_pct:   cvcParseNum(get('stag_pct')),
    fitness:    cvcParseNum(get('fitness')),
    avg_trade:  cvcParseNum(get('avg_trade')),
    exposure:   cvcParseNum(get('exposure')),
    payout:     cvcParseNum(get('payout')),
    indicators: get('indicators') || '',
    filters_result: get('filters') || '',
  };
  // Avg trade derivado si falta
  if (obj.avg_trade == null && obj.np != null && obj.trades) {
    obj.avg_trade = obj.np / obj.trades;
  }
  return obj;
}

// ===================================================================
// CARGA CHAMPION (CSV con 1 fila o manual)
// ===================================================================
async function cvcLoadChampionCSV(file) {
  const text = await file.text();
  const rows = cvcParseCSV(text);
  if (rows.length < 2) { cvcShowError('champion', 'CSV vacío o sin filas de datos.'); return; }
  const headers = rows[0];
  // Tomar la primera fila NO vacía después del header
  const dataRow = rows.slice(1).find(r => r.some(c => c && c.trim()));
  if (!dataRow) { cvcShowError('champion', 'No se encontró ninguna fila de datos.'); return; }
  CVC_STATE.champion = cvcRowToStrategy(headers, dataRow);
  // Detectar dirección automáticamente (si no hay override manual reciente)
  const detected = cvcDetectDirection(CVC_STATE.champion);
  CVC_STATE.directionDetected = detected;
  // Aplicar al EGT thresholds si la confidence es alta o media (no override manual)
  if (!CVC_STATE.directionManualOverride && detected.dir !== 'unknown') {
    CVC_STATE.egtThresholds.direction = detected.dir === 'short_only' ? 'long_only' : detected.dir;
    // Nota: short_only no tiene umbrales propios todavía; usar long_only como base
    cvcSaveLS();
  }
  cvcRenderAll();
}

function cvcLoadChampionManual() {
  const get = (id) => cvcParseNum(document.getElementById(id).value);
  const ch = {
    name:    document.getElementById('cvc-man-name').value || '(Champion manual)',
    np:      get('cvc-man-np'),
    pf:      get('cvc-man-pf'),
    sharpe:  get('cvc-man-sharpe'),
    ret_dd:  get('cvc-man-retdd'),
    dd_pct:  get('cvc-man-ddpct'),
    trades:  get('cvc-man-trades'),
    r_exp:   get('cvc-man-rexp'),
    stag:    get('cvc-man-stag'),
    indicators: '',
    filters_result: 'PASSED',
  };
  if (ch.pf == null || ch.ret_dd == null || ch.dd_pct == null || ch.trades == null) {
    cvcShowError('champion', 'PF, Ret/DD, DD% y #trades son obligatorios.');
    return;
  }
  if (ch.np != null && ch.trades) ch.avg_trade = ch.np / ch.trades;
  CVC_STATE.champion = ch;
  cvcRenderAll();
}

// ===================================================================
// CARGA OOS-POR-BLOQUES (CSV opcional con métricas por ventana)
// ===================================================================
// Detecta dinámicamente columnas con sufijo "(OOSn)" y agrupa por strategy.
// Métrica preferida: CAGR/Max DD %. Si no existe, usa Net Profit por bloque.
async function cvcLoadOOSCSV(file) {
  const text = await file.text();
  const rows = cvcParseCSV(text);
  if (rows.length < 2) { cvcShowError('oos', 'CSV vacío.'); return; }
  const headers = rows[0];
  const nameIdx = cvcFindCol(headers, 'name');
  if (nameIdx === -1) { cvcShowError('oos', 'No encontré columna "Strategy Name" en el CSV.'); return; }

  // Detectar TODAS las columnas con sufijo "(OOSn)" agrupadas por métrica
  // Output: { 'CAGR/Max DD %': [{idx, block}, ...], 'Net profit': [...], ... }
  const metricGroups = {};
  headers.forEach((h, i) => {
    const m = (h || '').match(/^(.+?)\s*\(OOS\s*(\d+)\)\s*$/i);
    if (!m) return;
    const metric = m[1].trim();
    const block = parseInt(m[2], 10);
    (metricGroups[metric] = metricGroups[metric] || []).push({ idx: i, block });
  });
  Object.values(metricGroups).forEach(arr => arr.sort((a,b) => a.block - b.block));

  if (!Object.keys(metricGroups).length) {
    cvcShowError('oos', 'No encontré columnas con sufijo "(OOSn)" en el CSV.');
    return;
  }

  // Métrica primaria para análisis (estable, EGT, etc): preferir CAGR/Max DD
  const matchPrimary = (rx) => Object.keys(metricGroups).find(k => rx.test(k));
  const primaryKey = matchPrimary(/CAGR\s*\/\s*Max\s*DD/i)
                  || matchPrimary(/Net\s*profit/i)
                  || matchPrimary(/Profit\s*factor/i)
                  || Object.keys(metricGroups)[0];
  const primaryCols = metricGroups[primaryKey];

  // PF: positivo = > 1; resto: positivo = > 0
  const isPositive = (v, metric) => /Profit\s*factor/i.test(metric) ? v > 1 : v > 0;

  const result = {};
  rows.slice(1).filter(r => r.some(c => c && c.trim())).forEach(r => {
    const name = (r[nameIdx] || '').trim();
    if (!name) return;

    // Por cada métrica detectada → array de valores por bloque
    const allBlocks = {};
    Object.entries(metricGroups).forEach(([metric, cols]) => {
      allBlocks[metric] = cols.map(c => cvcParseNum(r[c.idx]));
    });

    // Calcular stats sobre la métrica primaria
    const blocks = allBlocks[primaryKey] || [];
    const valid = blocks.filter(v => v != null);
    if (!valid.length) return;

    const positive = valid.filter(v => isPositive(v, primaryKey)).length;
    const minVal = Math.min(...valid);
    const maxVal = Math.max(...valid);
    const avgVal = valid.reduce((s, v) => s + v, 0) / valid.length;

    // Deterioro temporal sobre primary
    const half = Math.floor(valid.length / 2);
    const firstHalf = valid.slice(0, half);
    const secondHalf = valid.slice(valid.length - half);
    const avgFirst = firstHalf.length ? firstHalf.reduce((a,b)=>a+b, 0) / firstHalf.length : null;
    const avgSecond = secondHalf.length ? secondHalf.reduce((a,b)=>a+b, 0) / secondHalf.length : null;
    let decay = null;
    if (avgFirst != null && avgSecond != null && avgFirst !== 0) decay = avgSecond / avgFirst;

    // Cluster máximo de bloques negativos consecutivos
    let maxNegStreak = 0, curStreak = 0;
    valid.forEach(v => {
      if (!isPositive(v, primaryKey)) { curStreak++; maxNegStreak = Math.max(maxNegStreak, curStreak); }
      else curStreak = 0;
    });

    // Worst Year Profit < 0 detectado en cualquier bloque
    const worstYearBlocks = allBlocks['Worst Year Profit'] || [];
    const hasNegWorstYear = worstYearBlocks.some(v => v != null && v < 0);
    const minWorstYear = worstYearBlocks.filter(v => v != null).length
      ? Math.min(...worstYearBlocks.filter(v => v != null))
      : null;

    result[name] = {
      blocks,                    // métrica primaria (compat con código existente)
      blocksAll: allBlocks,      // TODAS las métricas por bloque
      metric: primaryKey,
      availableMetrics: Object.keys(metricGroups),
      positive, total: valid.length,
      stable: positive === valid.length,
      minVal, maxVal, avgVal,
      avgFirst, avgSecond, decay,
      maxNegStreak,
      hasNegWorstYear, minWorstYear,
    };
  });

  CVC_STATE.oosByStrategy = result;
  CVC_STATE.oosLoaded = true;
  const nMetrics = Object.keys(metricGroups).length;
  const nBlocks = primaryCols.length;
  cvcShowOk('oos',
    '✓ ' + Object.keys(result).length + ' strategies · ' + nBlocks + ' bloques · ' +
    nMetrics + ' métrica' + (nMetrics > 1 ? 's' : '') + ' por bloque (' + Object.keys(metricGroups).join(', ') + ')'
  );
  cvcRenderAll();
}

function cvcGetOOS(name) {
  return CVC_STATE.oosByStrategy[name] || null;
}

// ===================================================================
// TEMPORAL HEALTH — análisis contextual de Stagnation/Peak/DD
// ===================================================================
// Reemplaza el filtro hard "Stagnation < 365d" por una lectura contextual:
//   1. peak_block: en qué bloque OOS está el equity máximo
//   2. dd_at_close: cuánto cae desde peak hasta cierre del backtest
//   3. recovery_index: avg(últimos 3) / avg(histórico)
// Permite detectar si el estancamiento es PASADO (ya recuperado) o RECIENTE.
function cvcComputeTemporalHealth(name) {
  const oos = cvcGetOOS(name);
  if (!oos || !oos.blocksAll) return null;
  // Buscar Net profit (preferido) o caer a CAGR/DD
  const npBlocks = oos.blocksAll['Net profit']
                || oos.blocksAll['Net Profit']
                || oos.blocksAll['NetProfit']
                || oos.blocks; // fallback métrica primaria
  if (!npBlocks || !npBlocks.length) return null;
  const valid = npBlocks.map(v => v == null ? 0 : v);
  const n = valid.length;
  if (n < 4) return null;

  // Equity acumulada
  const equity = [];
  let acc = 0;
  for (let i = 0; i < n; i++) { acc += valid[i]; equity.push(acc); }

  // Peak block (incluye 0 = pre-OOS1, así que ajustamos a equity[0..n-1])
  let peakIdx = 0;
  let peakVal = equity[0];
  for (let i = 1; i < n; i++) {
    if (equity[i] > peakVal) { peakVal = equity[i]; peakIdx = i; }
  }
  const closeVal = equity[n - 1];
  const ddAtClose = peakVal > 0 ? (peakVal - closeVal) / peakVal : 0;

  // Recovery index: avg(últimos 3) / avg(histórico)
  const last3 = valid.slice(Math.max(0, n - 3));
  const avgHist = valid.reduce((a, b) => a + b, 0) / n;
  const avgRecent = last3.reduce((a, b) => a + b, 0) / last3.length;
  const recoveryIndex = avgHist !== 0 ? avgRecent / avgHist : null;

  // Clasificación de status
  // - fresh:     peak en últimos 3 bloques (estrategia activa en régimen reciente)
  // - recovered: peak en 2ª mitad pero no en últimos 3 (tuvo bache pero recuperó)
  // - old_peak:  peak en 1ª mitad y NO superado después
  // - declining: dd_at_close > 0.15 (en bache profundo al cierre)
  let status;
  if (ddAtClose > 0.15) {
    status = 'declining';
  } else if (peakIdx >= n - 3) {
    status = 'fresh';
  } else if (peakIdx >= Math.floor(n / 2)) {
    status = 'recovered';
  } else {
    status = 'old_peak';
  }

  // Pasa los 3 sub-filtros contextuales
  const passPeak = peakIdx >= Math.floor(n / 2);     // peak en 2ª mitad
  const passDD = ddAtClose < 0.15;                    // <15% DD del peak
  const passRecovery = recoveryIndex == null || recoveryIndex >= 0.7;
  const passAll = passPeak && passDD && passRecovery;

  return {
    peakIdx,                  // 0-based
    peakBlock: peakIdx + 1,   // 1-based, OOS1..OOSn
    peakVal,
    closeVal,
    ddAtClose,
    avgHist,
    avgRecent,
    recoveryIndex,
    status,                   // 'fresh' | 'recovered' | 'old_peak' | 'declining'
    passPeak,
    passDD,
    passRecovery,
    passAll,
    nBlocks: n,
  };
}

// ===================================================================
// RÉGIME ANALYSIS — calcula régimen del activo por cada bloque OOS
// ===================================================================
// Lee historical-data inline del dashboard (datos mensuales de 32 activos).
function cvcGetHistoricalData() {
  try {
    const raw = document.getElementById('historical-data');
    return raw ? JSON.parse(raw.textContent) : {};
  } catch(e) { return {}; }
}

function cvcCatalogKeys() {
  return Object.keys(cvcGetHistoricalData());
}

// Convierte 'YYYY-MM' o 'YYYY-MM-DD' → índice mensual del array dado el start
function cvcMonthIndex(dateStr, startStr) {
  const m = (dateStr || '').match(/^(\d{4})-(\d{2})/);
  const ms = (startStr || '').match(/^(\d{4})-(\d{2})/);
  if (!m || !ms) return -1;
  return (parseInt(m[1], 10) - parseInt(ms[1], 10)) * 12 + (parseInt(m[2], 10) - parseInt(ms[2], 10));
}

// Calcula bloques de régimen dado un activo, periodo y N bloques.
// Devuelve [{idx, startDate, endDate, pctChange, vol, regime, group}, ...]
function cvcComputeRegimeBlocks() {
  CVC_STATE.regimeReady = false;
  CVC_STATE.regimeBlocks = [];

  const asset = CVC_STATE.regimeAsset;
  const startStr = CVC_STATE.regimeStartDate;
  const endStr = CVC_STATE.regimeEndDate;
  const oos = CVC_STATE.oosByStrategy;
  const sample = Object.values(oos)[0];
  const nBlocks = sample ? sample.total : 0;
  if (!asset || !startStr || !endStr || !nBlocks) return null;

  const data = cvcGetHistoricalData()[asset];
  if (!data || !data.start || !data.v) return null;

  const sIdx = cvcMonthIndex(startStr, data.start);
  const eIdx = cvcMonthIndex(endStr, data.start);
  if (sIdx < 0 || eIdx <= sIdx) return null;
  if (eIdx >= data.v.length) return { error: 'El periodo termina (' + endStr + ') más allá de los datos disponibles del activo (' + asset + ' tiene hasta mes #' + (data.v.length-1) + '). Recorta la fecha fin.' };

  const totalMonths = eIdx - sIdx;
  const blockMonths = totalMonths / nBlocks;

  const blocks = [];
  for (let i = 0; i < nBlocks; i++) {
    const s = sIdx + Math.round(i * blockMonths);
    const e = sIdx + Math.round((i + 1) * blockMonths);
    if (e >= data.v.length || data.v[s] == null || data.v[e] == null) {
      blocks.push({ idx: i+1, pctChange: null, vol: null, regime: null, group: null });
      continue;
    }
    const pct = ((data.v[e] / data.v[s]) - 1) * 100;
    // Volatilidad anualizada: std de retornos mensuales × √12
    const ret = [];
    for (let j = s + 1; j <= e; j++) {
      if (data.v[j-1] && data.v[j]) ret.push((data.v[j] / data.v[j-1]) - 1);
    }
    const mean = ret.reduce((a,b)=>a+b, 0) / (ret.length || 1);
    const variance = ret.reduce((a,b)=>a+(b-mean)**2, 0) / (ret.length || 1);
    const vol = Math.sqrt(variance) * Math.sqrt(12) * 100;
    const regime = cvcClassifyRegime(pct);
    const group = cvcRegimeGroup(regime);
    blocks.push({ idx: i+1, pctChange: pct, vol, regime, group });
  }
  CVC_STATE.regimeBlocks = blocks;
  CVC_STATE.regimeReady = true;
  return blocks;
}

// ===================================================================
// EGT (Miguel Jiménez) — análisis de régimen natural vs contrario
// ===================================================================
// Para cada strategy, calcula:
//  - avg CAGR/DD por grupo (BULL/BEAR/RANGE)
//  - régimen natural (mayor avg)
//  - régimen contrario (opuesto al natural)
//  - score EGT: avg_natural ≥ strong_threshold AND avg_opposite ≥ weak_threshold
function cvcComputeEGT(name) {
  const oos = cvcGetOOS(name);
  if (!oos || !CVC_STATE.regimeReady) return null;
  const blocks = CVC_STATE.regimeBlocks;
  if (blocks.length !== oos.blocks.length) return null;

  // Si tenemos # trades por bloque y el usuario configuró min, ignorar bloques con muestra insuficiente
  const minTrades = CVC_STATE.egtMinTradesPerBlock || 0;
  const tradesPerBlock = (oos.blocksAll && (oos.blocksAll['# of trades'] || oos.blocksAll['# of Trades'])) || null;
  const skippedDueToTrades = [];

  const groups = { BULL: [], BEAR: [], RANGE: [] };
  oos.blocks.forEach((val, i) => {
    const blk = blocks[i];
    if (val == null || !blk || !blk.group) return;
    if (minTrades > 0 && tradesPerBlock) {
      const t = tradesPerBlock[i];
      if (t == null || t < minTrades) { skippedDueToTrades.push(i + 1); return; }
    }
    groups[blk.group].push(val);
  });

  const avg = (arr) => arr.length ? arr.reduce((a,b)=>a+b, 0) / arr.length : null;
  const min = (arr) => arr.length ? Math.min(...arr) : null;
  const variance = (arr, mean) => {
    if (!arr.length) return null;
    return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
  };
  const stats = {
    BULL:  { count: groups.BULL.length,  avg: avg(groups.BULL),  min: min(groups.BULL) },
    BEAR:  { count: groups.BEAR.length,  avg: avg(groups.BEAR),  min: min(groups.BEAR) },
    RANGE: { count: groups.RANGE.length, avg: avg(groups.RANGE), min: min(groups.RANGE) },
  };

  // Régimen "asignado" (más representado, no "natural" por mejor avg)
  const candidates = ['BULL','BEAR','RANGE'].filter(k => stats[k].count > 0 && stats[k].avg != null);
  if (!candidates.length) return null;
  const dominantRegime = candidates.reduce((best, k) =>
    stats[k].count > stats[best].count ? k :
    (stats[k].count === stats[best].count && stats[k].avg > stats[best].avg ? k : best),
    candidates[0]
  );

  // Mantener "natural" (mayor avg) para compatibilidad legacy
  const natural = candidates.reduce((best, k) => stats[k].avg > stats[best].avg ? k : best, candidates[0]);

  // Régimen contrario legacy
  let oppositeAvg, oppositeMin, oppositeKey;
  if (natural === 'BULL') {
    oppositeKey = 'BEAR'; oppositeAvg = stats.BEAR.avg; oppositeMin = stats.BEAR.min;
  } else if (natural === 'BEAR') {
    oppositeKey = 'BULL'; oppositeAvg = stats.BULL.avg; oppositeMin = stats.BULL.min;
  } else {
    const trending = [...groups.BULL, ...groups.BEAR];
    oppositeKey = 'TRENDING';
    oppositeAvg = trending.length ? trending.reduce((a,b)=>a+b, 0) / trending.length : null;
    oppositeMin = trending.length ? Math.min(...trending) : null;
  }

  // EGT v2: evaluación por régimen con umbrales según dirección
  const t = CVC_STATE.egtThresholds;
  const direction = t.direction || 'long_only';
  const dirThresholds = t[direction] || t.long_only;
  const minBlocks = t.minBlocksPerRegime || 2;

  // Por cada régimen evaluar: pass (≥ threshold.pass) y strong (≥ threshold.strong)
  // Si count < minBlocks → INSUFFICIENT para ese régimen (no entra en veredicto pero se reporta)
  const passByRegime = {}, strongByRegime = {}, sufficientByRegime = {};
  ['BULL','BEAR','RANGE'].forEach(r => {
    const s = stats[r];
    const thr = dirThresholds[r];
    sufficientByRegime[r] = s.count >= minBlocks;
    if (!sufficientByRegime[r] || s.avg == null) {
      passByRegime[r] = null;     // no evaluable
      strongByRegime[r] = null;
    } else {
      passByRegime[r] = s.avg >= thr.pass;
      strongByRegime[r] = s.avg >= thr.strong;
    }
  });

  const insufficientRegimes = ['BULL','BEAR','RANGE'].filter(r => stats[r].count > 0 && !sufficientByRegime[r]);
  const evaluatedRegimes    = ['BULL','BEAR','RANGE'].filter(r => sufficientByRegime[r]);
  const failedRegimes       = evaluatedRegimes.filter(r => passByRegime[r] === false);
  const strongRegimes       = evaluatedRegimes.filter(r => strongByRegime[r] === true);

  // Veredicto v2:
  // - INSUFFICIENT: no hay regímenes evaluables (todo n<2)
  // - RISK:        algún régimen evaluado falla pass
  // - STRONG:      pasa todos los evaluados Y régimen dominante es strong
  // - DEFENSIVE:   pasa todos los evaluados pero NINGUNO llega a strong
  // - COMPLIANT:   pasa todos los evaluados y al menos uno (no dominante) es strong
  let verdict;
  if (!evaluatedRegimes.length) {
    verdict = 'INSUFFICIENT';
  } else if (failedRegimes.length > 0) {
    verdict = 'RISK';
  } else if (strongByRegime[dominantRegime]) {
    verdict = 'STRONG';
  } else if (strongRegimes.length > 0) {
    verdict = 'COMPLIANT';
  } else {
    verdict = 'DEFENSIVE';
  }

  // Tiebreakers para ordenar entre estrategias del mismo veredicto
  const dominantAvg = stats[dominantRegime].avg;
  const evalAvgs = evaluatedRegimes.map(r => stats[r].avg);
  const meanAcrossRegimes = evalAvgs.length ? evalAvgs.reduce((a,b)=>a+b, 0) / evalAvgs.length : null;
  const varianceAcrossRegimes = meanAcrossRegimes != null ? variance(evalAvgs, meanAcrossRegimes) : null;
  const worstRegimeAvg = evalAvgs.length ? Math.min(...evalAvgs) : null;

  // Compatibilidad legacy: mapear verdict → label antigua
  // STRONG / COMPLIANT → 'COMPLIANT' (para no romper filtros existentes)
  // DEFENSIVE → 'FLAT' (legacy compat)
  // RISK → 'RISK'
  // INSUFFICIENT → 'FLAT' (legacy compat)
  const legacyLabel = (verdict === 'STRONG' || verdict === 'COMPLIANT') ? 'COMPLIANT'
                    : (verdict === 'RISK') ? 'RISK'
                    : 'FLAT';

  // Compat legacy: naturalOk, oppositeOk
  const naturalOk  = stats[natural].avg != null && stats[natural].avg >= t.strong;
  const oppositeOk = oppositeAvg != null && oppositeAvg >= t.weak;

  return {
    stats,
    // Legacy fields (mantener)
    natural, naturalAvg: stats[natural].avg,
    oppositeKey, oppositeAvg, oppositeMin,
    naturalOk, oppositeOk,
    label: legacyLabel,
    skippedDueToTrades,
    // EGT v2 fields
    verdict,
    direction,
    dominantRegime, dominantAvg,
    passByRegime, strongByRegime, sufficientByRegime,
    insufficientRegimes, evaluatedRegimes, failedRegimes, strongRegimes,
    worstRegimeAvg, varianceAcrossRegimes,
    thresholds: dirThresholds,
  };
}

// ===================================================================
// CARGA CHALLENGERS (CSV multi-row)
// ===================================================================
async function cvcLoadChallengersCSV(file) {
  const text = await file.text();
  const rows = cvcParseCSV(text);
  if (rows.length < 2) { cvcShowError('challengers', 'CSV vacío o sin filas de datos.'); return; }
  const headers = rows[0];
  CVC_STATE.rawHeaders = headers;
  const challengers = rows.slice(1)
    .filter(r => r.some(c => c && c.trim()))
    .map(r => cvcRowToStrategy(headers, r))
    .filter(s => s.pf != null && s.trades != null); // descartar filas inservibles
  CVC_STATE.challengers = challengers;
  cvcRenderAll();
}

function cvcShowError(zone, msg) {
  const el = document.getElementById('cvc-' + zone + '-msg');
  if (el) { el.textContent = msg; el.style.color = 'var(--red)'; }
}
function cvcShowOk(zone, msg) {
  const el = document.getElementById('cvc-' + zone + '-msg');
  if (el) { el.textContent = msg; el.style.color = 'var(--green)'; }
}

// ===================================================================
// MOTOR DE ANÁLISIS
// ===================================================================
function cvcThresholds() {
  const c = CVC_STATE.champion;
  if (!c) return null;
  const m = CVC_STATE.multipliers;
  return {
    pf:      c.pf      != null ? c.pf      * m.pf      : null,
    ret_dd:  c.ret_dd  != null ? c.ret_dd  * m.ret_dd  : null,
    dd_pct:  c.dd_pct  != null ? c.dd_pct  * m.dd_pct  : null,
    trades:  c.trades  != null ? c.trades  * m.trades  : null,
  };
}

function cvcEvaluate(challenger) {
  const t = cvcThresholds();
  if (!t) return null;
  // Un check es "applicable" si el Champion tiene ese dato (threshold no null).
  // Los no aplicables se excluyen del score (no cuentan como fail ni como pass).
  const mk = (key, valOk, threshold, label, op) => {
    const value = challenger[key];
    const applicable = threshold != null;
    const pass = applicable && value != null && op(value, threshold);
    return { value, threshold, applicable, pass, label };
  };
  const checks = {
    pf:     mk('pf',     null, t.pf,     'PF ≥ '      + (t.pf     != null ? t.pf.toFixed(3)        : '–'), (a,b) => a >= b),
    ret_dd: mk('ret_dd', null, t.ret_dd, 'Ret/DD ≥ '  + (t.ret_dd != null ? t.ret_dd.toFixed(2)    : '–'), (a,b) => a >= b),
    dd_pct: mk('dd_pct', null, CVC_STATE.useDDPctCriterion ? t.dd_pct : null, 'DD% ≤ ' + (t.dd_pct != null ? t.dd_pct.toFixed(2)+'%': '–'), (a,b) => a <= b),
    trades: mk('trades', null, t.trades, '#trades ≥ ' + (t.trades != null ? Math.round(t.trades)   : '–'), (a,b) => a >= b),
  };
  const forwardPass = CVC_STATE.forwardAssumePassed && (challenger.filters_result || '').toUpperCase().includes('PASSED');
  const formalKeys = ['pf','ret_dd','dd_pct','trades'];
  const applicableKeys = formalKeys.filter(k => checks[k].applicable);
  const formalCount   = applicableKeys.length;
  const formalScore   = applicableKeys.filter(k => checks[k].pass).length;
  const fullCount     = formalCount + (CVC_STATE.forwardAssumePassed ? 1 : 0);
  const fullScore     = formalScore + (forwardPass ? 1 : 0);
  const fails         = applicableKeys.filter(k => !checks[k].pass);
  const naKeys        = formalKeys.filter(k => !checks[k].applicable);
  return { checks, formalCount, formalScore, fullCount, fullScore, fails, naKeys, forwardPass };
}

// Detecta familias de indicadores presentes en el string
function cvcDetectFamilies(indicatorsStr) {
  const s = (indicatorsStr || '').toString();
  const out = [];
  for (const fam of CVC_INDICATOR_FAMILIES) {
    const matched = fam.match.some(m => s.indexOf(m) !== -1);
    if (!matched) continue;
    if (fam.excludeIfMatched && fam.excludeIfMatched.some(ex => s.indexOf(ex) !== -1)) continue;
    out.push(fam.id);
  }
  return out;
}

// Comparación métrica vs champion en delta %
function cvcDeltaPct(value, champValue) {
  if (value == null || champValue == null || champValue === 0) return null;
  return (value - champValue) / Math.abs(champValue) * 100;
}

// ===================================================================
// RENDER — paneles individuales
// ===================================================================
function cvcFmt(n, dec) {
  if (n == null || isNaN(n)) return '–';
  if (typeof dec === 'number') return n.toFixed(dec);
  return Math.abs(n) >= 1000 ? Math.round(n).toLocaleString() : n.toFixed(2);
}
function cvcCheckMark(check) {
  // check puede ser un objeto {applicable, pass} o un boolean (compat)
  if (check && typeof check === 'object') {
    if (!check.applicable) return '<span style="color:var(--text2);" title="N/A — Champion sin este dato">—</span>';
    return check.pass
      ? '<span style="color:var(--green);font-weight:700;">✓</span>'
      : '<span style="color:var(--red);font-weight:700;">✗</span>';
  }
  return check
    ? '<span style="color:var(--green);font-weight:700;">✓</span>'
    : '<span style="color:var(--red);font-weight:700;">✗</span>';
}

function cvcRenderChampion() {
  const el = document.getElementById('cvc-champion-panel');
  if (!el) return;
  const c = CVC_STATE.champion;
  if (!c) { el.innerHTML = '<div class="cvc-empty">Sube un Champion (CSV o manual) para empezar.</div>'; return; }
  const t = cvcThresholds();

  // Dirección detectada (auto)
  const dir = CVC_STATE.directionDetected || cvcDetectDirection(c);
  const dirLabels = { long_only: '🟢 Long-only', long_short: '🟡 Long+Short', short_only: '🔴 Short-only', unknown: '❓ Desconocida' };
  const dirSourceLabels = {
    trades_split: 'detectada por # trades Long/Short en CSV (DETERMINISTA)',
    np_split:     'detectada por NetProfit Long/Short (alta fiabilidad)',
    name:         'detectada por nombre del Champion',
    symbol:       'detectada por símbolo (' + (c.symbol || '') + ')',
    default:      'sin info, usando default',
  };
  const confidenceColor = { high: 'var(--green)', medium: 'var(--yellow)', low: 'var(--text2)' }[dir.confidence] || 'var(--text2)';
  const imbalanceTxt = dir.imbalance ?
    (dir.imbalance === 'long_dominated'  ? ' ⚠ Long >70% de trades — considerar adoptar como Long-only' :
     dir.imbalance === 'short_dominated' ? ' ⚠ Short >70% de trades — considerar adoptar como Short-only' :
     '') : '';
  const dirRow =
    '<div class="cvc-direction-row" style="margin-top:6px;padding:6px 10px;background:var(--surface2);border-radius:6px;font-size:12px;">' +
      '<strong>Dirección:</strong> ' + (dirLabels[dir.dir] || dir.dir) +
      ' <span style="color:' + confidenceColor + ';font-size:11px;">(' + dir.confidence + ')</span>' +
      ' <span style="color:var(--text2);font-size:11px;margin-left:8px;">' + (dirSourceLabels[dir.source] || dir.source) + '</span>' +
      (dir.tradesL != null ? ' <span style="color:var(--text2);font-size:11px;margin-left:8px;">L:' + dir.tradesL + ' / S:' + dir.tradesS + '</span>' : '') +
      (imbalanceTxt ? ' <span style="color:var(--yellow);">' + imbalanceTxt + '</span>' : '') +
    '</div>';

  el.innerHTML =
    '<div class="cvc-card cvc-champion-card">' +
      '<div class="cvc-card-head">' +
        '<span class="cvc-tag cvc-tag-champ">CHAMPION</span>' +
        '<span class="cvc-card-name">' + (c.name || '(sin nombre)') + '</span>' +
        (c.tf ? '<span class="cvc-mini-badge">' + c.tf + '</span>' : '') +
        (c.symbol ? '<span class="cvc-mini-badge">' + c.symbol + '</span>' : '') +
      '</div>' +
      dirRow +
      '<div class="cvc-metric-grid">' +
        cvcMetricBox('NP',         c.np != null ? '$' + cvcFmt(c.np) : '–') +
        cvcMetricBox('PF',         cvcFmt(c.pf, 2)) +
        cvcMetricBox('Sharpe',     cvcFmt(c.sharpe, 2)) +
        cvcMetricBox('Ret/DD',     cvcFmt(c.ret_dd, 2)) +
        cvcMetricBox('DD %',       (c.dd_pct != null ? cvcFmt(c.dd_pct, 2) + '%' : '–')) +
        cvcMetricBox('# trades',   cvcFmt(c.trades, 0)) +
        cvcMetricBox('Win %',      (c.win_pct != null ? cvcFmt(c.win_pct, 2) + '%' : '–')) +
        cvcMetricBox('R Exp',      cvcFmt(c.r_exp, 2)) +
        cvcMetricBox('Stagnation', (c.stag != null ? cvcFmt(c.stag, 0) + 'd' : '–')) +
        cvcMetricBox('Avg Trade',  c.avg_trade != null ? '$' + cvcFmt(c.avg_trade, 2) : '–') +
      '</div>' +
      (t ? '<div class="cvc-thresholds-row">' +
        '<span class="cvc-thr-label">Umbrales Challenger:</span>' +
        '<span class="cvc-thr-pill">PF ≥ ' + (t.pf != null ? t.pf.toFixed(3) : '–') + '</span>' +
        '<span class="cvc-thr-pill">Ret/DD ≥ ' + (t.ret_dd != null ? t.ret_dd.toFixed(2) : '–') + '</span>' +
        '<span class="cvc-thr-pill">DD% ≤ ' + (t.dd_pct != null ? t.dd_pct.toFixed(2) + '%' : '–') + '</span>' +
        '<span class="cvc-thr-pill">#trades ≥ ' + (t.trades != null ? Math.round(t.trades) : '–') + '</span>' +
      '</div>' : '') +
    '</div>';
}

function cvcMetricBox(label, value) {
  return '<div class="cvc-metric"><div class="cvc-metric-label">' + label + '</div><div class="cvc-metric-value">' + value + '</div></div>';
}

function cvcRenderTable() {
  const el = document.getElementById('cvc-table-wrap');
  if (!el) return;
  const ch = CVC_STATE.champion;
  const list = CVC_STATE.challengers;
  if (!ch) { el.innerHTML = ''; return; }
  if (!list.length) {
    el.innerHTML = '<div class="cvc-empty">Sube un CSV de Challengers para ver el ranking.</div>';
    return;
  }
  // Evaluar todos
  let rows = list.map(c => {
    const ev = cvcEvaluate(c);
    return {
      strategy: c,
      ev,
      score: ev.formalScore,
      fullScore: ev.fullScore,
      families: cvcDetectFamilies(c.indicators),
    };
  });
  // Filtrar
  const f = CVC_STATE.filters;
  if (f.minScore > 0) rows = rows.filter(r => r.score >= f.minScore);
  if (f.family !== 'all') rows = rows.filter(r => r.families.indexOf(f.family) !== -1);
  if (f.search) {
    const q = f.search.toLowerCase();
    rows = rows.filter(r => (r.strategy.name || '').toLowerCase().indexOf(q) !== -1
                         || (r.strategy.indicators || '').toLowerCase().indexOf(q) !== -1);
  }
  if (f.oosStableOnly && CVC_STATE.oosLoaded) {
    rows = rows.filter(r => {
      const oos = cvcGetOOS(r.strategy.name);
      return oos && oos.stable;
    });
  }
  if (f.egtCompliantOnly && CVC_STATE.regimeReady) {
    rows = rows.filter(r => {
      const egt = cvcComputeEGT(r.strategy.name);
      return egt && egt.label === 'COMPLIANT';
    });
  }
  if (f.noNegWorstYear && CVC_STATE.oosLoaded) {
    rows = rows.filter(r => {
      const oos = cvcGetOOS(r.strategy.name);
      return !oos || !oos.hasNegWorstYear;
    });
  }
  if (f.healthOK && CVC_STATE.oosLoaded) {
    rows = rows.filter(r => {
      const h = cvcComputeTemporalHealth(r.strategy.name);
      return h && h.passAll;
    });
  }
  // Sort
  const sk = CVC_STATE.sortKey, sd = CVC_STATE.sortDir === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    const va = cvcSortValue(a, sk), vb = cvcSortValue(b, sk);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (va < vb) return -1 * sd;
    if (va > vb) return  1 * sd;
    return 0;
  });

  const sortIcon = (k) => k === sk ? (sd === 1 ? ' ▲' : ' ▼') : '';
  const sortable = (k, label) => '<th class="sortable" data-cvc-sort="' + k + '">' + label + sortIcon(k) + '</th>';

  const showOOS = CVC_STATE.oosLoaded;
  const html =
    '<div class="cvc-table-meta">' +
      'Mostrando ' + rows.length + ' de ' + list.length + ' challengers' +
      (showOOS ? ' · OOS por bloques cargado' : '') +
    '</div>' +
    '<div class="matrix-wrap" style="max-height:560px;">' +
    '<table class="cat-table cvc-table">' +
      '<thead><tr>' +
        sortable('score', 'Score') +
        sortable('name', 'Strategy') +
        sortable('np', 'NP') +
        sortable('pf', 'PF') +
        sortable('sharpe', 'Sharpe') +
        sortable('ret_dd', 'Ret/DD') +
        sortable('dd_pct', 'DD%') +
        sortable('trades', '# trades') +
        sortable('avg_trade', 'Avg $') +
        sortable('r_exp', 'R Exp') +
        sortable('stag', 'Stag (d)') +
        '<th>C1<br>PF</th>' +
        '<th>C2<br>R/DD</th>' +
        '<th>C3<br>DD%</th>' +
        '<th>C4<br>#t</th>' +
        (showOOS ? sortable('oos', 'OOS<br>blocks') : '') +
        (showOOS ? '<th>Salud<br>temporal</th>' : '') +
        '<th>Indicators</th>' +
      '</tr></thead><tbody>' +
      rows.map(r => cvcRenderRow(r)).join('') +
    '</tbody></table></div>';
  el.innerHTML = html;
  // Sort listeners
  el.querySelectorAll('th[data-cvc-sort]').forEach(th => th.addEventListener('click', () => {
    const k = th.dataset.cvcSort;
    if (CVC_STATE.sortKey === k) CVC_STATE.sortDir = CVC_STATE.sortDir === 'asc' ? 'desc' : 'asc';
    else { CVC_STATE.sortKey = k; CVC_STATE.sortDir = 'desc'; }
    cvcRenderTable();
  }));
}

function cvcSortValue(r, key) {
  if (key === 'score') return r.fullScore * 10 + r.score; // ordena 5/5 antes que 4/4
  if (key === 'name') return (r.strategy.name || '').toLowerCase();
  if (key === 'oos') {
    const oos = cvcGetOOS(r.strategy.name);
    if (!oos) return -1;
    // Penalizar fuerte si no es stable; ordenar por (estable*10000 + positives*100 + minVal)
    return (oos.stable ? 10000 : 0) + oos.positive * 100 + (oos.minVal || 0);
  }
  return r.strategy[key];
}

function cvcRenderRow(r) {
  const s = r.strategy, ev = r.ev;
  const champ = CVC_STATE.champion;
  const scoreCls = r.fullScore >= 5 ? 'cvc-score-5' :
                   r.fullScore >= 4 ? 'cvc-score-4' :
                   r.fullScore >= 3 ? 'cvc-score-3' :
                   r.fullScore >= 2 ? 'cvc-score-2' : 'cvc-score-1';
  const deltaPct = (val, champVal, invert) => {
    const d = cvcDeltaPct(val, champVal);
    if (d == null) return '';
    const positive = invert ? d < 0 : d > 0;
    const cls = positive ? 'cvc-delta-pos' : 'cvc-delta-neg';
    const sign = d > 0 ? '+' : '';
    return ' <span class="' + cls + '">' + sign + d.toFixed(0) + '%</span>';
  };
  return '<tr>' +
    '<td><span class="cvc-score-pill ' + scoreCls + '">' + r.fullScore + '/' + r.ev.fullCount + '</span></td>' +
    '<td><strong>' + (s.name || '–') + '</strong></td>' +
    '<td>' + (s.np != null ? '$' + cvcFmt(s.np) : '–') + deltaPct(s.np, champ.np) + '</td>' +
    '<td>' + cvcFmt(s.pf, 2) + deltaPct(s.pf, champ.pf) + '</td>' +
    '<td>' + cvcFmt(s.sharpe, 2) + '</td>' +
    '<td>' + cvcFmt(s.ret_dd, 2) + deltaPct(s.ret_dd, champ.ret_dd) + '</td>' +
    '<td>' + (s.dd_pct != null ? cvcFmt(s.dd_pct, 2) + '%' : '–') + deltaPct(s.dd_pct, champ.dd_pct, true) + '</td>' +
    '<td>' + cvcFmt(s.trades, 0) + '</td>' +
    '<td>' + (s.avg_trade != null ? '$' + cvcFmt(s.avg_trade, 2) : '–') + '</td>' +
    '<td>' + cvcFmt(s.r_exp, 2) + '</td>' +
    '<td>' + cvcFmt(s.stag, 0) + '</td>' +
    '<td>' + cvcCheckMark(ev.checks.pf) + '</td>' +
    '<td>' + cvcCheckMark(ev.checks.ret_dd) + '</td>' +
    '<td>' + cvcCheckMark(ev.checks.dd_pct) + '</td>' +
    '<td>' + cvcCheckMark(ev.checks.trades) + '</td>' +
    (CVC_STATE.oosLoaded ? '<td>' + cvcRenderOOSCell(s.name) + '</td>' : '') +
    (CVC_STATE.oosLoaded ? '<td>' + cvcRenderHealthCell(s.name) + '</td>' : '') +
    '<td style="font-size:11px;color:var(--text2);">' + (s.indicators || '') + '</td>' +
  '</tr>';
}

// Renderiza celda OOS — pill X/N coloreada según estabilidad/decay/worst-year.
// Tooltip enriquecido con todas las métricas por bloque si están disponibles.
function cvcRenderOOSCell(name) {
  const oos = cvcGetOOS(name);
  if (!oos) return '<span style="color:var(--text2);">—</span>';

  let cls = 'cvc-oos-stable';
  const decayWarn = oos.decay != null && oos.decay < 0.7;
  const worstYearWarn = oos.hasNegWorstYear;
  if (!oos.stable || worstYearWarn) cls = 'cvc-oos-unstable';
  else if (decayWarn) cls = 'cvc-oos-decay';

  // Tooltip rico
  const lines = [];
  lines.push('OOS: ' + oos.positive + '/' + oos.total + ' bloques positivos · primary=' + oos.metric);
  if (oos.minVal != null) lines.push('Min ' + oos.minVal.toFixed(2) + ' · Avg ' + oos.avgVal.toFixed(2) + ' · Max ' + oos.maxVal.toFixed(2));
  if (oos.decay != null) {
    lines.push('Decay ' + oos.decay.toFixed(2) +
      (oos.decay < 0.7 ? ' (deterioro 2ª mitad)' : oos.decay > 1.3 ? ' (mejora 2ª mitad)' : ' (estable)'));
  }
  if (oos.maxNegStreak) lines.push('Streak negativo máx: ' + oos.maxNegStreak);
  if (oos.hasNegWorstYear) lines.push('⚠ Año perdedor real: Worst Year Profit min = ' + (oos.minWorstYear != null ? oos.minWorstYear.toFixed(2) : '?'));

  // Render por bloque si hay multi-métrica
  const all = oos.blocksAll;
  if (all && Object.keys(all).length > 1) {
    lines.push('');
    lines.push('Por bloque:');
    const metricsToShow = oos.availableMetrics.slice(0, 6); // limitar a 6 para no saturar
    const headerLine = 'Block | ' + metricsToShow.map(m => m.slice(0, 12).padEnd(12)).join(' | ');
    lines.push(headerLine);
    for (let i = 0; i < oos.total; i++) {
      const row = ('OOS' + (i+1)).padEnd(5) + ' | ' +
        metricsToShow.map(m => {
          const v = (all[m] || [])[i];
          return v == null ? '—'.padEnd(12)
            : (typeof v === 'number' ? v.toFixed(2) : String(v)).padEnd(12);
        }).join(' | ');
      lines.push(row);
    }
  } else if (oos.blocks) {
    lines.push('Bloques: [' + oos.blocks.map(b => b == null ? '—' : b.toFixed(2)).join(', ') + ']');
  }

  const tooltip = lines.join('\n').replace(/"/g, '&quot;');
  return '<span class="cvc-oos-pill ' + cls + '" title="' + tooltip + '">' + oos.positive + '/' + oos.total + '</span>';
}

// Render de la celda "Salud Temporal": 3 mini-pills (peak, DD del peak, recovery)
function cvcRenderHealthCell(name) {
  const h = cvcComputeTemporalHealth(name);
  if (!h) return '<span class="cvc-oos-pill cvc-health-na" title="Sin datos OOS">—</span>';

  // Pill 1: Peak block
  const peakCls = h.peakIdx >= h.nBlocks - 3 ? 'cvc-health-good' :
                  h.peakIdx >= Math.floor(h.nBlocks / 2) ? 'cvc-health-warn' :
                  'cvc-health-bad';
  const peakPill = '<span class="cvc-health-pill ' + peakCls +
    '" title="Peak en OOS' + h.peakBlock + ' de ' + h.nBlocks + '">P:' + h.peakBlock + '</span>';

  // Pill 2: DD desde peak al cierre
  const ddPct = (h.ddAtClose * 100);
  const ddCls = ddPct < 5 ? 'cvc-health-good' :
                ddPct < 15 ? 'cvc-health-warn' :
                'cvc-health-bad';
  const ddPill = '<span class="cvc-health-pill ' + ddCls +
    '" title="DD desde peak al cierre del backtest">DD:' + ddPct.toFixed(1) + '%</span>';

  // Pill 3: Recovery index
  let recPill = '';
  if (h.recoveryIndex != null) {
    const recPct = h.recoveryIndex * 100;
    const recCls = recPct >= 100 ? 'cvc-health-good' :
                   recPct >= 70 ? 'cvc-health-warn' :
                   'cvc-health-bad';
    recPill = '<span class="cvc-health-pill ' + recCls +
      '" title="avg(últimos 3 OOS) / avg(histórico)">R:' + recPct.toFixed(0) + '%</span>';
  }

  // Wrapper con status global
  const statusLabel = {
    'fresh':     'Peak fresh ✓',
    'recovered': 'Recuperada (peak en 2ª mitad)',
    'old_peak':  'Peak antiguo ⚠',
    'declining': 'En DD profundo ❌',
  }[h.status] || h.status;
  const wrapTitle = 'Salud Temporal: ' + statusLabel +
    '\nPeak: OOS' + h.peakBlock + ' / ' + h.nBlocks +
    '\nDD desde peak al cierre: ' + ddPct.toFixed(2) + '%' +
    (h.recoveryIndex != null ? '\nRecovery: ' + (h.recoveryIndex * 100).toFixed(1) + '% del avg histórico' : '') +
    '\nPasa filtros contextuales: ' + (h.passAll ? 'SÍ' : 'NO');

  return '<span class="cvc-health-wrap" title="' + wrapTitle.replace(/"/g, '&quot;') + '">' +
    peakPill + recPill + ddPill +
    '</span>';
}

// ===================================================================
// VEREDICTO + TOP PICKS auto-generados
// ===================================================================
function cvcRenderVerdict() {
  const el = document.getElementById('cvc-verdict-panel');
  if (!el) return;
  const ch = CVC_STATE.champion;
  const list = CVC_STATE.challengers;
  if (!ch || !list.length) { el.innerHTML = ''; return; }

  const evaluated = list.map(c => ({ s: c, ev: cvcEvaluate(c), fams: cvcDetectFamilies(c.indicators) }));
  const fullPass = evaluated.filter(r => r.ev.fullScore === r.ev.fullCount && r.ev.fullCount > 0);
  const formalAll = evaluated.filter(r => r.ev.formalScore === r.ev.formalCount && r.ev.formalCount > 0);
  const sample = evaluated[0];
  const naList = sample ? sample.ev.naKeys : [];
  const naWarn = naList.length
    ? '<div style="margin-top:6px;font-size:12px;color:var(--text2);">⚠ Criterios no evaluados (Champion sin dato): ' + naList.map(k => k.toUpperCase()).join(', ') + '</div>'
    : '';

  let veredict, vCls;
  if (fullPass.length > 0) {
    veredict = '<strong>ADOPTAR Challenger.</strong> ' + fullPass.length + ' estrategia(s) pasa(n) todos los criterios aplicables.' + naWarn;
    vCls = 'cvc-verdict-adopt';
  } else if (formalAll.length > 0) {
    veredict = '<strong>Posible adopción.</strong> ' + formalAll.length + ' pasa(n) todos los criterios formales (revisar Forward 2024-2026 manualmente).' + naWarn;
    vCls = 'cvc-verdict-maybe';
  } else {
    veredict = '<strong>MANTENER CHAMPION.</strong> Ninguna Challenger pasa los criterios. Top candidatas a Test de Descomposición + Filter by Correlation:' + naWarn;
    vCls = 'cvc-verdict-keep';
  }

  // Top picks: si hay OOS, priorizar estables; si no, score formal + score cualitativo compuesto
  let topCandidates = evaluated.slice();
  if (CVC_STATE.oosLoaded) {
    // Penalizar las inestables empujándolas al final
    topCandidates.sort((a, b) => {
      const oa = cvcGetOOS(a.s.name), ob = cvcGetOOS(b.s.name);
      const sa = oa && oa.stable ? 1 : 0;
      const sb = ob && ob.stable ? 1 : 0;
      if (sa !== sb) return sb - sa;
      if (b.ev.fullScore !== a.ev.fullScore) return b.ev.fullScore - a.ev.fullScore;
      return (b.s.pf || 0) - (a.s.pf || 0);
    });
  } else {
    topCandidates.sort((a, b) => {
      if (b.ev.fullScore !== a.ev.fullScore) return b.ev.fullScore - a.ev.fullScore;
      const sc = (r) => (r.s.pf || 0) + (r.s.ret_dd || 0) / 5 + (r.s.r_exp || 0) - (r.s.dd_pct || 0);
      return sc(b) - sc(a);
    });
  }
  const top = topCandidates.slice(0, 5);

  const tpHtml = top.map((r, i) => {
    const s = r.s, ev = r.ev;
    const oos = cvcGetOOS(s.name);
    const justifs = [];
    if (s.pf != null && s.pf > ch.pf) justifs.push('PF ' + s.pf.toFixed(2) + ' > Champion ' + ch.pf.toFixed(2));
    if (s.ret_dd != null && s.ret_dd > ch.ret_dd) justifs.push('Ret/DD ' + s.ret_dd.toFixed(2) + ' > ' + ch.ret_dd.toFixed(2));
    if (s.dd_pct != null && ch.dd_pct != null && s.dd_pct < ch.dd_pct) justifs.push('DD% ' + s.dd_pct.toFixed(2) + '% < ' + ch.dd_pct.toFixed(2) + '%');
    if (s.r_exp != null && ch.r_exp != null && s.r_exp > ch.r_exp) justifs.push('R Exp ' + s.r_exp.toFixed(2) + ' > ' + ch.r_exp.toFixed(2));
    if (s.stag != null && ch.stag != null && s.stag < ch.stag) justifs.push('Stag ' + Math.round(s.stag) + 'd < ' + Math.round(ch.stag) + 'd');
    const failed = ev.fails.length ? 'Falla: ' + ev.fails.map(f => f.toUpperCase()).join(', ') : 'Pasa todos los criterios formales';
    const oosLine = oos
      ? '<div class="cvc-toppick-oos ' + (oos.stable ? 'oos-ok' : 'oos-warn') + '">' +
          (oos.stable ? '✓ OOS estable: ' + oos.positive + '/' + oos.total + ' bloques positivos (min ' + oos.minVal.toFixed(2) + ')'
                      : '⚠ OOS inestable: ' + oos.positive + '/' + oos.total + ' bloques positivos · ' + (oos.total - oos.positive) + ' bloque(s) negativo(s) (min ' + oos.minVal.toFixed(2) + ')') +
        '</div>'
      : '';
    return '<div class="cvc-toppick' + (oos && !oos.stable ? ' cvc-toppick-warn' : '') + '">' +
      '<div class="cvc-toppick-rank">#' + (i+1) + '</div>' +
      '<div class="cvc-toppick-body">' +
        '<div class="cvc-toppick-name"><strong>' + (s.name || '–') + '</strong> · ' + ev.fullScore + '/' + ev.fullCount + '</div>' +
        '<div class="cvc-toppick-stats">' +
          'NP $' + cvcFmt(s.np) + ' · PF ' + cvcFmt(s.pf, 2) + ' · Ret/DD ' + cvcFmt(s.ret_dd, 2) + ' · DD% ' + cvcFmt(s.dd_pct, 2) + '% · ' + cvcFmt(s.trades, 0) + ' trades' +
        '</div>' +
        '<div class="cvc-toppick-just">' + failed + (justifs.length ? ' · Mejoras: ' + justifs.join(' · ') : '') + '</div>' +
        oosLine +
        (r.fams.length ? '<div class="cvc-toppick-fams">' + r.fams.map(f => '<span class="cvc-fam-pill">' + f + '</span>').join('') + '</div>' : '') +
      '</div>' +
    '</div>';
  }).join('');

  el.innerHTML =
    '<div class="cvc-verdict ' + vCls + '">' + veredict + '</div>' +
    '<div class="cvc-toppicks-wrap">' + tpHtml + '</div>' +
    '<div class="cvc-next-steps">' +
      '<strong>Próximos pasos pendientes:</strong>' +
      '<ol>' +
        '<li>Test de Descomposición sobre las top candidatas (Coef_Emergencia ≤ 1.25, PF_solo_edge ≥ 1.20).</li>' +
        '<li>Filter by Correlation entre Champion + top picks (threshold 0.7).</li>' +
        '<li>Verificación final en MT5 con datos reales del bróker (discrepancia &lt;10% en NP, PF, DD%).</li>' +
        '<li>Demo 30 días con sizing real antes de operativa real.</li>' +
      '</ol>' +
    '</div>';
}

// ===================================================================
// PATRONES POR FAMILIA DE INDICADOR
// ===================================================================
function cvcRenderPatterns() {
  const el = document.getElementById('cvc-patterns-panel');
  if (!el) return;
  if (!CVC_STATE.challengers.length) { el.innerHTML = ''; return; }

  // Agrupar por familia
  const groups = {};
  CVC_INDICATOR_FAMILIES.forEach(f => groups[f.id] = []);
  CVC_STATE.challengers.forEach(c => {
    const fams = cvcDetectFamilies(c.indicators);
    fams.forEach(f => groups[f].push(c));
  });

  const rows = Object.entries(groups)
    .filter(([, arr]) => arr.length > 0)
    .map(([id, arr]) => {
      const avgPF = arr.reduce((a, c) => a + (c.pf || 0), 0) / arr.length;
      const avgRetDD = arr.reduce((a, c) => a + (c.ret_dd || 0), 0) / arr.length;
      const avgDDpct = arr.reduce((a, c) => a + (c.dd_pct || 0), 0) / arr.length;
      const avgTrades = arr.reduce((a, c) => a + (c.trades || 0), 0) / arr.length;
      const avgRExp = arr.reduce((a, c) => a + (c.r_exp || 0), 0) / arr.length;
      const fam = CVC_INDICATOR_FAMILIES.find(f => f.id === id);
      return { id, label: (fam && fam.label) || id, count: arr.length, avgPF, avgRetDD, avgDDpct, avgTrades, avgRExp };
    })
    .sort((a, b) => b.count - a.count);

  if (!rows.length) { el.innerHTML = '<div class="cvc-empty">Sin familias de indicadores detectadas en el set.</div>'; return; }

  el.innerHTML =
    '<table class="cat-table cvc-table">' +
      '<thead><tr>' +
        '<th>Familia</th>' +
        '<th># estrategias</th>' +
        '<th>PF promedio</th>' +
        '<th>Ret/DD promedio</th>' +
        '<th>DD% promedio</th>' +
        '<th>#trades promedio</th>' +
        '<th>R Exp promedio</th>' +
      '</tr></thead><tbody>' +
      rows.map(r =>
        '<tr>' +
          '<td><strong>' + r.label + '</strong></td>' +
          '<td>' + r.count + '</td>' +
          '<td>' + r.avgPF.toFixed(2) + '</td>' +
          '<td>' + r.avgRetDD.toFixed(2) + '</td>' +
          '<td>' + r.avgDDpct.toFixed(2) + '%</td>' +
          '<td>' + Math.round(r.avgTrades) + '</td>' +
          '<td>' + r.avgRExp.toFixed(2) + '</td>' +
        '</tr>'
      ).join('') +
    '</tbody></table>';
}

// ===================================================================
// RENDER GLOBAL + LISTENERS
// ===================================================================
function cvcRenderAll() {
  cvcRenderChampion();
  cvcRenderTable();
  cvcRenderVerdict();
  cvcRenderPatterns();
  cvcRenderFamilyFilter();
  cvcRenderRegimeSection();
  // Mostrar/ocultar filtros según datos disponibles
  const oosFilterWrap = document.getElementById('cvc-oos-filter-wrap');
  if (oosFilterWrap) oosFilterWrap.style.display = CVC_STATE.oosLoaded ? '' : 'none';
  const egtFilterWrap = document.getElementById('cvc-egt-filter-wrap');
  if (egtFilterWrap) egtFilterWrap.style.display = CVC_STATE.regimeReady ? '' : 'none';
  // Filtros que sólo aparecen si el OOS tiene métricas extras (multi-métrica)
  const sample = Object.values(CVC_STATE.oosByStrategy)[0];
  const hasMultiMetrics = sample && sample.availableMetrics && sample.availableMetrics.length > 1;
  const minTradesWrap = document.getElementById('cvc-min-trades-wrap');
  if (minTradesWrap) minTradesWrap.style.display = (CVC_STATE.regimeReady && hasMultiMetrics) ? '' : 'none';
  const worstYearWrap = document.getElementById('cvc-worst-year-wrap');
  const hasWorstYear = sample && sample.blocksAll && sample.blocksAll['Worst Year Profit'];
  if (worstYearWrap) worstYearWrap.style.display = hasWorstYear ? '' : 'none';
  // Filtro salud temporal: requiere OOS con Net profit por bloque (siempre presente si hay OOS)
  const healthFilterWrap = document.getElementById('cvc-health-filter-wrap');
  if (healthFilterWrap) healthFilterWrap.style.display = CVC_STATE.oosLoaded ? '' : 'none';
}

// ===================================================================
// RENDER — Régime Analysis section (UI + tabla bloques + ranking EGT)
// ===================================================================
function cvcRenderRegimeSection() {
  const sec = document.getElementById('cvc-regime-section');
  if (!sec) return;
  // Solo aparece si hay OOS cargado
  sec.style.display = CVC_STATE.oosLoaded ? '' : 'none';
  if (!CVC_STATE.oosLoaded) return;

  // Poblar dropdown de activos
  const sel = document.getElementById('cvc-regime-asset');
  if (sel && !sel.options.length) {
    const keys = cvcCatalogKeys().sort();
    sel.innerHTML = '<option value="">— elige activo —</option>' +
      keys.map(k => '<option value="' + k + '">' + k + '</option>').join('');
  }

  // Auto-detect del activo desde el Symbol del primer challenger (si aún no está seteado)
  if (!CVC_STATE.regimeAsset && CVC_STATE.challengers.length) {
    const sym = CVC_STATE.challengers[0].symbol || (CVC_STATE.champion && CVC_STATE.champion.symbol);
    const detected = cvcResolveAsset(sym, cvcCatalogKeys());
    if (detected) CVC_STATE.regimeAsset = detected;
  }
  if (sel && CVC_STATE.regimeAsset) sel.value = CVC_STATE.regimeAsset;

  // Sincronizar inputs de fecha y EGT thresholds
  const startInp = document.getElementById('cvc-regime-start');
  const endInp = document.getElementById('cvc-regime-end');
  const strongInp = document.getElementById('cvc-egt-strong');
  const weakInp = document.getElementById('cvc-egt-weak');
  if (startInp && CVC_STATE.regimeStartDate) startInp.value = CVC_STATE.regimeStartDate;
  if (endInp && CVC_STATE.regimeEndDate) endInp.value = CVC_STATE.regimeEndDate;
  if (strongInp && !strongInp.value) strongInp.value = CVC_STATE.egtThresholds.strong;
  if (weakInp && weakInp.value === '') weakInp.value = CVC_STATE.egtThresholds.weak;

  // Info del activo
  const info = document.getElementById('cvc-regime-asset-info');
  if (info && CVC_STATE.regimeAsset) {
    const data = cvcGetHistoricalData()[CVC_STATE.regimeAsset];
    if (data) info.textContent = '(datos desde ' + data.start + ', ' + data.v.length + ' meses)';
  }

  // Render bloques + EGT
  cvcRenderRegimeBlocks();
  cvcRenderEGTSummary();
}

function cvcRenderRegimeBlocks() {
  const el = document.getElementById('cvc-regime-blocks-panel');
  if (!el) return;
  if (!CVC_STATE.regimeReady) {
    el.innerHTML = '<div class="cvc-empty">Configura activo y fechas y pulsa Aplicar para ver el régimen por bloque.</div>';
    return;
  }
  const blocks = CVC_STATE.regimeBlocks;
  const html =
    '<div style="font-size:12px;color:var(--text2);margin-bottom:6px;">Régimen del activo <strong style="color:var(--accent);">' + CVC_STATE.regimeAsset + '</strong> en cada bloque OOS (' + blocks.length + ' bloques)</div>' +
    '<table class="cat-table cvc-table">' +
      '<thead><tr><th>Bloque</th><th>%change</th><th>Vol anual</th><th>Régimen</th><th>Grupo EGT</th></tr></thead>' +
      '<tbody>' +
      blocks.map(b => {
        const cls = b.group === 'BULL' ? 'cvc-regime-bull' :
                    b.group === 'BEAR' ? 'cvc-regime-bear' :
                    b.group === 'RANGE' ? 'cvc-regime-range' : '';
        return '<tr>' +
          '<td><strong>OOS' + b.idx + '</strong></td>' +
          '<td>' + (b.pctChange != null ? (b.pctChange > 0 ? '+' : '') + b.pctChange.toFixed(1) + '%' : '–') + '</td>' +
          '<td>' + (b.vol != null ? b.vol.toFixed(1) + '%' : '–') + '</td>' +
          '<td><span class="cvc-regime-pill ' + cls + '">' + (b.regime || '–') + '</span></td>' +
          '<td>' + (b.group || '–') + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';
  el.innerHTML = html;
}

function cvcRenderEGTSummary() {
  const el = document.getElementById('cvc-egt-summary-panel');
  if (!el) return;
  if (!CVC_STATE.regimeReady) { el.innerHTML = ''; return; }
  const list = CVC_STATE.challengers;
  if (!list.length) { el.innerHTML = ''; return; }

  const evaluated = list.map(c => {
    const egt = cvcComputeEGT(c.name);
    return { strategy: c, egt };
  }).filter(x => x.egt);

  // Ordenar: STRONG primero, luego COMPLIANT, DEFENSIVE, INSUFFICIENT, RISK al final
  evaluated.sort((a, b) => {
    const vOrder = { STRONG: 0, COMPLIANT: 1, DEFENSIVE: 2, INSUFFICIENT: 3, RISK: 4 };
    const va = vOrder[a.egt.verdict] != null ? vOrder[a.egt.verdict] : 5;
    const vb = vOrder[b.egt.verdict] != null ? vOrder[b.egt.verdict] : 5;
    if (va !== vb) return va - vb;
    // Tiebreaker: avg en régimen dominante (más representativo)
    return (b.egt.dominantAvg || 0) - (a.egt.dominantAvg || 0);
  });

  const counts = { STRONG: 0, COMPLIANT: 0, DEFENSIVE: 0, INSUFFICIENT: 0, RISK: 0 };
  evaluated.forEach(e => { if (counts[e.egt.verdict] != null) counts[e.egt.verdict]++; });

  const t = CVC_STATE.egtThresholds;
  const dirLabel = t.direction === 'long_short' ? 'L+S' : 'Long-only';
  const dirThr = t[t.direction || 'long_only'];
  const thrSummary = 'BULL≥' + dirThr.BULL.pass + '·BEAR≥' + dirThr.BEAR.pass + '·RANGE≥' + dirThr.RANGE.pass + ' (' + dirLabel + ')';

  const summary =
    '<div class="cvc-egt-summary-bar">' +
      '<span class="cvc-egt-tag cvc-egt-strong" title="Pasa todos los regímenes Y dominante ≥ strong">⭐ ' + counts.STRONG + ' STRONG</span>' +
      '<span class="cvc-egt-tag cvc-egt-compliant" title="Pasa todos los regímenes con n≥2">✓ ' + counts.COMPLIANT + ' COMPLIANT</span>' +
      '<span class="cvc-egt-tag cvc-egt-defensive" title="No pierde en ningún régimen pero ninguno llega a strong">⚠ ' + counts.DEFENSIVE + ' DEFENSIVE</span>' +
      '<span class="cvc-egt-tag cvc-egt-insufficient" title="Algún régimen tiene <2 bloques (data insuficiente)">❓ ' + counts.INSUFFICIENT + ' INSUFFICIENT</span>' +
      '<span class="cvc-egt-tag cvc-egt-risk" title="Pierde en algún régimen evaluado">❌ ' + counts.RISK + ' RISK</span>' +
      '<span style="margin-left:auto;font-size:11px;color:var(--text2);">Umbrales: ' + thrSummary + '</span>' +
    '</div>';

  const tbl =
    '<table class="cat-table cvc-table" style="margin-top:10px;">' +
      '<thead><tr>' +
        '<th>Strategy</th>' +
        '<th>BULL avg (n)</th>' +
        '<th>BEAR avg (n)</th>' +
        '<th>RANGE avg (n)</th>' +
        '<th>Dominante</th>' +
        '<th>Avg dom.</th>' +
        '<th>Falla en</th>' +
        '<th>Insuficientes</th>' +
        '<th>Veredicto EGT v2</th>' +
      '</tr></thead><tbody>' +
      evaluated.map(({strategy, egt}) => {
        const verdictMap = {
          STRONG:       { cls: 'cvc-egt-strong',       icon: '⭐', txt: 'STRONG' },
          COMPLIANT:    { cls: 'cvc-egt-compliant',    icon: '✓',  txt: 'COMPLIANT' },
          DEFENSIVE:    { cls: 'cvc-egt-defensive',    icon: '⚠',  txt: 'DEFENSIVE' },
          INSUFFICIENT: { cls: 'cvc-egt-insufficient', icon: '❓', txt: 'INSUFFICIENT' },
          RISK:         { cls: 'cvc-egt-risk',         icon: '❌', txt: 'RISK' },
        };
        const v = verdictMap[egt.verdict] || verdictMap.INSUFFICIENT;
        const fmt = (val) => val == null ? '–' : val.toFixed(2);

        // Render por régimen con badge de status
        const regimeCell = (r) => {
          const s = egt.stats[r];
          if (s.count === 0) return '<span style="color:var(--text2);">–</span>';
          const sufficient = egt.sufficientByRegime[r];
          const passed = egt.passByRegime[r];
          const strong = egt.strongByRegime[r];
          let color = 'var(--text)';
          let icon = '';
          if (!sufficient) { color = 'var(--text2)'; icon = ' <span title="n<min" style="font-size:10px;">❓</span>'; }
          else if (passed === false) { color = 'var(--red)'; icon = ' <span style="font-size:10px;">❌</span>'; }
          else if (strong) { color = 'var(--green)'; icon = ' <span style="font-size:10px;">⭐</span>'; }
          else if (passed) { color = 'var(--green)'; icon = ' <span style="font-size:10px;">✓</span>'; }
          return '<span style="color:' + color + ';">' + fmt(s.avg) + icon +
            ' <span style="color:var(--text2);font-size:10px;">(' + s.count + ')</span></span>';
        };

        // Tooltip enriquecido
        const tip = [
          'EGT v2 — Veredicto: ' + egt.verdict,
          'Dirección: ' + (egt.direction === 'long_short' ? 'Long+Short' : 'Long-only'),
          'Régimen dominante: ' + egt.dominantRegime + ' (avg ' + fmt(egt.dominantAvg) + ')',
          '',
          'Por régimen:',
          ...['BULL','BEAR','RANGE'].map(r => {
            const s = egt.stats[r];
            if (s.count === 0) return '  ' + r + ': sin bloques';
            const thr = egt.thresholds[r];
            const status = !egt.sufficientByRegime[r] ? 'INSUFICIENTE n<' + (CVC_STATE.egtThresholds.minBlocksPerRegime || 2)
              : egt.passByRegime[r] === false ? 'FALLA pass<' + thr.pass
              : egt.strongByRegime[r] ? 'STRONG ≥' + thr.strong
              : 'PASS ≥' + thr.pass;
            return '  ' + r + ': avg ' + fmt(s.avg) + ' (n=' + s.count + ') — ' + status;
          }),
          '',
          'Worst régimen evaluado: ' + fmt(egt.worstRegimeAvg),
          'Varianza entre regímenes: ' + fmt(egt.varianceAcrossRegimes),
        ].join('\n').replace(/"/g, '&quot;');

        return '<tr title="' + tip + '">' +
          '<td><strong>' + (strategy.name || '–') + '</strong></td>' +
          '<td>' + regimeCell('BULL') + '</td>' +
          '<td>' + regimeCell('BEAR') + '</td>' +
          '<td>' + regimeCell('RANGE') + '</td>' +
          '<td><span class="cvc-regime-pill cvc-regime-' + egt.dominantRegime.toLowerCase() + '">' + egt.dominantRegime + '</span></td>' +
          '<td><strong>' + fmt(egt.dominantAvg) + '</strong></td>' +
          '<td>' + (egt.failedRegimes.length ? egt.failedRegimes.join(', ') : '–') + '</td>' +
          '<td style="color:var(--text2);font-size:11px;">' + (egt.insufficientRegimes.length ? egt.insufficientRegimes.join(', ') + ' (n<2)' : '–') + '</td>' +
          '<td><span class="cvc-egt-tag ' + v.cls + '">' + v.icon + ' ' + v.txt + '</span></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';

  el.innerHTML = summary + tbl;
}

function cvcRenderFamilyFilter() {
  const sel = document.getElementById('cvc-filter-family');
  if (!sel) return;
  const present = new Set();
  CVC_STATE.challengers.forEach(c => cvcDetectFamilies(c.indicators).forEach(f => present.add(f)));
  const cur = sel.value;
  sel.innerHTML = '<option value="all">Todas</option>' +
    [...present].map(f => {
      const fam = CVC_INDICATOR_FAMILIES.find(x => x.id === f);
      return '<option value="' + f + '">' + ((fam && fam.label) || f) + '</option>';
    }).join('');
  if (cur && [...present].indexOf(cur) !== -1) sel.value = cur;
}

// ===================================================================
// EXPORT MARKDOWN
// ===================================================================
function cvcExportMarkdown() {
  const ch = CVC_STATE.champion;
  const list = CVC_STATE.challengers;
  if (!ch || !list.length) { alert('Sube Champion y Challengers primero.'); return; }
  const t = cvcThresholds();
  const evaluated = list.map(c => ({ s: c, ev: cvcEvaluate(c), fams: cvcDetectFamilies(c.indicators) }));
  evaluated.sort((a, b) => b.ev.fullScore - a.ev.fullScore || (b.s.pf || 0) - (a.s.pf || 0));

  let md = '# Champion vs Challenger — Análisis\n\n';
  md += 'Generado: ' + new Date().toISOString().slice(0, 19).replace('T', ' ') + '\n\n';
  md += '## Champion\n\n';
  md += '- **Strategy:** ' + (ch.name || '–') + '\n';
  md += '- **NP:** $' + cvcFmt(ch.np) + ' | **PF:** ' + cvcFmt(ch.pf, 2) + ' | **Sharpe:** ' + cvcFmt(ch.sharpe, 2) + '\n';
  md += '- **Ret/DD:** ' + cvcFmt(ch.ret_dd, 2) + ' | **DD%:** ' + cvcFmt(ch.dd_pct, 2) + '% | **# trades:** ' + cvcFmt(ch.trades, 0) + '\n';
  md += '- **R Exp:** ' + cvcFmt(ch.r_exp, 2) + ' | **Stagnation:** ' + cvcFmt(ch.stag, 0) + 'd\n\n';
  md += '## Umbrales Challenger (multiplicadores ' +
    'PF×' + CVC_STATE.multipliers.pf + ', Ret/DD×' + CVC_STATE.multipliers.ret_dd +
    ', DD%×' + CVC_STATE.multipliers.dd_pct + ', #trades×' + CVC_STATE.multipliers.trades + ')\n\n';
  md += '- PF ≥ ' + (t.pf != null ? t.pf.toFixed(3) : '–') + '\n';
  md += '- Ret/DD ≥ ' + (t.ret_dd != null ? t.ret_dd.toFixed(2) : '–') + '\n';
  md += '- DD% ≤ ' + (t.dd_pct != null ? t.dd_pct.toFixed(2) + '%' : '–') + '\n';
  md += '- #trades ≥ ' + (t.trades != null ? Math.round(t.trades) : '–') + '\n';
  md += '- Forward 2024-2026 todos años positivos (asumido si "PASSED")\n\n';
  md += '## Ranking de finalistas (' + list.length + ')\n\n';
  md += '| Score | Strategy | NP | PF | Ret/DD | DD% | #trades | R Exp | Indicators |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|---|\n';
  evaluated.forEach(r => {
    md += '| ' + r.ev.fullScore + '/' + r.ev.fullCount + ' | ' + (r.s.name || '–') +
      ' | $' + cvcFmt(r.s.np) +
      ' | ' + cvcFmt(r.s.pf, 2) +
      ' | ' + cvcFmt(r.s.ret_dd, 2) +
      ' | ' + cvcFmt(r.s.dd_pct, 2) + '%' +
      ' | ' + cvcFmt(r.s.trades, 0) +
      ' | ' + cvcFmt(r.s.r_exp, 2) +
      ' | ' + (r.s.indicators || '') + ' |\n';
  });
  md += '\n## Veredicto\n\n';
  const fullPass = evaluated.filter(r => r.ev.fullScore === r.ev.fullCount && r.ev.fullCount > 0);
  if (fullPass.length) {
    md += '**ADOPTAR.** ' + fullPass.length + ' estrategia(s) pasan todos los criterios aplicables.\n';
  } else {
    md += '**Mantener Champion.** Ninguna Challenger pasa todos los criterios.\n';
  }
  const naSample = evaluated[0] ? evaluated[0].ev.naKeys : [];
  if (naSample.length) md += '\n_Criterios no evaluados (Champion sin dato):_ ' + naSample.map(k => k.toUpperCase()).join(', ') + '\n';

  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'CvC_analysis_' + Date.now() + '.md';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ===================================================================
// INIT — listeners
// ===================================================================
(function cvcInit() {
  if (!document.getElementById('tab-cvc')) return; // tab no presente

  // Champion CSV
  const chFile = document.getElementById('cvc-champ-file');
  if (chFile) chFile.addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (f) {
      try { await cvcLoadChampionCSV(f); cvcShowOk('champion', '✓ Champion cargado: ' + (CVC_STATE.champion.name || '(sin nombre)')); }
      catch (err) { cvcShowError('champion', 'Error: ' + err.message); }
    }
  });

  // Champion manual
  const manBtn = document.getElementById('cvc-champ-manual-apply');
  if (manBtn) manBtn.addEventListener('click', cvcLoadChampionManual);

  // Toggle entre subir CSV y manual
  document.querySelectorAll('[data-cvc-mode]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('[data-cvc-mode]').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    const m = b.dataset.cvcMode;
    document.getElementById('cvc-champ-csv-zone').style.display = m === 'csv' ? 'block' : 'none';
    document.getElementById('cvc-champ-manual-zone').style.display = m === 'manual' ? 'block' : 'none';
  }));

  // Challengers CSV
  const cgFile = document.getElementById('cvc-chal-file');
  if (cgFile) cgFile.addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (f) {
      try { await cvcLoadChallengersCSV(f); cvcShowOk('challengers', '✓ ' + CVC_STATE.challengers.length + ' challengers cargados'); }
      catch (err) { cvcShowError('challengers', 'Error: ' + err.message); }
    }
  });

  // Multiplicadores
  ['pf', 'ret_dd', 'dd_pct', 'trades'].forEach(k => {
    const inp = document.getElementById('cvc-mult-' + k);
    if (inp) inp.addEventListener('change', () => {
      const v = parseFloat(inp.value);
      if (!isNaN(v) && v > 0) { CVC_STATE.multipliers[k] = v; cvcRenderAll(); }
    });
  });

  // Filtros
  document.querySelectorAll('[data-cvc-min-score]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('[data-cvc-min-score]').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    CVC_STATE.filters.minScore = parseInt(b.dataset.cvcMinScore, 10) || 0;
    cvcRenderTable();
  }));
  const famSel = document.getElementById('cvc-filter-family');
  if (famSel) famSel.addEventListener('change', () => { CVC_STATE.filters.family = famSel.value; cvcRenderTable(); });
  const search = document.getElementById('cvc-filter-search');
  if (search) search.addEventListener('input', () => { CVC_STATE.filters.search = search.value.trim(); cvcRenderTable(); });

  // Forward toggle
  const fwd = document.getElementById('cvc-forward-toggle');
  if (fwd) fwd.addEventListener('change', () => { CVC_STATE.forwardAssumePassed = fwd.checked; cvcRenderAll(); });

  // DD% toggle (off por defecto — los % son métricas relativas no comparables)
  const ddPctTgl = document.getElementById('cvc-useddpct-toggle');
  if (ddPctTgl) {
    ddPctTgl.checked = CVC_STATE.useDDPctCriterion;
    ddPctTgl.addEventListener('change', () => { CVC_STATE.useDDPctCriterion = ddPctTgl.checked; cvcRenderAll(); });
  }

  // OOS file upload (opcional)
  const oosFile = document.getElementById('cvc-oos-file');
  if (oosFile) oosFile.addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (f) {
      try { await cvcLoadOOSCSV(f); }
      catch (err) { cvcShowError('oos', 'Error: ' + err.message); }
    }
  });

  // Filtro OOS estables
  const oosStable = document.getElementById('cvc-filter-oos-stable');
  if (oosStable) oosStable.addEventListener('change', () => {
    CVC_STATE.filters.oosStableOnly = oosStable.checked;
    cvcRenderTable();
  });

  // Filtro EGT compliant
  const egtFilter = document.getElementById('cvc-filter-egt-compliant');
  if (egtFilter) egtFilter.addEventListener('change', () => {
    CVC_STATE.filters.egtCompliantOnly = egtFilter.checked;
    cvcRenderTable();
  });

  // Filtro min trades por bloque (afecta cálculo EGT)
  const minTradesInp = document.getElementById('cvc-min-trades-block');
  if (minTradesInp) minTradesInp.addEventListener('change', () => {
    const v = parseInt(minTradesInp.value, 10);
    CVC_STATE.egtMinTradesPerBlock = isNaN(v) ? 0 : Math.max(0, v);
    cvcRenderAll(); // recalcula EGT y todo
  });

  // Filtro no negativos worst year
  const noNegYearFilter = document.getElementById('cvc-filter-no-neg-year');
  if (noNegYearFilter) noNegYearFilter.addEventListener('change', () => {
    CVC_STATE.filters.noNegWorstYear = noNegYearFilter.checked;
    cvcRenderTable();
  });

  // Filtro salud temporal OK (reemplaza el filtro hard "Stagnation < X días")
  const healthFilter = document.getElementById('cvc-filter-health-ok');
  if (healthFilter) healthFilter.addEventListener('change', () => {
    CVC_STATE.filters.healthOK = healthFilter.checked;
    cvcRenderTable();
  });

  // Régime Analysis: cargar settings de localStorage al inicio
  cvcLoadLS();

  // Régime Analysis: input listeners
  const regimeAssetSel = document.getElementById('cvc-regime-asset');
  if (regimeAssetSel) regimeAssetSel.addEventListener('change', () => {
    CVC_STATE.regimeAsset = regimeAssetSel.value || null;
  });
  const regimeStartInp = document.getElementById('cvc-regime-start');
  if (regimeStartInp) regimeStartInp.addEventListener('change', () => {
    CVC_STATE.regimeStartDate = regimeStartInp.value;
  });
  const regimeEndInp = document.getElementById('cvc-regime-end');
  if (regimeEndInp) regimeEndInp.addEventListener('change', () => {
    CVC_STATE.regimeEndDate = regimeEndInp.value;
  });
  const egtStrongInp = document.getElementById('cvc-egt-strong');
  if (egtStrongInp) egtStrongInp.addEventListener('change', () => {
    const v = parseFloat(egtStrongInp.value);
    if (!isNaN(v)) CVC_STATE.egtThresholds.strong = v;
  });
  const egtWeakInp = document.getElementById('cvc-egt-weak');
  if (egtWeakInp) egtWeakInp.addEventListener('change', () => {
    const v = parseFloat(egtWeakInp.value);
    if (!isNaN(v)) CVC_STATE.egtThresholds.weak = v;
  });
  // EGT v2: dirección y min bloques por régimen
  const egtDirSel = document.getElementById('cvc-egt-direction');
  if (egtDirSel) {
    egtDirSel.value = CVC_STATE.egtThresholds.direction || 'long_only';
    egtDirSel.addEventListener('change', () => {
      CVC_STATE.egtThresholds.direction = egtDirSel.value;
      cvcSaveLS();
      cvcRenderAll();
    });
  }
  const egtMinBlocksInp = document.getElementById('cvc-egt-min-blocks');
  if (egtMinBlocksInp) {
    egtMinBlocksInp.value = CVC_STATE.egtThresholds.minBlocksPerRegime || 2;
    egtMinBlocksInp.addEventListener('change', () => {
      const v = parseInt(egtMinBlocksInp.value, 10);
      if (!isNaN(v) && v >= 1) {
        CVC_STATE.egtThresholds.minBlocksPerRegime = v;
        cvcSaveLS();
        cvcRenderAll();
      }
    });
  }

  // Botón Aplicar régime analysis
  const regimeApplyBtn = document.getElementById('cvc-regime-apply');
  if (regimeApplyBtn) regimeApplyBtn.addEventListener('click', () => {
    if (!CVC_STATE.regimeAsset) { cvcShowError('regime', 'Elige primero un activo del catálogo.'); return; }
    if (!CVC_STATE.regimeStartDate || !CVC_STATE.regimeEndDate) {
      cvcShowError('regime', 'Rellena fechas de inicio y fin del backtest.'); return;
    }
    if (!CVC_STATE.oosLoaded) { cvcShowError('regime', 'Sube primero el CSV OOS por bloques.'); return; }
    const result = cvcComputeRegimeBlocks();
    if (!result) { cvcShowError('regime', 'No pude calcular bloques (revisa fechas y activo).'); return; }
    if (result.error) { cvcShowError('regime', result.error); return; }
    cvcSaveLS();
    cvcShowOk('regime', '✓ ' + result.length + ' bloques calculados sobre ' + CVC_STATE.regimeAsset);
    cvcRenderAll();
  });

  // Export
  const exp = document.getElementById('cvc-export-md');
  if (exp) exp.addEventListener('click', cvcExportMarkdown);

  // Reset
  const reset = document.getElementById('cvc-reset');
  if (reset) reset.addEventListener('click', () => {
    if (!confirm('¿Resetear todo el análisis?')) return;
    CVC_STATE.champion = null;
    CVC_STATE.challengers = [];
    CVC_STATE.rawHeaders = [];
    CVC_STATE.oosByStrategy = {};
    CVC_STATE.oosLoaded = false;
    document.getElementById('cvc-champ-file').value = '';
    document.getElementById('cvc-chal-file').value = '';
    const oosFile = document.getElementById('cvc-oos-file'); if (oosFile) oosFile.value = '';
    document.getElementById('cvc-champion-msg').textContent = '';
    document.getElementById('cvc-challengers-msg').textContent = '';
    const oosMsg = document.getElementById('cvc-oos-msg'); if (oosMsg) oosMsg.textContent = '';
    cvcRenderAll();
  });

  // Render inicial vacío
  cvcRenderAll();
})();
