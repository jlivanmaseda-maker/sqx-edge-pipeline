// =============================================================================
// VIEWS — Asset Grid, Detail, Top Picks, Categories, Filtros, Matrix + listeners
// Depende de: data.js, core.js
// =============================================================================
// ============================================================
// RENDER: ASSET GRID
// ============================================================
// Filtro SQX:
//   A / B → match contra la config primaria recomendada (getSqxConfig)
//   C     → activos con ≥1 categoría dir:'L' (ideas Long puras — índices/oro)
//   D     → activos con ≥1 categoría dir:'S' (ideas Short puras — índices/oro)
function assetMatchesSqxFilter(a, code) {
  if (code === 'all') return true;
  if (code === 'A' || code === 'B') return getSqxConfig(a).code === code;
  if (code === 'C') return Object.values(a.cats).some(v => v.dir === 'L');
  if (code === 'D') return Object.values(a.cats).some(v => v.dir === 'S');
  return true;
}

// Composite promedio data-driven cross-cat para un activo (en su TF más bajo por cat)
function _avgCompositeForAsset(a) {
  if (typeof getScore !== 'function') return null;
  const seen = new Set();
  const comps = [];
  for (const [catKey, entry] of Object.entries(a.cats)) {
    const base = catKey.endsWith('_S') ? catKey.slice(0,-2) : catKey;
    if (seen.has(base + '|' + entry.dir)) continue;
    seen.add(base + '|' + entry.dir);
    const tfs = (entry.tf || '').split(',').map(t => t.trim()).filter(Boolean);
    let bestComp = -1;
    for (const tf of tfs) {
      const sc = getScore(a.id, catKey, tf);
      if (sc && sc.composite != null && sc.composite * 100 > bestComp) {
        bestComp = sc.composite * 100;
      }
    }
    if (bestComp >= 0) comps.push(bestComp);
  }
  if (!comps.length) return null;
  return Math.round(comps.reduce((s,v)=>s+v,0) / comps.length);
}

function renderAssetGrid() {
  const search = document.getElementById('search-asset').value.toUpperCase();
  let list = ASSETS.filter(a => {
    if (filterType!=='all' && a.type!==filterType) return false;
    if (!assetMatchesSqxFilter(a, filterSqx)) return false;
    if (search && !a.id.includes(search)) return false;
    return true;
  }).map(a => ({ ...a, sc: calcScore(a,'all'), avgComp: _avgCompositeForAsset(a) }));

  if (assetSort==='score-desc') list.sort((a,b)=>(b.avgComp ?? b.sc.raw)-(a.avgComp ?? a.sc.raw));
  else if (assetSort==='score-asc') list.sort((a,b)=>(a.avgComp ?? a.sc.raw)-(b.avgComp ?? b.sc.raw));
  else if (assetSort==='cats-desc') list.sort((a,b)=>b.sc.count-a.sc.count);
  else list.sort((a,b)=>a.id.localeCompare(b.id));

  document.getElementById('asset-grid').innerHTML = list.map(a => {
    const compColor = a.avgComp == null ? 'var(--text2)'
      : a.avgComp >= 75 ? 'var(--green)' : a.avgComp >= 60 ? 'var(--accent)' : a.avgComp >= 45 ? 'var(--yellow)' : 'var(--red)';
    const compHtml = a.avgComp != null
      ? `<div class="score-badge" style="margin-top:4px;" title="Promedio composite data-driven cross-categoría (TF más bajo del rango)">⚡ <span style="color:${compColor}">${a.avgComp}%</span></div>`
      : '';
    return `<div class="asset-card type-${a.type}${selectedAsset===a.id?' selected':''}" onclick="selectAsset('${a.id}')">
      <div class="name">${a.id}</div>
      <span class="type-badge">${a.sub}</span>
      ${sparkHTML(a)}
      <div class="score-badge">Score: <span>${a.sc.norm}%</span></div>
      ${compHtml}
      <div style="margin-top:6px">${sqxBadge(a, true)}</div>
      ${typeof dukasBadge === 'function' ? dukasBadge(a.id) : ''}
    </div>`;
  }).join('');
}

window.selectAsset = function selectAsset(id) {
  selectedAsset = id; renderAssetGrid(); renderDetail();
}

