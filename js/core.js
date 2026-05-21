// =============================================================================
// CORE — STATE, helpers, SCORES system, history charts, sqxLegend, sort utils
// Depende de: data.js
// =============================================================================
// ============================================================
// STATE
// ============================================================

const STATE = {
  selectedAsset:   null,
  filterType:      'all',
  filterDir:       'all',
  filterMat:       'all',
  filterMatRating: 'all',
  filterMatDir:    'all',
  filterMatTf:     'all',
  filterCatRating: 'all',
  filterCatSub:    'all',
  filterCatTf:     'all',
  filterTpDir:     'all',
  assetSort:       'name',
  heatmapMode:     true,
};
// Proxy shortcuts for backward compat with render functions
let selectedAsset   = null;
let filterType      = 'all';
let filterSqx       = 'all';
let filterDir       = 'all';
let filterMat       = 'all';
let filterMatRating = 'all';
let filterMatDir    = 'all';
let filterMatTf     = 'all';
let filterCatRating = 'all';
let filterCatSub    = 'all';
let filterCatTf     = 'all';
let filterTpDir     = 'all';
let assetSort       = 'name';
let heatmapMode     = 'composite';  // default: data-driven con composite numérico

const sortState   = { cat:{}, mat:{ col:null, dir:null } };
const collapseMap = {};

// ============================================================
// SCORE
// ============================================================
function calcScore(asset, dirFilter) {
  let total = 0, count = 0;
  for (const [, val] of Object.entries(asset.cats)) {
    if (dirFilter === 'L' && val.dir === 'S') continue;
    if (dirFilter === 'S' && val.dir === 'L') continue;
    total += RATING_ORDER[val.rating] ?? 0;
    count++;
  }
  return { raw: total, count, norm: count ? Math.round((total / (count * 3)) * 100) : 0 };
}

// ============================================================
// HELPERS
// ============================================================
function rLabel(r) {
  if (r==='++') return { text:'Estrella', cls:'rating-pp' };
  if (r==='+')  return { text:'Bueno',    cls:'rating-p'  };
  if (r==='~')  return { text:'Precauc.', cls:'rating-t'  };
  return { text:'No recom.', cls:'rating-m' };
}
function hmCls(r) {
  if (r==='++') return 'hm-pp'; if (r==='+') return 'hm-p';
  if (r==='~')  return 'hm-t';  if (r==='-') return 'hm-m';
  return '';
}
function dirCls(d) {
  return d==='L' ? 'dir-long' : d==='S' ? 'dir-short' : 'dir-both';
}

// SQX Config: A = Both + Entry Symmetry, B = Both sin symmetry, C = Only Long, D = Only Short
function getSqxConfig(asset) {
  const keys = Object.keys(asset.cats);
  let hasL=false, hasS=false, hasLS=false, hasPair=false;
  for (const k of keys) {
    const v = asset.cats[k];
    if (v.dir === 'L/S') hasLS = true;
    else if (v.dir === 'L') hasL = true;
    else if (v.dir === 'S') hasS = true;
    if (k.endsWith('_S')) hasPair = true;
  }
  // A: forex sim (todas L/S, sin pares _S)
  if (hasLS && !hasPair && !hasL && !hasS) {
    return { code:'A', label:'Both + Entry Sym', desc:'Both (Long & Short) con Entry Symmetry ON. Reglas espejadas L/S — ideal para forex simétrico.' };
  }
  // B: tiene pares _S (reglas distintas L vs S)
  if (hasPair) {
    return { code:'B', label:'Both sin Symmetry', desc:'Both (Long & Short) con Symmetry OFF. SQX optimiza L y S por separado — necesario cuando las reglas Long ≠ Short (índices, oro).' };
  }
  // C: solo Long
  if (hasL && !hasS) {
    return { code:'C', label:'Only Long', desc:'Only Long. Solo se buscan estrategias en lado Long.' };
  }
  // D: solo Short
  if (hasS && !hasL) {
    return { code:'D', label:'Only Short', desc:'Only Short. Solo se buscan estrategias en lado Short.' };
  }
  // mixto raro (L y S sin pares _S → tratar como B)
  return { code:'B', label:'Both sin Symmetry', desc:'Both (Long & Short) con Symmetry OFF. SQX optimiza L y S por separado.' };
}
function sqxBadge(asset, mini=false) {
  const c = getSqxConfig(asset);
  const cls = mini ? `sqx-mini sqx-${c.code}` : `sqx-badge sqx-${c.code}`;
  const title = `Config SQX ${c.code}: ${c.desc}`;
  if (mini) return `<span class="${cls}" title="${title}">SQX ${c.code}</span>`;
  return `<span class="${cls}" title="${title}"><span class="sqx-letter">${c.code}</span><span>SQX · ${c.label}</span></span>`;
}

