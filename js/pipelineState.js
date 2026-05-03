// =============================================================================
// PIPELINE STATE — plan + KPIs + funnel + orphans + workflow summary + modales
// Depende de: data.js, core.js, strategies.js (getAllStrategies, STRATEGIES_USER)
// =============================================================================
// ============================================================
// PIPELINE STATE — plan 14 minings + embudo + KPIs
// ============================================================

// ── Plan USER (añadidos por UI, persistente en localStorage) ──
const PLAN_USER_KEY = 'sqx_plan_user_v1';
let PLAN_USER = { minings:[], phases:{} };
try {
  const stored = JSON.parse(localStorage.getItem(PLAN_USER_KEY) || '{}');
  PLAN_USER = { minings: stored.minings || [], phases: stored.phases || {} };
} catch(e){ /* keep defaults */ }
function savePlanUser() { localStorage.setItem(PLAN_USER_KEY, JSON.stringify(PLAN_USER)); }

function getPlanMinings() {
  // Combina DEFAULT + USER, ordena por num
  const all = [
    ...PLAN_MININGS,
    ...PLAN_USER.minings.map(m => ({...m, _user:true}))
  ];
  return all.sort((a,b) => a.num - b.num);
}
function getPlanPhases() {
  // Combina PHASE_META + USER phases
  return Object.assign({}, PHASE_META, PLAN_USER.phases);
}
function getPlanPhaseNums() {
  const phases = getPlanPhases();
  return Object.keys(phases).map(n => parseInt(n,10)).filter(n => !isNaN(n)).sort((a,b)=>a-b);
}
function nextMiningNum() {
  const all = getPlanMinings();
  return all.length ? Math.max(...all.map(m => m.num)) + 1 : 1;
}
function nextPhaseNum() {
  const nums = getPlanPhaseNums();
  return nums.length ? Math.max(...nums) + 1 : 1;
}
function addMiningUser(m) {
  // Validación mínima
  if (!m.asset || !m.tf || !m.bs || !m.dir || !m.phase) return false;
  // Dedupe por (num)
  if (getPlanMinings().some(x => x.num === m.num)) return false;
  PLAN_USER.minings.push({ num:m.num, phase:m.phase, asset:m.asset, tf:m.tf, bs:m.bs, dir:m.dir });
  savePlanUser();
  return true;
}
function addPhaseUser(num, name, desc) {
  if (!num || !name) return false;
  if (getPlanPhases()[num]) return false; // ya existe
  PLAN_USER.phases[num] = { name: name, desc: desc || '' };
  savePlanUser();
  return true;
}
function removeUserMining(num) {
  PLAN_USER.minings = PLAN_USER.minings.filter(m => m.num !== num);
  savePlanUser();
}
function removeUserPhase(num) {
  // No eliminar fase si tiene minings asignados
  const used = getPlanMinings().some(m => m.phase === num);
  if (used) { alert('La fase '+num+' tiene minings asignados. Elimínalos primero.'); return false; }
  delete PLAN_USER.phases[num];
  savePlanUser();
  return true;
}
function clearPlanUser() {
  PLAN_USER = { minings:[], phases:{} };
  savePlanUser();
}
// Alias visible para el helper de status (lee PLAN_ALL si existe)
window.PLAN_ALL = null;
function refreshPlanAll() { window.PLAN_ALL = getPlanMinings(); }
refreshPlanAll();

// Mapping inverso BS → categoría Priority (para sync con SQX Priority)

// Convierte un mining → key del SQX Priority (formato 'asset|cat|tf|dir')
function miningToPriorityKey(mining) {
  const cat = BS_TO_PRIORITY_CAT[mining.bs];
  if (!cat) return null;
  return mining.asset + '|' + cat + '|' + mining.tf + '|' + mining.dir;
}

// localStorage state — pipeline tracking
// Estructura: { overrides: { num: 'current'|... }, funnels: {...}, nextAction:'' }
// `overrides` solo guarda los manuales; el estado por defecto se deriva de SQX Priority
const PIPELINE_STATE_KEY = 'sqx_pipeline_state_v1';
let PIPELINE_STATE = { overrides:{}, funnels:{}, nextAction:'' };
try {
  const stored = JSON.parse(localStorage.getItem(PIPELINE_STATE_KEY) || '{}');
  // Migración del formato antiguo (miningStatus → overrides) + limpieza del preset fantasma
  let overrides = stored.overrides || stored.miningStatus || {};
  // Si solo hay UN override y es el preset Mining 1 = 'current' (preset antiguo), limpiarlo
  // — así el auto-sync con SQX Priority funciona desde el primer momento
  if (!stored.overrides && stored.miningStatus &&
      Object.keys(stored.miningStatus).length === 1 &&
      stored.miningStatus[1] === 'current') {
    overrides = {};
  }
  PIPELINE_STATE = { overrides:overrides, funnels:stored.funnels || {}, nextAction:stored.nextAction || '' };
  // Persistir migración limpia para que no se vuelva a aplicar
  localStorage.setItem(PIPELINE_STATE_KEY, JSON.stringify(PIPELINE_STATE));
} catch(e){ /* keep defaults */ }
// pre-load funnel Mining 1 LINEAR si no hay
if (!PIPELINE_STATE.funnels['1|LINEAR']) PIPELINE_STATE.funnels['1|LINEAR'] = {...FUNNEL_PRELOAD['1|LINEAR']};
if (!PIPELINE_STATE.nextAction) PIPELINE_STATE.nextAction = 'Filter-by-correlation entre las 3 PASSED del WFM (threshold 0.7) → confirmar diversidad estructural → cerrar TEMPLATE LINEAR. Después: Capa 2 sobre TEMPLATES ICHIMOKU x2, MACD y SUPER (mismo flujo).';