// ============================================================
// RENDER: DETAIL
// ============================================================
function renderDetail() {
  const panel = document.getElementById('detail-panel');
  if (!selectedAsset) { panel.classList.remove('visible'); return; }
  const a = ASSETS.find(x=>x.id===selectedAsset);
  if (!a) return;
  panel.classList.add('visible');

  const baseCats = {};
  for (const [key,val] of Object.entries(a.cats)) {
    const base = key.replace(/_S$/,'');
    if (!baseCats[base]) baseCats[base]=[];
    baseCats[base].push({...val, isShort:key.endsWith('_S')});
  }
  const sc = calcScore(a,'all');
  const typeBg    = a.type==='forex'?'rgba(59,130,246,.15)':a.type==='index'?'rgba(168,85,247,.15)':'rgba(234,179,8,.15)';
  const typeColor = a.type==='forex'?'var(--accent)':a.type==='index'?'var(--purple)':'var(--yellow)';

  const sqxConf = getSqxConfig(a);
  const sqxMeta = SQX_CONFIG_DESC[sqxConf.code] || { label:sqxConf.label, desc:sqxConf.desc };
  let html = `<div class="detail-header">
    <div class="asset-name">${a.id}</div>
    <span class="asset-type" style="background:${typeBg};color:${typeColor}">${a.sub}</span>
    ${sqxBadge(a)}
    <div class="asset-desc">${Object.keys(baseCats).length} categorias | ${a.type==='forex'?'L/S simetrico':'Long != Short'}</div>
    <div class="detail-score">${sc.norm}%<small>score global</small></div>
  </div>
  <div class="sqx-detail-box">
    ${sqxPreviewHTML(sqxConf.code)}
    <div class="sqx-detail-text">
      <strong>Config SQX ${sqxConf.code} · ${sqxConf.label}</strong>
      ${sqxMeta.desc}
    </div>
  </div>
  ${historySection(a.id)}
  ${typeof dukasQualityDetail === 'function' ? `
  <div class="dukas-quality-section" style="margin-top:18px;padding:14px;background:var(--surface);border:1px solid var(--border);border-radius:6px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <span style="font-size:14px;font-weight:700;">📊 Calidad data Dukascopy</span>
      <span style="font-size:11px;color:var(--text2);">— guía para decidir Opción 1 (Darwinex) vs Opción 2 (Dukas 2010+)</span>
    </div>
    ${dukasQualityDetail(a.id)}
  </div>` : ''}
  <div class="cat-cards">`;

  for (const [catKey,entries] of Object.entries(baseCats)) {
    const meta = CAT_META[catKey]; if (!meta) continue;
    for (const entry of entries) {
      const r = rLabel(entry.rating);
      const dLabel = entry.dir==='L'?'LONG':entry.dir==='S'?'SHORT':'LONG / SHORT';
      // Composite del TF más bajo del rango editorial (modo Auto)
      const tfs = (entry.tf || '').split(',').map(t => t.trim()).filter(Boolean);
      let bestTf = null, bestSc = null, bestComp = -1;
      const realCatKey = entry.isShort ? catKey + '_S' : catKey;
      for (const tf of tfs) {
        const s = getScore(a.id, realCatKey, tf);
        if (s && s.composite != null && s.composite * 100 > bestComp) {
          bestComp = s.composite * 100; bestSc = s; bestTf = tf;
        }
      }
      const compPct = bestComp >= 0 ? Math.round(bestComp) : null;
      const compColor = compPct == null ? 'var(--text2)'
        : compPct >= 90 ? 'var(--green)' : compPct >= 75 ? 'var(--accent)' : compPct >= 60 ? 'var(--yellow)' : 'var(--red)';
      const tip = bestSc && bestSc.metrics
        ? Object.entries(bestSc.metrics).map(([k,v]) => k+'='+v).join(' · ')
        : '';
      const compRow = compPct != null
        ? `<div class="info-row" style="background:rgba(${compPct >= 75 ? '34,197,94' : '59,130,246'},.04);padding:6px 0;">
             <span class="info-label">Composite ⚡</span>
             <span class="info-value" style="font-weight:800;color:${compColor};">
               ${compPct}% <span style="font-size:10px;color:var(--text2);font-family:Consolas,monospace;background:var(--surface);padding:1px 6px;border-radius:3px;margin-left:4px;">${bestTf}</span>
             </span>
           </div>`
        : '';
      html += `<div class="cat-card">
        <div class="cat-card-header">
          <div class="cat-icon" style="background:${meta.color}22;color:${meta.color}">${meta.icon}</div>
          <div class="cat-name">${meta.name}</div>
          <span class="rating ${r.cls}" title="${tip}">${r.text}</span>
        </div>
        <div class="info-row"><span class="info-label">Direccion</span><span class="info-value ${dirCls(entry.dir)}">${dLabel}</span></div>
        <div class="info-row"><span class="info-label">Timeframes</span><span class="info-value">${entry.tf}</span></div>
        ${compRow}
        <div class="info-row"><span class="info-label">Por que</span><span class="info-value" style="font-weight:400;font-size:12px">${entry.why}</span></div>
      </div>`;
    }
  }
  html += '</div>';
  panel.innerHTML = html;
  panel.scrollIntoView({behavior:'smooth',block:'nearest'});
}