// Replica visual del panel "Trading directions settings" de SQX según el código de config (A/B/C/D)
function sqxPreviewHTML(code) {
  const isLong  = code === 'C';
  const isShort = code === 'D';
  const isBoth  = code === 'A' || code === 'B';
  const entrySymOn = code === 'A';
  const symDisabled = isLong || isShort;
  return ''
    + '<div class="sqx-preview">'
    +   '<div class="sqx-preview-header">Trading directions settings</div>'
    +   '<div class="sqx-preview-body">'
    +     '<div class="sqx-preview-title">Strategy directions</div>'
    +     '<div class="sqx-preview-row">'
    +       '<div class="sqx-radios">'
    +         '<div class="sqx-radio'+(isBoth?' active':'')+'"><span class="sqx-radio-dot"></span>Both (Long and Short)</div>'
    +         '<div class="sqx-radio'+(isLong?' active':'')+'"><span class="sqx-radio-dot"></span>Only Long</div>'
    +         '<div class="sqx-radio'+(isShort?' active':'')+'"><span class="sqx-radio-dot"></span>Only Short</div>'
    +       '</div>'
    +       '<div class="sqx-toggles">'
    +         '<div class="sqx-toggle'+(entrySymOn?' on':'')+(symDisabled?' disabled':'')+'"><span class="sqx-toggle-track"><span class="sqx-toggle-knob"></span></span>Entry Symmetry</div>'
    +         '<div class="sqx-toggle'+(symDisabled?' disabled':'')+'"><span class="sqx-toggle-track"><span class="sqx-toggle-knob"></span></span>Exit Symmetry</div>'
    +       '</div>'
    +     '</div>'
    +   '</div>'
    + '</div>';
}


let HISTORICAL = {};
try {
  const _hd = document.getElementById('historical-data');
  const _txt = _hd && _hd.textContent.trim();
  if (_txt && !_txt.startsWith('__')) HISTORICAL = JSON.parse(_txt);
} catch(e) { console.warn('No se pudo parsear historical-data:', e); }

// Data-driven scores multi-TF (Dukascopy 2010-2026). Default H1, toggleable.
// Se cargan via fetch async desde analysis_output/ (servidos por Flask).
// Fallback: si fetch falla, intenta leer scripts inline <script id="scores-data*"> (modo file:// legacy).
const SCORES_ALL = {};
const SCORES_TFS = ['H4', 'H1', 'M30', 'M15', 'M5'];
let CURRENT_SCORES_TF = 'AUTO';  // por defecto cada fila usa su TF recomendado
let SCORES = {};                 // SCORES global (override fallback), se rellena tras loadAllScores

// ============================================================
// DUKAS DATA QUALITY (generado por scripts/analyze_dukas_csv_quality.py --json)
// ============================================================
let DUKAS_QUALITY = null;
async function loadDukasQuality() {
  try {
    const r = await fetch('data/dukas_quality.json', { cache: 'no-store' });
    if (r.ok) {
      DUKAS_QUALITY = await r.json();
      console.log('Dukas quality cargada para ' + Object.keys(DUKAS_QUALITY.assets || {}).length + ' activos');
    }
  } catch (e) { /* JSON no disponible, ok */ }
}

/** Devuelve el peor verdict entre los TFs del activo (worst-of), para el badge del grid. */
function dukasBadge(assetId, opts = {}) {
  if (!DUKAS_QUALITY || !DUKAS_QUALITY.assets[assetId]) return '';
  const tfs = DUKAS_QUALITY.assets[assetId];
  const tfList = Object.keys(tfs);
  if (!tfList.length) return '';
  // Buscar el "mejor" TF (el que tiene verdict más permisivo)
  const verdictRank = { opc2_ok: 0, opc2_limited: 1, opc1_recommended: 2, opc1_only: 3 };
  let best = null;
  for (const tf of tfList) {
    const v = tfs[tf];
    if (!best || verdictRank[v.verdict] < verdictRank[best.verdict]) {
      best = { ...v, tf };
    }
  }
  if (!best) return '';
  const cleanYear = best.first_clean_year || '?';
  const cfg = {
    opc2_ok:           { color: '#22c55e', icon: '✅', label: `Dukas ${cleanYear}+` },
    opc2_limited:      { color: '#fbbf24', icon: '⚠',  label: `Dukas ${cleanYear}+` },
    opc1_recommended:  { color: '#fb923c', icon: '⚠',  label: `Dukas ${cleanYear}+` },
    opc1_only:         { color: '#ef4444', icon: '🔴', label: 'Sin Dukas' },
  }[best.verdict] || { color: '#6b7280', icon: '?', label: '?' };
  const tip = `Dukas H1: ${tfs.H1?.coverage || '?'}% cov · ${tfs.H1?.gap_pct || '?'}% gaps · clean desde ${cleanYear}\\nGenerado: ${DUKAS_QUALITY.generated_at}`;
  if (opts.compact) {
    return `<span class="dukas-badge" style="display:inline-block;background:rgba(0,0,0,.25);border:1px solid ${cfg.color}40;color:${cfg.color};padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600;" title="${tip}">${cfg.icon} ${cfg.label}</span>`;
  }
  return `<div class="dukas-badge" style="display:inline-flex;align-items:center;gap:4px;background:rgba(0,0,0,.25);border:1px solid ${cfg.color}40;color:${cfg.color};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-top:4px;" title="${tip}">${cfg.icon} ${cfg.label}</div>`;
}

