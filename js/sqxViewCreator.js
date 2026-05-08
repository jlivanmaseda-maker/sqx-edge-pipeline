// =============================================================================
// SQX VIEW CREATOR — Tab del dashboard que genera archivos .vw para SQX databank
// =============================================================================
// Equivalente JS del script Python sqx_view_creator_anual.py — mismo catálogo,
// misma lógica de generación XML, misma salida byte-equivalente.
//
// Cada métrica es {display, class, anualDefault, selectedDefault, category, tooltip}
// className verificados contra "todas las metricas posibles.vw" oficial de SQX.

const VC_METRICS = [
  // FIJAS — sólo 127, no se anualiza
  { d:"Symbol",                  c:"Symbol",                  an:false, sel:true,  cat:"fixed",     t:"Símbolo del activo" },
  { d:"TimeFrame",               c:"TimeFrame",               an:false, sel:true,  cat:"fixed",     t:"Marco temporal" },
  { d:"Mini equity chart",       c:"MiniEquityChart",         an:false, sel:true,  cat:"fixed",     t:"Mini gráfico de equity (visual)" },
  { d:"Fitness",                 c:"Fitness",                 an:false, sel:true,  cat:"fixed",     t:"Fitness consolidado" },
  { d:"Entry indicators",        c:"EntryIndicators",         an:false, sel:false, cat:"fixed",     t:"Indicadores usados en entrada" },
  { d:"Exit indicators",         c:"ExitIndicators",          an:false, sel:false, cat:"fixed",     t:"Indicadores usados en salida" },
  { d:"Complexity",              c:"Complexity",              an:false, sel:false, cat:"fixed",     t:"Complejidad de la estrategia" },
  { d:"Note",                    c:"Note",                    an:false, sel:false, cat:"fixed",     t:"Notas asociadas" },
  { d:"Parameters",              c:"Parameters",              an:false, sel:false, cat:"fixed",     t:"Parámetros configurados" },
  { d:"Magic number",            c:"MagicNumber",             an:false, sel:false, cat:"fixed",     t:"Magic Number MT4/MT5" },
  { d:"Template",                c:"TemplateColumn",          an:false, sel:false, cat:"fixed",     t:"Template empleado" },

  // CORE — Esenciales EGT (preseleccionadas)
  { d:"CAGR/Max DD %",           c:"AnnualPctReturnDDRatio",  an:true,  sel:true,  cat:"core",      t:"CAGR / Max DD% — métrica principal de régimen" },
  { d:"Net profit",              c:"NetProfit",               an:true,  sel:true,  cat:"core",      t:"Rentabilidad absoluta por periodo (NP$)" },
  { d:"# of trades",             c:"NumberOfTrades",          an:true,  sel:true,  cat:"core",      t:"Número de trades — valida suficiencia de muestra" },
  { d:"Profit factor",           c:"ProfitFactor",            an:true,  sel:true,  cat:"core",      t:"PF — más resistente a outliers que CAGR/DD" },
  { d:"Max DD %",                c:"DrawdownPct",             an:true,  sel:true,  cat:"core",      t:"Drawdown máximo por periodo" },
  { d:"Sharpe Ratio",            c:"SharpeRatio",             an:true,  sel:true,  cat:"core",      t:"Consistencia ajustada por volatilidad" },

  // ADVANCED — Cuantitativo profesional (las 4 ⭐ entran en preset CORE+ADV)
  { d:"Sortino Ratio",           c:"SortinoRatio",            an:true,  sel:true,  cat:"advanced",  t:"⭐ Como Sharpe pero solo penaliza vol negativa" },
  { d:"Calmar Ratio",            c:"CalmarRatio",             an:true,  sel:true,  cat:"advanced",  t:"⭐ CAGR / Max DD%. Estándar gestión cuantitativa" },
  { d:"Sterling Ratio",          c:"SterlingRatio",           an:true,  sel:false, cat:"advanced",  t:"Similar a Calmar, suaviza el divisor" },
  { d:"SQN",                     c:"SQN",                     an:true,  sel:false, cat:"advanced",  t:"Van Tharp System Quality Number" },
  { d:"SQN Score",               c:"SQNScore",                an:true,  sel:false, cat:"advanced",  t:"Score normalizado de SQN" },
  { d:"R Expectancy",            c:"RExpectancy",             an:true,  sel:false, cat:"advanced",  t:"Esperanza matemática en R" },
  { d:"R Expectancy Score",      c:"RExpectancyScore",        an:true,  sel:false, cat:"advanced",  t:"Score normalizado R Exp" },
  { d:"Ulcer Index %",           c:"UlcerIndex",              an:true,  sel:false, cat:"advanced",  t:"Cuantifica 'dolor' del DD (más bajo = mejor)" },
  { d:"Ulcer Performance Index", c:"UlcerPerformanceIndex",   an:true,  sel:false, cat:"advanced",  t:"Return / Ulcer Index" },
  { d:"Strategy Quality Score",  c:"StrategyQualityScore",    an:true,  sel:false, cat:"advanced",  t:"Score consolidado de SQX" },
  { d:"Recovery Factor",         c:"RecoveryFactor",          an:true,  sel:false, cat:"advanced",  t:"Net profit / Max DD" },
  { d:"Stability",               c:"Stability",               an:true,  sel:false, cat:"advanced",  t:"Estabilidad de la equity curve" },
  { d:"Stability SQ3",           c:"StabilitySQ3",            an:true,  sel:false, cat:"advanced",  t:"Stability versión SQ3" },
  { d:"Profitable Months",       c:"ProfitableMonths",        an:true,  sel:false, cat:"advanced",  t:"Número de meses positivos" },
  { d:"% Profitable Months",     c:"ProfitableMonthsPct",     an:true,  sel:true,  cat:"advanced",  t:"⭐ Porcentaje de meses positivos" },
  { d:"Worst Year Profit",       c:"WorstYearProfit",         an:true,  sel:true,  cat:"advanced",  t:"⭐ NP del peor año (medida directa de robustez)" },
  { d:"Stagnation",              c:"Stagnation",              an:true,  sel:false, cat:"advanced",  t:"Días más largos sin nuevo equity high" },
  { d:"% Stagnation",            c:"StagnationPct",           an:true,  sel:false, cat:"advanced",  t:"% del periodo en stagnation" },

  // TRADES & WIN/LOSS
  { d:"Avg. Trade",              c:"AvgTrade",                an:true,  sel:false, cat:"trades",    t:"Beneficio medio por trade ($)" },
  { d:"Avg. Win",                c:"AvgWin",                  an:true,  sel:false, cat:"trades",    t:"Promedio ganadora" },
  { d:"Avg. Loss",               c:"AvgLoss",                 an:true,  sel:false, cat:"trades",    t:"Promedio perdedora" },
  { d:"Win/Loss ratio",          c:"WinLossRatio",            an:true,  sel:false, cat:"trades",    t:"Avg Win / Avg Loss" },
  { d:"Winning Percent",         c:"WinningPct",              an:true,  sel:false, cat:"trades",    t:"% trades ganadores" },
  { d:"Payout ratio",            c:"PayoutRatio",             an:true,  sel:false, cat:"trades",    t:"Avg Win / Avg Loss en ratio" },
  { d:"Expectancy",              c:"Expectancy",              an:true,  sel:false, cat:"trades",    t:"Esperanza matemática en $" },
  { d:"Kelly formula",           c:"KellyFormula",            an:true,  sel:false, cat:"trades",    t:"Tamaño óptimo por Kelly" },
  { d:"Avg. Bars in Trade",      c:"AvgBarsInTrade",          an:true,  sel:false, cat:"trades",    t:"Duración media de trade en barras" },
  { d:"Avg. Bars Win",           c:"AvgBarsWin",              an:true,  sel:false, cat:"trades",    t:"Barras medias en trades ganadores" },
  { d:"Avg. Bars Loss",          c:"AvgBarsLoss",             an:true,  sel:false, cat:"trades",    t:"Barras medias en trades perdedores" },
  { d:"Max Consec. Wins",        c:"MaxConsecWins",           an:true,  sel:false, cat:"trades",    t:"Racha máxima ganadora" },
  { d:"Max Consec. Losses",      c:"MaxConsecLosses",         an:true,  sel:false, cat:"trades",    t:"Racha máxima perdedora" },
  { d:"RR Ratio Median",         c:"RRRatioMedian",           an:true,  sel:false, cat:"trades",    t:"Risk/Reward Ratio mediana" },

  // DRAWDOWN
  { d:"Drawdown ($)",            c:"Drawdown",                an:true,  sel:false, cat:"drawdown",  t:"Drawdown máximo en dinero" },
  { d:"Max Drawdown Duration",   c:"MaxNewHighDuration",      an:true,  sel:false, cat:"drawdown",  t:"Duración máxima del DD" },
  { d:"Avg. Drawdown",           c:"AvgDrawdown",             an:true,  sel:false, cat:"drawdown",  t:"DD medio en $" },
  { d:"Avg. % Drawdown",         c:"AvgPctDrawdown",          an:true,  sel:false, cat:"drawdown",  t:"DD medio en %" },
  { d:"Max Intraday Drawdown",   c:"MaxIntradayDrawdown",     an:true,  sel:false, cat:"drawdown",  t:"DD intradía máximo" },
  { d:"Open Drawdown",           c:"OpenDrawdown",            an:true,  sel:false, cat:"drawdown",  t:"DD abierto al cierre" },
  { d:"Open Drawdown %",         c:"OpenDrawdownPct",         an:true,  sel:false, cat:"drawdown",  t:"DD abierto en %" },

  // RETURN & PROFIT
  { d:"CAGR",                    c:"CAGR",                    an:true,  sel:false, cat:"return",    t:"Compound Annual Growth Rate" },
  { d:"Annual % Return",         c:"AnnualPctReturn",         an:true,  sel:false, cat:"return",    t:"Rentabilidad anualizada" },
  { d:"Net profit in %",         c:"NetProfitInPct",          an:true,  sel:false, cat:"return",    t:"NP sobre equity inicial" },
  { d:"Gross profit",            c:"GrossProfit",             an:true,  sel:false, cat:"return",    t:"Ganancia bruta" },
  { d:"Gross loss",              c:"GrossLoss",               an:true,  sel:false, cat:"return",    t:"Pérdida bruta" },
  { d:"Avg. Profit Per Day",     c:"AvgProfitPerDay",         an:true,  sel:false, cat:"return",    t:"Profit medio diario" },
  { d:"Avg. Profit Per Month",   c:"AvgProfitPerMonth",       an:true,  sel:false, cat:"return",    t:"Profit medio mensual" },
  { d:"Avg. % Profit Per Year",  c:"AvgPctProfitPerYear",     an:true,  sel:false, cat:"return",    t:"% promedio anual" },

  // RISK
  { d:"VaR (95%)",               c:"VaR_Hobbiecode",          an:true,  sel:false, cat:"risk",      t:"Value at Risk al 95%" },
  { d:"CVaR (95%)",              c:"CVaR_Hobbiecode",         an:true,  sel:false, cat:"risk",      t:"Conditional VaR al 95% (expected shortfall)" },
  { d:"StandardDev",             c:"StandardDev",             an:true,  sel:false, cat:"risk",      t:"Desviación estándar de retornos" },
  { d:"Z-Score",                 c:"ZScore",                  an:true,  sel:false, cat:"risk",      t:"Z-Score de aleatoriedad de rachas" },
  { d:"Z-Probability",           c:"ZProbability",            an:true,  sel:false, cat:"risk",      t:"Probabilidad asociada al Z-Score" },
  { d:"Negative Streaks P80",    c:"NegativeStreaksPct80",    an:true,  sel:false, cat:"risk",      t:"Percentil 80 de rachas negativas" },
  { d:"Negative Streaks P95",    c:"NegativeStreaksPct95",    an:true,  sel:false, cat:"risk",      t:"Percentil 95 de rachas negativas" },

  // ACTIVITY & EXPOSURE
  { d:"Exposure",                c:"Exposure",                an:true,  sel:false, cat:"activity",  t:"% del tiempo en mercado" },
  { d:"Exposure Position",       c:"ExposurePosition",        an:true,  sel:false, cat:"activity",  t:"Exposure por posición" },
  { d:"Exposure Bars %",         c:"ExposureBarsPercent",     an:true,  sel:false, cat:"activity",  t:"% de barras en mercado" },
  { d:"Avg. Trades Per Day",     c:"AvgTradesPerDay",         an:true,  sel:false, cat:"activity",  t:"Trades medios por día" },
  { d:"Avg. Trades Per Month",   c:"AvgTradesPerMonth",       an:true,  sel:false, cat:"activity",  t:"Trades medios por mes" },
  { d:"Avg. Trades Per Year",    c:"AvgTradesPerYear",        an:true,  sel:false, cat:"activity",  t:"Trades medios por año" },
  { d:"Longest trade (days)",    c:"LongestTrade",            an:true,  sel:false, cat:"activity",  t:"Trade más largo en días" },

  // SYMMETRY / EDGE / OTRAS
  { d:"Symmetry",                c:"Symmetry",                an:true,  sel:false, cat:"extra",     t:"Simetría de resultados L vs S" },
  { d:"Trades Symmetry",         c:"TradesSymmetry",          an:true,  sel:false, cat:"extra",     t:"Simetría de # trades L vs S" },
  { d:"Edge Ratio",              c:"EdgeRatioInPips",         an:true,  sel:false, cat:"extra",     t:"Edge ratio en pips" },
  { d:"Equity Slope",            c:"EquitySlope",             an:true,  sel:false, cat:"extra",     t:"Pendiente de la equity curve" },
  { d:"EquityAngle",             c:"EquityAngle",             an:true,  sel:false, cat:"extra",     t:"Ángulo de la equity curve" },
  { d:"AHPR",                    c:"AHPR",                    an:true,  sel:false, cat:"extra",     t:"Average Holding Period Return" },
  { d:"RINAIndex",               c:"RINAIndex",               an:true,  sel:false, cat:"extra",     t:"RINA Index" },
  { d:"RSquared",                c:"RSquared",                an:true,  sel:false, cat:"extra",     t:"R² del fit lineal de equity" },

  // CONTADORES
  { d:"# of profits",            c:"NumberOfProfits",         an:true,  sel:false, cat:"counts",    t:"Número de trades ganadores" },
  { d:"# of canceled",           c:"NumberOfCanceled",        an:true,  sel:false, cat:"counts",    t:"Número de trades cancelados" },
];