// ============================================================
// RENDER: TOP PICKS
// ============================================================
function renderTopPicks() {
  let html = '';

  // ── 1. PLAN v2 (los 14 minings recomendados, data-driven) ──
  if (typeof PLAN_MININGS !== 'undefined') {
    html += '<div class="top-section">' +
      '<div class="top-section-title">🎯 Plan v2 — 14 Minings Recomendados ' +
        '<span class="badge" style="background:rgba(34,197,94,.15);color:var(--green)">data-driven multi-TF</span>' +
      '</div>' +
      '<div style="font-size:13px;color:var(--text2);margin-bottom:12px;">' +
        'Composite calculado en el TF más bajo del rango editorial · diversificado por activo/categoría/dirección · ' +
        'excluye short tendencial índices/oro y USDJPY (data parcial Dukascopy).' +
      '</div>' +
      '<div class="top-grid">';
    const sqxCfgInfo = {A:'Forex L/S sym', B:'Idx/oro L+S', C:'Long puro', D:'Short puro'};
    PLAN_MININGS.forEach(m => {
      const dirCls = m.dir==='L'?'dir-long':(m.dir==='S'?'dir-short':'dir-both');
      const phaseColor = m.phase===1?'var(--green)':(m.phase===2?'var(--accent)':'var(--purple)');
      html += '<div class="top-card" onclick="navToAsset(\''+m.asset+'\')" ' +
        'style="border-left:3px solid '+phaseColor+'">' +
        '<div class="rank">#M'+String(m.num).padStart(2,'0')+' · F'+m.phase+'</div>' +
        '<div class="tc-name">'+m.asset+'</div>' +
        '<div class="tc-sub">'+m.tf+' · '+m.bs.replace('BS_','')+'</div>' +
        '<div class="score-bar-wrap">' +
          '<div class="score-bar" style="width:'+Math.max(m.composite,3)+'%;background:'+phaseColor+'"></div>' +
          '<span class="score-val" style="color:'+phaseColor+'">'+m.composite+'%</span>' +
        '</div>' +
        '<div class="tc-cats" style="display:flex;align-items:center;gap:6px;margin-top:4px;">' +
          '<span class="'+dirCls+'" style="font-weight:700;font-size:11px;">'+m.dir+'</span>' +
          '<span class="pgm-sqx-cfg pgm-sqx-'+m.sqx_config.toLowerCase()+'" title="Config SQX: '+sqxCfgInfo[m.sqx_config]+'">'+m.sqx_config+'</span>' +
        '</div>' +
      '</div>';
    });
    html += '</div></div>';
  }

  // ── 2. Top 20 (asset, cat, TF) data-driven absoluto ──
  // Recorre todas las celdas (asset×cat×tf) usando composite del TF correspondiente
  const cells = [];
  for (const a of ASSETS) {
    const baseSeen = new Set();
    for (const [catKey, entry] of Object.entries(a.cats)) {
      const base = catKey.endsWith('_S') ? catKey.slice(0, -2) : catKey;
      if (baseSeen.has(base + '|' + entry.dir)) continue;
      baseSeen.add(base + '|' + entry.dir);
      // Direccion filter
      if (filterTpDir === 'L' && entry.dir === 'S') continue;
      if (filterTpDir === 'S' && entry.dir === 'L') continue;
      // Composite del TF más bajo del rango editorial
      const tfs = (entry.tf || '').split(',').map(t => t.trim()).filter(Boolean);
      let bestTf = null, bestComp = null;
      for (const tf of tfs) {
        const sc = (typeof getScore === 'function') ? getScore(a.id, catKey, tf) : null;
        if (sc && sc.composite != null) {
          const comp = Math.round(sc.composite * 100);
          if (bestComp == null || comp > bestComp) { bestComp = comp; bestTf = tf; }
        }
      }
      if (bestComp == null) continue;
      cells.push({asset: a, cat: base, dir: entry.dir, tf: bestTf, composite: bestComp,
                  catMeta: CAT_META[base] || {}});
    }
  }
  cells.sort((x,y) => y.composite - x.composite);
  const top20 = cells.slice(0, 20);

  html += '<div class="top-section">' +
    '<div class="top-section-title">🏆 Top 20 (Asset × Categoría × TF) data-driven ' +
      '<span class="badge" style="background:rgba(59,130,246,.15);color:var(--accent)">composite multi-TF</span>' +
    '</div>' +
    '<table class="cat-table" style="font-size:13px;">' +
      '<thead><tr><th style="width:36px">#</th><th>Asset</th><th>Categoría</th><th>TF</th><th>Dir</th><th style="width:160px">Composite</th></tr></thead><tbody>';
  top20.forEach((c, i) => {
    const dirCls = c.dir==='L'?'dir-long':(c.dir==='S'?'dir-short':'dir-both');
    const tierColor = c.composite >= 90 ? 'var(--green)' : c.composite >= 75 ? 'var(--accent)' : c.composite >= 60 ? 'var(--yellow)' : 'var(--red)';
    html += '<tr>' +
      '<td style="font-weight:700;color:var(--text2)">'+(i+1)+'</td>' +
      '<td><span class="asset-link" onclick="navToAsset(\''+c.asset.id+'\')">'+c.asset.id+'</span> <span style="color:var(--text2);font-size:11px">'+c.asset.sub+'</span></td>' +
      '<td><span style="color:'+(c.catMeta.color||'#888')+';font-weight:700;display:inline-block;width:18px">'+(c.catMeta.icon||'?')+'</span> '+(c.catMeta.name||c.cat)+'</td>' +
      '<td><code style="font-size:11px;color:var(--text2)">'+c.tf+'</code></td>' +
      '<td class="'+dirCls+'" style="font-weight:700;font-size:12px">'+c.dir+'</td>' +
      '<td><span class="priority-bar-wrap"><span class="priority-bar" style="width:'+c.composite+'%;background:'+tierColor+'"></span></span><span style="font-weight:700;color:'+tierColor+'">'+c.composite+'%</span></td>' +
    '</tr>';
  });
  html += '</tbody></table></div>';

  // ── 3. Top 5 por categoría (data-driven con composite numérico) ──
  html += '<div class="top-section"><div class="top-section-title">⭐ Top 5 por Categoría — data-driven</div><div class="cat-top-grid">';
  for (const [ck, meta] of Object.entries(CAT_META)) {
    const rows = [];
    for (const a of ASSETS) {
      const baseSeen = new Set();
      for (const [key, val] of Object.entries(a.cats)) {
        const base = key.replace(/_S$/, '');
        if (base !== ck) continue;
        if (baseSeen.has(val.dir)) continue;
        baseSeen.add(val.dir);
        if (filterTpDir === 'L' && val.dir === 'S') continue;
        if (filterTpDir === 'S' && val.dir === 'L') continue;
        // Composite del TF más bajo
        const tfs = (val.tf || '').split(',').map(t => t.trim()).filter(Boolean);
        let bestTf = null, bestComp = -1;
        for (const tf of tfs) {
          const sc = (typeof getScore === 'function') ? getScore(a.id, key, tf) : null;
          if (sc && sc.composite != null && sc.composite * 100 > bestComp) {
            bestComp = sc.composite * 100; bestTf = tf;
          }
        }
        if (bestComp < 0) continue;
        rows.push({a, val, comp: Math.round(bestComp), tf: bestTf});
      }
    }
    rows.sort((x, y) => y.comp - x.comp);
    const top5 = rows.slice(0, 5);
    html += '<div class="cat-top-card">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">' +
        '<div style="width:32px;height:32px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:16px;background:'+meta.color+'22;color:'+meta.color+'">'+meta.icon+'</div>' +
        '<span style="font-weight:700">'+meta.name+'</span>' +
      '</div>';
    top5.forEach((row, i) => {
      const dirCls = row.val.dir==='L'?'dir-long':(row.val.dir==='S'?'dir-short':'dir-both');
      const compColor = row.comp >= 90 ? 'var(--green)' : row.comp >= 75 ? 'var(--accent)' : row.comp >= 60 ? 'var(--yellow)' : 'var(--text2)';
      html += '<div class="cat-top-row" onclick="navToAsset(\''+row.a.id+'\')">' +
        '<span style="color:var(--text2);width:18px;font-size:11px">#'+(i+1)+'</span>' +
        '<span class="asset-link">'+row.a.id+'</span>' +
        '<span class="'+dirCls+'" style="font-size:10px;font-weight:700;">'+row.val.dir+'</span>' +
        '<span style="font-size:10px;color:var(--text2);font-family:Consolas,monospace;">'+row.tf+'</span>' +
        '<span style="flex:1;text-align:right;font-weight:700;color:'+compColor+';font-size:12px;">'+row.comp+'%</span>' +
      '</div>';
    });
    html += '</div>';
  }
  html += '</div></div>';

  document.getElementById('toppicks-view').innerHTML = html;
}