/** Render detallado de calidad por TF para el panel de detalle del activo. */
function dukasQualityDetail(assetId) {
  if (!DUKAS_QUALITY || !DUKAS_QUALITY.assets[assetId]) {
    return '<div style="padding:10px;color:var(--text2);font-size:12px;">Sin data de calidad Dukas. Ejecuta <code>scripts/analyze_dukas_csv_quality.py --json all</code> para generar.</div>';
  }
  const tfs = DUKAS_QUALITY.assets[assetId];
  const verdictColor = (v) => ({
    opc2_ok: '#22c55e', opc2_limited: '#fbbf24',
    opc1_recommended: '#fb923c', opc1_only: '#ef4444',
  })[v] || '#6b7280';
  const verdictLabel = (v) => ({
    opc2_ok: '✅ Mining Dukas 2010-2023 viable',
    opc2_limited: '⚠ Mining Dukas desde año limpio',
    opc1_recommended: '⚠ Sample corto, usa Darwinex',
    opc1_only: '🔴 Solo Darwinex',
  })[v] || v;
  let html = '<div style="font-size:11px;color:var(--text2);margin-bottom:8px;">Generado: ' + DUKAS_QUALITY.generated_at + '</div>';
  html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
  html += '<thead><tr style="background:var(--surface);border-bottom:1px solid var(--border);">' +
    '<th style="padding:6px;text-align:left;">TF</th>' +
    '<th style="padding:6px;text-align:right;">Barras</th>' +
    '<th style="padding:6px;text-align:right;">Cov %</th>' +
    '<th style="padding:6px;text-align:right;">Gap %</th>' +
    '<th style="padding:6px;text-align:right;">Bad OHLC</th>' +
    '<th style="padding:6px;text-align:left;">Rango</th>' +
    '<th style="padding:6px;text-align:center;">Apto</th>' +
    '<th style="padding:6px;text-align:left;">Veredicto</th>' +
    '</tr></thead><tbody>';
  for (const [tf, d] of Object.entries(tfs)) {
    const c = verdictColor(d.verdict);
    html += '<tr style="border-bottom:1px solid rgba(255,255,255,.05);">' +
      '<td style="padding:6px;font-weight:700;">' + tf + '</td>' +
      '<td style="padding:6px;text-align:right;font-family:Consolas,monospace;">' + d.bars.toLocaleString() + '</td>' +
      '<td style="padding:6px;text-align:right;font-family:Consolas,monospace;">' + d.coverage + '%</td>' +
      '<td style="padding:6px;text-align:right;font-family:Consolas,monospace;color:' + (d.gap_pct > 5 ? '#ef4444' : d.gap_pct > 1 ? '#fbbf24' : '#22c55e') + ';">' + d.gap_pct + '%</td>' +
      '<td style="padding:6px;text-align:right;font-family:Consolas,monospace;">' + d.bad_ohlc + '</td>' +
      '<td style="padding:6px;font-family:Consolas,monospace;font-size:11px;">' + d.first_bar + ' → ' + d.last_bar + '</td>' +
      '<td style="padding:6px;text-align:center;font-weight:700;color:' + c + ';">' + (d.first_clean_year || '—') + '+</td>' +
      '<td style="padding:6px;color:' + c + ';">' + verdictLabel(d.verdict) + '</td>' +
      '</tr>';
  }
  html += '</tbody></table>';
  // Mini heatmap por año
  const tf1 = tfs.H1 || tfs.H4 || Object.values(tfs)[0];
  if (tf1 && tf1.by_year) {
    const years = Object.keys(tf1.by_year).sort();
    html += '<div style="margin-top:12px;font-size:11px;color:var(--text2);">Heatmap por año (TF ' + (tfs.H1 ? 'H1' : Object.keys(tfs)[0]) + '):</div>';
    html += '<div style="display:flex;gap:2px;margin-top:4px;flex-wrap:wrap;">';
    for (const y of years) {
      const yd = tf1.by_year[y];
      const c = yd.verdict === 'VERDE' ? '#22c55e' : yd.verdict === 'AMARILLO' ? '#fbbf24' : '#ef4444';
      const tip = y + ': ' + yd.bars + '/' + yd.expected + ' bars (' + yd.coverage + '% cov)';
      html += '<div style="display:flex;flex-direction:column;align-items:center;background:' + c + '20;border:1px solid ' + c + '60;border-radius:3px;padding:3px 6px;" title="' + tip + '">' +
        '<span style="font-size:10px;font-weight:700;color:' + c + ';">' + y + '</span>' +
        '<span style="font-size:9px;color:var(--text2);font-family:Consolas,monospace;">' + yd.coverage + '%</span>' +
        '</div>';
    }
    html += '</div>';
  }
  return html;
}

