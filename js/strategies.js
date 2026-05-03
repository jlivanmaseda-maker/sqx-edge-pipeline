// =============================================================================
// STRATEGIES — repositorio + modal añadir + CSV import + listeners
// Depende de: data.js, core.js
// =============================================================================
// ============================================================
// STRATEGIES — repositorio de .sqx supervivientes
// Para añadir una estrategia: usa el modal "+ Añadir estrategia" en el tab,
// pulsa "Generar JSON", copia el snippet y pégalo dentro del array.
// ============================================================

let stratFilterMining   = 'all';
let stratFilterTemplate = 'all';
let stratFilterTier     = 'all';
let stratFilterStatus   = 'all';

function tierClass(tier) {
  if (tier === '1')   return 'tier-1';
  if (tier === '1.5') return 'tier-15';
  if (tier === '2')   return 'tier-2';
  return 'tier-tentativa';
}
function tierLabel(tier) {
  if (tier === '1')   return 'TIER 1';
  if (tier === '1.5') return 'TIER 1.5';
  if (tier === '2')   return 'TIER 2';
  return 'TENTATIVA';
}
function dirClass(d) {
  if (d === 'L')   return 'dir-L';
  if (d === 'S')   return 'dir-S';
  return 'dir-LS';
}
function metricClass(label, val) {
  if (val == null) return '';
  if (label === 'PF')      return val >= 1.5 ? 'pos' : val >= 1.2 ? 'warn' : 'neg';
  if (label === 'Ret/DD')  return val >= 5   ? 'pos' : val >= 3   ? 'warn' : 'neg';
  if (label === 'R Exp')   return val >= 0.30? 'pos' : val >= 0.15? 'warn' : 'neg';
  if (label === 'DD %')    return val <  2   ? 'pos' : val <  5   ? 'warn' : 'neg';
  if (label === 'Sharpe')  return val >= 1.3 ? 'pos' : val >= 1.0 ? 'warn' : 'neg';
  if (label === 'SQN')     return val >= 1.6 ? 'pos' : val >= 1.0 ? 'warn' : 'neg';
  if (label === 'Stagn d') return val <  180 ? 'pos' : val <  365 ? 'warn' : 'neg';
  return '';
}
function fmtNum(v, dec=2) {
  if (v == null || v === '') return '—';
  if (typeof v !== 'number') v = parseFloat(v);
  if (isNaN(v)) return '—';
  return v.toLocaleString('en-US', { minimumFractionDigits:dec, maximumFractionDigits:dec });
}
function fmtInt(v) {
  if (v == null || v === '') return '—';
  return parseInt(v,10).toLocaleString('en-US');
}

function getFilteredStrategies() {
  return getAllStrategies().filter(s => {
    if (stratFilterMining   !== 'all' && String(s.mining)   !== stratFilterMining)   return false;
    if (stratFilterTemplate !== 'all' && s.template !== stratFilterTemplate) return false;
    if (stratFilterTier     !== 'all' && s.tier     !== stratFilterTier)     return false;
    if (stratFilterStatus   !== 'all' && s.status   !== stratFilterStatus)   return false;
    return true;
  });
}

function renderStratSummary() {
  const all = getAllStrategies();
  const t1  = all.filter(s => s.tier === '1').length;
  const t15 = all.filter(s => s.tier === '1.5').length;
  const t2  = all.filter(s => s.tier === '2').length;
  const tt  = all.filter(s => s.tier === 'tentativa').length;
  const deployed = all.filter(s => s.status === 'DEPLOYED').length;
  const totalProfit = all.reduce((acc,s) => acc + ((s.metrics && s.metrics.net_profit) || 0), 0);

  document.getElementById('strat-summary').innerHTML =
    '<div class="strat-summary-card"><div class="ss-count">' + all.length + '</div><div class="ss-label">Total</div></div>' +
    '<div class="strat-summary-card t1"><div class="ss-count">' + t1 + '</div><div class="ss-label">TIER 1</div></div>' +
    '<div class="strat-summary-card t15"><div class="ss-count">' + t15 + '</div><div class="ss-label">TIER 1.5</div></div>' +
    '<div class="strat-summary-card t2"><div class="ss-count">' + t2 + '</div><div class="ss-label">TIER 2</div></div>' +
    '<div class="strat-summary-card tt"><div class="ss-count">' + tt + '</div><div class="ss-label">Tentativas</div></div>' +
    '<div class="strat-summary-card"><div class="ss-count">' + deployed + '</div><div class="ss-label">Deployed</div></div>' +
    '<div class="strat-summary-card"><div class="ss-count" style="font-size:18px;">$' + fmtInt(Math.round(totalProfit)) + '</div><div class="ss-label">Σ Net Profit (BT)</div></div>';
}

function populateStratFilters() {
  const all = getAllStrategies();
  const minings   = [...new Set(all.map(s => s.mining))].sort((a,b)=>a-b);
  const templates = [...new Set(all.map(s => s.template))].sort();

  const mSel = document.getElementById('strat-filter-mining');
  mSel.innerHTML = '<option value="all">Todos</option>' + minings.map(m =>
    '<option value="'+m+'">Mining ' + m + '</option>'
  ).join('');

  const tSel = document.getElementById('strat-filter-template');
  tSel.innerHTML = '<option value="all">Todos</option>' + templates.map(t =>
    '<option value="'+t+'">' + t + '</option>'
  ).join('');
}

