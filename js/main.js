// ============================================================
// SQX Dashboard — main / INIT
// Tab handlers + subtab handler + initial render calls
// ============================================================

// Render inicial: espera a que los scores async estén cargados
// (modo Flask: fetch desde analysis_output/; fallback inline si file://)
(window.SCORES_READY || Promise.resolve()).then(() => {
  // Ahora SCORES_ALL está poblado → aplicar ratings data-driven a ASSETS
  if (typeof applyObjectiveRatings === 'function') applyObjectiveRatings();
  renderSqxLegend();
  renderAssetGrid();
  renderTopPicks();
  renderCategoriesView();
  renderFiltros();
  renderMatrix();
  renderPriority();
  renderStrategies();
  renderPipelineState();
  if (typeof renderWorkflowSummary === 'function') renderWorkflowSummary();
});

// ── Sub-tabs (dentro de Workflow tab) ──
document.querySelectorAll('.subtab').forEach(t => t.addEventListener('click', () => {
  const sub = t.dataset.subtab;
  document.querySelectorAll('.subtab').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  document.querySelectorAll('.subtab-content').forEach(x => x.classList.remove('active'));
  const target = document.getElementById(sub);
  if (target) target.classList.add('active');
}));

// ── Checklist persistente (Workflow Capa 1 / Capa 2) ──
const CHECKLIST_KEY = 'sqx_workflow_checklist_v1';
let CHECKLIST_STATE = {};
try { CHECKLIST_STATE = JSON.parse(localStorage.getItem(CHECKLIST_KEY) || '{}'); } catch(e){ CHECKLIST_STATE = {}; }
function saveChecklist() { localStorage.setItem(CHECKLIST_KEY, JSON.stringify(CHECKLIST_STATE)); }

document.querySelectorAll('input[type="checkbox"][data-check]').forEach(cb => {
  const id = cb.dataset.check;
  if (CHECKLIST_STATE[id]) cb.checked = true;
  cb.addEventListener('change', function() {
    if (this.checked) CHECKLIST_STATE[id] = true;
    else delete CHECKLIST_STATE[id];
    saveChecklist();
  });
});

document.querySelectorAll('button[data-checklist-clear]').forEach(btn => {
  btn.addEventListener('click', function() {
    const prefix = this.dataset.checklistClear + '-';
    const matches = Object.keys(CHECKLIST_STATE).filter(k => k.startsWith(prefix));
    if (!matches.length) return;
    if (!confirm('¿Resetear ' + matches.length + ' checks de ' + this.dataset.checklistClear + '?')) return;
    matches.forEach(k => delete CHECKLIST_STATE[k]);
    saveChecklist();
    document.querySelectorAll('input[type="checkbox"][data-check^="' + prefix + '"]').forEach(cb => cb.checked = false);
  });
});

// ============================================================
// PROJECT GENERATOR — Tab que consume el backend Python (F3 API)
// ============================================================
const PG_API = 'http://127.0.0.1:5050/api';
let PG_CONNECTED = false;
let PG_HEALTH_TIMER = null;

function pgLog(msg, level) {
  const log = document.getElementById('pg-log');
  if (!log) return;
  const t = new Date().toLocaleTimeString();
  const cls = level === 'ok' ? 'log-ok' : level === 'err' ? 'log-err' : 'log-info';
  const line = '[' + t + '] <span class="' + cls + '">' + msg + '</span>\n';
  if (log.textContent.trim() === '[esperando primera acción…]') log.innerHTML = '';
  log.innerHTML += line;
  log.scrollTop = log.scrollHeight;
}

async function pgFetch(path, options) {
  const url = PG_API + path;
  const opts = Object.assign({}, options || {});
  if (opts.body && typeof opts.body !== 'string') {
    opts.body = JSON.stringify(opts.body);
    opts.headers = Object.assign({'Content-Type': 'application/json'}, opts.headers || {});
  }
  const r = await fetch(url, opts);
  const data = await r.json();
  if (!r.ok && !data.ok) throw new Error(data.error || ('HTTP ' + r.status));
  return data;
}

function pgSetStatus(state, title, desc) {
  const banner = document.getElementById('pg-status-banner');
  const t = document.getElementById('pg-status-title');
  const d = document.getElementById('pg-status-desc');
  if (!banner) return;
  banner.classList.remove('pg-status-up', 'pg-status-down', 'pg-status-loading');
  banner.classList.add('pg-status-' + state);
  if (t) t.textContent = title;
  if (d) d.textContent = desc;
}