// ============================================================
// RENDER: CATEGORIES
// ============================================================
function renderCategoriesView() {
  let html='';
  for (const [catKey,meta] of Object.entries(CAT_META)) {
    let rows=[];
    for (const a of ASSETS) {
      for (const [key,val] of Object.entries(a.cats)) {
        const base=key.replace(/_S$/,'');
        if (base!==catKey) continue;
        if (filterDir==='L'&&val.dir==='S') continue;
        if (filterDir==='S'&&val.dir==='L') continue;
        if (filterCatRating!=='all'&&val.rating!==filterCatRating) continue;
        if (filterCatSub!=='all'&&a.sub!==filterCatSub) continue;
        if (filterCatTf!=='all'&&!tfMatch(val.tf,filterCatTf)) continue;
        // Calcular composite del TF más bajo del rango (o del TF filtrado si aplica)
        const tfs = (val.tf || '').split(',').map(t => t.trim()).filter(Boolean);
        let bestTf = null, bestComp = -1;
        for (const tf of tfs) {
          if (filterCatTf !== 'all' && !tfMatch(tf, filterCatTf)) continue;
          const sc = (typeof getScore === 'function') ? getScore(a.id, key, tf) : null;
          if (sc && sc.composite != null && sc.composite * 100 > bestComp) {
            bestComp = sc.composite * 100; bestTf = tf;
          }
        }
        rows.push({
          asset:a, ...val, isShort:key.endsWith('_S'),
          composite: bestComp >= 0 ? Math.round(bestComp) : null,
          tf_score: bestTf,
        });
      }
    }
    const s=sortState.cat[catKey]||{col:'composite',dir:'desc'};  // default ordenado por composite desc
    rows=sortRows(rows,s.col,s.dir);
    const collapsed=collapseMap[catKey]??false;
    const maxH=collapsed?'0':'2000px';

    html+=`<div class="category-section">
      <div class="category-header-row" onclick="toggleCat('${catKey}')">
        <div class="cat-icon" style="background:${meta.color}22;color:${meta.color}">${meta.icon}</div>
        <h2>${meta.name}</h2>
        <span class="cat-desc">${meta.desc}</span>
        <span style="color:var(--text2);font-size:13px;margin-right:8px">${rows.length} activos</span>
        <span class="collapse-arrow${collapsed?' closed':''}">▼</span>
      </div>
      <div class="cat-body" style="max-height:${maxH}">`;

    if (rows.length) {
      html+=`<table class="cat-table" style="margin-top:8px"><thead><tr>
        ${thH('Activo','asset','cat',catKey)}
        ${thH('Tipo','sub','cat',catKey)}
        ${thH('Dir','dir','cat',catKey)}
        ${thH('Timeframes','tf','cat',catKey)}
        ${thH('Rating','rating','cat',catKey)}
        ${thH('Composite ⚡','composite','cat',catKey)}
        <th>Por que</th>
      </tr></thead><tbody>`;
      for (const row of rows) {
        const r=rLabel(row.rating);
        const dl=row.dir==='L'?'LONG':row.dir==='S'?'SHORT':'L/S';
        const compColor = row.composite == null ? 'var(--text2)'
          : row.composite >= 90 ? 'var(--green)' : row.composite >= 75 ? 'var(--accent)'
          : row.composite >= 60 ? 'var(--yellow)' : row.composite >= 40 ? 'var(--orange)' : 'var(--red)';
        const compCell = row.composite != null
          ? `<span style="font-weight:700;color:${compColor};">${row.composite}%</span> <span style="font-size:10px;color:var(--text2);font-family:Consolas,monospace;background:var(--surface2);padding:1px 6px;border-radius:3px;margin-left:3px;">${row.tf_score}</span>`
          : '<span style="color:var(--text2);font-size:11px;">—</span>';
        html+=`<tr>
          <td><span class="asset-link" onclick="event.stopPropagation();navToAsset('${row.asset.id}')">${row.asset.id}</span></td>
          <td>${row.asset.sub}</td>
          <td class="${dirCls(row.dir)}" style="font-weight:700">${dl}</td>
          <td>${row.tf}</td>
          <td><span class="rating ${r.cls}">${r.text}</span></td>
          <td>${compCell}</td>
          <td style="font-size:12px;color:var(--text2);max-width:280px">${row.why}</td>
        </tr>`;
      }
      html+='</tbody></table>';
    } else {
      html+='<div class="no-data">No hay activos para este filtro</div>';
    }
    html+='</div></div>';
  }
  document.getElementById('categories-view').innerHTML=html;
}