async function loadAllScores() {
  const tasks = SCORES_TFS.map(async tf => {
    const fname = (tf === 'H1') ? 'dashboard_scores.json' : ('dashboard_scores_' + tf + '.json');
    // 1) Intentar fetch (modo Flask)
    try {
      const r = await fetch('analysis_output/' + fname, { cache: 'no-store' });
      if (r.ok) { SCORES_ALL[tf] = await r.json(); return; }
    } catch(e) { /* fall through al fallback inline */ }
    // 2) Fallback: leer script inline (modo file:// legacy, si los bloques siguen en HTML)
    try {
      const id = (tf === 'H1') ? 'scores-data' : ('scores-data-' + tf);
      const el = document.getElementById(id);
      const txt = el && el.textContent.trim();
      if (txt && !txt.startsWith('__')) SCORES_ALL[tf] = JSON.parse(txt);
    } catch(e) { console.warn('No se pudo cargar scores ' + tf + ':', e); }
  });
  await Promise.all(tasks);
  SCORES = SCORES_ALL.H1 || {};
  // Si tras fetch + fallback todo sigue vacío → modo file:// sin Flask + sin scores inline
  if (!Object.keys(SCORES_ALL).length) {
    window.SCORES_LOAD_FAILED = true;
    _showNoScoresBanner();
  }
}

function _showNoScoresBanner() {
  // Banner full-width arriba del dashboard explicando qué pasa y cómo arreglarlo
  const isFile = location.protocol === 'file:';
  const banner = document.createElement('div');
  banner.id = 'no-scores-banner';
  banner.style.cssText = 'position:sticky;top:0;z-index:9999;background:linear-gradient(90deg,#7f1d1d,#991b1b);color:#fff;padding:14px 20px;border-bottom:3px solid #fbbf24;font-family:Segoe UI,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.4);';
  banner.innerHTML =
    '<div style="max-width:1400px;margin:0 auto;display:flex;align-items:center;gap:14px;flex-wrap:wrap;">' +
      '<div style="font-size:32px;line-height:1;">⚠️</div>' +
      '<div style="flex:1;min-width:300px;">' +
        '<div style="font-size:15px;font-weight:800;margin-bottom:4px;">' +
          (isFile ? 'Dashboard abierto como file:// — los scores no pueden cargarse' : 'No hay scores disponibles') +
        '</div>' +
        '<div style="font-size:13px;line-height:1.5;color:#fde68a;">' +
          (isFile
            ? 'El SQX Priority, Top Picks, Matriz Composite y demás vistas data-driven están vacíos porque <code style="background:rgba(0,0,0,.3);padding:1px 6px;border-radius:3px;">fetch()</code> no funciona en <code style="background:rgba(0,0,0,.3);padding:1px 6px;border-radius:3px;">file://</code>. ' +
              '<strong style="color:#fff;">Arranca el backend para verlo todo:</strong> ' +
              '<code style="background:rgba(0,0,0,.3);padding:2px 8px;border-radius:3px;color:#a7f3d0;">cd sqx-edge-tool &amp;&amp; run-web.bat</code> ' +
              '→ abre <a href="http://127.0.0.1:5050/SQX_Dashboard_v6.html" style="color:#a7f3d0;font-weight:700;">http://127.0.0.1:5050/SQX_Dashboard_v6.html</a>'
            : 'No se han podido cargar los <code>dashboard_scores*.json</code>. Comprueba que <code>analysis_output/</code> tenga los JSONs y que el backend esté arriba.'
          ) +
        '</div>' +
      '</div>' +
      '<button onclick="this.parentNode.parentNode.remove()" style="background:rgba(0,0,0,.3);color:#fff;border:1px solid rgba(255,255,255,.3);border-radius:4px;padding:6px 14px;cursor:pointer;font-weight:700;">✕ Cerrar</button>' +
    '</div>';
  // Insertar al inicio del body (con seguridad si el body no está aún listo)
  if (document.body) {
    document.body.insertBefore(banner, document.body.firstChild);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      document.body.insertBefore(banner, document.body.firstChild);
    });
  }
  console.error('[SQX Dashboard] Sin scores. ' +
    (isFile ? 'Modo file:// — arranca run-web.bat y usa http://localhost:5050/' : 'Backend no responde + sin fallback inline.'));
}