function savePipelineState() { localStorage.setItem(PIPELINE_STATE_KEY, JSON.stringify(PIPELINE_STATE)); }

// Devuelve { status, source } donde source ∈ {'manual','priority','strategies','default'}
function getMiningStatusInfo(num) {
  // 1) Override manual en Pipeline State
  if (PIPELINE_STATE.overrides[num]) {
    return { status: PIPELINE_STATE.overrides[num], source: 'manual' };
  }
  // 2) Estado del SQX Priority (source of truth por defecto)
  const m = (typeof PLAN_ALL !== 'undefined' ? PLAN_ALL : PLAN_MININGS).find(x => x.num === num);
  if (m) {
    const key = miningToPriorityKey(m);
    if (key && typeof PRIORITY_PROGRESS !== 'undefined' && PRIORITY_PROGRESS[key] && PRIORITY_PROGRESS[key].status) {
      return { status: PRIORITY_PROGRESS[key].status, source: 'priority' };
    }
  }
  // 3) Si hay estrategias del mining → al menos current
  const has = getAllStrategies().some(s => s.mining === num);
  if (has) return { status: 'current', source: 'strategies' };
  // 4) Default
  return { status: 'pending', source: 'default' };
}
function getMiningStatus(num) { return getMiningStatusInfo(num).status; }

function setMiningOverride(num, st) {
  PIPELINE_STATE.overrides[num] = st;
  savePipelineState();
}
function clearMiningOverride(num) {
  delete PIPELINE_STATE.overrides[num];
  savePipelineState();
}
function clearAllOverrides() {
  PIPELINE_STATE.overrides = {};
  savePipelineState();
}
function cycleMiningStatusPS(num) {
  const cur = getMiningStatus(num);
  const seq = ['pending','current','completed'];
  const next = seq[(seq.indexOf(cur)+1) % seq.length];
  setMiningOverride(num, next);
  renderPipelineState();
}
window.cycleMiningStatusPS = cycleMiningStatusPS;
window.clearMiningOverride = function(num) { clearMiningOverride(num); renderPipelineState(); };

function getStrategiesByMining(num) {
  return getAllStrategies().filter(s => s.mining === num);
}
function getTemplatesByMining(num) {
  return [...new Set(getStrategiesByMining(num).map(s => s.template))].filter(t=>t && t!=='UNKNOWN');
}

function renderPsKpis() {
  const allMinings = getPlanMinings();
  const total = allMinings.length;
  const completed = allMinings.filter(m => getMiningStatus(m.num) === 'completed').length;
  const current   = allMinings.filter(m => getMiningStatus(m.num) === 'current').length;
  const pending   = total - completed - current;
  const pctDone   = Math.round((completed/total)*100);

  const all = getAllStrategies();
  const survivors = all.filter(s => s.tier==='1' || s.tier==='1.5' || s.tier==='2').length;
  const tier1     = all.filter(s => s.tier==='1').length;
  const deployed  = all.filter(s => s.status==='DEPLOYED').length;
  const tentativas= all.filter(s => s.tier==='tentativa').length;
  const portfolioGoal = 10; // mid del rango 8-12

  document.getElementById('ps-kpis').innerHTML =
    '<div class="ps-kpi k-progress">' +
      '<div class="ps-k-label">Plan minings</div>' +
      '<div class="ps-k-value">'+completed+' / '+total+'</div>' +
      '<div class="ps-k-sub">'+current+' en curso · '+pending+' pendientes</div>' +
      '<div class="ps-k-bar-bg"><div class="ps-k-bar-fill" style="width:'+pctDone+'%"></div></div>' +
    '</div>' +
    '<div class="ps-kpi k-survivors">' +
      '<div class="ps-k-label">Supervivientes</div>' +
      '<div class="ps-k-value">'+survivors+'</div>' +
      '<div class="ps-k-sub">'+tier1+' TIER 1 · ' + (survivors-tier1) + ' TIER 1.5+2</div>' +
    '</div>' +
    '<div class="ps-kpi k-deployed">' +
      '<div class="ps-k-label">Deployed MT5</div>' +
      '<div class="ps-k-value">'+deployed+' / '+portfolioGoal+'</div>' +
      '<div class="ps-k-sub">objetivo portfolio 8-12</div>' +
      '<div class="ps-k-bar-bg"><div class="ps-k-bar-fill" style="width:'+Math.min(100, Math.round(deployed/portfolioGoal*100))+'%"></div></div>' +
    '</div>' +
    '<div class="ps-kpi k-pending">' +
      '<div class="ps-k-label">Tentativas</div>' +
      '<div class="ps-k-value">'+tentativas+'</div>' +
      '<div class="ps-k-sub">candidatas pendientes de tests</div>' +
    '</div>' +
    '<div class="ps-kpi k-time">' +
      '<div class="ps-k-label">Tiempo estimado</div>' +
      '<div class="ps-k-value">~'+(pending+current)*15+'h</div>' +
      '<div class="ps-k-sub">15h promedio por mining restante</div>' +
    '</div>';
}