async function pgCheckHealth() {
  pgSetStatus('loading', 'Comprobando…', 'GET ' + PG_API + '/health');
  try {
    const h = await pgFetch('/health');
    PG_CONNECTED = true;
    const tplOk = h.templates_capa1_exists && h.templates_capa2_exists;
    pgSetStatus('up',
      '🟢 Backend conectado · v' + h.version,
      'SQX path: ' + (h.sqx_path || '(no set)') + ' · Templates: ' + (tplOk ? 'C1+C2 OK' : '⚠ alguno falta'));
    await pgLoadAll();
  } catch(e) {
    PG_CONNECTED = false;
    pgSetStatus('down',
      '🔴 Backend desconectado',
      'Lanza "run-web.bat" en sqx-edge-tool/ para arrancar la API en localhost:5050. Detalle: ' + e.message);
  }
}

async function pgLoadAll() {
  await Promise.all([pgLoadConfig(), pgLoadMinings(), pgLoadOutput()]);
}

let PG_ALIASES = {}; // estado en memoria de los aliases editados

async function pgLoadConfig() {
  try {
    const c = await pgFetch('/config');
    document.getElementById('pg-sqx-path').value = c.sqx_path || '';
    document.getElementById('pg-sqx-db').value = c.sqx_data_db || '';
    document.getElementById('pg-sqx-projects').value = c.sqx_projects_dir || '';
    document.getElementById('pg-output-dir').value = c.output_dir || '';
    document.getElementById('pg-tpl-c1').value = c.template_capa1 || '';
    document.getElementById('pg-tpl-c2').value = c.template_capa2 || '';
    PG_ALIASES = c.asset_aliases || {};
    pgRenderAliases();
  } catch(e) { pgLog('Error cargando config: ' + e.message, 'err'); }
}

function pgRenderAliases() {
  const tbl = document.getElementById('pg-aliases-table');
  if (!tbl) return;
  // Lista de assets únicos del plan (los obtenemos de la tabla minings ya cargada)
  // Si todavía no se han cargado, mostramos placeholder
  fetch(PG_API + '/minings').then(r => r.json()).then(minings => {
    const assets = [...new Set(minings.map(m => m.asset))].sort();
    tbl.innerHTML =
      '<table class="cat-table" style="font-size:12px;">' +
        '<thead><tr><th>Asset (plan)</th><th>Instrument SQX (alias)</th><th></th></tr></thead>' +
        '<tbody>' +
        assets.map(a => {
          const cur = PG_ALIASES[a] || '';
          return '<tr>' +
            '<td style="font-weight:700;">'+a+'</td>' +
            '<td><input type="text" class="search-input" style="width:200px;font-size:12px;padding:4px 8px;" data-pg-alias="'+a+'" value="'+cur+'" placeholder="(default)"></td>' +
            '<td><button class="export-btn" style="padding:3px 10px;font-size:11px;" data-pg-suggest-asset="'+a+'">🔍</button></td>' +
          '</tr>';
        }).join('') +
        '</tbody>' +
      '</table>';
    // Bind input change
    tbl.querySelectorAll('input[data-pg-alias]').forEach(inp => {
      inp.addEventListener('change', function(){
        const k = this.dataset.pgAlias;
        const v = this.value.trim();
        if (v) PG_ALIASES[k] = v;
        else delete PG_ALIASES[k];
      });
    });
    // Bind suggest button
    tbl.querySelectorAll('button[data-pg-suggest-asset]').forEach(btn => {
      btn.addEventListener('click', () => pgSuggestForAsset(btn.dataset.pgSuggestAsset));
    });
  }).catch(() => {
    tbl.innerHTML = '<div style="color:var(--text2);font-size:12px;">(esperando minings…)</div>';
  });
}