// Promesa global — main.js espera a esto antes de renderizar
window.SCORES_READY = Promise.all([loadAllScores(), loadDukasQuality()]);

function getAvailableScoresTFs() {
  return SCORES_TFS.filter(tf => SCORES_ALL[tf] && Object.keys(SCORES_ALL[tf]).length);
}

// Orden TF más corto → más largo (para "más bajo"=más intraday)
const TF_ORDER = ['M5', 'M15', 'M30', 'H1', 'H4', 'D1']; // ya estaba

/**
 * Devuelve el TF "recomendado" para una fila del Priority dado su rango editorial.
 * Lógica: el más BAJO del rango que tenga scores disponibles.
 * Ejemplos:
 *   "M5, M15, M30" + scores M15 disponibles → "M15" (M5 todavía no procesado)
 *   "H1, H4, D1" → "H1" (default seguro)
 *   "M30, H1" → "M30"
 */
function getRecommendedTF(tfStr) {
  if (!tfStr) return 'H1';
  const available = new Set(getAvailableScoresTFs());
  const tfsInEntry = tfStr.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
  // Buscar el más bajo disponible
  for (const tf of TF_ORDER) {
    if (tfsInEntry.includes(tf) && available.has(tf)) return tf;
  }
  // Fallback: si ninguno coincide, usar el primero del entry que esté disponible
  for (const tf of tfsInEntry) {
    if (available.has(tf)) return tf;
  }
  return 'H1'; // último fallback
}

window.setScoresTF = function(tf) {
  // Validar: AUTO siempre es válido, otros TFs deben tener scores cargados
  if (tf !== 'AUTO' && (!SCORES_ALL[tf] || !Object.keys(SCORES_ALL[tf]).length)) {
    console.warn('TF no disponible:', tf);
    return false;
  }
  CURRENT_SCORES_TF = tf;
  // SCORES global apunta al TF override seleccionado, o H1 como fallback en modo Auto
  SCORES = (tf === 'AUTO') ? (SCORES_ALL.H1 || {}) : SCORES_ALL[tf];
  if (typeof applyObjectiveRatings === 'function') applyObjectiveRatings();
  if (typeof renderPriority === 'function') renderPriority();
  if (typeof renderAssetGrid === 'function') renderAssetGrid();
  if (typeof renderCategoriesView === 'function') renderCategoriesView();
  if (typeof renderTopPicks === 'function') renderTopPicks();
  if (typeof renderMatrix === 'function') renderMatrix();
  if (typeof renderPipelineState === 'function') renderPipelineState();
  if (typeof renderWorkflowSummary === 'function') renderWorkflowSummary();
  try { localStorage.setItem('sqx_scores_tf', tf); } catch(e){}
  return true;
};

// Restaurar selección previa — espera a la carga async de scores
window.SCORES_READY.then(() => {
  try {
    const _saved = localStorage.getItem('sqx_scores_tf');
    if (_saved === 'AUTO') {
      CURRENT_SCORES_TF = 'AUTO';
    } else if (_saved && SCORES_ALL[_saved]) {
      CURRENT_SCORES_TF = _saved;
      SCORES = SCORES_ALL[_saved];
    }
  } catch(e){}
});

/**
 * Lee el score de un (asset, cat) opcionalmente desde un TF específico.
 * Si tf no se pasa, usa CURRENT_SCORES_TF (toggle global).
 */
function getScore(assetId, catKey, tf) {
  const base = catKey.endsWith('_S') ? catKey.slice(0, -2) : catKey;
  const sourceScores = (tf && SCORES_ALL[tf]) ? SCORES_ALL[tf] : SCORES;
  const a = sourceScores[assetId];
  if (!a || !a[base]) return null;
  const e = a[base];
  return {
    base: base,
    objective: e.objective,
    composite: e.composite_score,
    metrics: (a.metrics && a.metrics[base]) || {},
    tf_used: tf || CURRENT_SCORES_TF,
  };
}

// Sobreescribe los ratings editoriales en ASSETS con los data-driven (Dukascopy H1).
// Tras esto toda la UI (grid, cat-cards, tablas, matriz, top picks) usa automaticamente
// los ratings objetivos calculados desde datos reales.
function applyObjectiveRatings() {
  if (!SCORES || !Object.keys(SCORES).length) return;
  for (const a of ASSETS) {
    for (const [catKey, entry] of Object.entries(a.cats)) {
      const sc = getScore(a.id, catKey);
      if (sc && sc.objective) {
        entry.rating = sc.objective;
        entry._composite = sc.composite;
        entry._metrics = sc.metrics;
      }
    }
  }
}
// La 1ª invocación se hace tras la carga async de scores (en main.js, dentro de SCORES_READY.then)

