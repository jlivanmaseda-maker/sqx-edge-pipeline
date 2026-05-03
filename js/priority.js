// =============================================================================
// PRIORITY — SQX Priority tab + tracking persistente
// Depende de: data.js, core.js
// =============================================================================
// ============================================================
// SQX PRIORITY — lista ranked por composite data-driven
// ============================================================

function renderPriorityTfSelector() {
  const container = document.getElementById('priority-tf-buttons');
  if (!container) return;
  const tfs = getAvailableScoresTFs();
  // Botones: Auto + cada TF disponible (Auto = default, recomendado)
  const options = ['AUTO', ...tfs];
  container.innerHTML = options.map(tf => {
    const label = tf === 'AUTO' ? '✨ Auto' : tf;
    const cls = tf === CURRENT_SCORES_TF ? 'active' : '';
    const title = tf === 'AUTO'
      ? 'Cada fila usa el TF más bajo disponible de su rango editorial (M5 si existe, sino M15, etc.)'
      : 'Override: todas las filas con métricas de ' + tf;
    return '<button class="filter-btn ' + cls + '" data-priority-tf="' + tf + '" title="' + title + '">' + label + '</button>';
  }).join('');
  container.querySelectorAll('button[data-priority-tf]').forEach(btn => {
    btn.addEventListener('click', function(){
      window.setScoresTF(this.dataset.priorityTf);
      container.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.priorityTf === CURRENT_SCORES_TF));
      updatePriorityTfInfo();
    });
  });
  updatePriorityTfInfo();
}

function updatePriorityTfInfo() {
  const info = document.getElementById('priority-tf-info');
  if (!info) return;
  if (CURRENT_SCORES_TF === 'AUTO') {
    const tfs = getAvailableScoresTFs();
    info.textContent = 'Modo Auto: cada fila composite en su TF recomendado (' + tfs.join(', ') + ' disponibles)';
  } else {
    info.textContent = 'Override: todas las filas con métricas de ' + CURRENT_SCORES_TF;
  }
}

function priorityTier(pct) {
  if (pct >= 85) return { label: 'MAXIMA',     cls: 'tier-max',  color: 'var(--green)' };
  if (pct >= 70) return { label: 'ALTA',       cls: 'tier-high', color: 'var(--accent)' };
  if (pct >= 55) return { label: 'SECUNDARIA', cls: 'tier-mid',  color: 'var(--yellow)' };
  if (pct >= 40) return { label: 'BAJA',       cls: 'tier-low',  color: 'var(--orange)' };
  return                { label: 'SKIP',       cls: 'tier-skip', color: 'var(--text2)' };
}

let filterPriorityMin  = 0;
let filterPriorityCat  = 'all';
let filterPriorityType = 'all';