window.toggleCat = function toggleCat(key) {
  collapseMap[key]=!(collapseMap[key]??false);
  renderCategoriesView();
}

// ============================================================
// RENDER: FILTROS
// ============================================================
function renderFiltros() {
  document.getElementById('filtros-view').innerHTML=FILTROS.map(f=>`<div class="filtro-card">
    <h3>${f.name}</h3><div class="filtro-desc">${f.desc}</div>
    <div class="thresholds">
      <div class="threshold threshold-long"><div class="th-label">Long</div>${f.long}</div>
      <div class="threshold threshold-short"><div class="th-label">Short</div>${f.short}</div>
    </div>
  </div>`).join('');
}

// ============================================================
// RENDER: MATRIX
// ============================================================
// Composite del TF más bajo del rango editorial para una entry (si filtra TF, usa ése)
function _bestCompositeForEntry(asset, catKey, entry, tfFilter) {
  if (typeof getScore !== 'function') return null;
  const tfs = (entry.tf || '').split(',').map(t => t.trim()).filter(Boolean);
  let bestComp = null;
  for (const tf of tfs) {
    if (tfFilter && tfFilter !== 'all' && !tfMatch(tf, tfFilter)) continue;
    const sc = getScore(asset.id, catKey, tf);
    if (sc && sc.composite != null) {
      const c = Math.round(sc.composite * 100);
      if (bestComp == null || c > bestComp) bestComp = c;
    }
  }
  return bestComp;
}

function _compositeColor(pct) {
  // Gradient continuo: 0% rojo → 50% naranja → 75% azul → 100% verde
  if (pct == null) return 'transparent';
  if (pct >= 90) return 'rgba(34,197,94,'+(0.15+pct/300).toFixed(2)+')';
  if (pct >= 75) return 'rgba(59,130,246,'+(0.10+pct/300).toFixed(2)+')';
  if (pct >= 60) return 'rgba(234,179,8,'+(0.10+pct/400).toFixed(2)+')';
  if (pct >= 40) return 'rgba(249,115,22,0.12)';
  return 'rgba(239,68,68,0.08)';
}