function renderPsNextAction() {
  document.getElementById('ps-na-text').textContent = PIPELINE_STATE.nextAction || '(sin definir)';
}

function renderPsPlan() {
  refreshPlanAll();
  const allMinings = getPlanMinings();
  const allPhases = getPlanPhases();
  const phases = getPlanPhaseNums().filter(p => allMinings.some(m => m.phase === p));
  const html = phases.map(p => {
    const meta = allPhases[p] || { name:'(sin nombre)', desc:'' };
    const isUserPhase = !!PLAN_USER.phases[p];
    const minings = allMinings.filter(m => m.phase === p);
    const done = minings.filter(m => getMiningStatus(m.num)==='completed').length;
    const pct = minings.length ? Math.round(done/minings.length*100) : 0;
    const rows = minings.map(m => {
      const info = getMiningStatusInfo(m.num);
      const st = info.status;
      const stLbl = st==='completed' ? '✓ Completado' : st==='current' ? '▶ En curso' : '○ Pendiente';
      // Badge de fuente del estado
      let srcBadge = '';
      if (info.source === 'manual') {
        srcBadge = '<span class="ps-src-badge ps-src-manual" title="Override manual — click ↻ para volver a auto-sync con Priority" onclick="event.stopPropagation();clearMiningOverride('+m.num+')">✏ Manual ↻</span>';
      } else if (info.source === 'priority') {
        srcBadge = '<span class="ps-src-badge ps-src-priority" title="Sincronizado desde SQX Priority">🔗 Priority</span>';
      } else if (info.source === 'strategies') {
        srcBadge = '<span class="ps-src-badge ps-src-strategies" title="Auto-detectado: hay estrategias importadas de este mining">📦 Auto</span>';
      }
      // Composite % del Priority si existe
      const pkey = miningToPriorityKey(m);
      let compHtml = '';
      if (pkey && typeof getScore === 'function') {
        const a = ASSETS.find(x => x.id === m.asset);
        if (a) {
          // intentar leer composite del catKey base o catKey_S según dirección
          const catBase = BS_TO_PRIORITY_CAT[m.bs];
          const sc = getScore(m.asset, m.dir==='S' ? (catBase+'_S') : catBase);
          if (sc && sc.composite != null) {
            const pct = Math.round(sc.composite * 100);
            compHtml = '<div class="ps-m-comp" title="Composite percentile data-driven">'+pct+'%</div>';
          }
        }
      }
      const survivors = getStrategiesByMining(m.num).filter(s => s.tier==='1'||s.tier==='1.5'||s.tier==='2').length;
      const tentativas = getStrategiesByMining(m.num).filter(s => s.tier==='tentativa').length;
      const tpls = getTemplatesByMining(m.num);
      const dirCls = m.dir==='L'?'dir-l':(m.dir==='S'?'dir-s':'dir-ls');
      const survBadge = survivors > 0 ?
        '<span class="ps-m-survivors" title="' + survivors + ' supervivientes (TIER 1/1.5/2)">' + survivors + ' ✓</span>' :
        '<span class="ps-m-survivors zero">0 ✓</span>';
      const tentBadge = tentativas > 0 ? ' <span class="ps-m-survivors zero" style="background:rgba(249,115,22,.12);color:var(--orange);">' + tentativas + ' ?</span>' : '';
      const tplsHtml = tpls.length ? '<div style="font-size:10px;color:var(--text2);margin-top:3px;">Templates: '+tpls.join(', ')+'</div>' : '';
      const userBadge = m._user ? '<span class="ps-user-badge" title="Añadido por UI (vive en localStorage)">USER</span>' : '';
      const removeBtn = m._user ? '<button class="ps-remove-btn" title="Eliminar este mining USER" onclick="removeUserMiningClick('+m.num+')">✕</button>' : '';
      // Composite del plan v2 (preconfigurado) > composite via getScore (fallback)
      const planComp = (m.composite != null) ? m.composite : null;
      const compBadge = planComp != null
        ? '<div class="ps-m-comp" title="Composite data-driven del plan v2 (multi-TF)">'+planComp+'%</div>'
        : compHtml;
      // SQX config badge (A/B/C/D)
      const sqxCfgInfo = {
        A: ['A', 'Both + Entry Sym (Forex L/S simétrico)'],
        B: ['B', 'Both sin Sym (Índice/oro L+S asimétrico)'],
        C: ['C', 'Only Long (Índice/oro Long puro)'],
        D: ['D', 'Only Short (Edge short específico)'],
      };
      const cfg = m.sqx_config && sqxCfgInfo[m.sqx_config];
      const sqxCfgBadge = cfg
        ? '<span class="ps-sqx-cfg ps-sqx-' + m.sqx_config.toLowerCase() + '" title="Config SQX: ' + cfg[1] + '">' + cfg[0] + '</span>'
        : '';
      return '<tr>' +
        '<td class="ps-m-num">'+m.num+userBadge+'</td>' +
        '<td><div class="ps-m-asset">'+m.asset+'</div>'+tplsHtml+'</td>' +
        '<td class="ps-m-tf">'+m.tf+'</td>' +
        '<td><span class="ps-m-bs">'+m.bs+'</span></td>' +
        '<td><span class="'+dirCls+'" style="font-weight:700;font-size:12px;">'+m.dir+'</span> '+sqxCfgBadge+'</td>' +
        '<td>'+compBadge+'</td>' +
        '<td>'+survBadge+tentBadge+'</td>' +
        '<td><span class="status '+st+' clickable-status" onclick="cycleMiningStatusPS('+m.num+')">'+stLbl+'</span> '+srcBadge+removeBtn+'</td>' +
      '</tr>';
    }).join('');
    const phaseCls = p > 5 ? 'p1' : 'p'+p; // las USER reusan estilo p1
    const phaseUserBadge = isUserPhase ? '<span class="ps-user-badge" title="Fase USER (localStorage)">USER</span>' : '';
    const phaseRemove = isUserPhase ? '<button class="ps-remove-btn" title="Eliminar fase USER" onclick="removeUserPhaseClick('+p+')">✕</button>' : '';
    return '<div class="ps-phase">' +
      '<div class="ps-phase-head '+phaseCls+'">' +
        '<div class="ps-phase-num">'+p+'</div>' +
        '<h3>FASE '+p+' — '+meta.name+phaseUserBadge+'</h3>' +
        '<span style="color:var(--text2);font-size:12px;">'+meta.desc+'</span>' +
        '<span class="ps-phase-count">'+done+'/'+minings.length+'</span>' +
        '<div class="ps-phase-bar"><div style="width:'+pct+'%"></div></div>' +
        phaseRemove +
      '</div>' +
      '<table class="ps-mining-table">' +
        '<thead><tr><th>#</th><th>Asset</th><th>TF</th><th>Blocksetting</th><th>Dir</th><th>Composite</th><th>Estrategias</th><th>Estado</th></tr></thead>' +
        '<tbody>'+rows+'</tbody>' +
      '</table>' +
    '</div>';
  }).join('');
  document.getElementById('ps-plan-table').innerHTML = html;
}