async function pgSuggestForAsset(asset) {
  try {
    const r = await pgFetch('/suggest-instruments/' + asset);
    if (!r.suggestions || !r.suggestions.length) {
      pgLog('Sin sugerencias para ' + asset + ' en data.db', 'err');
      return;
    }
    // Mostrar prompt simple con las top 5 sugerencias
    const top = r.suggestions.slice(0, 5);
    const opts = top.map((s, i) => (i+1) + '. ' + s.instrument + ' [' + s.score + '%] — ' + (s.description || '') + ' (broker_id=' + s.broker_id + ')').join('\n');
    const choice = prompt('Sugerencias para "' + asset + '":\n\n' + opts + '\n\nElige número (1-' + top.length + ') o escribe el ticker manualmente:', '1');
    if (!choice) return;
    let chosen = '';
    const idx = parseInt(choice, 10);
    if (idx >= 1 && idx <= top.length) chosen = top[idx - 1].instrument;
    else chosen = choice.trim();
    PG_ALIASES[asset] = chosen;
    document.querySelector('input[data-pg-alias="' + asset + '"]').value = chosen;
    pgLog('Alias propuesto: ' + asset + ' → ' + chosen + ' (pulsa Guardar config)', 'info');
  } catch(e) { pgLog('Error sugiriendo: ' + e.message, 'err'); }
}

async function pgSuggestAll() {
  const inputs = document.querySelectorAll('input[data-pg-alias]');
  pgLog('Auto-sugiriendo para ' + inputs.length + ' assets…', 'info');
  let found = 0;
  for (const inp of inputs) {
    const asset = inp.dataset.pgAlias;
    try {
      const r = await pgFetch('/suggest-instruments/' + asset);
      const top = r.suggestions && r.suggestions[0];
      // Solo sugerir si score > 80 y no hay alias actual
      if (top && top.score >= 80 && !inp.value.trim()) {
        inp.value = top.instrument;
        PG_ALIASES[asset] = top.instrument;
        found++;
      }
    } catch {}
  }
  pgLog('Auto-suggest: ' + found + ' aliases nuevos propuestos (pulsa Guardar config)', found > 0 ? 'ok' : 'info');
}

function pgDirClass(d) { return d === 'long' ? 'long' : d === 'short' ? 'short' : 'both'; }
function pgDirLabel(d) { return d === 'long' ? 'LONG' : d === 'short' ? 'SHORT' : 'L+S'; }

async function pgLoadMinings() {
  try {
    const minings = await pgFetch('/minings');
    document.getElementById('pg-minings-count').textContent = minings.length + ' minings';
    // Resolver costos para cada mining en paralelo (cosmético, no bloquea generación)
    const infos = await Promise.all(minings.map(async m => {
      try { return { ...m, _info: (await pgFetch('/symbol-info/' + m.asset)).info }; }
      catch { return { ...m, _info: null }; }
    }));
    const html = infos.map(m => {
      const info = m._info;
      const srcBadge = info && info.source === 'db'
        ? '<span class="pgm-src pgm-src-db" title="Costos leídos de data.db: ' + info.instrument + ' spread=' + info.spread + ' swap=' + info.swap_long + '/' + info.swap_short + '">📊 DB</span>'
        : '<span class="pgm-src pgm-src-fallback" title="Costos por defecto (data.db no disponible o asset no encontrado)">📋 Default</span>';
      const instrAlias = info && info.instrument && info.instrument !== m.asset
        ? '<span class="pgm-alias" title="Alias: ' + m.asset + ' -> ' + info.instrument + ' en SQX DB">→ ' + info.instrument + '</span>'
        : '';
      const sqxCfgInfo = {
        A: 'Both + Entry Sym (Forex L/S simétrico)',
        B: 'Both sin Sym (Índice/oro L+S)',
        C: 'Only Long (Índice/oro Long puro)',
        D: 'Only Short (Edge short)',
      };
      const sqxCfg = m.sqx_config && sqxCfgInfo[m.sqx_config]
        ? '<span class="pgm-sqx-cfg pgm-sqx-' + m.sqx_config.toLowerCase() + '" title="Config SQX: ' + sqxCfgInfo[m.sqx_config] + '">' + m.sqx_config + '</span>'
        : '';
      return '<div class="pg-mining-row">' +
        '<div class="pgm-num">M' + String(m.num).padStart(2,'0') + '</div>' +
        '<div class="pgm-asset">' + m.asset + instrAlias + '</div>' +
        '<div class="pgm-tf">' + m.tf + '</div>' +
        '<div class="pgm-bs">' + m.bs + '</div>' +
        '<div class="pgm-dir ' + pgDirClass(m.dir) + '">' + pgDirLabel(m.dir) + '</div>' +
        sqxCfg +
        srcBadge +
        '<div class="pgm-actions">' +
          '<button class="pgm-btn c1" data-pg-gen="' + m.num + '" data-pg-capa="1">📦 Capa 1</button>' +
          '<button class="pgm-btn c2" data-pg-gen="' + m.num + '" data-pg-capa="2">📦 Capa 2</button>' +
        '</div>' +
      '</div>';
    });
    document.getElementById('pg-minings-table').innerHTML = html.join('');
    document.querySelectorAll('button[data-pg-gen]').forEach(btn => {
      btn.addEventListener('click', () => pgGenerateOne(parseInt(btn.dataset.pgGen,10), parseInt(btn.dataset.pgCapa,10)));
    });
  } catch(e) { pgLog('Error cargando minings: ' + e.message, 'err'); }
}