function _compositeTextColor(pct) {
  if (pct == null) return 'var(--text2)';
  if (pct >= 90) return 'var(--green)';
  if (pct >= 75) return 'var(--accent)';
  if (pct >= 60) return 'var(--yellow)';
  if (pct >= 40) return 'var(--orange)';
  return 'var(--red)';
}

let filterMatMinComposite = 0;

function renderMatrix() {
  const filtered=ASSETS.filter(a=>filterMat==='all'||a.type===filterMat);
  let matRows=[];

  for (const a of filtered) {
    if (a.type!=='forex') {
      const lc={},sc={};
      for (const ck of CAT_KEYS) {
        const e=a.cats[ck]; const eS=a.cats[ck+'_S'];
        if (e&&(e.dir==='L'||e.dir==='L/S')) lc[ck]=e;
        if (eS) sc[ck]=eS; else if (e&&e.dir==='L/S') sc[ck]=e;
      }
      const bL=Object.values(lc).reduce((b,e)=>(RATING_ORDER[e.rating]??-1)>(RATING_ORDER[b]??-1)?e.rating:b,'-');
      const bS=Object.values(sc).reduce((b,e)=>(RATING_ORDER[e.rating]??-1)>(RATING_ORDER[b]??-1)?e.rating:b,'-');
      // Pre-calcular composites por celda
      const lcComp={}, scComp={};
      for (const ck of CAT_KEYS) {
        if (lc[ck]) lcComp[ck] = _bestCompositeForEntry(a, ck, lc[ck], filterMatTf);
        if (sc[ck]) {
          const realKey = a.cats[ck+'_S'] ? ck+'_S' : ck;
          scComp[ck] = _bestCompositeForEntry(a, realKey, sc[ck], filterMatTf);
        }
      }
      const bestCompL = Math.max(...Object.values(lcComp).filter(v => v != null), -1);
      const bestCompS = Math.max(...Object.values(scComp).filter(v => v != null), -1);
      matRows.push({asset:a,rowDir:'L',cats:lc,catComps:lcComp,bestRating:bL,bestComp:bestCompL>=0?bestCompL:null,_g:a.id});
      matRows.push({asset:a,rowDir:'S',cats:sc,catComps:scComp,bestRating:bS,bestComp:bestCompS>=0?bestCompS:null,_g:a.id});
    } else {
      const ac={};
      for (const ck of CAT_KEYS) { if (a.cats[ck]) ac[ck]=a.cats[ck]; }
      const b=Object.values(ac).reduce((bx,e)=>(RATING_ORDER[e.rating]??-1)>(RATING_ORDER[bx]??-1)?e.rating:bx,'-');
      const acComp={};
      for (const ck of CAT_KEYS) if (ac[ck]) acComp[ck] = _bestCompositeForEntry(a, ck, ac[ck], filterMatTf);
      const bestComp = Math.max(...Object.values(acComp).filter(v => v != null), -1);
      matRows.push({asset:a,rowDir:'L/S',cats:ac,catComps:acComp,bestRating:b,bestComp:bestComp>=0?bestComp:null,_g:a.id});
    }
  }

  if (filterMatDir!=='all') matRows=matRows.filter(r=>r.rowDir===filterMatDir||r.rowDir==='L/S');
  if (filterMatRating!=='all') {
    const minO=RATING_ORDER[filterMatRating]??0;
    matRows=matRows.filter(r=>(RATING_ORDER[r.bestRating]??-1)>=minO);
  }
  if (filterMatTf!=='all') matRows=matRows.filter(r=>Object.values(r.cats).some(e=>tfMatch(e.tf,filterMatTf)));
  // Filtro min composite (solo aplica si vista composite o si min>0)
  if (filterMatMinComposite > 0) {
    matRows = matRows.filter(r => (r.bestComp ?? 0) >= filterMatMinComposite);
  }

  const s=sortState.mat;
  if (s.col&&s.dir) {
    matRows=[...matRows].sort((a,b)=>{
      let va,vb;
      if (s.col==='asset') {va=a.asset.id;vb=b.asset.id;}
      else if (s.col==='dir') {va=a.rowDir;vb=b.rowDir;}
      else if (s.col==='best') {va=RATING_ORDER[a.bestRating]??-1;vb=RATING_ORDER[b.bestRating]??-1;}
      else {va=RATING_ORDER[a.cats[s.col]?.rating]??-1;vb=RATING_ORDER[b.cats[s.col]?.rating]??-1;}
      if (typeof va==='number') return s.dir==='asc'?va-vb:vb-va;
      return s.dir==='asc'?va.localeCompare(vb):vb.localeCompare(va);
    });
  }

  let html=`<thead><tr>
    ${thH('Activo','asset','mat','mat')}
    ${thH('Dir','dir','mat','mat')}
    ${thH('Best','best','mat','mat')}`;
  for (const ck of CAT_KEYS) {
    html+=thH(CAT_META[ck].icon,ck,'mat','mat').replace('</th>',
      `<span style="display:block;font-size:9px;color:var(--text2);font-weight:400;text-transform:none;letter-spacing:0">${CAT_META[ck].name}</span></th>`);
  }
  html+='</tr></thead><tbody>';

  let lastG=null;
  for (const row of matRows) {
    const isNew=row._g!==lastG;
    const border=lastG&&isNew&&row.asset.type!=='forex'?'border-top:2px solid var(--border)':'';
    lastG=row._g;
    const dc=row.rowDir==='L'?'dir-long':row.rowDir==='S'?'dir-short':'dir-both';
    const showName=isNew||row.asset.type==='forex';
    const br=rLabel(row.bestRating);

    // Render de la celda Best
    let bestCell;
    if (heatmapMode === 'composite') {
      const bc = row.bestComp;
      bestCell = bc != null
        ? `<span style="font-size:12px;padding:3px 8px;border-radius:4px;font-weight:800;background:${_compositeColor(bc)};color:${_compositeTextColor(bc)};">${bc}%</span>`
        : '<span style="color:var(--text2);">—</span>';
    } else if (heatmapMode === true || heatmapMode === 'on') {
      bestCell = `<span class="${hmCls(row.bestRating)}" style="font-size:12px;padding:2px 6px;border-radius:4px;font-weight:700">${row.bestRating==='+'?'+':row.bestRating||'—'}</span>`;
    } else {
      bestCell = `<span class="rating ${br.cls}" style="font-size:11px">${row.bestRating}</span>`;
    }

    html+=`<tr style="${border}">
      <td>${showName?`<span class="asset-link" onclick="navToAsset('${row.asset.id}')">${row.asset.id}</span> ${sqxBadge(row.asset, true)}`:''}</td>
      <td class="${dc}" style="font-weight:700;font-size:12px">${row.rowDir}</td>
      <td style="text-align:center">${bestCell}</td>`;

    for (const ck of CAT_KEYS) {
      const entry=row.cats[ck];
      const passesTf = entry && (filterMatTf==='all' || tfMatch(entry.tf, filterMatTf));
      const comp = passesTf ? row.catComps[ck] : null;
      const passesMinComp = !filterMatMinComposite || (comp != null && comp >= filterMatMinComposite);

      if (passesTf && passesMinComp) {
        if (heatmapMode === 'composite') {
          if (comp != null) {
            html += `<td style="text-align:center;background:${_compositeColor(comp)};color:${_compositeTextColor(comp)};font-weight:800;font-size:12px;padding:6px;" title="${entry.why} | ${entry.tf} | composite ${comp}%">${comp}%</td>`;
          } else {
            html += `<td style="text-align:center;color:var(--text2);font-size:11px;" title="Sin composite (TF no procesado)">${entry.rating}</td>`;
          }
        } else if (heatmapMode === true || heatmapMode === 'on') {
          html += `<td class="${hmCls(entry.rating)}" style="text-align:center;font-size:13px;font-weight:800" title="${entry.why} | ${entry.tf}">${entry.rating}</td>`;
        } else {
          html += `<td style="text-align:center"><span class="rating ${rLabel(entry.rating).cls}" style="font-size:11px" title="${entry.why}">${entry.rating}</span></td>`;
        }
      } else {
        html+=`<td style="text-align:center;color:#1e2233">—</td>`;
      }
    }
    html+='</tr>';
  }
  html+='</tbody>';
  document.getElementById('matrix-table').innerHTML=html;
}