function ratingPairBadge(score) {
  if (!score || !score.objective) return '';
  const absDiff = Math.abs(score.diff || 0);
  let cls = '';
  let icon = '';
  if (absDiff >= 2)      { cls = 'discrepancy-major'; icon = ' !!'; }
  else if (absDiff >= 1) { cls = 'discrepancy';       icon = ' !'; }
  const pct = Math.max(0, Math.min(100, Math.round((score.composite || 0) * 100)));
  const metricStr = Object.entries(score.metrics).map(([k,v]) => k+'='+v).join('  ');
  const tip = 'Editorial L='+(score.editorialL||'-')+'  S='+(score.editorialS||'-')+'\nData-driven: '+score.objective+'\nComposite percentile: '+pct+'%\n'+metricStr;
  return '<span class="rating-pair '+cls+'" title="'+tip+'">'
    + '<span class="rp-label">DATA</span>'
    + '<span>'+score.objective+icon+'</span>'
    + '</span>';
}

function compositeBar(score) {
  if (!score || score.composite === null || score.composite === undefined) return '';
  const pct = Math.max(0, Math.min(100, Math.round(score.composite * 100)));
  const color = pct >= 75 ? 'var(--green)' : pct >= 50 ? 'var(--accent)' : pct >= 25 ? 'var(--yellow)' : 'var(--red)';
  return '<div class="composite-bar"><div class="composite-bar-fill" style="width:'+pct+'%;background:'+color+'"></div></div>'
    + '<div class="composite-text">Composite '+pct+'% percentil (Dukascopy H1 2010-2026)</div>';
}