function getCurrentFunnelKey() {
  const m = document.getElementById('ps-funnel-mining').value;
  const t = document.getElementById('ps-funnel-template').value;
  return m + '|' + t;
}

function getFunnelData(key) {
  return PIPELINE_STATE.funnels[key] || {};
}

function setFunnelValue(key, stage, val) {
  if (!PIPELINE_STATE.funnels[key]) PIPELINE_STATE.funnels[key] = {};
  if (val === '' || val == null) delete PIPELINE_STATE.funnels[key][stage];
  else PIPELINE_STATE.funnels[key][stage] = parseInt(val,10) || 0;
  savePipelineState();
}

function populateFunnelSelectors() {
  const selM = document.getElementById('ps-funnel-mining');
  const selT = document.getElementById('ps-funnel-template');
  // mining selector
  const miningsWithStrats = [...new Set(getAllStrategies().map(s => s.mining))].sort((a,b)=>a-b);
  const miningsAll = miningsWithStrats.length ? miningsWithStrats : [1];
  const curM = parseInt(selM.value,10) || miningsAll[0];
  selM.innerHTML = miningsAll.map(m => '<option value="'+m+'">Mining '+m+'</option>').join('');
  selM.value = miningsAll.includes(curM) ? curM : miningsAll[0];
  // template selector
  const tpls = getTemplatesByMining(parseInt(selM.value,10));
  const tplsAll = tpls.length ? tpls : ['LINEAR'];
  const curT = selT.value || tplsAll[0];
  selT.innerHTML = tplsAll.map(t => '<option value="'+t+'">'+t+'</option>').join('');
  selT.value = tplsAll.includes(curT) ? curT : tplsAll[0];
}

function renderPsFunnel() {
  const key = getCurrentFunnelKey();
  const data = getFunnelData(key);
  const initial = data[FUNNEL_STAGES_DEFAULT[0].id] || 0;
  const html = FUNNEL_STAGES_DEFAULT.map(stage => {
    const v = data[stage.id];
    const valStr = v == null ? '—' : v;
    const pct = (initial > 0 && typeof v === 'number') ? Math.max(2, Math.round(v/initial*100)) : 0;
    const surv = (initial > 0 && typeof v === 'number') ? (v/initial*100).toFixed(2) + '%' : '';
    const cls = stage.terminal ? 'ps-funnel-step terminal ps-funnel-final' : 'ps-funnel-step';
    return '<div class="'+cls+'">' +
      '<div class="pf-name">'+stage.name+'</div>' +
      '<div class="pf-bar-wrap"><div class="pf-bar" style="width:'+pct+'%"></div></div>' +
      '<div class="pf-count" data-stage="'+stage.id+'" onclick="editFunnelCell(this, \''+key+'\', \''+stage.id+'\')">'+valStr+'</div>' +
      '<div class="pf-survival">'+surv+'</div>' +
    '</div>';
  }).join('');
  document.getElementById('ps-funnel').innerHTML = html;
}