// ── CSV exports vistas ──
function doExport(data,filename) {
  const csv=data.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  Object.assign(document.createElement('a'),{href:url,download:filename}).click();
  URL.revokeObjectURL(url);
}
function exportCatCSV() {
  const rows=[['Activo','Tipo','Categoria','Direccion','Timeframes','Rating','Por que']];
  for (const [catKey,meta] of Object.entries(CAT_META)) {
    for (const a of ASSETS) {
      for (const [key,val] of Object.entries(a.cats)) {
        const base=key.replace(/_S$/,'');
        if (base!==catKey) continue;
        if (filterDir==='L'&&val.dir==='S') continue;
        if (filterDir==='S'&&val.dir==='L') continue;
        if (filterCatRating!=='all'&&val.rating!==filterCatRating) continue;
        if (filterCatSub!=='all'&&a.sub!==filterCatSub) continue;
        if (filterCatTf!=='all'&&!tfMatch(val.tf,filterCatTf)) continue;
        rows.push([a.id,a.sub,meta.name,val.dir,val.tf,val.rating,val.why]);
      }
    }
  }
  doExport(rows,'SQX_categorias.csv');
}
function exportMatCSV() {
  const header=['Activo','Tipo','Dir','Best',...CAT_KEYS.map(ck=>CAT_META[ck].name)];
  const rows=[header];
  const filtered=ASSETS.filter(a=>filterMat==='all'||a.type===filterMat);
  for (const a of filtered) {
    const dirs=a.type!=='forex'?['L','S']:['L/S'];
    for (const d of dirs) {
      if (filterMatDir!=='all'&&d!==filterMatDir&&d!=='L/S') continue;
      const cats={};
      for (const ck of CAT_KEYS) {
        if (d==='L') { const e=a.cats[ck]; if(e&&(e.dir==='L'||e.dir==='L/S')) cats[ck]=e; }
        else if (d==='S') { const eS=a.cats[ck+'_S']; const eB=a.cats[ck]; if(eS) cats[ck]=eS; else if(eB&&eB.dir==='L/S') cats[ck]=eB; }
        else { if(a.cats[ck]) cats[ck]=a.cats[ck]; }
      }
      const best=Object.values(cats).reduce((b,e)=>(RATING_ORDER[e.rating]??-1)>(RATING_ORDER[b]??-1)?e.rating:b,'-');
      if (filterMatRating!=='all'&&(RATING_ORDER[best]??-1)<(RATING_ORDER[filterMatRating]??0)) continue;
      rows.push([a.id,a.sub,d,best,...CAT_KEYS.map(ck=>cats[ck]?.rating||'')]);
    }
  }
  doExport(rows,'SQX_matriz.csv');
}