function renderStrategyCard(s) {
  const m = s.metrics || {};
  const dirCls = dirClass(s.direction);
  const dirTxt = s.direction === 'L' ? 'LONG' : s.direction === 'S' ? 'SHORT' : 'L+S';

  const metricsRow = [
    ['Net Profit', m.net_profit != null ? '$'+fmtNum(m.net_profit, 0) : '—', m.net_profit > 0 ? 'pos' : ''],
    ['PF',         fmtNum(m.pf),         metricClass('PF', m.pf)],
    ['Ret/DD',     fmtNum(m.ret_dd),     metricClass('Ret/DD', m.ret_dd)],
    ['DD %',       m.dd_pct != null ? fmtNum(m.dd_pct) + '%' : '—', metricClass('DD %', m.dd_pct)],
    ['Sharpe',     fmtNum(m.sharpe),     metricClass('Sharpe', m.sharpe)],
    ['R Exp',      fmtNum(m.r_exp),      metricClass('R Exp', m.r_exp)],
    ['# Trades',   fmtInt(m.trades),     ''],
    ['Win %',      m.win_pct != null ? fmtNum(m.win_pct) + '%' : '—', ''],
    [m.sqn != null ? 'SQN' : (m.stagnation_days != null ? 'Stagn d' : 'WFM $'),
      m.sqn != null ? fmtNum(m.sqn) : (m.stagnation_days != null ? fmtInt(m.stagnation_days) : (m.wfm_profit != null ? '$'+fmtInt(m.wfm_profit) : '—')),
      m.sqn != null ? metricClass('SQN', m.sqn) : (m.stagnation_days != null ? metricClass('Stagn d', m.stagnation_days) : '')],
  ];

  const metricsHtml = metricsRow.map(([lbl,val,cls]) =>
    '<div class="sc-metric"><div class="m-label">' + lbl + '</div><div class="m-val ' + cls + '">' + val + '</div></div>'
  ).join('');

  const testsOk = (s.tests_passed||[]).map(t => '<span class="sc-test-ok">✓ '+t+'</span>').join('');
  const testsKo = (s.tests_failed||[]).map(t => '<span class="sc-test-ko">✗ '+t+'</span>').join('');

  const importedCls = s._imported ? ' user-imported' : '';
  return '<div class="strat-card ' + tierClass(s.tier) + importedCls + '">' +
    '<div class="sc-head">' +
      '<span class="sc-id">' + s.id + '</span>' +
      '<span class="sc-name">' + s.name + '</span>' +
      '<span class="strat-tier-badge ' + tierClass(s.tier) + '">' + tierLabel(s.tier) + '</span>' +
      '<span class="strat-status-badge ' + s.status + '">' + s.status.replace('_',' ') + '</span>' +
    '</div>' +
    '<div class="sc-meta">' +
      '<span class="sc-meta-pill">M' + s.mining + '</span>' +
      '<span class="sc-meta-pill">' + s.asset + '</span>' +
      '<span class="sc-meta-pill">' + s.tf + '</span>' +
      '<span class="sc-meta-pill">' + s.blocksetting + '</span>' +
      '<span class="sc-meta-pill template">' + s.template + '</span>' +
      '<span class="sc-meta-pill ' + dirCls + '">' + dirTxt + '</span>' +
    '</div>' +
    '<div class="sc-indicators"><strong>Señal</strong>' + s.indicators + '</div>' +
    '<div class="sc-indicators"><strong>Exits</strong>' + s.exits + '</div>' +
    '<div class="sc-metrics">' + metricsHtml + '</div>' +
    (testsOk || testsKo ? '<div class="sc-tests">' + testsOk + testsKo + '</div>' : '') +
    (s.notes ? '<div class="sc-notes">' + s.notes + '</div>' : '') +
    '<div class="sc-footer"><span class="sc-date">📅 ' + (s.added || '—') + '</span></div>' +
  '</div>';
}

function renderStrategies() {
  populateStratFilters();
  renderStratSummary();
  // banner de importadas
  const userInfo = document.getElementById('strat-user-info');
  if (userInfo) {
    const cnt = STRATEGIES_USER.length;
    userInfo.style.display = cnt > 0 ? 'block' : 'none';
    const cntEl = document.getElementById('strat-user-count');
    if (cntEl) cntEl.textContent = cnt;
  }
  const list = getFilteredStrategies();
  const grid = document.getElementById('strat-grid');
  if (!list.length) {
    grid.innerHTML = '<div class="no-data" style="grid-column:1/-1;">Sin estrategias que coincidan con los filtros.</div>';
    return;
  }
  // sort: tier 1 → 1.5 → 2 → tentativa, dentro mismo tier por net_profit desc
  const tierRank = { '1':0, '1.5':1, '2':2, 'tentativa':3 };
  list.sort((a,b) => {
    const ta = tierRank[a.tier] ?? 99, tb = tierRank[b.tier] ?? 99;
    if (ta !== tb) return ta - tb;
    return (b.metrics.net_profit||0) - (a.metrics.net_profit||0);
  });
  grid.innerHTML = list.map(renderStrategyCard).join('');
}