function renderPriority() {
  renderPriorityTfSelector();
  const isAuto = (CURRENT_SCORES_TF === 'AUTO');
  const rows = [];
  for (const a of ASSETS) {
    if (filterPriorityType !== 'all' && a.type !== filterPriorityType) continue;
    const baseSeen = new Set();
    for (const [catKey, entry] of Object.entries(a.cats)) {
      const base = catKey.endsWith('_S') ? catKey.slice(0, -2) : catKey;
      if (baseSeen.has(base)) continue;
      baseSeen.add(base);
      const meta = CAT_META[base] || {};
      // Split timeframes y crear una fila independiente por cada TF
      const tfs = (entry.tf || '').split(',').map(t => t.trim()).filter(Boolean);
      const tfList = tfs.length ? tfs : [''];
      for (const tf of tfList) {
        // En modo AUTO: composite calculado en ESTE TF específico de la fila.
        // Si el TF no tiene scores (ej. M5 antes de Fase 2), fallback al más cercano disponible.
        let tfForComposite;
        if (isAuto) {
          tfForComposite = (tf && SCORES_ALL[tf]) ? tf : getRecommendedTF(entry.tf);
        } else {
          tfForComposite = CURRENT_SCORES_TF;
        }
        const sc = getScore(a.id, catKey, tfForComposite);
        if (!sc || sc.composite === null || sc.composite === undefined) continue;
        const pct = Math.round(sc.composite * 100);
        rows.push({
          asset: a.id, type: a.type, sub: a.sub, dir: entry.dir, tf: tf,
          cat: base, catName: meta.name || base, catColor: meta.color || '#888', catIcon: meta.icon || '?',
          rating: entry.rating, composite: pct,
          tf_used: sc.tf_used, tf_fallback: (isAuto && tf && tf !== sc.tf_used),
        });
      }
    }
  }
  let filtered = rows.filter(r => r.composite >= filterPriorityMin);
  if (filterPriorityCat !== 'all') filtered = filtered.filter(r => r.cat === filterPriorityCat);
  filtered.sort((a, b) => b.composite - a.composite);

  // Resumen tier counts
  const tierCounts = { MAXIMA:0, ALTA:0, SECUNDARIA:0, BAJA:0, SKIP:0 };
  for (const r of filtered) tierCounts[priorityTier(r.composite).label]++;
  const summaryHtml = Object.entries(tierCounts).map(([label,count]) => {
    const tier = priorityTier(label==='MAXIMA'?90:label==='ALTA'?75:label==='SECUNDARIA'?60:label==='BAJA'?45:0);
    return '<div class="priority-summary-card"><div class="ps-count" style="color:'+tier.color+'">'+count+'</div><div class="ps-label">'+label+'</div></div>';
  }).join('');
  document.getElementById('priority-summary').innerHTML = summaryHtml;

  let html = '<thead><tr>'
    + '<th style="width:40px">#</th>'
    + '<th style="width:90px">Tier</th>'
    + '<th>Activo</th>'
    + '<th>Categoría</th>'
    + '<th>Blocksetting</th>'
    + '<th style="width:170px">Composite</th>'
    + '<th>Rating</th>'
    + '<th>Dir</th>'
    + '<th>Timeframes</th>'
    + '<th>Approach SQX sugerido</th>'
    + '<th style="width:130px">Estado</th>'
    + '</tr></thead><tbody>';

  let pCount=0, cCount=0, dCount=0;
  filtered.forEach((r, i) => {
    const tier = priorityTier(r.composite);
    const hint = APPROACH_HINTS[r.cat] || '';
    const rl = rLabel(r.rating);
    const dLabel = r.dir==='L'?'LONG':r.dir==='S'?'SHORT':'L/S';
    const dCls = dirCls(r.dir);
    const rowId = r.asset+'|'+r.cat+'|'+r.tf+'|'+r.dir;
    const status = (PRIORITY_PROGRESS[rowId] && PRIORITY_PROGRESS[rowId].status) || 'pending';
    if (status==='completed') dCount++; else if (status==='current') cCount++; else pCount++;
    // Match con minings del plan (B.3 sync)
    const planRef = (typeof PLAN_MININGS !== 'undefined') ? PLAN_MININGS.find(m =>
      m.asset === r.asset && BS_TO_PRIORITY_CAT[m.bs] === r.cat && m.tf === r.tf && m.dir === r.dir
    ) : null;
    const planBadge = planRef ? '<span class="ps-pin-badge" title="Mining '+planRef.num+' del plan operativo (Pipeline State)">📌 M'+planRef.num+'</span>' : '';
    html += '<tr>'
      + '<td style="font-weight:700;color:var(--text2)">'+(i+1)+planBadge+'</td>'
      + '<td><span class="tier-badge '+tier.cls+'">'+tier.label+'</span></td>'
      + '<td><span class="asset-link" onclick="navToAsset(\''+r.asset+'\')">'+r.asset+'</span> <span style="color:var(--text2);font-size:11px">'+r.sub+'</span></td>'
      + '<td><span style="color:'+r.catColor+';font-weight:700;display:inline-block;width:18px">'+r.catIcon+'</span> '+r.catName+'</td>'
      + '<td><code style="font-size:11px;color:var(--text2)">'+(CAT_TO_BS[r.cat]||'-')+'</code></td>'
      + '<td><span class="priority-bar-wrap"><span class="priority-bar" style="width:'+r.composite+'%;background:'+tier.color+'"></span></span><span style="font-weight:700">'+r.composite+'%</span> <span class="tf-badge'+(r.tf_fallback?' fallback':'')+'" title="Composite calculado con métricas de '+r.tf_used+(r.tf_fallback?' (fallback: TF '+r.tf+' no procesado todavía)':'')+'">'+r.tf_used+'</span></td>'
      + '<td><span class="rating '+rl.cls+'">'+rl.text+'</span></td>'
      + '<td class="'+dCls+'" style="font-weight:700;font-size:12px">'+dLabel+'</td>'
      + '<td style="font-size:12px">'+r.tf+'</td>'
      + '<td style="font-size:12px;color:var(--text2)">'+hint+'</td>'
      + '<td>' + statusBadgeHtml(rowId, status) + '</td>'
      + '</tr>';
  });
  html += '</tbody>';
  if (!filtered.length) html += '<tbody><tr><td colspan="11" class="no-data">Sin resultados con esos filtros</td></tr></tbody>';
  document.getElementById('priority-table').innerHTML = html;

  // Update progress bar and stats
  const total = filtered.length;
  const pct = total ? Math.round(dCount/total*100) : 0;
  document.getElementById('priority-progress-text').textContent = 'Progreso: ' + dCount + ' de ' + total + ' completados';
  document.getElementById('priority-progress-pct').textContent = pct + '%';
  document.getElementById('priority-progress-fill').style.width = pct + '%';
}