window.editFunnelCell = function(el, key, stage) {
  if (el.classList.contains('editing')) return;
  const cur = el.textContent.trim();
  el.classList.add('editing');
  el.innerHTML = '<input type="number" min="0" value="'+(cur==='—'?'':cur)+'">';
  const inp = el.querySelector('input');
  inp.focus(); inp.select();
  function commit() {
    const v = inp.value.trim();
    setFunnelValue(key, stage, v);
    el.classList.remove('editing');
    renderPsFunnel();
  }
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', function(e){
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { el.classList.remove('editing'); renderPsFunnel(); }
  });
};

// ── Orphans: items current/completed en SQX Priority sin match en el plan ──
function getOrphanPriorityItems() {
  if (typeof PRIORITY_PROGRESS === 'undefined') return [];
  const planKeys = new Set(getPlanMinings().map(m => miningToPriorityKey(m)).filter(Boolean));
  const out = [];
  for (const [key, val] of Object.entries(PRIORITY_PROGRESS)) {
    const status = val && val.status;
    if (status !== 'current' && status !== 'completed') continue;
    if (planKeys.has(key)) continue;
    const parts = key.split('|');
    if (parts.length !== 4) continue;
    const [asset, cat, tfRaw, dir] = parts;
    if (!PRIORITY_CAT_TO_BS[cat]) continue;
    // Detectar key legacy con múltiples TFs ("H1, H4, D1") → split en múltiples orphans
    const tfs = tfRaw.includes(',') ? tfRaw.split(',').map(t => t.trim()).filter(Boolean) : [tfRaw];
    const isLegacy = tfs.length > 1;
    for (const tf of tfs) {
      // Si este TF específico ya tiene un mining en el plan → no es huérfano
      const newKey = asset+'|'+cat+'|'+tf+'|'+dir;
      if (planKeys.has(newKey)) continue;
      // Composite del scoring
      let comp = null;
      const a = (typeof ASSETS !== 'undefined') ? ASSETS.find(x => x.id === asset) : null;
      if (a && typeof getScore === 'function') {
        const sc = getScore(asset, dir==='S' ? (cat+'_S') : cat);
        if (sc && sc.composite != null) comp = Math.round(sc.composite * 100);
      }
      out.push({ origKey: key, key: newKey, asset, cat, tf, dir, status, bs: PRIORITY_CAT_TO_BS[cat], composite: comp, isLegacy });
    }
  }
  out.sort((a,b) => {
    if (a.status !== b.status) return a.status === 'completed' ? -1 : 1;
    return (b.composite||0) - (a.composite||0);
  });
  return out;
}

function renderOrphans() {
  const orphans = getOrphanPriorityItems();
  const card = document.getElementById('ps-orphans-card');
  const list = document.getElementById('ps-orphans-list');
  if (!card || !list) return;
  if (!orphans.length) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  const meta = (typeof CAT_META !== 'undefined') ? CAT_META : {};
  list.innerHTML = orphans.map(o => {
    const catName = (meta[o.cat] && meta[o.cat].name) || o.cat;
    const dirCls = o.dir==='L'?'dir-l':(o.dir==='S'?'dir-s':'dir-ls');
    const dirTxt = o.dir==='L'?'LONG':(o.dir==='S'?'SHORT':'L+S');
    const compHtml = o.composite != null ? '<span class="po-comp">'+o.composite+'%</span>' : '';
    const stLbl = o.status==='completed' ? '✓ Completado' : '▶ En curso';
    const legacyBadge = o.isLegacy ? '<span class="po-legacy" title="Key del Priority en formato antiguo (TFs juntos). Se ha hecho split visual; al «Quitar» se elimina la key entera.">⚠ Legacy</span>' : '';
    const safeOrig = o.origKey.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    const safeNew  = o.key.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    return '<div class="ps-orphan-row">' +
      '<span class="po-asset">'+o.asset+'</span>' +
      '<span class="po-cat">'+catName+'</span>' +
      '<span class="po-tf">'+o.tf+'</span>' +
      '<span class="'+dirCls+' po-dir">'+dirTxt+'</span>' +
      '<span class="po-bs">'+o.bs+'</span>' +
      compHtml +
      '<span class="po-status '+o.status+'">'+stLbl+'</span>' +
      legacyBadge +
      '<button class="po-add-btn" onclick="promoteOrphanToPlan(\''+safeNew+'\')">+ Añadir al plan</button>' +
      '<button class="po-remove-btn" title="Eliminar este item del SQX Priority (no afecta el plan)" onclick="removeOrphanFromPriority(\''+safeOrig+'\','+(o.isLegacy?'true':'false')+')">✕ Quitar</button>' +
    '</div>';
  }).join('');
}

window.removeOrphanFromPriority = function(origKey, isLegacy) {
  if (typeof PRIORITY_PROGRESS === 'undefined') return;
  if (!PRIORITY_PROGRESS[origKey]) { renderPipelineState(); return; }
  const msg = isLegacy
    ? '¿Eliminar la key legacy "'+origKey+'" del SQX Priority? (Contiene varios TFs juntos — se borran todos.)'
    : '¿Eliminar este item del SQX Priority?';
  if (!confirm(msg)) return;
  delete PRIORITY_PROGRESS[origKey];
  if (typeof savePriorityProgress === 'function') savePriorityProgress();
  if (typeof renderPriority === 'function') renderPriority();
  renderPipelineState();
};