const VC_CATEGORY_LABELS = {
  fixed:    "Identificación / contexto (no se anualiza)",
  core:     "Core EGT / Régime (recomendadas)",
  advanced: "Avanzadas (cuantitativo profesional)",
  trades:   "Trades / Win-Loss",
  drawdown: "Drawdown",
  return:   "Return / Profit",
  risk:     "Risk",
  activity: "Activity / Exposure",
  extra:    "Symmetry / Edge / Otras",
  counts:   "Contadores",
};

// ---------- ESTADO ----------
const VC_STATE = {
  selected: {},   // {className: bool}
  anual:    {},   // {className: bool}
};

// Inicializar desde defaults
VC_METRICS.forEach(m => {
  VC_STATE.selected[m.c] = m.sel;
  VC_STATE.anual[m.c] = m.an;
});

// ---------- GENERACIÓN XML ----------
// Equivalente exacto a build_view_xml de Python.
function vcBuildXml(viewName, selected, yearCount, sampleStart, includeTotal, groupMode) {
  // selected: array de objetos {d, c, anual}
  const lines = [
    `<View name="${vcEsc(viewName)}" originalName="${vcEsc(viewName)}">`,
    '  <Columns>',
  ];
  const colTpl = (cls, name, st) =>
    `    <Column class="${cls}" name="${vcEsc(name)}" sampleType="${st}" direction="0" plType="10" resultType="main" confidenceLevel="50" market="1" subresult="30" showMainResult="true"/>`;

  if (groupMode === "by_metric") {
    selected.forEach(m => {
      if (!m.anual) {
        lines.push(colTpl(m.c, m.d, 127));
        return;
      }
      for (let y = 0; y < yearCount; y++) lines.push(colTpl(m.c, m.d, sampleStart + y));
      if (includeTotal) lines.push(colTpl(m.c, m.d, 127));
    });
  } else {
    // by_year
    let emittedAnual = false;
    const anualList = selected.filter(m => m.anual);
    selected.forEach(m => {
      if (m.anual) {
        if (!emittedAnual) {
          for (let y = 0; y < yearCount; y++) {
            const st = sampleStart + y;
            anualList.forEach(am => lines.push(colTpl(am.c, am.d, st)));
          }
          if (includeTotal) anualList.forEach(am => lines.push(colTpl(am.c, am.d, 127)));
          emittedAnual = true;
        }
        return;
      }
      lines.push(colTpl(m.c, m.d, 127));
    });
  }

  lines.push('  </Columns>');
  lines.push('</View>');
  return lines.join('\n');
}

function vcEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------- RENDER ----------
function vcRenderMetrics() {
  const el = document.getElementById('vc-metrics-panel');
  if (!el) return;
  const cats = {};
  VC_METRICS.forEach(m => { (cats[m.cat] = cats[m.cat] || []).push(m); });
  const ordered = ['fixed','core','advanced','trades','drawdown','return','risk','activity','extra','counts'];
  let html = '';
  ordered.forEach(cat => {
    if (!cats[cat]) return;
    html += `<div class="vc-cat-block vc-cat-${cat}">`;
    html += `<div class="vc-cat-head">${VC_CATEGORY_LABELS[cat]} <span style="font-size:10px;color:var(--text2);">(${cats[cat].length})</span></div>`;
    html += '<div class="vc-cat-body">';
    cats[cat].forEach(m => {
      const isFixed = m.cat === 'fixed';
      const sel = VC_STATE.selected[m.c];
      const an = VC_STATE.anual[m.c];
      html += `<div class="vc-row" title="${vcEsc(m.t)}">` +
        `<label class="vc-cell-sel"><input type="checkbox" data-vc-sel="${m.c}" ${sel ? 'checked' : ''}> SEL</label>` +
        `<label class="vc-cell-an"><input type="checkbox" data-vc-an="${m.c}" ${an ? 'checked' : ''} ${isFixed ? 'disabled' : ''}> ANUAL</label>` +
        `<span class="vc-cell-name">${vcEsc(m.d)}</span>` +
        `<span class="vc-cell-class">${vcEsc(m.c)}</span>` +
      `</div>`;
    });
    html += '</div></div>';
  });
  el.innerHTML = html;

  // Listeners
  el.querySelectorAll('input[data-vc-sel]').forEach(cb => cb.addEventListener('change', () => {
    VC_STATE.selected[cb.dataset.vcSel] = cb.checked;
    vcUpdatePreview();
  }));
  el.querySelectorAll('input[data-vc-an]').forEach(cb => cb.addEventListener('change', () => {
    VC_STATE.anual[cb.dataset.vcAn] = cb.checked;
    vcUpdatePreview();
  }));
}