function historyChartSVG(assetId) {
  const data = HISTORICAL[assetId];
  if (!data) return '<div class="history-no-data">Sin histórico disponible para '+assetId+' (no estaba en Darwinex).</div>';

  const W=720, H=220, padL=44, padR=14, padT=18, padB=32;
  const innerW = W-padL-padR, innerH = H-padT-padB;
  const v = data.v, n = v.length;
  const [sy, sm] = data.start.split('-').map(Number);

  const xAt = i => padL + (n>1 ? (i/(n-1))*innerW : innerW/2);
  const minV = Math.min.apply(null, v), maxV = Math.max.apply(null, v);
  const useLog = (maxV/Math.max(minV,0.001)) > 3;
  const tx = useLog ? Math.log : (x=>x);
  const minT = tx(minV), maxT = tx(maxV), rangeT = (maxT-minT) || 1;
  const yAt = val => padT + (1 - (tx(val)-minT)/rangeT) * innerH;

  // 24-month SMA (régimen) — más estable que SMA12
  const SMA_PERIOD = 24;
  const sma = v.map((_, i) => {
    if (i < SMA_PERIOD-1) return null;
    let s=0; for (let k=i-(SMA_PERIOD-1); k<=i; k++) s += v[k]; return s/SMA_PERIOD;
  });

  // Régimen raw: precio vs SMA24
  const regimeRaw = v.map((_, i) => sma[i] === null ? null : (v[i] > sma[i] ? 1 : -1));

  // Bandas bull/bear con HYSTERESIS — sólo flip si el cambio se sostiene 6+ meses
  // Esto elimina los flips ruidosos cortos y muestra regímenes coherentes
  const MIN_BAND_MONTHS = 6;
  const bands = [];
  let curStart = -1, curBull = null;
  for (let i=0; i<n; i++) {
    if (regimeRaw[i] === null) continue;
    const isBull = regimeRaw[i] === 1;
    if (curBull === null) { curBull = isBull; curStart = i; continue; }
    if (isBull !== curBull) {
      // Verificar si el cambio se sostiene los próximos MIN_BAND_MONTHS meses
      let sustained = true;
      for (let k=i; k<Math.min(i+MIN_BAND_MONTHS, n); k++) {
        if (regimeRaw[k] !== null && (regimeRaw[k] === 1) !== isBull) { sustained = false; break; }
      }
      if (sustained) {
        bands.push({ start: curStart, end: i-1, bull: curBull });
        curStart = i; curBull = isBull;
      }
    }
  }
  if (curStart !== -1) bands.push({ start: curStart, end: n-1, bull: curBull });

  // Paths
  let path = '', smaPath = '', smaStarted = false;
  for (let i=0; i<n; i++) {
    path += (i===0?'M':'L') + xAt(i).toFixed(1) + ',' + yAt(v[i]).toFixed(1) + ' ';
    if (sma[i] !== null) {
      smaPath += (smaStarted?'L':'M') + xAt(i).toFixed(1) + ',' + yAt(sma[i]).toFixed(1) + ' ';
      smaStarted = true;
    }
  }

  // Year ticks
  const totalMonths = n + (sm-1);
  const ey = sy + Math.floor((totalMonths-1) / 12);
  const span = ey - sy;
  const tickEvery = span >= 16 ? 3 : span >= 10 ? 2 : 1;
  const yearTicks = [];
  for (let yy = Math.ceil(sy/tickEvery)*tickEvery; yy <= ey; yy += tickEvery) {
    const idx = (yy - sy) * 12 - (sm - 1);
    if (idx >= 0 && idx < n) yearTicks.push({ year: yy, idx });
  }

  let svg = '<svg class="history-chart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet">';
  svg += '<rect x="0" y="0" width="'+W+'" height="'+H+'" fill="#11141d" rx="6"/>';

  // Bandas régimen
  for (const b of bands) {
    const x1 = xAt(b.start), x2 = xAt(b.end);
    const fill = b.bull ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)';
    svg += '<rect x="'+x1.toFixed(1)+'" y="'+padT+'" width="'+(x2-x1).toFixed(1)+'" height="'+innerH+'" fill="'+fill+'"/>';
  }

  // Gridlines horizontales
  const gridVals = [];
  if (useLog) {
    const decades = [50, 75, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000];
    for (const d of decades) if (d >= minV*0.9 && d <= maxV*1.1) gridVals.push(d);
  } else {
    const span2 = maxV - minV;
    const step = span2 < 30 ? 5 : span2 < 80 ? 10 : 20;
    for (let g = Math.floor(minV/step)*step; g <= maxV; g += step) {
      if (g >= minV*0.95) gridVals.push(g);
    }
  }
  for (const g of gridVals) {
    const yp = yAt(g);
    svg += '<line x1="'+padL+'" y1="'+yp.toFixed(1)+'" x2="'+(W-padR)+'" y2="'+yp.toFixed(1)+'" stroke="#2e3348" stroke-width="0.5" stroke-dasharray="2,3"/>';
    svg += '<text x="'+(padL-6)+'" y="'+(yp+3).toFixed(1)+'" text-anchor="end" font-size="10" fill="#9ca3af">'+g.toFixed(0)+'</text>';
  }
  // Línea base 100
  if (100 >= minV && 100 <= maxV) {
    const y100 = yAt(100);
    svg += '<line x1="'+padL+'" y1="'+y100.toFixed(1)+'" x2="'+(W-padR)+'" y2="'+y100.toFixed(1)+'" stroke="#3b82f6" stroke-width="0.7" stroke-dasharray="3,2" opacity="0.4"/>';
  }

  // Year ticks
  for (const t of yearTicks) {
    const xp = xAt(t.idx);
    svg += '<line x1="'+xp.toFixed(1)+'" y1="'+padT+'" x2="'+xp.toFixed(1)+'" y2="'+(H-padB+2)+'" stroke="#2e3348" stroke-width="0.5"/>';
    svg += '<text x="'+xp.toFixed(1)+'" y="'+(H-padB+15)+'" text-anchor="middle" font-size="10" fill="#9ca3af">'+t.year+'</text>';
  }

  // Eventos macro
  for (const ev of MACRO_EVENTS) {
    const parts = ev.date.split('-').map(Number);
    const idx = (parts[0]-sy)*12 + (parts[1]-sm);
    if (idx < 0 || idx >= n) continue;
    const xp = xAt(idx);
    svg += '<line x1="'+xp.toFixed(1)+'" y1="'+padT+'" x2="'+xp.toFixed(1)+'" y2="'+(H-padB)+'" stroke="'+ev.color+'" stroke-width="1.2" stroke-dasharray="3,2" opacity="0.7"><title>'+ev.label+' ('+ev.date+')</title></line>';
    svg += '<circle cx="'+xp.toFixed(1)+'" cy="'+(padT-2)+'" r="3.2" fill="'+ev.color+'"><title>'+ev.label+' ('+ev.date+')</title></circle>';
  }

  // SMA12
  svg += '<path d="'+smaPath+'" fill="none" stroke="#9ca3af" stroke-width="1" stroke-dasharray="3,2" opacity="0.55"/>';
  // Curva principal
  svg += '<path d="'+path+'" fill="none" stroke="#3b82f6" stroke-width="1.7"/>';

  // Stat top-right
  const last = v[n-1], first = v[0];
  const totalChange = ((last/first - 1) * 100);
  const tcStr = (totalChange>=0?'+':'') + totalChange.toFixed(1) + '%';
  const tcColor = totalChange >= 0 ? '#22c55e' : '#ef4444';
  svg += '<text x="'+(W-padR)+'" y="'+(padT-4)+'" text-anchor="end" font-size="11" fill="'+tcColor+'" font-weight="700">'+tcStr+' ('+data.start+' → hoy)</text>';

  svg += '</svg>';
  return svg;
}