async function pgLoadOutput() {
  try {
    const r = await pgFetch('/output');
    document.getElementById('pg-output-count').textContent = r.files.length + ' archivos';
    const list = document.getElementById('pg-output-list');
    if (!r.files.length) {
      list.innerHTML = '<div class="pg-output-empty">No hay .cfx generados todavía. Pulsa un botón "📦 Capa 1/2" arriba.</div>';
      return;
    }
    list.innerHTML = r.files.map(f =>
      '<div class="pg-output-row">' +
        '<div class="pgo-name">' + f.name + '</div>' +
        '<div class="pgo-size">' + f.size_kb + ' KB</div>' +
        '<div class="pgo-time">' + new Date(f.mtime * 1000).toLocaleString() + '</div>' +
      '</div>');
  } catch(e) { pgLog('Error cargando output: ' + e.message, 'err'); }
}

async function pgGenerateOne(mining, capa) {
  pgLog('Generando Mining ' + mining + ' · Capa ' + capa + '…', 'info');
  try {
    const r = await pgFetch('/generate', { method:'POST', body: { mining, capa } });
    if (r.ok) {
      pgLog('✓ ' + r.filename, 'ok');
      await pgLoadOutput();
    } else {
      pgLog('✗ ' + (r.error || 'fallo'), 'err');
    }
  } catch(e) { pgLog('✗ Error: ' + e.message, 'err'); }
}

async function pgGenerateAll(capa) {
  if (!confirm('¿Generar los 14 minings en Capa ' + capa + '? Sobrescribe los existentes en output/.')) return;
  pgLog('Generando TODOS · Capa ' + capa + '…', 'info');
  try {
    const r = await pgFetch('/generate-all', { method:'POST', body: { capa } });
    pgLog('OK: ' + r.ok_count + ' · FAIL: ' + r.fail_count, r.fail_count === 0 ? 'ok' : 'err');
    r.results.forEach(x => {
      if (x.ok) pgLog('  ✓ M' + String(x.mining).padStart(2,'0') + ' → ' + x.filename, 'ok');
      else pgLog('  ✗ M' + String(x.mining).padStart(2,'0') + ' → ' + x.error, 'err');
    });
    await pgLoadOutput();
  } catch(e) { pgLog('✗ Error: ' + e.message, 'err'); }
}

async function pgSaveConfig() {
  const body = {
    sqx_path: document.getElementById('pg-sqx-path').value.trim(),
    sqx_data_db: document.getElementById('pg-sqx-db').value.trim(),
    sqx_projects_dir: document.getElementById('pg-sqx-projects').value.trim(),
    output_dir: document.getElementById('pg-output-dir').value.trim(),
    template_capa1: document.getElementById('pg-tpl-c1').value.trim(),
    template_capa2: document.getElementById('pg-tpl-c2').value.trim(),
    asset_aliases: PG_ALIASES,
  };
  const msg = document.getElementById('pg-settings-msg');
  msg.textContent = 'Guardando…';
  try {
    const r = await pgFetch('/config', { method:'POST', body });
    msg.textContent = '✓ Guardado: ' + r.updated_keys.join(', ');
    msg.style.color = 'var(--green)';
    pgLog('Config actualizada (' + r.updated_keys.length + ' keys)', 'ok');
    await pgCheckHealth();
  } catch(e) {
    msg.textContent = '✗ Error: ' + e.message;
    msg.style.color = 'var(--red)';
  }
}