function vcGetConfig() {
  return {
    viewName: (document.getElementById('vc-view-name').value || 'EGT - Anual').trim(),
    yearCount: Math.max(1, Math.min(30, parseInt(document.getElementById('vc-year-count').value, 10) || 9)),
    sampleStart: Math.max(0, Math.min(126, parseInt(document.getElementById('vc-sample-start').value, 10) || 21)),
    includeTotal: document.getElementById('vc-include-total').value === 'true',
    groupMode: document.getElementById('vc-group-mode').value,
  };
}

function vcGetSelectedList() {
  // Mantenemos el orden del catálogo para coherencia con el script Python
  return VC_METRICS
    .filter(m => VC_STATE.selected[m.c])
    .map(m => ({ d: m.d, c: m.c, anual: VC_STATE.anual[m.c] && m.cat !== 'fixed' }));
}

function vcUpdatePreview() {
  const cfg = vcGetConfig();
  const sel = vcGetSelectedList();
  if (!sel.length) {
    document.getElementById('vc-preview').textContent = '(selecciona al menos una métrica)';
    document.getElementById('vc-status').textContent = '0 columnas';
    return;
  }
  const xml = vcBuildXml(cfg.viewName, sel, cfg.yearCount, cfg.sampleStart, cfg.includeTotal, cfg.groupMode);
  // Contar columnas
  const nCols = (xml.match(/<Column /g) || []).length;
  // Vista previa: sólo primeras y últimas líneas para no saturar
  const lines = xml.split('\n');
  let preview;
  if (lines.length > 50) {
    preview = lines.slice(0, 25).join('\n') + '\n  ...\n  (' + (lines.length - 50) + ' líneas más)\n  ...\n' + lines.slice(-15).join('\n');
  } else {
    preview = xml;
  }
  document.getElementById('vc-preview').textContent = preview;
  document.getElementById('vc-status').textContent = nCols + ' columnas · ' + sel.length + ' métricas';
}