function exportStrategiesCSV() {
  const headers = ['ID','Name','Mining','Asset','TF','Blocksetting','Template','Direction','Tier','Status','NetProfit','PF','Sharpe','RetDD','DDpct','Trades','WinPct','RExp','SQN','StagnationDays','TestsPassed','TestsFailed','Indicators','Exits','Notes','Added','Source'];
  const rows = getAllStrategies().map(s => {
    const m = s.metrics || {};
    return [
      s.id, s.name, s.mining, s.asset, s.tf, s.blocksetting, s.template, s.direction, s.tier, s.status,
      m.net_profit ?? '', m.pf ?? '', m.sharpe ?? '', m.ret_dd ?? '', m.dd_pct ?? '',
      m.trades ?? '', m.win_pct ?? '', m.r_exp ?? '', m.sqn ?? '', m.stagnation_days ?? '',
      (s.tests_passed||[]).join('|'), (s.tests_failed||[]).join('|'),
      (s.indicators||'').replace(/[\r\n]+/g,' '), (s.exits||'').replace(/[\r\n]+/g,' '),
      (s.notes||'').replace(/[\r\n]+/g,' '), s.added || '',
      s._imported ? 'IMPORTED' : 'DEFAULT'
    ].map(v => '"' + String(v).replace(/"/g,'""') + '"').join(';');
  });
  doExport([headers.map(h=>'"'+h+'"').join(';'), ...rows], 'SQX_estrategias.csv');
}

// ── MODAL: añadir estrategia ──
function openStratModal() { document.getElementById('strat-modal-backdrop').style.display = 'flex'; }
function closeStratModal() { document.getElementById('strat-modal-backdrop').style.display = 'none'; document.getElementById('sf-output-wrap').style.display = 'none'; }
function clearStratForm() {
  ['sf-id','sf-name','sf-template','sf-indicators','sf-exits','sf-tests-ok','sf-tests-ko','sf-notes',
   'sf-np','sf-wfm','sf-pf','sf-sharpe','sf-retdd','sf-ddpct','sf-dd','sf-trades','sf-win','sf-rexp',
   'sf-rexpscore','sf-sqn','sf-cagr','sf-stagd','sf-stagpct','sf-zprob','sf-exposure'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('sf-mining').value = '1';
  document.getElementById('sf-asset').value = 'XAUUSD';
  document.getElementById('sf-tf').value = 'H1';
  document.getElementById('sf-bs').value = 'BS_Tendencia';
  document.getElementById('sf-dir').value = 'L';
  document.getElementById('sf-tier').value = 'tentativa';
  document.getElementById('sf-status').value = 'CANDIDATA';
  document.getElementById('sf-output-wrap').style.display = 'none';
}
function numOrNull(id) {
  const v = document.getElementById(id).value.trim();
  if (v === '') return null;
  const n = parseFloat(v); return isNaN(n) ? null : n;
}
function intOrNull(id) {
  const v = document.getElementById(id).value.trim();
  if (v === '') return null;
  const n = parseInt(v,10); return isNaN(n) ? null : n;
}
function strOrEmpty(id) { return (document.getElementById(id).value || '').trim(); }
function listFromCSV(id) {
  const v = strOrEmpty(id); if (!v) return [];
  return v.split(',').map(x => x.trim()).filter(Boolean);
}
function generateStratJSON() {
  const obj = {
    id:           strOrEmpty('sf-id') || '0.000000',
    name:         strOrEmpty('sf-name') || 'Sin nombre',
    mining:       parseInt(document.getElementById('sf-mining').value,10) || 1,
    asset:        strOrEmpty('sf-asset') || 'XAUUSD',
    tf:           document.getElementById('sf-tf').value,
    blocksetting: document.getElementById('sf-bs').value,
    template:     strOrEmpty('sf-template') || 'UNKNOWN',
    direction:    document.getElementById('sf-dir').value,
    indicators:   strOrEmpty('sf-indicators'),
    exits:        strOrEmpty('sf-exits'),
    metrics: {}
  };
  // métricas - solo incluir las rellenadas
  const M = obj.metrics;
  const np = numOrNull('sf-np');         if (np   !== null) M.net_profit = np;
  const wf = numOrNull('sf-wfm');        if (wf   !== null) M.wfm_profit = wf;
  const pf = numOrNull('sf-pf');         if (pf   !== null) M.pf = pf;
  const sh = numOrNull('sf-sharpe');     if (sh   !== null) M.sharpe = sh;
  const rd = numOrNull('sf-retdd');      if (rd   !== null) M.ret_dd = rd;
  const dp = numOrNull('sf-ddpct');      if (dp   !== null) M.dd_pct = dp;
  const dd = numOrNull('sf-dd');         if (dd   !== null) M.dd = dd;
  const tr = intOrNull('sf-trades');     if (tr   !== null) M.trades = tr;
  const wn = numOrNull('sf-win');        if (wn   !== null) M.win_pct = wn;
  const re = numOrNull('sf-rexp');       if (re   !== null) M.r_exp = re;
  const rs = numOrNull('sf-rexpscore');  if (rs   !== null) M.r_exp_score = rs;
  const sq = numOrNull('sf-sqn');        if (sq   !== null) M.sqn = sq;
  const cg = numOrNull('sf-cagr');       if (cg   !== null) M.cagr = cg;
  const sd = intOrNull('sf-stagd');      if (sd   !== null) M.stagnation_days = sd;
  const sp = numOrNull('sf-stagpct');    if (sp   !== null) M.stagnation_pct = sp;
  const zp = numOrNull('sf-zprob');      if (zp   !== null) M.z_probability = zp;
  const ex = numOrNull('sf-exposure');   if (ex   !== null) M.exposure = ex;

  obj.tier         = document.getElementById('sf-tier').value;
  obj.status       = document.getElementById('sf-status').value;
  obj.tests_passed = listFromCSV('sf-tests-ok');
  obj.tests_failed = listFromCSV('sf-tests-ko');
  obj.notes        = strOrEmpty('sf-notes');
  obj.added        = new Date().toISOString().slice(0,10);

  const json = JSON.stringify(obj, null, 2);
  // imprime con coma final lista para pegar
  const snippet = '  ' + json.replace(/\n/g, '\n  ') + ',';
  document.getElementById('sf-output').textContent = snippet;
  document.getElementById('sf-output-wrap').style.display = 'block';
}

// ── ESTRATEGIAS: filtros + modal listeners ──
// ── ESTRATEGIAS: filtros + modal ──
bindBtns('[data-strat-tier]', 'stratTier', function(v){ stratFilterTier = v; }, renderStrategies);
document.getElementById('strat-filter-mining').addEventListener('change',  function(e){ stratFilterMining   = e.target.value; renderStrategies(); });
document.getElementById('strat-filter-template').addEventListener('change',function(e){ stratFilterTemplate = e.target.value; renderStrategies(); });
document.getElementById('strat-filter-status').addEventListener('change',  function(e){ stratFilterStatus   = e.target.value; renderStrategies(); });
document.getElementById('strat-export-btn').addEventListener('click', exportStrategiesCSV);

document.getElementById('strat-add-btn').addEventListener('click', openStratModal);
document.getElementById('strat-modal-close').addEventListener('click', closeStratModal);
document.getElementById('strat-modal-backdrop').addEventListener('click', function(e){
  if (e.target === this) closeStratModal();
});
document.getElementById('sf-generate').addEventListener('click', generateStratJSON);
document.getElementById('sf-clear').addEventListener('click', clearStratForm);
document.getElementById('sf-copy').addEventListener('click', function(){
  const txt = document.getElementById('sf-output').textContent;
  navigator.clipboard.writeText(txt).then(function(){
    const btn = document.getElementById('sf-copy');
    const old = btn.textContent;
    btn.textContent = '✓ Copiado';
    setTimeout(function(){ btn.textContent = old; }, 1500);
  }, function(){ alert('No se pudo copiar al portapapeles. Selecciona el texto manualmente.'); });
});
document.addEventListener('keydown', function(e){
  if (e.key === 'Escape') {
    if (document.getElementById('strat-modal-backdrop').style.display !== 'none') closeStratModal();
    if (document.getElementById('strat-import-backdrop').style.display !== 'none') closeImportModal();
    const psm = document.getElementById('ps-add-mining-backdrop');
    const psp = document.getElementById('ps-add-phase-backdrop');
    if (psm && psm.style.display !== 'none') closeAddMiningModal();
    if (psp && psp.style.display !== 'none') closeAddPhaseModal();
  }
});

// ── CSV IMPORT (Databank Export SQX) ──
// ============================================================
// CSV IMPORT — Databank Export de SQX
// ============================================================
const STRAT_USER_KEY = 'sqx_strategies_user_v1';
let STRATEGIES_USER = [];
try { STRATEGIES_USER = JSON.parse(localStorage.getItem(STRAT_USER_KEY) || '[]'); } catch(e){ STRATEGIES_USER = []; }
function saveStrategiesUser() { localStorage.setItem(STRAT_USER_KEY, JSON.stringify(STRATEGIES_USER)); }

const SQX_COLUMN_MAP = {
  'Strategy Name':         '_strategy_name',
  'TimeFrame':             'tf',
  'Symbol':                '_symbol',
  'Net profit':            'm.net_profit',
  'Fitness':               'm.fitness',
  'Net profit in %':       'm.net_profit_pct',
  'Drawdown':              'm.dd',
  'Max DD %':              'm.dd_pct',
  'Open Drawdown %':       'm.open_dd_pct',
  'Max Intraday Drawdown': 'm.max_intraday_dd',
  'Ret/DD Ratio':          'm.ret_dd',
  'Annual % Return':       'm.annual_pct_return',
  'Sharpe Ratio':          'm.sharpe',
  'Profit factor':         'm.pf',
  '# of trades':           'm.trades',
  '# of profits':          'm.wins',
  '# of losses':           'm.losses',
  'Max Consec. Wins':      'm.max_consec_wins',
  'Max Consec. Losses':    'm.max_consec_losses',
  'Winning Percent':       'm.win_pct',
  'Avg. Trades Per Month': 'm.trades_per_month',
  'Longest trade (days)':  'm.longest_trade_days',
  'Entry indicators':      'indicators',
  'Exit quality':          'm.exit_quality',
  'Complexity':            'm.complexity',
  'EquityAngle':           'm.equity_angle',
  'Stagnation':            'm.stagnation_days',
  'Exposure Position':     'm.exposure',
  'RecoveryFactor':        'm.recovery_factor',
  'ZScore':                'm.z_score',
  'SQN Score':             'm.sqn',
  'R Expectancy':          'm.r_exp',
  'StandardDev':           'm.std_dev',
  'Payout ratio':          'm.payout_ratio',
  'Avg. Bars in Trade':    'm.avg_bars_in_trade',
};

function autoDetectTemplate(indicators) {
  if (!indicators) return null;
  const ind = indicators.toUpperCase();
  if (ind.includes('LINEARREGRESSION')) return 'LINEAR';
  if (ind.includes('ICHIMOKU'))         return 'ICHIMOKU';
  if (ind.includes('SUPERTREND'))       return 'SUPER';
  if (ind.includes('MACD'))             return 'MACD';
  if (ind.includes('PARABOLICSAR'))     return 'SAR';
  if (ind.includes('EMA') || ind.includes('SMA')) return 'EMA';
  if (ind.includes('STOCHASTIC') || ind.includes('STOCH')) return 'STOCH';
  if (ind.includes('RSI'))              return 'RSI';
  if (ind.includes('CCI'))              return 'CCI';
  if (ind.includes('BOLLINGER'))        return 'BOLLINGER';
  if (ind.includes('KELTNER'))          return 'KELTNER';
  if (ind.includes('DONCHIAN'))         return 'DONCHIAN';
  if (ind.includes('ADX'))              return 'ADX';
  if (ind.includes('ATR'))              return 'ATR';
  return null;
}

// Parser CSV simple — separador configurable, soporte comillas con escape ""
function parseCSV(text, sep) {
  const rows = [];
  let cur = '', inQuotes = false, row = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i+1];
    if (inQuotes) {
      if (c === '"' && n === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { cur += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === sep) { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c === '\r') { /* skip */ }
      else { cur += c; }
    }
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
}

function detectSeparator(text) {
  const sample = text.split('\n')[0] || '';
  const semis = (sample.match(/;/g) || []).length;
  const commas = (sample.match(/,/g) || []).length;
  return semis > commas ? ';' : ',';
}

const csvImport = {
  step: 1, rows: [], headers: [], mapping: {}, selected: new Set(), filter: '', sortCol: null, sortDir: 'desc'
};

function openImportModal() {
  csvImport.step = 1; csvImport.rows = []; csvImport.headers = []; csvImport.mapping = {};
  csvImport.selected = new Set(); csvImport.filter = ''; csvImport.sortCol = null; csvImport.sortDir = 'desc';
  document.getElementById('csv-file-info').style.display = 'none';
  document.getElementById('csv-mapping-summary').innerHTML = '';
  document.getElementById('strat-import-backdrop').style.display = 'flex';
  showStep(1);
}
function closeImportModal() { document.getElementById('strat-import-backdrop').style.display = 'none'; }

function showStep(n) {
  csvImport.step = n;
  for (let i = 1; i <= 4; i++) {
    const pane = document.getElementById('csv-pane-'+i);
    pane.style.display = (i === n) ? 'block' : 'none';
    pane.classList.toggle('active', i === n);
    const stepEl = document.querySelector('.csv-step[data-step="'+i+'"]');
    stepEl.classList.toggle('active', i === n);
    stepEl.classList.toggle('done', i < n);
  }
  document.getElementById('csv-back-btn').disabled = (n === 1);
  const next = document.getElementById('csv-next-btn');
  const finish = document.getElementById('csv-finish-btn');
  if (n === 4) { next.style.display = 'none'; finish.style.display = 'inline-block'; }
  else { next.style.display = 'inline-block'; finish.style.display = 'none'; }
  // habilita next según condiciones
  if (n === 1) next.disabled = csvImport.rows.length === 0;
  else if (n === 3) next.disabled = csvImport.selected.size === 0;
  else next.disabled = false;

  if (n === 3) renderCsvPreview();
  if (n === 4) renderCsvConfirm();
}

function readCsvFile(file) {
  const r = new FileReader();
  r.onload = function(ev) {
    const text = ev.target.result;
    const sep = detectSeparator(text);
    const rows = parseCSV(text, sep);
    if (rows.length < 2) { alert('CSV vacío o no válido.'); return; }
    csvImport.headers = rows[0];
    csvImport.rows = rows.slice(1).map(r => {
      const obj = {};
      csvImport.headers.forEach((h, i) => { obj[h] = (r[i] !== undefined ? r[i] : ''); });
      return obj;
    });
    // mapping automático
    csvImport.mapping = {};
    csvImport.headers.forEach(h => { if (SQX_COLUMN_MAP[h]) csvImport.mapping[h] = SQX_COLUMN_MAP[h]; });
    const recognized = Object.keys(csvImport.mapping).length;
    const total = csvImport.headers.length;
    document.getElementById('csv-file-name').textContent = file.name;
    document.getElementById('csv-file-meta').textContent = (file.size/1024).toFixed(1)+' KB · separador "'+sep+'" · '+csvImport.rows.length+' filas · '+total+' columnas';
    const ok = recognized === total ? 'var(--green)' : (recognized >= total*0.7 ? 'var(--accent)' : 'var(--yellow)');
    document.getElementById('csv-mapping-summary').innerHTML =
      '<span style="color:'+ok+'; font-weight:700;">'+recognized+'/'+total+'</span> columnas reconocidas automáticamente del esquema SQX. ' +
      (recognized < total ? '<span style="color:var(--text2);">Las no reconocidas se ignoran al importar.</span>' : '');
    document.getElementById('csv-file-info').style.display = 'block';
    // auto-seleccionar todas
    csvImport.selected = new Set(csvImport.rows.map((_,i)=>i));
    showStep(1); // refresh next button
  };
  r.readAsText(file, 'UTF-8');
}

function getCsvFilteredRows() {
  const q = csvImport.filter.toLowerCase().trim();
  let rows = csvImport.rows.map((r,i) => ({_idx:i, ...r}));
  if (q) {
    rows = rows.filter(r =>
      (r['Strategy Name']||'').toLowerCase().includes(q) ||
      (r['Entry indicators']||'').toLowerCase().includes(q)
    );
  }
  if (csvImport.sortCol) {
    const col = csvImport.sortCol;
    const dir = csvImport.sortDir === 'asc' ? 1 : -1;
    rows.sort((a,b) => {
      const va = parseFloat(a[col]); const vb = parseFloat(b[col]);
      const na = isNaN(va), nb = isNaN(vb);
      if (na && nb) return (a[col]||'').localeCompare(b[col]||'') * dir;
      if (na) return 1; if (nb) return -1;
      return (va - vb) * dir;
    });
  }
  return rows;
}

function renderCsvPreview() {
  const rows = getCsvFilteredRows();
  document.getElementById('csv-row-count').textContent = csvImport.rows.length;
  document.getElementById('csv-selected-count').textContent = csvImport.selected.size;
  const cols = ['Strategy Name','Net profit','Profit factor','Sharpe Ratio','Ret/DD Ratio','Max DD %','# of trades','Winning Percent','SQN Score','R Expectancy','Stagnation','Entry indicators'];
  const head = '<thead><tr><th style="width:30px;"><input type="checkbox" id="csv-th-check"></th>' +
    cols.map(c => {
      const isNum = c !== 'Strategy Name' && c !== 'Entry indicators';
      const arrow = csvImport.sortCol === c ? (csvImport.sortDir==='asc'?' ▲':' ▼') : '';
      return '<th class="sortable" data-col="'+c+'">'+c+arrow+'</th>';
    }).join('') + '<th>TPL</th></tr></thead>';
  const body = '<tbody>' + rows.map(r => {
    const idx = r._idx;
    const checked = csvImport.selected.has(idx) ? 'checked' : '';
    const tpl = autoDetectTemplate(r['Entry indicators']) || '—';
    const cells = cols.map(c => {
      const v = r[c] || '';
      if (c === 'Strategy Name') return '<td class="cv-id">'+v+'</td>';
      if (c === 'Entry indicators') return '<td style="font-size:11px; color:var(--text2); max-width:280px; white-space:normal;">'+v+'</td>';
      const num = parseFloat(v);
      let cls = '';
      if (!isNaN(num)) {
        if (c === 'Profit factor')   cls = num >= 1.5 ? 'pos' : num >= 1.2 ? 'warn' : 'neg';
        if (c === 'Sharpe Ratio')    cls = num >= 1.3 ? 'pos' : num >= 1.0 ? 'warn' : 'neg';
        if (c === 'Ret/DD Ratio')    cls = num >= 5   ? 'pos' : num >= 3   ? 'warn' : 'neg';
        if (c === 'Max DD %')        cls = num <  2   ? 'pos' : num <  5   ? 'warn' : 'neg';
        if (c === 'R Expectancy')    cls = num >= 0.30? 'pos' : num >= 0.15? 'warn' : 'neg';
        if (c === 'SQN Score')       cls = num >= 1.6 ? 'pos' : num >= 1.0 ? 'warn' : 'neg';
        if (c === 'Stagnation')      cls = num <  180 ? 'pos' : num <  365 ? 'warn' : 'neg';
        if (c === 'Net profit')      cls = num > 0    ? 'pos' : 'neg';
      }
      return '<td class="cv-num '+cls+'">'+v+'</td>';
    }).join('');
    return '<tr><td><input type="checkbox" class="cv-row-check" data-idx="'+idx+'" '+checked+'></td>' + cells + '<td><span class="cv-tpl">'+tpl+'</span></td></tr>';
  }).join('') + '</tbody>';
  const t = document.getElementById('csv-preview-table');
  t.innerHTML = head + body;
  // events
  document.getElementById('csv-th-check').checked = (csvImport.selected.size === csvImport.rows.length);
  document.getElementById('csv-th-check').addEventListener('change', function(){
    if (this.checked) csvImport.selected = new Set(csvImport.rows.map((_,i)=>i));
    else csvImport.selected = new Set();
    renderCsvPreview(); showStep(3);
  });
  t.querySelectorAll('.cv-row-check').forEach(cb => cb.addEventListener('change', function(){
    const i = parseInt(this.dataset.idx,10);
    if (this.checked) csvImport.selected.add(i); else csvImport.selected.delete(i);
    document.getElementById('csv-selected-count').textContent = csvImport.selected.size;
    document.getElementById('csv-next-btn').disabled = csvImport.selected.size === 0;
  }));
  t.querySelectorAll('th.sortable').forEach(th => th.addEventListener('click', function(){
    const c = this.dataset.col;
    if (csvImport.sortCol === c) csvImport.sortDir = csvImport.sortDir === 'asc' ? 'desc' : 'asc';
    else { csvImport.sortCol = c; csvImport.sortDir = 'desc'; }
    renderCsvPreview();
  }));
}

function renderCsvConfirm() {
  const meta = readImportMeta();
  const sel = csvImport.selected.size;
  const sample = Array.from(csvImport.selected).slice(0,5).map(i => 'Strategy ' + (csvImport.rows[i]['Strategy Name']||'').replace(/^Strategy /,'')).join(', ');
  document.getElementById('csv-confirm-summary').innerHTML =
    '<div><strong>'+sel+'</strong> estrategia(s) se importarán.</div>' +
    '<div style="margin-top:6px;">Mining <strong>'+meta.mining+'</strong> · '+meta.bs+' · Template default <strong>'+(meta.template||'(auto-detect)')+'</strong> · Dirección <strong>'+meta.dir+'</strong> · TIER <strong>'+meta.tier+'</strong> · Status <strong>'+meta.status+'</strong></div>' +
    (sample ? '<div style="margin-top:6px; font-size:12px; color:var(--text2);">Primeras: '+sample+(sel>5?'…':'')+'</div>' : '');
}

function readImportMeta() {
  return {
    mining:       parseInt(document.getElementById('csv-meta-mining').value, 10) || 1,
    bs:           document.getElementById('csv-meta-bs').value,
    template:     (document.getElementById('csv-meta-template').value || '').trim(),
    autoTemplate: document.getElementById('csv-meta-autotemplate').value === 'yes',
    dir:          document.getElementById('csv-meta-dir').value,
    tier:         document.getElementById('csv-meta-tier').value,
    status:       document.getElementById('csv-meta-status').value,
    phase:        document.getElementById('csv-meta-phase').value,
    notes:        (document.getElementById('csv-meta-notes').value || '').trim(),
  };
}

function rowToStrategy(row, meta) {
  const sn = (row['Strategy Name'] || '').trim();
  const id = sn.replace(/^Strategy\s+/i, '') || sn;
  const indicators = row['Entry indicators'] || '';
  let template = meta.template || 'UNKNOWN';
  if (meta.autoTemplate) {
    const auto = autoDetectTemplate(indicators);
    if (auto) template = auto;
  }
  const numFields = ['m.net_profit','m.fitness','m.net_profit_pct','m.dd','m.dd_pct','m.open_dd_pct','m.max_intraday_dd','m.ret_dd','m.annual_pct_return','m.sharpe','m.pf','m.win_pct','m.trades_per_month','m.exit_quality','m.equity_angle','m.exposure','m.recovery_factor','m.z_score','m.sqn','m.r_exp','m.std_dev','m.payout_ratio','m.avg_bars_in_trade'];
  const intFields = ['m.trades','m.wins','m.losses','m.max_consec_wins','m.max_consec_losses','m.longest_trade_days','m.complexity','m.stagnation_days'];
  const metrics = {};
  Object.entries(SQX_COLUMN_MAP).forEach(([col, target]) => {
    if (!target.startsWith('m.')) return;
    const key = target.slice(2);
    const raw = row[col];
    if (raw == null || raw === '') return;
    if (intFields.includes(target))      { const n = parseInt(raw,10);   if (!isNaN(n)) metrics[key] = n; }
    else if (numFields.includes(target)) { const n = parseFloat(raw);    if (!isNaN(n)) metrics[key] = n; }
    else metrics[key] = raw;
  });
  let asset = (row['Symbol'] || '').replace(/_darwinex$/i,'').replace(/_[a-z]+$/i,'').toUpperCase() || 'XAUUSD';
  let tf = (row['TimeFrame'] || '').toUpperCase() || 'H1';
  const noteParts = [];
  if (meta.phase) noteParts.push('Fase: '+meta.phase);
  if (meta.notes) noteParts.push(meta.notes);
  return {
    id: id,
    name: indicators ? indicators.split(',').slice(0,3).join(' + ') : 'Sin nombre',
    mining: meta.mining,
    asset: asset,
    tf: tf,
    blocksetting: meta.bs,
    template: template,
    direction: meta.dir,
    indicators: indicators,
    exits: '— (no en CSV)',
    metrics: metrics,
    tier: meta.tier,
    status: meta.status,
    tests_passed: [],
    tests_failed: [],
    notes: noteParts.join(' · '),
    added: new Date().toISOString().slice(0,10),
    _imported: true,
    _import_id: 'imp_' + Date.now() + '_' + id
  };
}

function commitImport() {
  const meta = readImportMeta();
  const newOnes = Array.from(csvImport.selected).map(i => rowToStrategy(csvImport.rows[i], meta));
  // dedupe contra existentes (mismo id + mining + template)
  const existingKeys = new Set([...STRATEGIES, ...STRATEGIES_USER].map(s => s.id+'|'+s.mining+'|'+s.template));
  const fresh = newOnes.filter(s => !existingKeys.has(s.id+'|'+s.mining+'|'+s.template));
  const dups = newOnes.length - fresh.length;
  STRATEGIES_USER = [...STRATEGIES_USER, ...fresh];
  saveStrategiesUser();
  closeImportModal();
  renderStrategies();
  renderPipelineState();
  alert('✓ Importadas: '+fresh.length + (dups ? ' (omitidas '+dups+' duplicadas)' : ''));
}

// override de getAllStrategies y refactor de filtros
function getAllStrategies() {
  return [...STRATEGIES, ...STRATEGIES_USER];
}

// ── consolidate (todo el array a JSON para pegar al HTML) ──
function consolidateStrategiesJSON() {
  const all = getAllStrategies().map(s => {
    const c = JSON.parse(JSON.stringify(s));
    delete c._imported; delete c._import_id;
    return c;
  });
  const json = JSON.stringify(all, null, 2);
  const wrapper = '// REEMPLAZA el contenido del array `const STRATEGIES = [ ... ];` con esto:\nconst STRATEGIES = ' + json + ';';
  // muestra en un modal simple usando el sf-output-wrap si está cerrado, si no en alert
  const w = window.open('', '_blank', 'width=900,height=700');
  if (w) {
    w.document.write('<html><head><title>SQX Strategies — Consolidado</title><style>body{background:#0f1117;color:#e4e4e7;font-family:Segoe UI,sans-serif;padding:20px;}h1{font-size:16px;margin-bottom:10px;}p{color:#9ca3af;font-size:12px;margin-bottom:14px;}pre{background:#0a0c12;border:1px solid #2e3348;border-radius:8px;padding:14px;font-family:Consolas,monospace;font-size:12px;color:#9eb1d3;line-height:1.5;overflow:auto;max-height:80vh;white-space:pre-wrap;}button{margin-bottom:10px;padding:8px 16px;background:#22c55e;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;}</style></head><body>');
    w.document.write('<h1>💾 Consolidado: '+all.length+' estrategias</h1>');
    w.document.write('<p>Pega esto reemplazando el bloque <code>const STRATEGIES = [ ... ];</code> al inicio del JS principal del HTML.</p>');
    w.document.write('<button onclick="navigator.clipboard.writeText(document.getElementById(\'cn\').textContent).then(()=>this.textContent=\'✓ Copiado\')">📋 Copiar al portapapeles</button>');
    w.document.write('<pre id="cn">'+wrapper.replace(/[<>&]/g, c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))+'</pre>');
    w.document.write('</body></html>');
    w.document.close();
  } else {
    navigator.clipboard.writeText(wrapper);
    alert('Popup bloqueado. He copiado el JSON al portapapeles ('+all.length+' estrategias).');
  }
}

// ── listeners CSV import ──
document.getElementById('strat-import-btn').addEventListener('click', openImportModal);
document.getElementById('strat-import-close').addEventListener('click', closeImportModal);
document.getElementById('strat-import-backdrop').addEventListener('click', function(e){ if (e.target === this) closeImportModal(); });
document.getElementById('csv-cancel-btn').addEventListener('click', closeImportModal);
document.getElementById('csv-back-btn').addEventListener('click', function(){ if (csvImport.step > 1) showStep(csvImport.step - 1); });
document.getElementById('csv-next-btn').addEventListener('click', function(){ if (csvImport.step < 4) showStep(csvImport.step + 1); });
document.getElementById('csv-finish-btn').addEventListener('click', commitImport);

const dz = document.getElementById('csv-dropzone');
dz.addEventListener('click', function(){ document.getElementById('strat-import-file').click(); });
dz.addEventListener('dragover', function(e){ e.preventDefault(); dz.classList.add('drag-over'); });
dz.addEventListener('dragleave', function(){ dz.classList.remove('drag-over'); });
dz.addEventListener('drop', function(e){
  e.preventDefault(); dz.classList.remove('drag-over');
  const f = e.dataTransfer.files[0]; if (f) readCsvFile(f);
});
document.getElementById('strat-import-file').addEventListener('change', function(e){
  const f = e.target.files[0]; if (f) readCsvFile(f);
});

document.getElementById('csv-filter-input').addEventListener('input', function(e){
  csvImport.filter = e.target.value; renderCsvPreview();
});
document.getElementById('csv-select-all').addEventListener('click', function(){
  getCsvFilteredRows().forEach(r => csvImport.selected.add(r._idx));
  renderCsvPreview(); document.getElementById('csv-next-btn').disabled = false;
});
document.getElementById('csv-select-none').addEventListener('click', function(){
  getCsvFilteredRows().forEach(r => csvImport.selected.delete(r._idx));
  renderCsvPreview(); document.getElementById('csv-next-btn').disabled = csvImport.selected.size === 0;
});
document.getElementById('csv-select-top10').addEventListener('click', function(){
  const sorted = [...csvImport.rows].map((r,i)=>({_idx:i, np: parseFloat(r['Net profit'])||0}))
    .sort((a,b)=>b.np-a.np).slice(0,10);
  csvImport.selected = new Set(sorted.map(s=>s._idx));
  renderCsvPreview(); document.getElementById('csv-next-btn').disabled = false;
});

document.getElementById('strat-consolidate-btn').addEventListener('click', consolidateStrategiesJSON);
document.getElementById('strat-clear-user-btn').addEventListener('click', function(){
  if (!STRATEGIES_USER.length) return;
  if (confirm('¿Borrar las '+STRATEGIES_USER.length+' estrategias importadas? Las del HTML se mantienen.')) {
    STRATEGIES_USER = []; saveStrategiesUser(); renderStrategies(); renderPipelineState();
  }
});