// ── Tab handler global ──
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  document.querySelectorAll('.tab-content').forEach(c=>c.style.display='none');
  document.getElementById('tab-'+t.dataset.tab).style.display='block';
}));

function bindBtns(sel, dataKey, varSetter, cb) {
  document.querySelectorAll(sel).forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll(sel).forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    varSetter(b.dataset[dataKey]);
    cb();
  }));
}
bindBtns('[data-filter-type]', 'filterType', function(v){ filterType = v; }, renderAssetGrid);
bindBtns('[data-filter-sqx]',  'filterSqx',  function(v){ filterSqx  = v; }, renderAssetGrid);
bindBtns('[data-filter-dir]',  'filterDir',  function(v){ filterDir  = v; }, renderCategoriesView);
bindBtns('[data-filter-mat]',  'filterMat',  function(v){ filterMat  = v; }, renderMatrix);
bindBtns('[data-tp-dir]',      'tpDir',      function(v){ filterTpDir = v; }, renderTopPicks);
bindBtns('[data-priority-min]','priorityMin',function(v){ filterPriorityMin = parseInt(v,10) || 0; }, renderPriority);
bindBtns('[data-priority-type]','priorityType',function(v){ filterPriorityType = v; }, renderPriority);

document.querySelectorAll('[data-heatmap]').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('[data-heatmap]').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  // 3 modos: 'on' (heatmap rating), 'off' (badges), 'composite' (numérico data-driven)
  heatmapMode = b.dataset.heatmap;  // string: 'on' | 'off' | 'composite'
  renderMatrix();
}));

document.getElementById('search-asset').addEventListener('input',renderAssetGrid);
document.getElementById('asset-sort').addEventListener('change',function(e){ assetSort=e.target.value; renderAssetGrid(); });
document.getElementById('cat-filter-rating').addEventListener('change',function(e){ filterCatRating=e.target.value; renderCategoriesView(); });
document.getElementById('cat-filter-sub').addEventListener('change',function(e){ filterCatSub=e.target.value; renderCategoriesView(); });
document.getElementById('cat-filter-tf').addEventListener('change',function(e){ filterCatTf=e.target.value; renderCategoriesView(); });
document.getElementById('mat-filter-rating').addEventListener('change',function(e){ filterMatRating=e.target.value; renderMatrix(); });
document.getElementById('mat-filter-dir').addEventListener('change',function(e){ filterMatDir=e.target.value; renderMatrix(); });
document.getElementById('mat-filter-tf').addEventListener('change',function(e){ filterMatTf=e.target.value; renderMatrix(); });

// Slider min composite
const _matMinSlider = document.getElementById('mat-min-composite');
const _matMinLabel  = document.getElementById('mat-min-composite-val');
if (_matMinSlider) {
  _matMinSlider.addEventListener('input', function(e){
    filterMatMinComposite = parseInt(e.target.value, 10) || 0;
    if (_matMinLabel) _matMinLabel.textContent = filterMatMinComposite + '%';
    renderMatrix();
  });
}
document.getElementById('export-cat-btn').addEventListener('click',exportCatCSV);
document.getElementById('export-mat-btn').addEventListener('click',exportMatCSV);
document.getElementById('priority-cat-filter').addEventListener('change',function(e){ filterPriorityCat=e.target.value; renderPriority(); });

// Global helper for inline onclick navigation to asset tab
window.navToAsset = function(id) {
  var tab = document.querySelector('.tab[data-tab="activos"]');
  if (tab) tab.click();
  selectAsset(id);
};