// ── SQX PRIORITY: tracking + listeners ──
// ── SQX PRIORITY: tracking persistente en localStorage ──
const PRIORITY_STATE_KEY = 'sqx_priority_progress_v1';
let PRIORITY_PROGRESS = {};
try { PRIORITY_PROGRESS = JSON.parse(localStorage.getItem(PRIORITY_STATE_KEY) || '{}'); } catch(e){ PRIORITY_PROGRESS = {}; }
function savePriorityProgress() { localStorage.setItem(PRIORITY_STATE_KEY, JSON.stringify(PRIORITY_PROGRESS)); }

function statusBadgeHtml(id, status) {
  const label = status==='completed' ? '✓ Completado' : status==='current' ? '▶ En curso' : '○ Pendiente';
  return '<span class="status ' + status + ' clickable-status" onclick="cycleMiningStatus(\''+id+'\')">' + label + '</span>';
}

window.cycleMiningStatus = function(id) {
  const cur = (PRIORITY_PROGRESS[id] && PRIORITY_PROGRESS[id].status) || 'pending';
  const seq = ['pending','current','completed'];
  const next = seq[(seq.indexOf(cur)+1) % seq.length];
  PRIORITY_PROGRESS[id] = { status: next, updated: new Date().toISOString() };
  savePriorityProgress();
  renderPriority();
  // Sync con Pipeline State (re-renderiza si la fila importada cambió de estado allí)
  if (typeof renderPipelineState === 'function') renderPipelineState();
};

document.getElementById('priority-reset-btn').addEventListener('click', function() {
  if (confirm('Resetear todo el progreso del SQX Priority?')) {
    PRIORITY_PROGRESS = {};
    savePriorityProgress();
    renderPriority();
    if (typeof renderPipelineState === 'function') renderPipelineState();
  }
});
document.getElementById('priority-export-btn').addEventListener('click', function() {
  const blob = new Blob([JSON.stringify(PRIORITY_PROGRESS, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'sqx_priority_progress_' + new Date().toISOString().slice(0,10) + '.json';
  a.click(); URL.revokeObjectURL(url);
});
const _impFile = document.getElementById('priority-import-file');
document.getElementById('priority-import-btn').addEventListener('click', function() { _impFile.click(); });
_impFile.addEventListener('change', function(e){
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = function(ev) {
    try {
      const data = JSON.parse(ev.target.result);
      if (typeof data === 'object' && data !== null) {
        PRIORITY_PROGRESS = data;
        savePriorityProgress();
        renderPriority();
        if (typeof renderPipelineState === 'function') renderPipelineState();
        alert('Importado: ' + Object.keys(data).length + ' entradas');
      }
    } catch(err){ alert('JSON invalido: '+err.message); }
  };
  r.readAsText(f);
});