function vcGenerate() {
  const cfg = vcGetConfig();
  const sel = vcGetSelectedList();
  if (!sel.length) { alert('Selecciona al menos una métrica.'); return; }
  const xml = vcBuildXml(cfg.viewName, sel, cfg.yearCount, cfg.sampleStart, cfg.includeTotal, cfg.groupMode);
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (cfg.viewName || 'EGT - Anual') + '.vw';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- PRESETS ----------
function vcApplyPresetCore() {
  VC_METRICS.forEach(m => { VC_STATE.selected[m.c] = m.sel; });
  vcRenderMetrics();
  vcUpdatePreview();
}
function vcSelectAll() {
  VC_METRICS.forEach(m => { VC_STATE.selected[m.c] = true; });
  vcRenderMetrics();
  vcUpdatePreview();
}
function vcSelectNone() {
  VC_METRICS.forEach(m => { VC_STATE.selected[m.c] = (m.cat === 'fixed' && m.sel); });
  vcRenderMetrics();
  vcUpdatePreview();
}

// ---------- INIT ----------
(function vcInit() {
  if (!document.getElementById('tab-viewcreator')) return;
  vcRenderMetrics();
  vcUpdatePreview();

  // Listeners de configuración
  ['vc-view-name','vc-year-count','vc-sample-start','vc-include-total','vc-group-mode'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', vcUpdatePreview);
    if (el) el.addEventListener('change', vcUpdatePreview);
  });

  document.getElementById('vc-preset-core').addEventListener('click', vcApplyPresetCore);
  document.getElementById('vc-select-all').addEventListener('click', vcSelectAll);
  document.getElementById('vc-select-none').addEventListener('click', vcSelectNone);
  document.getElementById('vc-generate').addEventListener('click', vcGenerate);
})();