// ── Listeners Project Generator ──
(function pgInit(){
  const refresh = document.getElementById('pg-status-refresh');
  if (!refresh) return; // tab no está en el HTML

  refresh.addEventListener('click', pgCheckHealth);

  document.getElementById('pg-settings-toggle').addEventListener('click', function(){
    const body = document.getElementById('pg-settings-body');
    const arrow = document.getElementById('pg-settings-arrow');
    const open = body.style.display !== 'none';
    body.style.display = open ? 'none' : 'block';
    arrow.classList.toggle('closed', open);
  });
  document.getElementById('pg-settings-save').addEventListener('click', pgSaveConfig);
  document.getElementById('pg-settings-reload').addEventListener('click', pgLoadConfig);

  // Auto-detect SQX install
  document.getElementById('pg-autodetect').addEventListener('click', async function(){
    const out = document.getElementById('pg-autodetect-results');
    out.innerHTML = '<div style="color:var(--text2);font-size:12px;">🔍 Buscando instalaciones de SQX...</div>';
    try {
      const r = await pgFetch('/autodetect-sqx');
      if (!r.found) {
        out.innerHTML = '<div class="alert warning"><div class="alert-icon">⚠</div><div class="alert-content"><strong>No se encontró ninguna instalación de SQX.</strong>Edita los campos manualmente con la ruta donde esté StrategyQuantX.exe.</div></div>';
        return;
      }
      out.innerHTML = '<div style="font-size:12px;color:var(--text2);margin-bottom:6px;">'+r.found+' instalación(es) detectada(s):</div>' +
        r.candidates.map((c, i) =>
          '<div class="pg-autodetect-row">' +
            '<div style="flex:1;">' +
              '<div style="font-weight:700;font-size:13px;">SQX v'+c.version+(c.has_exe?' ✓':' ⚠ sin .exe')+'</div>' +
              '<div style="font-family:Consolas,monospace;font-size:11px;color:var(--text2);">'+c.sqx_path+'</div>' +
              '<div style="font-family:Consolas,monospace;font-size:10px;color:var(--text2);">→ data.db: '+c.data_db+'</div>' +
            '</div>' +
            '<button class="export-btn pg-use-btn" data-idx="'+i+'" style="border-color:var(--green);color:var(--green);">Usar esta</button>' +
          '</div>'
        ).join('');
      // Bind use buttons
      document.querySelectorAll('.pg-use-btn').forEach(btn => {
        btn.addEventListener('click', function(){
          const c = r.candidates[parseInt(this.dataset.idx, 10)];
          document.getElementById('pg-sqx-path').value = c.sqx_path;
          document.getElementById('pg-sqx-db').value = c.data_db;
          document.getElementById('pg-sqx-projects').value = c.projects_dir;
          pgLog('Path SQX seleccionado: ' + c.sqx_path + ' (pulsa Guardar config)', 'info');
          out.innerHTML = '<div class="alert success"><div class="alert-icon">✓</div><div class="alert-content"><strong>Aplicado.</strong> Pulsa "💾 Guardar config" para persistir.</div></div>';
        });
      });
    } catch(e) {
      out.innerHTML = '<div style="color:var(--red);font-size:12px;">Error: '+e.message+'</div>';
    }
  });

  // Auto-sugerir aliases para todos los assets
  document.getElementById('pg-aliases-suggest').addEventListener('click', pgSuggestAll);

  // Validar paths actuales
  document.getElementById('pg-validate').addEventListener('click', async function(){
    const path = document.getElementById('pg-sqx-path').value.trim();
    const out = document.getElementById('pg-autodetect-results');
    if (!path) { out.innerHTML = '<div style="color:var(--yellow);font-size:12px;">Pon primero un SQX install path.</div>'; return; }
    try {
      const r = await pgFetch('/validate-sqx-path', { method:'POST', body: { path } });
      const c = r.checks;
      const item = (label, ok) => '<li style="color:'+(ok?'var(--green)':'var(--red)')+';">'+(ok?'✓':'✗')+' '+label+'</li>';
      out.innerHTML = '<div class="alert '+(r.valid?'success':'warning')+'"><div class="alert-icon">'+(r.valid?'✓':'⚠')+'</div><div class="alert-content"><strong>'+(r.valid?'Path válido':'Path con problemas')+'</strong>' +
        '<ul style="margin-top:6px;padding-left:20px;font-size:12px;">' +
          item('Directorio base existe', c.base_exists) +
          item('user/data/data.db existe', c.data_db_exists) +
          item('user/projects/ existe', c.projects_exists) +
          item('StrategyQuantX.exe existe', c.exe_exists) +
        '</ul></div></div>';
      if (r.valid && r.resolved.data_db) {
        document.getElementById('pg-sqx-db').value = r.resolved.data_db;
        document.getElementById('pg-sqx-projects').value = r.resolved.projects_dir || '';
      }
    } catch(e) {
      out.innerHTML = '<div style="color:var(--red);font-size:12px;">Error: '+e.message+'</div>';
    }
  });

  document.getElementById('pg-gen-all-c1').addEventListener('click', () => pgGenerateAll(1));
  document.getElementById('pg-gen-all-c2').addEventListener('click', () => pgGenerateAll(2));
  document.getElementById('pg-output-refresh').addEventListener('click', pgLoadOutput);
  document.getElementById('pg-log-clear').addEventListener('click', function(){
    document.getElementById('pg-log').textContent = '[esperando primera acción…]';
  });

  // ── Strategy Cleaner ──
  let CLN_FILES = [];        // todos los .sqx escaneados
  let CLN_SELECTED = new Set(); // paths seleccionados

  async function clnScan() {
    const dir = document.getElementById('cln-dir').value.trim();
    const recursive = document.getElementById('cln-recursive').checked;
    const info = document.getElementById('cln-info');
    if (!dir) { info.textContent = 'Pon una carpeta primero.'; info.style.color='var(--yellow)'; return; }
    info.textContent = '🔍 Escaneando...'; info.style.color='var(--text2)';
    try {
      const r = await pgFetch('/sqx-list', { method:'POST', body: { dir, recursive } });
      if (!r.ok) { info.textContent = '✗ ' + r.error; info.style.color='var(--red)'; return; }
      CLN_FILES = r.files;
      CLN_SELECTED = new Set();
      info.textContent = '✓ ' + r.count + ' archivos .sqx encontrados';
      info.style.color = 'var(--green)';
      clnRenderTable();
      document.getElementById('cln-actions').style.display = r.count > 0 ? 'block' : 'none';
    } catch(e) { info.textContent = '✗ ' + e.message; info.style.color='var(--red)'; }
  }

  function clnRenderTable() {
    const tbl = document.getElementById('cln-table');
    if (!CLN_FILES.length) { tbl.innerHTML = ''; return; }
    tbl.innerHTML =
      '<div class="matrix-wrap" style="max-height:380px;">' +
        '<table class="cat-table" style="font-size:11px;">' +
          '<thead><tr>' +
            '<th style="width:30px;"><input type="checkbox" id="cln-th-check"></th>' +
            '<th>Archivo</th><th>Asset</th><th>TF</th><th>Dir</th>' +
            '<th>EAB</th><th>ID</th><th>KB</th>' +
          '</tr></thead><tbody>' +
          CLN_FILES.map(f => {
            const checked = CLN_SELECTED.has(f.path) ? 'checked' : '';
            const eabCls = f.exit_after_bars_count > 0 ? 'cv-num warn' : 'cv-num pos';
            return '<tr>' +
              '<td><input type="checkbox" class="cln-row-check" data-path="'+f.path.replace(/"/g,'&quot;')+'" '+checked+'></td>' +
              '<td style="font-family:Consolas,monospace;">'+f.name+'</td>' +
              '<td><strong>'+f.asset+'</strong></td>' +
              '<td>'+f.timeframe+'</td>' +
              '<td>'+f.direction+'</td>' +
              '<td class="'+eabCls+'">'+f.exit_after_bars_count+'</td>' +
              '<td>'+f.fitness_id+'</td>' +
              '<td style="color:var(--text2);">'+f.size_kb+'</td>' +
            '</tr>';
          }).join('') +
        '</tbody></table></div>';
    document.querySelectorAll('.cln-row-check').forEach(cb => cb.addEventListener('change', function(){
      const p = this.dataset.path;
      if (this.checked) CLN_SELECTED.add(p); else CLN_SELECTED.delete(p);
      clnUpdateSelectedCount();
    }));
    document.getElementById('cln-th-check').addEventListener('change', function(){
      if (this.checked) CLN_FILES.forEach(f => CLN_SELECTED.add(f.path));
      else CLN_SELECTED.clear();
      clnRenderTable();
      clnUpdateSelectedCount();
    });
    clnUpdateSelectedCount();
  }

  function clnUpdateSelectedCount() {
    document.getElementById('cln-selected').textContent = CLN_SELECTED.size + ' seleccionadas';
  }

  async function clnPreviewRename() {
    if (!CLN_SELECTED.size) { pgLog('No hay nada seleccionado', 'err'); return; }
    const pattern = document.getElementById('cln-pattern').value.trim() || '{asset}_{tf}_{dir}_{id}';
    try {
      const r = await pgFetch('/sqx-preview-rename', { method:'POST', body: { files: [...CLN_SELECTED], pattern } });
      pgLog('Preview rename para ' + r.previews.length + ' archivos:', 'info');
      r.previews.forEach(p => {
        if (p.error) pgLog('  ✗ ' + p.path + ': ' + p.error, 'err');
        else pgLog('  ' + p.current + ' → ' + p.new_name, 'info');
      });
    } catch(e) { pgLog('Error preview: ' + e.message, 'err'); }
  }

  async function clnProcess() {
    if (!CLN_SELECTED.size) { pgLog('No hay nada seleccionado', 'err'); return; }
    const opts = {
      remove_exit_bars: document.getElementById('cln-opt-eab').checked,
      rename_institutional: document.getElementById('cln-opt-rename').checked,
      rename_pattern: document.getElementById('cln-pattern').value.trim() || '{asset}_{tf}_{dir}_{id}',
    };
    if (!opts.remove_exit_bars && !opts.rename_institutional) {
      pgLog('Selecciona al menos una acción', 'err'); return;
    }
    const msg = `¿Procesar ${CLN_SELECTED.size} archivos?\n\n` +
      (opts.remove_exit_bars ? '• Eliminar ExitAfterBars (set 0)\n' : '') +
      (opts.rename_institutional ? `• Renombrar a: ${opts.rename_pattern}\n` : '') +
      '\nLos cambios son IN-PLACE (modifica los .sqx originales).';
    if (!confirm(msg)) return;
    pgLog('🧹 Procesando ' + CLN_SELECTED.size + ' archivos...', 'info');
    try {
      const r = await pgFetch('/sqx-clean', { method:'POST', body: { files: [...CLN_SELECTED], options: opts } });
      pgLog('Resultado: ' + r.ok_count + ' OK · ' + r.fail_count + ' FAIL', r.fail_count === 0 ? 'ok' : 'err');
      r.results.forEach(x => {
        const fname = x.path.split(/[\\/]/).pop();
        if (x.ok) pgLog('  ✓ ' + fname + ' — ' + x.actions.join(', '), 'ok');
        else pgLog('  ✗ ' + fname + ' — ' + x.actions.join(', '), 'err');
      });
      // Re-scan al terminar
      await clnScan();
    } catch(e) { pgLog('Error procesando: ' + e.message, 'err'); }
  }

  document.getElementById('cln-scan').addEventListener('click', clnScan);
  document.getElementById('cln-preview').addEventListener('click', clnPreviewRename);
  document.getElementById('cln-process').addEventListener('click', clnProcess);
  document.getElementById('cln-select-all').addEventListener('click', function(){ CLN_FILES.forEach(f => CLN_SELECTED.add(f.path)); clnRenderTable(); });
  document.getElementById('cln-select-none').addEventListener('click', function(){ CLN_SELECTED.clear(); clnRenderTable(); });
  document.getElementById('cln-opt-rename').addEventListener('change', function(){
    document.getElementById('cln-pattern-wrap').style.display = this.checked ? 'inline-block' : 'none';
  });

  document.getElementById('pg-open-output').addEventListener('click', async function(){
    if (!PG_CONNECTED) { pgLog('Backend desconectado', 'err'); return; }
    try {
      const cfg = await pgFetch('/config');
      const out = cfg.output_dir || 'output';
      // El path absoluto lo resuelve el backend
      const r = await pgFetch('/output');
      await pgFetch('/open-folder', { method:'POST', body: { path: r.output_dir } });
      pgLog('📁 Abierta carpeta output', 'info');
    } catch(e) { pgLog('Error abrir carpeta: ' + e.message, 'err'); }
  });

  // Auto-check al abrir el tab
  document.querySelectorAll('.tab[data-tab="projectgen"]').forEach(t => {
    t.addEventListener('click', function(){ setTimeout(pgCheckHealth, 100); });
  });
  // Polling cada 30s mientras esté visible
  setInterval(function(){
    if (document.getElementById('tab-projectgen').style.display !== 'none') pgCheckHealth();
  }, 30000);
  // Initial check al cargar la página (silencioso)
  setTimeout(pgCheckHealth, 500);
})();