window.promoteOrphanToPlan = function(key) {
  const parts = key.split('|');
  if (parts.length !== 4) return;
  const [asset, cat, tf, dir] = parts;
  const bs = PRIORITY_CAT_TO_BS[cat];
  if (!bs) { alert('Categoría desconocida: '+cat); return; }
  // Abrir modal pre-rellenado
  openAddMiningModal();
  document.getElementById('psm-num').value = nextMiningNum();
  document.getElementById('psm-asset').value = asset;
  document.getElementById('psm-tf').value = tf;
  document.getElementById('psm-bs').value = bs;
  document.getElementById('psm-dir').value = dir;
  // Sugerir fase: si el asset coincide con el de alguna fase DEFAULT lo elegimos, si no la última
  const phaseSel = document.getElementById('psm-phase');
  const allMin = getPlanMinings();
  const sameAssetMining = allMin.find(m => m.asset === asset);
  if (sameAssetMining) phaseSel.value = String(sameAssetMining.phase);
};

// ── Workflow > Vista General · resumen Plan v2 (data-driven desde PLAN_MININGS) ──
function renderWorkflowSummary() {
  const host = document.getElementById('wf-plan-v2-body');
  if (!host || typeof PLAN_MININGS === 'undefined') return;
  const minings = PLAN_MININGS;
  const phases  = (typeof PHASE_META !== 'undefined') ? PHASE_META : {};

  // breakdown por fase
  const byPhase = {};
  minings.forEach(m => { (byPhase[m.phase] = byPhase[m.phase] || []).push(m); });

  // breakdown por asset_type / sqx_config / dir / TF / categoría
  const tally = (arr, key) => arr.reduce((a,m) => (a[m[key]] = (a[m[key]]||0)+1, a), {});
  const byType = tally(minings, 'asset_type');
  const byCfg  = tally(minings, 'sqx_config');
  const byDir  = tally(minings, 'dir');
  const byTf   = tally(minings, 'tf');
  const byBs   = tally(minings, 'bs');
  const uniqAssets = new Set(minings.map(m => m.asset)).size;

  const cfgLabel = { A:'A · L/S Sym', B:'B · L+S sin Sym', C:'C · Long puro', D:'D · Short puro' };
  const cfgColor = { A:'var(--accent)', B:'var(--purple)', C:'var(--green)', D:'#ef4444' };

  const fmt = (obj, render) => Object.entries(obj)
    .sort((a,b) => b[1]-a[1])
    .map(render).join('');

  let html = '';

  // grid por fase
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-bottom:16px;">';
  Object.keys(byPhase).sort().forEach(p => {
    const meta = phases[p] || { name:'Fase '+p, desc:'' };
    const list = byPhase[p];
    const compRange = (list.length === 1)
      ? list[0].composite + '%'
      : Math.min(...list.map(m=>m.composite)) + '–' + Math.max(...list.map(m=>m.composite)) + '%';
    html += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">'
      +   '<div style="font-weight:700;color:var(--text);">Fase ' + p + ' · ' + meta.name + '</div>'
      +   '<div style="font-size:11px;color:var(--text2);font-family:Consolas,monospace;">' + list.length + ' min</div>'
      + '</div>'
      + '<div style="font-size:11px;color:var(--text2);margin-bottom:6px;">' + (meta.desc || '') + '</div>'
      + '<div style="font-size:11px;color:var(--text);">Composite: <strong>' + compRange + '</strong></div>'
      + '</div>';
  });
  html += '</div>';

  // tabla resumen breakdown
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">';

  // Activos
  html += '<div><div style="font-size:11px;text-transform:uppercase;color:var(--text2);letter-spacing:.5px;margin-bottom:6px;">Activos</div>'
    + '<div style="font-size:12px;color:var(--text);"><strong>' + uniqAssets + '</strong> únicos · ' + minings.length + ' minings</div>'
    + '<div style="margin-top:6px;font-size:11px;color:var(--text2);">'
    + fmt(byType, ([k,v]) => '<span style="display:inline-block;background:var(--surface2);padding:2px 6px;border-radius:3px;margin:2px 2px 0 0;">' + k + ' <strong style="color:var(--text);">' + v + '</strong></span>')
    + '</div></div>';

  // SQX configs
  html += '<div><div style="font-size:11px;text-transform:uppercase;color:var(--text2);letter-spacing:.5px;margin-bottom:6px;">SQX Config</div>'
    + '<div style="margin-top:2px;">'
    + fmt(byCfg, ([k,v]) => '<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;margin:2px 0;">'
        + '<span style="color:' + (cfgColor[k]||'var(--text)') + ';font-weight:700;">' + (cfgLabel[k]||k) + '</span>'
        + '<span style="color:var(--text);font-weight:700;">' + v + '</span></div>')
    + '</div></div>';

  // Direcciones
  html += '<div><div style="font-size:11px;text-transform:uppercase;color:var(--text2);letter-spacing:.5px;margin-bottom:6px;">Dirección</div>'
    + '<div style="margin-top:2px;font-size:11px;">'
    + fmt(byDir, ([k,v]) => '<span style="display:inline-block;background:var(--surface2);padding:2px 6px;border-radius:3px;margin:2px 2px 0 0;color:var(--text);">' + k + ' <strong>' + v + '</strong></span>')
    + '</div></div>';

  // TFs
  html += '<div><div style="font-size:11px;text-transform:uppercase;color:var(--text2);letter-spacing:.5px;margin-bottom:6px;">Temporalidad</div>'
    + '<div style="margin-top:2px;font-size:11px;">'
    + fmt(byTf, ([k,v]) => '<span style="display:inline-block;background:var(--surface2);padding:2px 6px;border-radius:3px;margin:2px 2px 0 0;font-family:Consolas,monospace;color:var(--text);">' + k + ' <strong>' + v + '</strong></span>')
    + '</div></div>';

  // Categorías (BS)
  html += '<div style="grid-column:1/-1;"><div style="font-size:11px;text-transform:uppercase;color:var(--text2);letter-spacing:.5px;margin-bottom:6px;">Categorías cubiertas (' + Object.keys(byBs).length + '/7)</div>'
    + '<div style="margin-top:2px;font-size:11px;">'
    + fmt(byBs, ([k,v]) => '<span style="display:inline-block;background:var(--surface2);padding:2px 8px;border-radius:3px;margin:2px 4px 0 0;color:var(--text);">' + k.replace('BS_','') + ' <strong>' + v + '</strong></span>')
    + '</div></div>';

  html += '</div>';

  host.innerHTML = html;
}