function historySection(assetId) {
  if (!HISTORICAL[assetId]) {
    if (Object.keys(HISTORICAL).length === 0) return ''; // datos no inyectados aún, no mostrar
    return '<div class="history-section"><div class="history-title">📈 Histórico real</div>'
      + '<div class="history-no-data">Sin datos para '+assetId+' (no disponible en Darwinex).</div></div>';
  }
  return '<div class="history-section">'
    + '<div class="history-title">📈 Histórico real mensual base 100 — Darwinex MT5 · línea gris = SMA24 (régimen, mín 6 meses)</div>'
    + historyChartSVG(assetId)
    + '<div class="history-events-legend">'
    + MACRO_EVENTS.map(e => '<span><i style="background:'+e.color+'"></i>'+e.label+' ('+e.date+')</span>').join('')
    + '<span style="margin-left:auto"><i style="background:rgba(34,197,94,.5)"></i>Sobre SMA24 = bull (sostenido ≥6m)</span>'
    + '<span><i style="background:rgba(239,68,68,.5)"></i>Bajo SMA24 = bear (sostenido ≥6m)</span>'
    + '</div></div>';
}

function renderSqxLegend() {
  const codes = ['A','B','C','D'];
  document.getElementById('sqx-legend-grid').innerHTML = codes.map(code => {
    const meta = SQX_CONFIG_DESC[code];
    return ''
      + '<div class="sqx-config-card">'
      +   '<div class="sqx-config-card-head">'
      +     '<span class="sqx-badge sqx-'+code+'"><span class="sqx-letter">'+code+'</span><span>'+meta.label+'</span></span>'
      +   '</div>'
      +   sqxPreviewHTML(code)
      +   '<div class="sqx-config-desc">'+meta.desc+'</div>'
      + '</div>';
  }).join('');
}
function tfMatch(tf, filter) {
  return filter==='all' || tf.includes(filter);
}
function thH(label, col, ctx, key) {
  const s = ctx==='cat' ? (sortState.cat[key]||{}) : sortState.mat;
  const cls = s.col===col ? (s.dir==='asc'?'sort-asc':'sort-desc') : '';
  return `<th class="sortable ${cls}" onclick="doSort('${ctx}','${key}','${col}')">${label}<span class="sort-icon"></span></th>`;
}
window.doSort = function doSort(ctx, key, col) {
  if (ctx==='cat') {
    if (!sortState.cat[key]) sortState.cat[key]={col:null,dir:null};
    const s=sortState.cat[key];
    if (s.col===col) { s.dir = s.dir==='asc'?'desc':(s.dir==='desc'?null:'asc'); if(!s.dir) s.col=null; }
    else { s.col=col; s.dir='asc'; }
    renderCategoriesView();
  } else {
    const s=sortState.mat;
    if (s.col===col) { s.dir = s.dir==='asc'?'desc':(s.dir==='desc'?null:'asc'); if(!s.dir) s.col=null; }
    else { s.col=col; s.dir='asc'; }
    renderMatrix();
  }
}
function sortRows(rows, col, dir) {
  if (!col||!dir) return rows;
  return [...rows].sort((a,b)=>{
    let va,vb;
    if (col==='asset')  { va=a.asset?.id||''; vb=b.asset?.id||''; }
    else if (col==='sub')    { va=a.asset?.sub||''; vb=b.asset?.sub||''; }
    else if (col==='dir')    { va=a.dir||''; vb=b.dir||''; }
    else if (col==='tf')     { va=a.tf||''; vb=b.tf||''; }
    else if (col==='rating') { va=RATING_ORDER[a.rating]??-1; vb=RATING_ORDER[b.rating]??-1; }
    else { va=''; vb=''; }
    if (typeof va==='number') return dir==='asc'?va-vb:vb-va;
    return dir==='asc'?va.localeCompare(vb):vb.localeCompare(va);
  });
}
function sparkHTML(asset) {
  return '<div class="sparkline">' + CAT_KEYS.map(ck => {
    const e = asset.cats[ck];
    if (!e) return `<div class="sparkline-seg" style="background:#1e2233"></div>`;
    const alpha = e.rating==='++' ? 1 : e.rating==='+' ? 0.7 : e.rating==='~' ? 0.4 : 0.2;
    return `<div class="sparkline-seg" style="background:${CAT_META[ck].color};opacity:${alpha}" title="${CAT_META[ck].name}: ${e.rating}"></div>`;
  }).join('') + '</div>';
}