function renderPipelineState() {
  renderPsKpis();
  renderPsNextAction();
  renderOrphans();
  renderPsPlan();
  populateFunnelSelectors();
  renderPsFunnel();
  // override info bar
  const ovCount = Object.keys(PIPELINE_STATE.overrides || {}).length;
  const info = document.getElementById('ps-overrides-info');
  const restore = document.getElementById('ps-restore-auto');
  if (info && restore) {
    if (ovCount > 0) {
      info.style.display = 'inline-block';
      info.textContent = '✏ ' + ovCount + ' override' + (ovCount===1?'':'s') + ' manual' + (ovCount===1?'':'es');
      restore.style.display = 'inline-block';
    } else {
      info.style.display = 'none';
      restore.style.display = 'none';
    }
  }
  // counts del plan
  const allMinings = getPlanMinings();
  const allPhasesCount = getPlanPhaseNums().filter(p => allMinings.some(m => m.phase === p)).length;
  const cntEl = document.getElementById('ps-plan-counts');
  if (cntEl) cntEl.textContent = allPhasesCount + ' fases · ' + allMinings.length + ' minings';
  // banner USER
  const userInfo = document.getElementById('ps-plan-user-info');
  if (userInfo) {
    const userCount = PLAN_USER.minings.length + Object.keys(PLAN_USER.phases).length;
    userInfo.style.display = userCount > 0 ? 'block' : 'none';
    const cnt = document.getElementById('ps-plan-user-count');
    if (cnt) cnt.textContent = userCount;
  }
}

// listeners
document.getElementById('ps-funnel-mining').addEventListener('change', function(){
  populateFunnelSelectors();
  renderPsFunnel();
});
document.getElementById('ps-funnel-template').addEventListener('change', renderPsFunnel);

document.getElementById('ps-na-edit').addEventListener('click', function(){
  const v = prompt('Próxima acción inmediata:', PIPELINE_STATE.nextAction || '');
  if (v != null) { PIPELINE_STATE.nextAction = v.trim(); savePipelineState(); renderPsNextAction(); }
});

document.getElementById('ps-plan-reset').addEventListener('click', function(){
  if (confirm('¿Resetear COMPLETAMENTE el tracking? Borra overrides manuales y deja solo el auto-sync con SQX Priority. (No afecta estrategias ni embudos.)')) {
    PIPELINE_STATE.overrides = {};
    savePipelineState();
    renderPipelineState();
  }
});

document.getElementById('ps-restore-auto').addEventListener('click', function(){
  const n = Object.keys(PIPELINE_STATE.overrides || {}).length;
  if (!n) return;
  if (confirm('¿Limpiar los '+n+' override(s) manual(es) y volver al auto-sync con SQX Priority?')) {
    clearAllOverrides();
    renderPipelineState();
  }
});

// ── B.2: gestión del plan (modales + listeners) ──
function openAddMiningModal() {
  // pre-fill num auto + populate fase select
  document.getElementById('psm-num').value = nextMiningNum();
  const sel = document.getElementById('psm-phase');
  const phases = getPlanPhaseNums();
  const meta = getPlanPhases();
  sel.innerHTML = phases.map(p => '<option value="'+p+'">FASE '+p+' — '+(meta[p]?.name || '')+'</option>').join('');
  document.getElementById('ps-add-mining-backdrop').style.display = 'flex';
}
function closeAddMiningModal() { document.getElementById('ps-add-mining-backdrop').style.display = 'none'; }

function openAddPhaseModal() {
  document.getElementById('psp-num').value = nextPhaseNum();
  document.getElementById('psp-name').value = '';
  document.getElementById('psp-desc').value = '';
  document.getElementById('ps-add-phase-backdrop').style.display = 'flex';
}
function closeAddPhaseModal() { document.getElementById('ps-add-phase-backdrop').style.display = 'none'; }

function saveAddMining() {
  const m = {
    num:    parseInt(document.getElementById('psm-num').value, 10),
    phase:  parseInt(document.getElementById('psm-phase').value, 10),
    asset:  (document.getElementById('psm-asset').value || '').trim().toUpperCase(),
    tf:     document.getElementById('psm-tf').value,
    bs:     document.getElementById('psm-bs').value,
    dir:    document.getElementById('psm-dir').value,
  };
  if (!m.num || !m.phase || !m.asset) { alert('Faltan campos obligatorios.'); return; }
  if (!addMiningUser(m)) { alert('Mining #'+m.num+' ya existe en el plan.'); return; }
  closeAddMiningModal();
  renderPipelineState();
}

function saveAddPhase() {
  const num  = parseInt(document.getElementById('psp-num').value, 10);
  const name = (document.getElementById('psp-name').value || '').trim();
  const desc = (document.getElementById('psp-desc').value || '').trim();
  if (!num || !name) { alert('Número y nombre son obligatorios.'); return; }
  if (!addPhaseUser(num, name, desc)) { alert('Fase '+num+' ya existe.'); return; }
  closeAddPhaseModal();
  renderPipelineState();
}

window.removeUserMiningClick = function(num) {
  if (confirm('¿Eliminar mining #'+num+' del plan USER?')) { removeUserMining(num); renderPipelineState(); }
};
window.removeUserPhaseClick = function(num) {
  if (confirm('¿Eliminar fase '+num+' del plan USER?')) { if (removeUserPhase(num)) renderPipelineState(); }
};

document.getElementById('ps-add-mining-btn').addEventListener('click', openAddMiningModal);
document.getElementById('ps-add-phase-btn').addEventListener('click', openAddPhaseModal);
document.getElementById('ps-add-mining-close').addEventListener('click', closeAddMiningModal);
document.getElementById('ps-add-phase-close').addEventListener('click', closeAddPhaseModal);
document.getElementById('ps-add-mining-backdrop').addEventListener('click', function(e){ if (e.target === this) closeAddMiningModal(); });
document.getElementById('ps-add-phase-backdrop').addEventListener('click', function(e){ if (e.target === this) closeAddPhaseModal(); });
document.getElementById('psm-cancel').addEventListener('click', closeAddMiningModal);
document.getElementById('psp-cancel').addEventListener('click', closeAddPhaseModal);
document.getElementById('psm-save').addEventListener('click', saveAddMining);
document.getElementById('psp-save').addEventListener('click', saveAddPhase);

document.getElementById('ps-clear-plan-user-btn').addEventListener('click', function(){
  const n = PLAN_USER.minings.length + Object.keys(PLAN_USER.phases).length;
  if (!n) return;
  if (confirm('¿Borrar los '+n+' añadidos USER del plan? Los DEFAULT se mantienen.')) {
    clearPlanUser(); renderPipelineState();
  }
});

document.getElementById('ps-consolidate-plan').addEventListener('click', function(){
  const all = getPlanMinings().map(m => { const c = {...m}; delete c._user; return c; });
  const phases = getPlanPhases();
  const minJson = JSON.stringify(all, null, 2);
  const phJson  = JSON.stringify(phases, null, 2);
  const wrapper = '// REEMPLAZA `const PLAN_MININGS = [...];` con esto:\nconst PLAN_MININGS = ' + minJson + ';\n\n// REEMPLAZA `const PHASE_META = {...};` con esto:\nconst PHASE_META = ' + phJson + ';';
  const w = window.open('', '_blank', 'width=900,height=700');
  if (w) {
    w.document.write('<html><head><title>SQX Plan — Consolidado</title><style>body{background:#0f1117;color:#e4e4e7;font-family:Segoe UI,sans-serif;padding:20px;}h1{font-size:16px;margin-bottom:10px;}p{color:#9ca3af;font-size:12px;margin-bottom:14px;}pre{background:#0a0c12;border:1px solid #2e3348;border-radius:8px;padding:14px;font-family:Consolas,monospace;font-size:12px;color:#9eb1d3;line-height:1.5;overflow:auto;max-height:80vh;white-space:pre-wrap;}button{margin-bottom:10px;padding:8px 16px;background:#22c55e;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;}</style></head><body>');
    w.document.write('<h1>💾 Consolidado: '+all.length+' minings · '+Object.keys(phases).length+' fases</h1>');
    w.document.write('<p>Reemplaza los bloques <code>PLAN_MININGS</code> y <code>PHASE_META</code> en el JS principal del HTML.</p>');
    w.document.write('<button onclick="navigator.clipboard.writeText(document.getElementById(\'cn\').textContent).then(()=>this.textContent=\'✓ Copiado\')">📋 Copiar al portapapeles</button>');
    w.document.write('<pre id="cn">'+wrapper.replace(/[<>&]/g, c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))+'</pre>');
    w.document.write('</body></html>');
    w.document.close();
  } else {
    navigator.clipboard.writeText(wrapper);
    alert('Popup bloqueado. He copiado el snippet al portapapeles ('+all.length+' minings · '+Object.keys(phases).length+' fases).');
  }
});
