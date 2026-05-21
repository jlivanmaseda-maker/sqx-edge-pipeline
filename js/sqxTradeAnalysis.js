/**
 * Análisis trade-by-trade sobre el array de trades parseado desde un .sqx.
 *
 * Genera secciones para el dashboard CvC:
 *   - Resumen general (PL, win%, PF, cierres por tipo)
 *   - Performance por hora del día
 *   - Performance por día de semana
 *   - Distribución MAE/MFE
 *   - R-multiples (PL / MAE como proxy de risk)
 *   - OOS trend (PL por bloque OOS si los CSV de bloques están disponibles)
 *   - Auditoría exits (basada en trades reales)
 *
 * Uso:
 *   const stats = SQXTradeAnalysis.analyzeTrades(trades);
 *   SQXTradeAnalysis.renderInto(container, parsed); // parsed = {header, trades, strategy_xml}
 */

(function (global) {
  'use strict';

  const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  // ---------- core stats ----------
  function analyzeTrades(trades) {
    const n = trades.length;
    if (!n) return null;

    const totalPl = trades.reduce((s, t) => s + t.pl, 0);
    const wins = trades.filter(t => t.pl > 0);
    const losses = trades.filter(t => t.pl < 0);
    const nWins = wins.length;
    const nLosses = losses.length;
    const winPct = (nWins / n) * 100;
    const grossProfit = wins.reduce((s, t) => s + t.pl, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pl, 0));
    const pf = grossLoss > 0 ? grossProfit / grossLoss : Infinity;
    const avgWin = nWins ? grossProfit / nWins : 0;
    const avgLoss = nLosses ? grossLoss / nLosses : 0;
    const payoff = avgLoss > 0 ? avgWin / avgLoss : 0;

    // Close type histogram
    const closeTypes = {};
    for (const t of trades) {
      if (!closeTypes[t.close_type]) closeTypes[t.close_type] = { count: 0, pl: 0, wins: 0, losses: 0 };
      closeTypes[t.close_type].count++;
      closeTypes[t.close_type].pl += t.pl;
      if (t.pl > 0) closeTypes[t.close_type].wins++;
      else if (t.pl < 0) closeTypes[t.close_type].losses++;
    }

    // Hour of day (UTC)
    const hours = {};
    for (const t of trades) {
      const h = t.open_time.getUTCHours();
      if (!hours[h]) hours[h] = { count: 0, pl: 0, wins: 0 };
      hours[h].count++;
      hours[h].pl += t.pl;
      if (t.pl > 0) hours[h].wins++;
    }

    // Day of week (Mon=1 ... Sun=0 → reorder to Mon..Sun)
    const daysRaw = {};
    for (const t of trades) {
      const d = t.open_time.getUTCDay(); // 0=Sun
      if (!daysRaw[d]) daysRaw[d] = { count: 0, pl: 0, wins: 0 };
      daysRaw[d].count++;
      daysRaw[d].pl += t.pl;
      if (t.pl > 0) daysRaw[d].wins++;
    }

    // Duration buckets
    const durationBuckets = { '<1h': 0, '1-4h': 0, '4-12h': 0, '12-24h': 0, '1-3d': 0, '>3d': 0 };
    for (const t of trades) {
      const h = t.duration_seconds / 3600;
      if (h < 1) durationBuckets['<1h']++;
      else if (h < 4) durationBuckets['1-4h']++;
      else if (h < 12) durationBuckets['4-12h']++;
      else if (h < 24) durationBuckets['12-24h']++;
      else if (h < 72) durationBuckets['1-3d']++;
      else durationBuckets['>3d']++;
    }

    // MAE/MFE
    const avgMae = trades.reduce((s, t) => s + t.mae, 0) / n;
    const avgMfe = trades.reduce((s, t) => s + t.mfe, 0) / n;
    const maxMae = Math.min(...trades.map(t => t.mae));
    const maxMfe = Math.max(...trades.map(t => t.mfe));
    const deepMaeThreshold = -150;
    const deepMae = trades.filter(t => t.mae < deepMaeThreshold);
    const wastedMfe = trades.filter(t => t.pl < 0 && t.mfe > 100);

    // R-multiples (PL / |MAE|)
    const rValues = trades.map(t => Math.abs(t.mae) > 0 ? t.pl / Math.abs(t.mae) : 0);
    const avgR = rValues.reduce((s, r) => s + r, 0) / n;
    const rBuckets = { '>3R': 0, '2-3R': 0, '1-2R': 0, '0-1R': 0, '-1-0R': 0, '<-1R': 0 };
    for (const r of rValues) {
      if (r > 3) rBuckets['>3R']++;
      else if (r > 2) rBuckets['2-3R']++;
      else if (r > 1) rBuckets['1-2R']++;
      else if (r > 0) rBuckets['0-1R']++;
      else if (r > -1) rBuckets['-1-0R']++;
      else rBuckets['<-1R']++;
    }

    // Streaks
    let curW = 0, curL = 0, maxW = 0, maxL = 0;
    for (const t of trades) {
      if (t.pl > 0) { curW++; curL = 0; maxW = Math.max(maxW, curW); }
      else { curL++; curW = 0; maxL = Math.max(maxL, curL); }
    }

    // Equity curve & DD — SQX-compatible: % sobre equity total (capital + peak),
    // no sobre peak PL solo. Capital inicial default $100K (Reformia/Darwinex).
    const STARTING_CAPITAL = 100000;
    let balance = 0, peak = 0, maxDdPct = 0, maxDdAbs = 0;
    const equity = [];
    for (const t of trades) {
      balance += t.pl;
      equity.push(balance);
      if (balance > peak) peak = balance;
      const ddAbs = peak - balance;
      const ddPct = (ddAbs / (STARTING_CAPITAL + peak)) * 100;
      if (ddAbs > maxDdAbs) maxDdAbs = ddAbs;
      if (ddPct > maxDdPct) maxDdPct = ddPct;
    }

    // Position sizing
    const sizes = trades.map(t => t.size);
    const minSize = Math.min(...sizes);
    const maxSize = Math.max(...sizes);
    const avgSize = sizes.reduce((s, x) => s + x, 0) / n;

    // Year-by-year
    const years = {};
    for (const t of trades) {
      const y = t.close_time.getUTCFullYear();
      if (!years[y]) years[y] = { count: 0, pl: 0, wins: 0 };
      years[y].count++;
      years[y].pl += t.pl;
      if (t.pl > 0) years[y].wins++;
    }

    return {
      n, totalPl, nWins, nLosses, winPct, grossProfit, grossLoss, pf, avgWin, avgLoss, payoff,
      closeTypes, hours, days: daysRaw, durationBuckets,
      mae: { avg: avgMae, max: maxMae, deepCount: deepMae.length, wastedCount: wastedMfe.length },
      mfe: { avg: avgMfe, max: maxMfe },
      r: { avg: avgR, buckets: rBuckets },
      streaks: { maxWin: maxW, maxLoss: maxL },
      equity, maxDdAbs, maxDdPct,
      sizing: { min: minSize, max: maxSize, avg: avgSize },
      years,
    };
  }

  // ---------- HTML rendering ----------
  function fmt(v, d = 2) {
    if (v === undefined || v === null || !isFinite(v)) return '—';
    if (Math.abs(v) > 1e9) return (v / 1e9).toFixed(2) + 'B';
    return Number(v).toFixed(d);
  }
  function fmtCur(v, d = 2) {
    if (v === undefined || v === null || !isFinite(v)) return '—';
    const sign = v < 0 ? '-' : '';
    return sign + '$' + Math.abs(v).toFixed(d);
  }
  function pct(v) { return fmt(v, 1) + '%'; }

  function renderSummary(stats) {
    const ct = Object.entries(stats.closeTypes)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([k, v]) => {
        const winp = v.count ? (v.wins / v.count * 100).toFixed(1) + '%' : '—';
        return `<tr><td><strong>${k}</strong></td><td>${v.count}</td><td>${(v.count/stats.n*100).toFixed(1)}%</td><td>${fmtCur(v.pl)}</td><td>${fmtCur(v.pl/v.count)}</td><td>${v.wins}/${v.losses}</td><td>${winp}</td></tr>`;
      }).join('');

    return `
      <div class="cvc-grid-2col" style="margin-bottom:12px;">
        <div class="cvc-stat-card">
          <div class="cvc-stat-label">Total P/L</div>
          <div class="cvc-stat-value" style="color:${stats.totalPl >= 0 ? '#5dd95d' : '#ff6b6b'};">${fmtCur(stats.totalPl)}</div>
        </div>
        <div class="cvc-stat-card">
          <div class="cvc-stat-label">Win %</div>
          <div class="cvc-stat-value">${pct(stats.winPct)}</div>
          <div class="cvc-stat-sub">${stats.nWins}W / ${stats.nLosses}L</div>
        </div>
        <div class="cvc-stat-card">
          <div class="cvc-stat-label">Profit Factor</div>
          <div class="cvc-stat-value">${fmt(stats.pf, 2)}</div>
        </div>
        <div class="cvc-stat-card">
          <div class="cvc-stat-label">Payoff</div>
          <div class="cvc-stat-value">${fmt(stats.payoff, 2)}</div>
          <div class="cvc-stat-sub">W:${fmtCur(stats.avgWin, 0)} / L:${fmtCur(stats.avgLoss, 0)}</div>
        </div>
        <div class="cvc-stat-card">
          <div class="cvc-stat-label">Max DD (cuenta interna)</div>
          <div class="cvc-stat-value">${fmtCur(stats.maxDdAbs, 0)}</div>
          <div class="cvc-stat-sub">${pct(stats.maxDdPct)} del peak</div>
        </div>
        <div class="cvc-stat-card">
          <div class="cvc-stat-label">Streaks</div>
          <div class="cvc-stat-value">${stats.streaks.maxWin}W / ${stats.streaks.maxLoss}L</div>
          <div class="cvc-stat-sub">consecutivos máx.</div>
        </div>
        <div class="cvc-stat-card">
          <div class="cvc-stat-label">Position size</div>
          <div class="cvc-stat-value">${fmt(stats.sizing.avg, 2)} lots</div>
          <div class="cvc-stat-sub">${fmt(stats.sizing.min, 2)}–${fmt(stats.sizing.max, 2)}</div>
        </div>
        <div class="cvc-stat-card">
          <div class="cvc-stat-label">R Expectancy</div>
          <div class="cvc-stat-value">${fmt(stats.r.avg, 3)}</div>
          <div class="cvc-stat-sub">Avg PL / |MAE|</div>
        </div>
      </div>

      <div style="overflow-x:auto;margin-top:14px;">
        <table class="cvc-table">
          <thead><tr><th>Cierre</th><th>#</th><th>%</th><th>Total PL</th><th>Avg PL</th><th>W/L</th><th>Win%</th></tr></thead>
          <tbody>${ct}</tbody>
        </table>
      </div>
    `;
  }

  function renderHours(stats) {
    const maxPl = Math.max(...Object.values(stats.hours).map(h => Math.abs(h.pl)));
    let rows = '';
    for (let h = 0; h < 24; h++) {
      const d = stats.hours[h];
      if (!d) {
        rows += `<tr><td>${String(h).padStart(2, '0')}:00</td><td colspan="4" style="color:var(--text2);text-align:center;font-size:11px;">—</td></tr>`;
        continue;
      }
      const winp = (d.wins / d.count * 100).toFixed(1);
      const avgpl = d.pl / d.count;
      const barW = maxPl > 0 ? (Math.abs(d.pl) / maxPl * 100).toFixed(0) : 0;
      const barColor = d.pl > 0 ? '#5dd95d' : '#ff6b6b';
      const winColor = d.wins / d.count >= 0.5 ? '#5dd95d' : '#ff6b6b';
      const plColor = d.pl > 0 ? '#5dd95d' : (d.pl < 0 ? '#ff6b6b' : 'var(--text2)');
      rows += `
        <tr>
          <td><strong>${String(h).padStart(2, '0')}:00</strong></td>
          <td>${d.count}</td>
          <td style="color:${winColor};">${winp}%</td>
          <td style="color:${plColor};">${fmtCur(d.pl, 0)}</td>
          <td>${fmtCur(avgpl, 0)}</td>
          <td><div style="display:inline-block;height:8px;width:${barW}%;background:${barColor};max-width:120px;vertical-align:middle;border-radius:2px;"></div></td>
        </tr>
      `;
    }
    return `
      <p style="font-size:12px;color:var(--text2);margin:0 0 8px;">Performance por hora del día (open time UTC). Detecta franjas donde el edge funciona vs. donde es ruido.</p>
      <div style="overflow-x:auto;">
        <table class="cvc-table cvc-table-compact">
          <thead><tr><th>Hora</th><th>#</th><th>Win%</th><th>Total PL</th><th>Avg</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function renderDays(stats) {
    let rows = '';
    // Order Mon..Sun (1..6, 0)
    const order = [1, 2, 3, 4, 5, 6, 0];
    for (const di of order) {
      const d = stats.days[di];
      if (!d) continue;
      const winp = (d.wins / d.count * 100).toFixed(1);
      const winColor = d.wins / d.count >= 0.5 ? '#5dd95d' : '#ff6b6b';
      const plColor = d.pl > 0 ? '#5dd95d' : '#ff6b6b';
      rows += `<tr><td><strong>${DAY_NAMES[di]}</strong></td><td>${d.count}</td><td style="color:${winColor};">${winp}%</td><td style="color:${plColor};">${fmtCur(d.pl, 0)}</td><td>${fmtCur(d.pl/d.count, 0)}</td></tr>`;
    }
    return `
      <p style="font-size:12px;color:var(--text2);margin:0 0 8px;">Performance por día de semana.</p>
      <table class="cvc-table cvc-table-compact"><thead><tr><th>Día</th><th>#</th><th>Win%</th><th>PL</th><th>Avg</th></tr></thead><tbody>${rows}</tbody></table>
    `;
  }

  function renderMaeMfe(stats) {
    return `
      <p style="font-size:12px;color:var(--text2);margin:0 0 8px;">MAE = Max Adverse Excursion (peor pérdida no realizada antes del cierre). MFE = Max Favorable Excursion (mayor ganancia no realizada).</p>
      <div class="cvc-grid-2col">
        <div class="cvc-stat-card"><div class="cvc-stat-label">Avg MAE</div><div class="cvc-stat-value">${fmtCur(stats.mae.avg, 0)}</div></div>
        <div class="cvc-stat-card"><div class="cvc-stat-label">Avg MFE</div><div class="cvc-stat-value">${fmtCur(stats.mfe.avg, 0)}</div></div>
        <div class="cvc-stat-card"><div class="cvc-stat-label">Max MAE (worst)</div><div class="cvc-stat-value" style="color:#ff6b6b;">${fmtCur(stats.mae.max, 0)}</div></div>
        <div class="cvc-stat-card"><div class="cvc-stat-label">Max MFE (best)</div><div class="cvc-stat-value" style="color:#5dd95d;">${fmtCur(stats.mfe.max, 0)}</div></div>
        <div class="cvc-stat-card">
          <div class="cvc-stat-label">Deep MAE (&lt;-$150)</div>
          <div class="cvc-stat-value">${stats.mae.deepCount}</div>
          <div class="cvc-stat-sub">${pct(stats.mae.deepCount/stats.n*100)} de trades tocaron pérdida profunda antes del cierre</div>
        </div>
        <div class="cvc-stat-card">
          <div class="cvc-stat-label">Wasted MFE</div>
          <div class="cvc-stat-value">${stats.mae.wastedCount}</div>
          <div class="cvc-stat-sub">MFE&gt;$100 pero cierre en pérdida — candidatos a trailing</div>
        </div>
      </div>
    `;
  }

  function renderR(stats) {
    let rows = '';
    for (const [b, c] of Object.entries(stats.r.buckets)) {
      const p = (c / stats.n * 100).toFixed(1);
      const barW = c / stats.n * 100;
      const color = b.startsWith('>') || b.startsWith('1') || b.startsWith('2') ? '#5dd95d' : (b.startsWith('0-') ? '#88c' : '#ff6b6b');
      rows += `<tr><td><strong>${b}</strong></td><td>${c}</td><td>${p}%</td><td><div style="height:8px;width:${barW*4}px;background:${color};max-width:120px;border-radius:2px;"></div></td></tr>`;
    }
    return `
      <p style="font-size:12px;color:var(--text2);margin:0 0 8px;">R-multiples = PL / |MAE|. Distribución revela si el edge mantiene riesgo controlado.</p>
      <div class="cvc-stat-card" style="margin-bottom:10px;"><div class="cvc-stat-label">Avg R Expectancy</div><div class="cvc-stat-value">${fmt(stats.r.avg, 3)}</div></div>
      <table class="cvc-table cvc-table-compact"><thead><tr><th>R bucket</th><th>#</th><th>%</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    `;
  }

  function renderYears(stats) {
    let rows = '';
    const ys = Object.keys(stats.years).map(Number).sort();
    for (const y of ys) {
      const d = stats.years[y];
      const winp = (d.wins / d.count * 100).toFixed(1);
      const plColor = d.pl > 0 ? '#5dd95d' : '#ff6b6b';
      rows += `<tr><td><strong>${y}</strong></td><td>${d.count}</td><td>${winp}%</td><td style="color:${plColor};">${fmtCur(d.pl, 0)}</td></tr>`;
    }
    return `<p style="font-size:12px;color:var(--text2);margin:0 0 8px;">Performance año a año (close_time).</p>
      <table class="cvc-table cvc-table-compact"><thead><tr><th>Año</th><th>#</th><th>Win%</th><th>PL</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function renderAudit(audit, header) {
    if (!audit) return '<p>No XML interno disponible.</p>';
    const exitsOK = (audit.exitAfterBars || '').includes('OFF') || audit.exitAfterBars === 'NOT_FOUND';
    const auditScore = (exitsOK ? 1 : 0) + (audit.usesPercentiles ? 1 : 0) + (audit.numberAbsoluteValues.length === 0 ? 1 : 0);
    const verdict = auditScore === 3 ? '⭐ POST-FIX v6 (limpia)' :
                    auditScore === 2 ? '✓ MAYORMENTE OK' :
                    auditScore === 1 ? '⚠ PRE-FIX PARCIAL' :
                    '❌ PRE-FIX (overfit numérico)';

    return `
      <div class="cvc-stat-card" style="margin-bottom:12px;">
        <div class="cvc-stat-label">Veredicto Auditoría Blocksettings</div>
        <div class="cvc-stat-value" style="font-size:18px;">${verdict}</div>
      </div>
      <table class="cvc-table cvc-table-compact">
        <thead><tr><th>Componente</th><th>Estado</th></tr></thead>
        <tbody>
          <tr><td><strong>ExitAfterBars</strong></td><td>${((audit.exitAfterBars||'').includes('OFF') || audit.exitAfterBars === 'NOT_FOUND') ? '<span style="color:#5dd95d;">✓ ' + audit.exitAfterBars + '</span>' : '<span style="color:#ff6b6b;">❌ ' + audit.exitAfterBars + '</span> (problema: cierra trades antes de SL/TP)'}</td></tr>
          <tr><td><strong>Profit Target</strong></td><td>${audit.profitTarget || '—'}</td></tr>
          <tr><td><strong>Stop Loss</strong></td><td>${audit.stopLoss || '—'}</td></tr>
          <tr><td><strong>Trailing Stop</strong></td><td>${audit.trailingStop || '—'}</td></tr>
          <tr><td><strong>Trailing Activation</strong></td><td>${audit.trailingActivation || '—'}</td></tr>
          <tr><td><strong>Move SL to BE</strong></td><td>${audit.moveSL2BE || '—'}</td></tr>
          <tr><td><strong>Uses Percentiles</strong></td><td>${audit.usesPercentiles ? '<span style="color:#5dd95d;">✓ ' + audit.percentileCount + ' uses (escala-invariante)</span>' : '<span style="color:#888;">— ninguna</span>'}</td></tr>
          <tr><td><strong>Number absolutos &gt;10 en reglas</strong></td><td>${audit.numberAbsoluteValues.length === 0 ? '<span style="color:#5dd95d;">✓ ninguno (limpio)</span>' : '<span style="color:#ff6b6b;">❌ ' + audit.numberAbsoluteValues.length + ' valores: ' + audit.numberAbsoluteValues.slice(0, 5).join(', ') + (audit.numberAbsoluteValues.length > 5 ? '…' : '') + '</span>'}</td></tr>
        </tbody>
      </table>
    `;
  }

  // ====================================================================
  // 🧪 OOS SINTÉTICO + EGT + Salud temporal — sin necesidad de CSV
  // ====================================================================
  // Genera N bloques OOS sobre las fechas de los trades, los inyecta en
  // CVC_STATE.oosByStrategy y reutiliza los algoritmos de cvcAnalysis.js
  // (cvcComputeRegimeBlocks / cvcComputeEGT / cvcComputeTemporalHealth /
  //  cvcComputeDirectionalCoherence / cvcDetectArchetype).

  const TF_MINUTES = { M1:1, M5:5, M15:15, M30:30, H1:60, H4:240, D1:1440 };

  // CVC_STATE en cvcAnalysis.js está declarado con `const` top-level → NO se expone
  // como window.CVC_STATE. Lo obtenemos vía Function() que ejecuta en global scope.
  let _cvcStateCache = null;
  function getCvcState() {
    if (_cvcStateCache) return _cvcStateCache;
    try {
      _cvcStateCache = (new Function('return typeof CVC_STATE !== "undefined" ? CVC_STATE : null'))();
    } catch (e) { _cvcStateCache = null; }
    return _cvcStateCache;
  }

  function detectTimeframeMinutes(chartName) {
    const m = (chartName || '').match(/\b(M1|M5|M15|M30|H1|H4|D1)\b/i);
    return m ? (TF_MINUTES[m[1].toUpperCase()] || 60) : 60;
  }

  function extractIndicatorsFromXml(xml) {
    if (!xml) return [];
    const inds = new Set();
    // Long entry signal
    const m = xml.match(/<signal variable="33333333-1111-1111-3333-333333333333">([\s\S]*?)<\/signal>/);
    const body = m ? m[1] : xml;
    for (const im of body.matchAll(/<Block key="#Indicator#"[^>]*?>\s*<Item[^>]*?key="(\w+)"/g)) {
      inds.add(im[1]);
    }
    return Array.from(inds);
  }

  function monthStr(d) {
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  }

  // ====================================================================
  // DETECCIÓN CAPA 1 / CAPA 2 — clasifica cada .sqx según metodología Nesnidal
  // ====================================================================
  //
  // CAPA 1 (edge puro):
  //   - ExitAfterBars=20 ON · Sin PT/SL/Trailing
  //   - 100% trades cierran por EAB (close_type=19)
  //   - avg_bars ≈ 20 (forzado por EAB)
  //
  // CAPA 2 (edge + filtros + gestión):
  //   - ExitAfterBars OFF · PT + SL configurados con ATR (a veces Trailing)
  //   - Trades cierran por SL (id=2) / PT (id=3) / TR (id=6)
  //   - avg_bars varía libre (5-100)
  //
  // Híbrido / mixed: combinaciones raras (PT+EAB juntos, sin SL, etc.)
  function detectLayer(parsed) {
    if (!parsed || !parsed.trades || !parsed.trades.length) {
      return { layer: 'unknown', confidence: 'low', reasons: ['sin trades'] };
    }
    const audit = (global.SQXParser && parsed.strategy_xml)
      ? global.SQXParser.auditStrategyXml(parsed.strategy_xml)
      : { exitAfterBars: 'NOT_FOUND', profitTarget: null, stopLoss: null };

    // Señal 1: Auditoría XML
    const eabRaw = String(audit.exitAfterBars || '');
    const eabOn = eabRaw.startsWith('ON') || eabRaw === 'PRESENT_UNKNOWN';
    const hasPT = audit.profitTarget && audit.profitTarget !== 'OFF' && audit.profitTarget !== 'None';
    const hasSL = audit.stopLoss && audit.stopLoss !== 'OFF' && audit.stopLoss !== 'None';

    // Señal 2: Distribución de close types
    const closeCounts = {};
    for (const t of parsed.trades) {
      closeCounts[t.close_type] = (closeCounts[t.close_type] || 0) + 1;
    }
    const total = parsed.trades.length;
    const eabPct = (closeCounts['EAB'] || 0) / total;
    const slPct = (closeCounts['SL'] || 0) / total;
    const ptPct = (closeCounts['PT'] || 0) / total;
    const trPct = (closeCounts['TR'] || 0) / total;
    const slPtTrPct = slPct + ptPct + trPct;

    // Señal 3: Duración promedio de trades en bars (necesita TF)
    const tfMin = detectTimeframeMinutes(parsed.header.chart_name);
    const avgBars = (parsed.trades.reduce((s, t) => s + t.duration_seconds, 0) / total) / (tfMin * 60);

    // Clasificación con confianza
    const reasons = [];
    let layer, confidence;

    if (eabPct >= 0.95 && !hasPT && !hasSL) {
      layer = 'capa1';
      confidence = 'high';
      reasons.push('EAB en ' + (eabPct * 100).toFixed(0) + '% de trades');
      reasons.push('Sin PT/SL en XML');
      reasons.push('avg_bars ' + avgBars.toFixed(1));
    } else if (slPtTrPct >= 0.95 && hasPT && hasSL) {
      layer = 'capa2';
      confidence = 'high';
      reasons.push('SL/PT/TR en ' + (slPtTrPct * 100).toFixed(0) + '% de trades');
      reasons.push('PT=' + audit.profitTarget + ' · SL=' + audit.stopLoss);
      reasons.push('avg_bars ' + avgBars.toFixed(1));
    } else if (eabPct >= 0.7 && !hasPT) {
      layer = 'capa1';
      confidence = 'medium';
      reasons.push('EAB en ' + (eabPct * 100).toFixed(0) + '% (no llega a 95%)');
      reasons.push('Sin PT pero podría tener SL');
    } else if (slPtTrPct >= 0.7 && (hasPT || hasSL)) {
      layer = 'capa2';
      confidence = 'medium';
      reasons.push('SL/PT en ' + (slPtTrPct * 100).toFixed(0) + '% (no llega a 95%)');
      reasons.push('Gestión configurada parcialmente');
    } else {
      layer = 'mixed';
      confidence = 'low';
      reasons.push('señales contradictorias: EAB ' + (eabPct * 100).toFixed(0) + '% · SL/PT ' + (slPtTrPct * 100).toFixed(0) + '% · hasPT=' + !!hasPT + ' · hasSL=' + !!hasSL);
    }

    return {
      layer,
      confidence,
      reasons,
      audit,
      closeCounts,
      eabPct, slPtTrPct, slPct, ptPct, trPct,
      avgBars,
      timeframeMin: tfMin,
    };
  }

  // Detecta el "modo del mining" cargado a partir de las layers de cada .sqx
  function detectMiningMode(parsedList) {
    const layers = parsedList.map(p => ({ name: p.header.strategy_name || p.file_name, ...detectLayer(p) }));
    const nCapa1 = layers.filter(l => l.layer === 'capa1').length;
    const nCapa2 = layers.filter(l => l.layer === 'capa2').length;
    const nMixed = layers.filter(l => l.layer === 'mixed').length;
    const nUnknown = layers.filter(l => l.layer === 'unknown').length;

    let mode, modeIcon, modeLabel, description, recommendation;
    if (nCapa1 === 1 && nCapa2 >= 1 && nMixed === 0 && nUnknown === 0) {
      mode = 'cvc_classic';
      modeIcon = '🏆';
      modeLabel = 'Champion vs Challenger (clásico Nesnidal)';
      description = '1 template Capa 1 (= Champion) + ' + nCapa2 + ' candidatas Capa 2 (= Challengers)';
      recommendation = 'Aplicar los 5 filtros consolidados (CvC + EGT v2 + Salud + 9/9 OOS + Recovery)';
    } else if (nCapa1 >= 2 && nCapa2 === 0 && nMixed === 0) {
      mode = 'portfolio_capa1';
      modeIcon = '🧩';
      modeLabel = 'Portfolio puro Capa 1';
      description = nCapa1 + ' edges puros (todas con EAB · sin SL/TP)';
      recommendation = 'Seleccionar por descorrelación NP-bloque. Útiles solo en prop firms SIN obligación de SL/TP.';
    } else if (nCapa2 >= 2 && nCapa1 === 0 && nMixed === 0) {
      mode = 'portfolio_capa2';
      modeIcon = '🧩';
      modeLabel = 'Portfolio puro Capa 2';
      description = nCapa2 + ' candidatas con edge + filtros + gestión (SL/TP/Trailing)';
      recommendation = 'Seleccionar por descorrelación + filtros 2-5 (EGT, Salud, OOS, Recovery)';
    } else if (nUnknown > 0 || nMixed > 0) {
      mode = 'mixed';
      modeIcon = '⚠';
      modeLabel = 'Mining mixto (revisar)';
      description = nCapa1 + ' Capa 1 + ' + nCapa2 + ' Capa 2 + ' + nMixed + ' mixed + ' + nUnknown + ' unknown';
      recommendation = 'Revisar individualmente. Las mixed suelen ser bugs de configuración del template.';
    } else {
      mode = 'unknown';
      modeIcon = '❓';
      modeLabel = 'Modo desconocido';
      description = 'No se pudo clasificar';
      recommendation = '';
    }

    return { mode, modeIcon, modeLabel, description, recommendation, layers, counts: { capa1: nCapa1, capa2: nCapa2, mixed: nMixed, unknown: nUnknown } };
  }

  // ─── HTML helpers ───────────────────────────────────────────────
  function renderLayerBadge(layerInfo) {
    if (!layerInfo) return '';
    const map = {
      capa1: { icon: '🔵', label: 'CAPA 1', cls: 'cvc-layer-capa1', color: '#3b82f6' },
      capa2: { icon: '🟣', label: 'CAPA 2', cls: 'cvc-layer-capa2', color: '#a855f7' },
      mixed: { icon: '⚠', label: 'MIXED', cls: 'cvc-layer-mixed', color: '#f59e0b' },
      unknown: { icon: '❓', label: 'UNK', cls: 'cvc-layer-unknown', color: '#6b7280' },
    };
    const m = map[layerInfo.layer] || map.unknown;
    const conf = layerInfo.confidence === 'high' ? '' : ' · ' + layerInfo.confidence;
    const tooltip = (layerInfo.reasons || []).join(' · ');
    return `<span class="cvc-layer-badge ${m.cls}" title="${tooltip}">${m.icon} ${m.label}${conf}</span>`;
  }

  function renderMiningModeBanner(modeInfo) {
    if (!modeInfo) return '';
    const colorMap = {
      cvc_classic: { bg: 'rgba(34,197,94,.10)', border: 'rgba(34,197,94,.4)', txt: '#22c55e' },
      portfolio_capa1: { bg: 'rgba(59,130,246,.10)', border: 'rgba(59,130,246,.4)', txt: '#60a5fa' },
      portfolio_capa2: { bg: 'rgba(168,85,247,.10)', border: 'rgba(168,85,247,.4)', txt: '#c084fc' },
      mixed: { bg: 'rgba(245,158,11,.10)', border: 'rgba(245,158,11,.4)', txt: '#f59e0b' },
      unknown: { bg: 'rgba(107,114,128,.10)', border: 'rgba(107,114,128,.4)', txt: '#9ca3af' },
    };
    const c = colorMap[modeInfo.mode] || colorMap.unknown;
    const counts = modeInfo.counts;
    return `
      <div style="padding:10px 14px;background:${c.bg};border:1px solid ${c.border};border-radius:6px;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <span style="font-size:18px;">${modeInfo.modeIcon}</span>
          <strong style="color:${c.txt};font-size:14px;">${modeInfo.modeLabel}</strong>
          <span style="font-size:11px;color:var(--text2);">${counts.capa1} Capa 1 · ${counts.capa2} Capa 2${counts.mixed ? ' · ' + counts.mixed + ' mixed' : ''}${counts.unknown ? ' · ' + counts.unknown + ' unknown' : ''}</span>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-top:4px;">${modeInfo.description}</div>
        ${modeInfo.recommendation ? '<div style="font-size:11px;color:var(--text);margin-top:4px;"><strong>💡 Recomendación:</strong> ' + modeInfo.recommendation + '</div>' : ''}
      </div>
    `;
  }

  /**
   * Análisis ONGOING DD trade-by-trade (complemento al filtro salud temporal por bloques).
   *
   * El filtro de bloques mide DD en agregados (NP por bloque OOS). Pero una estrategia
   * puede tener un bloque OOS9 positivo agregado y, dentro de ese mismo bloque, estar
   * AHORA en su MaxDD histórico (subió y bajó). Este detector mira la equity curve
   * trade-by-trade para detectar:
   *   - ATH (all-time-high) de la equity acumulada
   *   - Fecha del ATH
   *   - DD actual desde el ATH al cierre
   *   - Días en bache (último ATH → último trade)
   *   - Si el MaxDD histórico EVER coincide con el bache actual (ONGOING_MAX_DD)
   *
   * Umbrales por defecto (operacionales, no académicos):
   *   - DD aceptable al cierre: < 8% del ATH (configurable)
   *   - Tiempo sin recuperar:   < 60 días (configurable)
   *   - Si ambos se exceden → bandera roja "currently in extreme drawdown"
   */
  function computeOngoingDD(trades, opts = {}) {
    // SQX calcula DD% sobre equity total (capital + PL acumulado), no sobre peak PL solo.
    // Por eso usamos startingCapital como denominador base (default $100K para coincidir
    // con SQX Reformia Algotrading).
    const ddPctCutoff = opts.ddPctCutoff != null ? opts.ddPctCutoff : 1.5;  // antes 8 (sin capital)
    const daysCutoff = opts.daysCutoff != null ? opts.daysCutoff : 60;
    const startingCapital = opts.startingCapital != null ? opts.startingCapital : 100000;

    const sorted = trades.slice().sort((a, b) => a.close_time - b.close_time);
    if (!sorted.length) return null;

    let cum = 0, peak = 0, peakDate = sorted[0].close_time;
    let maxDD = 0, maxDDTroughDate = sorted[0].close_time, maxDDPeakDate = sorted[0].close_time;
    let maxDDPct = 0;  // % máximo histórico SQX-compatible
    for (const t of sorted) {
      cum += t.pl;
      if (cum > peak) { peak = cum; peakDate = t.close_time; }
      const dd = peak - cum;
      const equityAtPeak = startingCapital + peak;
      const ddPct = equityAtPeak > 0 ? (dd / equityAtPeak) * 100 : 0;
      if (dd > maxDD) { maxDD = dd; maxDDPeakDate = peakDate; maxDDTroughDate = t.close_time; }
      if (ddPct > maxDDPct) maxDDPct = ddPct;
    }
    const finalBal = cum;
    const lastDate = sorted[sorted.length - 1].close_time;
    const currentDD = peak - finalBal;
    // SQX-compatible: DD actual / (capital + peak), no DD/peak
    const currentDDPct = (currentDD / (startingCapital + peak)) * 100;
    const daysSinceATH = currentDD > 0
      ? Math.round((lastDate.getTime() - peakDate.getTime()) / (24 * 3600 * 1000))
      : 0;
    const lastTroughDateStr = maxDDTroughDate.toISOString().slice(0, 10);
    const lastDateStr = lastDate.toISOString().slice(0, 10);
    const isAtMaxDD = currentDD > 0 && lastTroughDateStr === lastDateStr;

    // Veredictos
    const passDD = currentDDPct < ddPctCutoff;
    const passTime = daysSinceATH < daysCutoff;
    const passOngoing = passDD && passTime;
    let severity;
    if (isAtMaxDD) severity = 'AT_MAX_DD';
    else if (!passDD && !passTime) severity = 'SEVERE';
    else if (!passDD || !passTime) severity = 'WARNING';
    else if (currentDD > 0) severity = 'NORMAL_DD';
    else severity = 'AT_PEAK';

    return {
      finalBalance: finalBal,
      ath: peak,
      athDate: peakDate.toISOString().slice(0, 10),
      lastTradeDate: lastDateStr,
      currentDD,
      currentDDPct,
      daysSinceATH,
      maxDDEver: maxDD,
      maxDDPctEver: maxDDPct,   // % máximo histórico (SQX-compatible)
      maxDDTroughDate: lastTroughDateStr,
      isAtMaxDD,
      passDD, passTime, passOngoing,
      severity,
      ddPctCutoff, daysCutoff,
      startingCapital,
    };
  }

  /**
   * Genera N bloques OOS sintéticos desde el array de trades.
   * Devuelve {blocks, startDate, endDate, startStr, endStr, blockMs}
   * Cada bloque: {idx, startMonth, endMonth, netProfit, netProfitPct,
   *               maxDD, maxDDPct, cagr, cagrDD, trades, wins, worstYear}
   */
  /** Calcula N bloques auto-escalado: target ~12 meses/bloque.
   *  4 años → 6 bloques (mín), 8 años → 8, 16 años → 16, >20y → 20 (máx). */
  function autoN(rangeMs, targetMonthsPerBlock = 12) {
    const years = rangeMs / (365.25 * 24 * 3600 * 1000);
    return Math.max(6, Math.min(20, Math.round(years * 12 / targetMonthsPerBlock)));
  }

  function generateOOSBlocks(trades, opts = {}) {
    const startingCapital = opts.startingCapital || 100000;

    let minOpen = Infinity, maxClose = -Infinity;
    for (const t of trades) {
      if (t.open_time.getTime() < minOpen) minOpen = t.open_time.getTime();
      if (t.close_time.getTime() > maxClose) maxClose = t.close_time.getTime();
    }
    const startDate = new Date(minOpen);
    startDate.setUTCDate(1); startDate.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(maxClose);
    endDate.setUTCDate(1); endDate.setUTCMonth(endDate.getUTCMonth() + 1); endDate.setUTCHours(0, 0, 0, 0);
    if (opts.startDate) startDate.setTime(new Date(opts.startDate + 'T00:00:00Z').getTime());
    if (opts.endDate) endDate.setTime(new Date(opts.endDate + 'T00:00:00Z').getTime());

    const rangeMs = endDate.getTime() - startDate.getTime();
    // Auto-N por defecto: target 12 meses/bloque. opts.nBlocks fuerza valor concreto.
    const N = opts.nBlocks || autoN(rangeMs);
    const blockMs = rangeMs / N;
    const yearsPerBlock = blockMs / (365.25 * 24 * 3600 * 1000);

    const blocks = [];
    for (let i = 0; i < N; i++) {
      const bs = startDate.getTime() + i * blockMs;
      const be = startDate.getTime() + (i + 1) * blockMs;
      let bal = 0, peak = 0, maxDD = 0, count = 0, wins = 0;
      const yearsInBlock = {};
      for (const t of trades) {
        const dt = t.close_time.getTime();
        if (dt < bs || dt >= be) continue;
        bal += t.pl;
        if (bal > peak) peak = bal;
        const dd = peak - bal;
        if (dd > maxDD) maxDD = dd;
        count++;
        if (t.pl > 0) wins++;
        const y = t.close_time.getUTCFullYear();
        yearsInBlock[y] = (yearsInBlock[y] || 0) + t.pl;
      }
      const finalEq = startingCapital + bal;
      const cagr = yearsPerBlock > 0 && finalEq > 0
        ? (Math.pow(finalEq / startingCapital, 1 / yearsPerBlock) - 1) * 100
        : 0;
      const ddPct = peak > 0 ? (maxDD / (startingCapital + peak)) * 100 : 0;
      const cagrDD = ddPct > 0 ? cagr / ddPct : (cagr > 0 ? 99 : 0);
      const yvs = Object.values(yearsInBlock);
      blocks.push({
        idx: i + 1,
        startMonth: monthStr(new Date(bs)),
        endMonth: monthStr(new Date(be)),
        netProfit: bal,
        netProfitPct: (bal / startingCapital) * 100,
        maxDD, maxDDPct: ddPct,
        cagr, cagrDD,
        trades: count, wins,
        worstYear: yvs.length ? Math.min(...yvs) : 0,
      });
    }
    return {
      blocks,
      startDate, endDate,
      startStr: startDate.toISOString().slice(0, 10),
      endStr: endDate.toISOString().slice(0, 10),
      blockMs,
    };
  }

  /** Detecta clave del catálogo de activos a partir del symbol */
  function detectCatalogAsset(symbol) {
    if (!symbol || typeof global.cvcCatalogKeys !== 'function') return null;
    const keys = global.cvcCatalogKeys();
    if (!keys.length) return null;
    if (typeof global.cvcResolveAsset === 'function') {
      const r = global.cvcResolveAsset(symbol, keys);
      if (r) return r;
    }
    const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const aliasGroups = [
      ['SP500', 'US500', 'SPX', 'SPX500'],
      ['NDX', 'USTEC', 'NAS100', 'NQ100'],
      ['US30', 'DJ30', 'DJIA', 'WS30'],
      ['XAUUSD', 'GOLD', 'XAU'],
      ['GER40', 'DAX', 'DE40'],
    ];
    for (const k of keys) {
      const kc = k.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (s === kc) return k;
    }
    for (const k of keys) {
      const kc = k.toUpperCase().replace(/[^A-Z0-9]/g, '');
      for (const group of aliasGroups) {
        if (group.some(a => s.includes(a)) && group.some(a => kc.includes(a))) return k;
      }
    }
    // Fallback: first key that contains a substring
    for (const k of keys) {
      const kc = k.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (s.includes(kc) || kc.includes(s)) return k;
    }
    return null;
  }

  /** Recorta endDate al último mes disponible en el catálogo del activo */
  function clampEndDateToCatalog(assetKey, endStr) {
    try {
      const hist = JSON.parse(document.getElementById('historical-data').textContent);
      const data = hist[assetKey];
      if (!data || !data.start || !data.v) return endStr;
      const [y0, m0] = data.start.split('-').map(Number);
      const lastIdx = data.v.length - 1;
      let y = y0, m = m0 + lastIdx;
      y += Math.floor((m - 1) / 12);
      m = ((m - 1) % 12) + 1;
      const catalogEnd = y + '-' + String(m).padStart(2, '0') + '-01';
      return endStr > catalogEnd ? catalogEnd : endStr;
    } catch (e) { return endStr; }
  }

  /** Construye objeto strategy "mock" para alimentar cvcDetectArchetype y cvcDetectDirection */
  function buildMockStrategy(parsed, oosResult) {
    const stats = analyzeTrades(parsed.trades);
    const indicators = extractIndicatorsFromXml(parsed.strategy_xml);
    const tfMin = detectTimeframeMinutes(parsed.header.chart_name);
    const avgBarsRaw = parsed.trades.reduce((s, t) => s + t.duration_seconds, 0) / parsed.trades.length;
    const avgBars = avgBarsRaw / (tfMin * 60);
    const firstDate = parsed.trades[0].open_time;
    const lastDate = parsed.trades[parsed.trades.length - 1].close_time;
    const months = (lastDate.getTime() - firstDate.getTime()) / (30.4375 * 24 * 3600 * 1000);
    return {
      name: parsed.header.strategy_name,
      symbol: parsed.header.symbol,
      indicators: indicators.join(','),
      avg_bars: avgBars,
      avg_trades_per_month: months > 0 ? parsed.trades.length / months : null,
      trades: parsed.trades.length,
      netProfit: stats.totalPl,
      maxDD: stats.maxDdAbs,
      retDD: stats.maxDdAbs > 0 ? stats.totalPl / stats.maxDdAbs : null,
      pf: stats.pf,
      rExpectancy: stats.r.avg,
      winRate: stats.winPct,
      tradesL: null, tradesS: null, // no L/S split por trade en binario
    };
  }

  /** Pipeline completa: genera bloques, inyecta en CVC_STATE, computa EGT/Health/Coh/Archetype */
  function runSyntheticOOS(parsed, opts = {}) {
    if (!parsed?.trades?.length) return null;
    const cvcState = getCvcState();
    const cvcAvailable = typeof global.cvcComputeRegimeBlocks === 'function'
      && typeof global.cvcComputeEGT === 'function'
      && cvcState != null && typeof cvcState === 'object';
    if (!cvcAvailable) return { error: 'cvcAnalysis.js no cargado (CVC_STATE=' + (cvcState === null ? 'null' : typeof cvcState) + ')' };

    const symbol = parsed.header.symbol;
    const assetKey = detectCatalogAsset(symbol);
    const oos = generateOOSBlocks(parsed.trades, opts);
    let startStr = oos.startStr;
    let endStr = oos.endStr;
    // Clamp al catálogo si el activo está detectado
    if (assetKey) {
      const clampedEnd = clampEndDateToCatalog(assetKey, endStr);
      if (clampedEnd !== endStr) {
        const oosClamped = generateOOSBlocks(parsed.trades, { ...opts, startDate: startStr, endDate: clampedEnd });
        oos.blocks = oosClamped.blocks;
        oos.startDate = oosClamped.startDate;
        oos.endDate = oosClamped.endDate;
        oos.startStr = oosClamped.startStr;
        oos.endStr = oosClamped.endStr;
        oos.blockMs = oosClamped.blockMs;
        endStr = clampedEnd;
      }
    }

    // Inyectar en CVC_STATE (necesario para cvcComputeEGT/Health/Coherence)
    const npBlocks = oos.blocks.map(b => b.netProfit);
    const cagrDdBlocks = oos.blocks.map(b => b.cagrDD);
    const tradesPerBlock = oos.blocks.map(b => b.trades);
    const worstYearBlocks = oos.blocks.map(b => b.worstYear);
    const N = oos.blocks.length;
    const positive = npBlocks.filter(v => v > 0).length;
    let maxNegStreak = 0, cur = 0;
    for (const v of npBlocks) { if (v < 0) { cur++; maxNegStreak = Math.max(maxNegStreak, cur); } else cur = 0; }
    const half = Math.floor(N / 2);
    const avgFirst = npBlocks.slice(0, half).reduce((s, v) => s + v, 0) / half;
    const avgSecond = npBlocks.slice(N - half).reduce((s, v) => s + v, 0) / half;
    const name = parsed.header.strategy_name;

    cvcState.oosByStrategy = cvcState.oosByStrategy || {};
    cvcState.oosByStrategy[name] = {
      blocks: cagrDdBlocks,
      blocksAll: {
        'CAGR/Max DD %': cagrDdBlocks,
        'Net profit': npBlocks,
        '# of trades': tradesPerBlock,
        'Worst Year Profit': worstYearBlocks,
      },
      metric: 'CAGR/Max DD %',
      availableMetrics: ['CAGR/Max DD %', 'Net profit', '# of trades', 'Worst Year Profit'],
      positive, total: N,
      stable: positive === N,
      minVal: Math.min.apply(null, cagrDdBlocks),
      maxVal: Math.max.apply(null, cagrDdBlocks),
      avgVal: cagrDdBlocks.reduce((s, v) => s + v, 0) / N,
      avgFirst, avgSecond,
      decay: avgFirst !== 0 ? avgSecond / avgFirst : null,
      maxNegStreak,
      hasNegWorstYear: worstYearBlocks.some(v => v < 0),
      minWorstYear: Math.min.apply(null, worstYearBlocks),
    };
    cvcState.oosLoaded = true;
    cvcState.regimeStartDate = startStr;
    cvcState.regimeEndDate = endStr;
    cvcState.regimeAsset = assetKey;

    // Computar régime SOLO si tenemos asset
    let regimeBlocks = null, regimeError = null;
    if (assetKey) {
      const r = global.cvcComputeRegimeBlocks();
      if (r && r.error) regimeError = r.error;
      else if (r && r.length) regimeBlocks = r;
    }

    // Detectar dirección
    const mockStrategy = buildMockStrategy(parsed, oos);
    const dirInfo = typeof global.cvcDetectDirection === 'function'
      ? global.cvcDetectDirection(mockStrategy)
      : { dir: 'long_only' };
    mockStrategy.direction = dirInfo.dir;
    cvcState.egtDirection = dirInfo.dir;
    cvcState.egtMinBlocksPerRegime = cvcState.egtMinBlocksPerRegime || 2;

    // Computar EGT, Health, Coherence, Archetype
    const egt = regimeBlocks ? global.cvcComputeEGT(name) : null;
    const health = global.cvcComputeTemporalHealth(name);
    const coherence = regimeBlocks ? global.cvcComputeDirectionalCoherence(name) : null;
    const archetype = global.cvcDetectArchetype(mockStrategy);

    // ONGOING DD — análisis trade-by-trade (complementa salud temporal por bloques)
    const ongoingDD = computeOngoingDD(parsed.trades, opts);

    // Veredicto 5-filtros consolidados (con ongoingDD integrado en filtro #3)
    // ctx: para el Filtro #4 v2 (supervivencia por régime)
    const verdict = compute5Filters(npBlocks, regimeBlocks, egt, health, ongoingDD, {
      symbol: parsed.header.symbol,
      archetype: archetype,
      direction: dirInfo.dir,
    });

    return {
      assetKey, regimeError,
      oos, regimeBlocks,
      egt, health, coherence, archetype,
      ongoingDD,
      direction: dirInfo,
      mockStrategy,
      verdict,
    };
  }

  // ====================================================================
  // FILTRO #4 v2 — "Supervivencia por régime" (mayo 2026)
  // ====================================================================
  // Reemplaza el viejo "9/9 OOS positivos" (irreal en sample largo 16y).
  // Filosofía: "domina en tu régime propio + sobrevive en los adversos".
  //
  // 2 variantes auto-seleccionadas por nº de bloques adversos disponibles:
  //   ≥3 bloques adversos → ESTADÍSTICA  (avg adversos ≥ −30% × avg propio)
  //   <3 bloques adversos → POR-EVENTO   (cada bloque adverso pierde <1.5% capital)

  /** Clasifica el activo (solo contexto para el reporte, NO decide la variante). */
  function detectAssetClass(symbol) {
    const s = (symbol || '').toUpperCase()
      .replace(/_DUKASCOPY|_DARWINEX|\.IDX|IDXUSD/g, '')
      .replace(/M$/, '');
    const INDICES = ['US30','US500','USTEC','GER40','NDX','SPX','SP500','NASDAQ',
                     'DAX','WS30','USATECH','USA500','USA30','DEU','UK100','JP225','AUS200'];
    const METALS  = ['XAU','XAG','GOLD','SILVER'];
    if (INDICES.some(ix => s.includes(ix))) return 'INDEX';
    if (METALS.some(mx => s.includes(mx)))  return 'METAL';
    if (/^[A-Z]{6}$/.test(s))               return 'FOREX';
    return 'UNKNOWN';
  }

  /** Régime propio según arquetipo + dirección. */
  function detectOwnRegime(archetype, direction) {
    const arch = (typeof archetype === 'string' ? archetype : archetype?.archetype) || 'UNKNOWN';
    const isShort = /short/i.test(direction || '');
    if (arch === 'MEAN_REVERT') return 'RANGE';
    if (arch === 'SCALPER')     return 'RANGE';   // vol intradía, régime macro neutro
    // TREND_FOLLOWING, BREAKOUT, UNKNOWN → por dirección
    return isShort ? 'BEAR' : 'BULL';
  }

  /** Filtro #4 v2. Devuelve {verdict, mode, assetClass, ownRegime, detail}. */
  function cvcFilter4v2(npBlocks, regimeBlocks, ctx, capital = 100000) {
    if (!regimeBlocks || !regimeBlocks.length || regimeBlocks.length !== npBlocks.length) {
      // Sin régimes → fallback al criterio viejo (todos positivos)
      const allPos = npBlocks.every(v => v > 0);
      return { verdict: allPos ? 'ROBUSTO' : 'FRAGIL', mode: 'fallback-sin-regime',
               assetClass: 'UNKNOWN', ownRegime: null, pass: allPos,
               detail: 'Sin datos de régime — usado criterio viejo (todos positivos)' };
    }
    const assetClass = detectAssetClass(ctx?.symbol);
    const ownRegime  = detectOwnRegime(ctx?.archetype, ctx?.direction);

    const own = [], adverse = [];
    npBlocks.forEach((np, i) => {
      const g = regimeBlocks[i]?.group;
      if (!g) return;
      if (g === ownRegime)    own.push(np);
      else if (g !== 'RANGE') adverse.push(np);   // RANGE = neutro, no cuenta como adverso
    });

    const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
    const sum = a => a.reduce((s, v) => s + v, 0);
    const avgOwn = avg(own);
    const ownPos = own.length ? own.filter(v => v > 0).length / own.length : 0;
    const worst = Math.min(...npBlocks);
    const totalNet = sum(npBlocks);

    // Componentes comunes
    const c4A = ownPos >= 0.80 && avgOwn > 0;
    const c4C = worst > -0.02 * capital;
    const c4D = totalNet > 0;

    // 4B — variante según nº de bloques adversos. 2 umbrales:
    //   c4B_strict → pasa = ROBUSTO
    //   c4B_lax    → pasa strict-no/lax-sí = DEFENSIVO ; falla lax = FRÁGIL
    const useStatistical = adverse.length >= 3;
    let c4B_strict, c4B_lax, mode, detail;
    if (useStatistical) {
      mode = 'estadístico';
      const avgAdv = avg(adverse);
      c4B_strict = avgAdv >= -0.30 * avgOwn;   // robusto: adversos ≤ 30% del propio
      c4B_lax    = avgAdv >= -0.50 * avgOwn;   // defensivo: hasta 50%
      const ratio = avgOwn > 0 ? (avgAdv / avgOwn * 100) : 0;
      detail = `avg propio +$${avgOwn.toFixed(0)} · avg adverso $${avgAdv.toFixed(0)} `
             + `(${ratio.toFixed(0)}% del propio · umbral ROBUSTO −30%, DEFENSIVO −50%) `
             + `· ${adverse.length} bloques adversos`;
    } else {
      mode = 'por-evento';
      c4B_strict = adverse.every(v => v > -0.015 * capital);  // robusto: cada uno >−1.5% cap
      c4B_lax    = adverse.every(v => v > -0.02 * capital);   // defensivo: cada uno >−2% cap
      const worstAdv = adverse.length ? Math.min(...adverse) : 0;
      detail = `${adverse.length} bloque(s) adverso(s) · peor adverso $${worstAdv.toFixed(0)} `
             + `(umbral ROBUSTO −$${(0.015*capital).toFixed(0)}, DEFENSIVO −$${(0.02*capital).toFixed(0)})`;
    }

    let verdict;
    if (!c4C) verdict = 'CATASTROFICO';
    else if (c4A && c4D && c4B_strict)  verdict = 'ROBUSTO';
    else if (c4A && c4D && c4B_lax)     verdict = 'DEFENSIVO';
    else verdict = 'FRAGIL';

    // pass = ROBUSTO o DEFENSIVO (ambos cuentan como filtro #4 superado)
    return {
      verdict, mode, assetClass, ownRegime,
      pass: verdict === 'ROBUSTO' || verdict === 'DEFENSIVO',
      ownCount: own.length, adverseCount: adverse.length,
      detail,
    };
  }

  /** Cálculo del veredicto consolidado (filtros 2-5 + ongoing DD bandera roja) */
  function compute5Filters(npBlocks, regimeBlocks, egt, health, ongoingDD, ctx) {
    const N = npBlocks.length;
    const positive = npBlocks.filter(v => v > 0).length;
    // F2 — EGT v2
    const egtPass = egt && (egt.verdict === 'STRONG' || egt.verdict === 'COMPLIANT' || egt.verdict === 'DEFENSIVE');
    // F3 — Salud temporal POR BLOQUES (informativo)
    const healthBlocksPass = health && health.passAll;
    // F3' — ONGOING DD trade-by-trade (estricto, detecta máximo histórico actual)
    const ongoingPass = !ongoingDD || ongoingDD.passOngoing;
    // F3 combinado: AMBOS deben pasar
    const healthPass = healthBlocksPass && ongoingPass;
    // F4 v2 — Supervivencia por régime (reemplaza "9/9 OOS positivos")
    const f4 = cvcFilter4v2(npBlocks, regimeBlocks, ctx);
    const allPositive = f4.pass;  // ROBUSTO o DEFENSIVO cuenta como #4 superado
    // F5 — Recovery ≥ 70%
    const recoveryPass = health && (health.recoveryIndex == null || health.recoveryIndex >= 0.7);
    const passCount = (egtPass ? 1 : 0) + (healthPass ? 1 : 0) + (allPositive ? 1 : 0) + (recoveryPass ? 1 : 0);

    // Banderazo crítico: si está en su Max DD histórico, descarta hard
    const criticalFlag = ongoingDD && ongoingDD.isAtMaxDD;

    let label;
    if (criticalFlag) label = '🚨 EN MAX DD HISTÓRICO — NO ADOPTAR';
    else if (ongoingDD && !ongoingDD.passOngoing) label = '🛑 BACHE EXTREMO ACTIVO — esperar';
    else if (passCount >= 4) label = '⭐ ADOPTAR (4/4)';
    else if (passCount === 3) label = '✓ CANDIDATA (3/4)';
    else if (passCount === 2) label = '⚠ DUDOSA (2/4)';
    else label = '✗ DESCARTAR (<2/4)';

    return {
      passCount,
      maxPossible: 4,
      criticalFlag,
      F2_EGT: { pass: !!egtPass, verdict: egt?.verdict || 'N/A' },
      F3_Health: {
        pass: !!healthPass,
        blocksPass: !!healthBlocksPass,
        ongoingPass: !!ongoingPass,
        status: health?.status || 'N/A',
        ongoingSeverity: ongoingDD?.severity || 'N/A',
      },
      F4_RegimeSurvival: {
        pass: f4.pass, verdict: f4.verdict, mode: f4.mode,
        assetClass: f4.assetClass, ownRegime: f4.ownRegime,
        ownCount: f4.ownCount, adverseCount: f4.adverseCount,
        detail: f4.detail,
        // retro-compat: positive/total siguen disponibles
        positive, total: N,
      },
      F5_Recovery: { pass: !!recoveryPass, value: health?.recoveryIndex },
      label,
    };
  }

  // ====================================================================
  // 🧩 PORTFOLIO DESCORRELACIONADO — selección greedy por correlación
  // ====================================================================
  // Idea: dadas N estrategias finalistas, muchas son "clones funcionales"
  // (mismo edge en práctica aunque las reglas SQX se vean diferentes).
  // La correlación entre sus Net Profit por bloque OOS detecta estas
  // redundancias mejor que cualquier comparación textual de reglas.
  //
  // Algoritmo:
  //   1. Calcular NP por bloque OOS de cada strategy (mismo periodo)
  //   2. Calcular matriz N×N de correlación Pearson
  //   3. Score por strategy = PF × (Ret/DD) × (positives/N_BLOCKS) × (rExp>0 ? 1 : 0.5)
  //   4. Ordenar por score descendente
  //   5. Greedy: añadir strategy si max(corr con seleccionadas) < umbral
  //   6. Devolver portfolio + descartadas con motivo

  function pearson(a, b) {
    const n = a.length;
    if (!n) return 0;
    const ma = a.reduce((s, v) => s + v, 0) / n;
    const mb = b.reduce((s, v) => s + v, 0) / n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) {
      num += (a[i] - ma) * (b[i] - mb);
      da += (a[i] - ma) ** 2;
      db += (b[i] - mb) ** 2;
    }
    return Math.sqrt(da * db) > 0 ? num / Math.sqrt(da * db) : 0;
  }

  function buildCorrelationMatrix(parsedList, opts = {}) {
    // resample modes:
    //   'blocks'  → N bloques OOS (default, retro-compat)
    //   'daily'   → un punto por día calendario
    //   'weekly'  → un punto por semana ISO
    //   'monthly' → un punto por mes año-mes
    const resample = opts.resample || 'blocks';
    const cvcState = getCvcState();
    const startStr = opts.startDate || cvcState?.regimeStartDate;
    const endStr = opts.endDate || cvcState?.regimeEndDate;
    if (!startStr || !endStr) return null;
    const startD = new Date(startStr + 'T00:00:00Z').getTime();
    const endD = new Date(endStr + 'T00:00:00Z').getTime();
    // Auto-N por defecto: target 12 meses/bloque
    const N_BLOCKS = opts.nBlocks || autoN(endD - startD);
    const blockMs = (endD - startD) / N_BLOCKS;
    const DAY_MS = 86400 * 1000;
    const WEEK_MS = 7 * DAY_MS;

    function tradesToBlocks(trades) {
      const blocks = new Array(N_BLOCKS).fill(0);
      for (const t of trades) {
        const dt = t.close_time.getTime();
        if (dt < startD || dt >= endD) continue;
        const idx = Math.min(N_BLOCKS - 1, Math.floor((dt - startD) / blockMs));
        blocks[idx] += t.pl;
      }
      return blocks;
    }

    function tradesToDaily(trades) {
      const nDays = Math.floor((endD - startD) / DAY_MS) + 1;
      const arr = new Array(nDays).fill(0);
      for (const t of trades) {
        const dt = t.close_time.getTime();
        if (dt < startD || dt >= endD) continue;
        const idx = Math.floor((dt - startD) / DAY_MS);
        if (idx >= 0 && idx < nDays) arr[idx] += t.pl;
      }
      return arr;
    }

    function tradesToWeekly(trades) {
      const nWeeks = Math.floor((endD - startD) / WEEK_MS) + 1;
      const arr = new Array(nWeeks).fill(0);
      for (const t of trades) {
        const dt = t.close_time.getTime();
        if (dt < startD || dt >= endD) continue;
        const idx = Math.floor((dt - startD) / WEEK_MS);
        if (idx >= 0 && idx < nWeeks) arr[idx] += t.pl;
      }
      return arr;
    }

    function tradesToMonthly(trades) {
      const startDate = new Date(startD);
      const endDate = new Date(endD);
      const startY = startDate.getUTCFullYear();
      const startM = startDate.getUTCMonth();
      const endY = endDate.getUTCFullYear();
      const endM = endDate.getUTCMonth();
      const nMonths = (endY - startY) * 12 + (endM - startM) + 1;
      const arr = new Array(nMonths).fill(0);
      for (const t of trades) {
        const dt = t.close_time.getTime();
        if (dt < startD || dt >= endD) continue;
        const d = new Date(dt);
        const idx = (d.getUTCFullYear() - startY) * 12 + (d.getUTCMonth() - startM);
        if (idx >= 0 && idx < nMonths) arr[idx] += t.pl;
      }
      return arr;
    }

    function tradesToSeries(trades) {
      if (resample === 'daily') return tradesToDaily(trades);
      if (resample === 'weekly') return tradesToWeekly(trades);
      if (resample === 'monthly') return tradesToMonthly(trades);
      return tradesToBlocks(trades);
    }

    const items = parsedList.map(p => {
      const trades = p.trades;
      const total = trades.reduce((s, t) => s + t.pl, 0);
      const gp = trades.filter(t => t.pl > 0).reduce((s, t) => s + t.pl, 0);
      const gl = Math.abs(trades.filter(t => t.pl < 0).reduce((s, t) => s + t.pl, 0));
      const pf = gl > 0 ? gp / gl : (gp > 0 ? 99 : 0);
      let bal = 0, peak = 0, maxDD = 0;
      for (const t of trades) {
        bal += t.pl;
        if (bal > peak) peak = bal;
        const dd = peak - bal;
        if (dd > maxDD) maxDD = dd;
      }
      const retDD = maxDD > 0 ? total / maxDD : (total > 0 ? 99 : 0);
      const rExp = trades.length > 0
        ? trades.reduce((s, t) => s + (Math.abs(t.mae) > 0 ? t.pl / Math.abs(t.mae) : 0), 0) / trades.length
        : 0;
      // npBlocks (siempre, para mantener métricas "positive/N_BLOCKS" que alimentan el score)
      const npBlocks = tradesToBlocks(trades);
      const positive = npBlocks.filter(v => v > 0).length;
      // serie para correlación (puede ser distinta de npBlocks si resample != 'blocks')
      const corrSeries = tradesToSeries(trades);
      const score = pf * retDD * (positive / N_BLOCKS) * (rExp > 0 ? 1 : 0.5);
      return {
        parsed: p,
        name: p.header.strategy_name || p.file_name,
        total, pf, retDD, maxDD, rExp, positive, score,
        npBlocks,
        corrSeries,
      };
    });

    const matrix = items.map((it1, i) =>
      items.map((it2, j) => i === j ? 1 : pearson(it1.corrSeries, it2.corrSeries))
    );

    return { items, matrix, nBlocks: N_BLOCKS, startStr, endStr, resample, nPoints: items[0]?.corrSeries.length || 0 };
  }

  /**
   * Selecciona greedy un subset descorrelacionado.
   * @param {object} data - resultado de buildCorrelationMatrix
   * @param {number} threshold - corr max permitida (default 0.70)
   */
  function selectDecorrelatedPortfolio(data, threshold = 0.70) {
    if (!data) return null;
    const items = data.items.slice().sort((a, b) => b.score - a.score);
    const selected = [];
    const rejected = [];
    for (const item of items) {
      if (selected.length === 0) {
        selected.push({ ...item, maxCorr: null, corrWith: null, reasonAdd: 'top score (semilla)' });
        continue;
      }
      let maxCorr = -1, maxCorrWith = null;
      for (const s of selected) {
        const c = pearson(item.corrSeries, s.corrSeries);
        if (c > maxCorr) { maxCorr = c; maxCorrWith = s.name; }
      }
      if (maxCorr < threshold) {
        selected.push({ ...item, maxCorr, corrWith: maxCorrWith, reasonAdd: 'descorrelacionada' });
      } else {
        rejected.push({ ...item, maxCorr, corrWith: maxCorrWith, reasonReject: 'corr ' + (maxCorr * 100).toFixed(0) + '% con ' + maxCorrWith });
      }
    }
    return { selected, rejected, threshold };
  }

  // ---------- HTML rendering for decorrelated portfolio ----------
  function renderDecorrelationSection(parsedList, opts = {}) {
    if (!parsedList || parsedList.length < 2) {
      return '<div class="cvc-empty-state">Carga al menos 2 .sqx para análisis de descorrelación.</div>';
    }
    const threshold = opts.threshold != null ? opts.threshold : 0.70;
    const resample = opts.resample || 'blocks';
    const data = buildCorrelationMatrix(parsedList, { ...opts, resample });
    if (!data) return '<div class="cvc-empty-state">No se pudo computar matriz (falta rango temporal).</div>';
    const portfolio = selectDecorrelatedPortfolio(data, threshold);

    // ─── Tabla portfolio seleccionado ───
    const selRows = portfolio.selected.map((s, i) => {
      const corrLabel = s.maxCorr == null ? '<span style="color:var(--text2);">—</span>'
                      : '<span style="color:var(--text2);">' + (s.maxCorr * 100).toFixed(0) + '% vs ' + s.corrWith.replace(/^Strategy /, 'S_') + '</span>';
      return `
        <tr>
          <td><strong>${i + 1}</strong></td>
          <td><strong>${s.name}</strong></td>
          <td>${s.pf.toFixed(2)}</td>
          <td>${s.retDD.toFixed(2)}</td>
          <td>${fmtCur(s.total, 0)}</td>
          <td>${fmtCur(s.maxDD, 0)}</td>
          <td>${s.rExp.toFixed(2)}</td>
          <td>${s.positive}/${data.nBlocks}</td>
          <td>${s.score.toFixed(2)}</td>
          <td>${corrLabel}</td>
        </tr>
      `;
    }).join('');

    // ─── Tabla descartadas ───
    const rejRows = portfolio.rejected.map(r => `
      <tr style="opacity:0.7;">
        <td><strong>${r.name}</strong></td>
        <td>${r.pf.toFixed(2)}</td>
        <td>${r.retDD.toFixed(2)}</td>
        <td>${fmtCur(r.total, 0)}</td>
        <td>${r.positive}/${data.nBlocks}</td>
        <td style="color:#ff6b6b;font-size:11px;">${r.reasonReject}</td>
      </tr>
    `).join('');

    // ─── Heatmap N×N (sorted by score desc para alineación visual) ───
    const sortedIdx = data.items.map((it, i) => [it.score, i])
      .sort((a, b) => b[0] - a[0]).map(x => x[1]);
    const sortedNames = sortedIdx.map(i => data.items[i].name);
    const selectedNames = new Set(portfolio.selected.map(s => s.name));

    function colorForCorr(c) {
      if (c >= 0.85) return '#dc2626';  // rojo fuerte
      if (c >= 0.70) return '#ef4444';  // rojo
      if (c >= 0.50) return '#f59e0b';  // amarillo
      if (c >= 0.30) return '#fbbf24';  // amarillo claro
      if (c >= 0) return '#86efac';     // verde claro
      return '#5dd95d';                  // verde fuerte (negativa = ortogonal)
    }

    let heatHeaderCells = '<th style="position:sticky;left:0;background:var(--surface2);z-index:2;"></th>';
    sortedIdx.forEach(i => {
      const name = data.items[i].name.replace(/^Strategy /, 'S_');
      const isSel = selectedNames.has(data.items[i].name);
      heatHeaderCells += `<th style="font-size:9px;padding:2px 4px;white-space:nowrap;transform:rotate(-45deg);transform-origin:left;height:60px;${isSel ? 'color:#22c55e;font-weight:700;' : 'color:var(--text2);'}">${name}</th>`;
    });

    let heatRows = '';
    for (const i of sortedIdx) {
      const name = data.items[i].name.replace(/^Strategy /, 'S_');
      const isSelRow = selectedNames.has(data.items[i].name);
      let row = `<tr><td style="position:sticky;left:0;background:var(--surface2);font-size:10px;font-weight:600;padding:3px 6px;z-index:1;${isSelRow ? 'color:#22c55e;' : 'color:var(--text);'}">${name}</td>`;
      for (const j of sortedIdx) {
        const c = data.matrix[i][j];
        const bg = i === j ? '#1f2937' : colorForCorr(c);
        const txtColor = i === j ? 'var(--text2)' : (c >= 0.5 ? '#000' : '#1f2937');
        row += `<td style="background:${bg};color:${txtColor};font-size:10px;text-align:center;padding:3px 4px;font-family:Consolas,monospace;min-width:34px;" title="${data.items[i].name} ↔ ${data.items[j].name}: ${c.toFixed(3)}">${i === j ? '·' : c.toFixed(2)}</td>`;
      }
      row += '</tr>';
      heatRows += row;
    }

    const heatmapHTML = `
      <div style="overflow:auto;max-height:540px;max-width:100%;border:1px solid var(--border);border-radius:6px;">
        <table style="border-collapse:collapse;font-size:10px;">
          <thead><tr style="position:sticky;top:0;background:var(--surface2);z-index:3;">${heatHeaderCells}</tr></thead>
          <tbody>${heatRows}</tbody>
        </table>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;font-size:11px;margin-top:8px;color:var(--text2);">
        <span style="display:inline-flex;align-items:center;gap:4px;"><span style="display:inline-block;width:14px;height:14px;background:#5dd95d;"></span> &lt;0 (ortogonal)</span>
        <span style="display:inline-flex;align-items:center;gap:4px;"><span style="display:inline-block;width:14px;height:14px;background:#86efac;"></span> 0–0.30</span>
        <span style="display:inline-flex;align-items:center;gap:4px;"><span style="display:inline-block;width:14px;height:14px;background:#fbbf24;"></span> 0.30–0.50</span>
        <span style="display:inline-flex;align-items:center;gap:4px;"><span style="display:inline-block;width:14px;height:14px;background:#f59e0b;"></span> 0.50–0.70</span>
        <span style="display:inline-flex;align-items:center;gap:4px;"><span style="display:inline-block;width:14px;height:14px;background:#ef4444;"></span> 0.70–0.85</span>
        <span style="display:inline-flex;align-items:center;gap:4px;"><span style="display:inline-block;width:14px;height:14px;background:#dc2626;"></span> &gt;0.85 (duplicado funcional)</span>
        <span style="margin-left:auto;color:#22c55e;font-weight:600;">verde = strategy seleccionada en portfolio</span>
      </div>
    `;

    const selectedNamesList = portfolio.selected.map(s => s.name).join('\n');

    // Hint del resample: a más granular, más puntos pero correlación más baja
    // (ruido del día a día). El criterio SQX clásico es MONTHLY 0.3.
    const resampleLabels = {
      blocks: `OOS (${data.nBlocks} bloques)`,
      daily: `Diaria (${data.nPoints} días)`,
      weekly: `Semanal (${data.nPoints} sem)`,
      monthly: `Mensual (${data.nPoints} meses)`,
    };
    const resampleHint = {
      blocks: 'segmentos OOS, granularidad gruesa (correlación más alta)',
      daily: 'punto por día, granularidad fina (correlación más baja)',
      weekly: 'punto por semana ISO, equilibrio entre granularidad y robustez',
      monthly: 'punto por mes calendario (criterio SQX clásico)',
    };

    return `
      <p style="font-size:12px;color:var(--text2);margin:0 0 10px;">
        Algoritmo greedy: ordena por score (PF × Ret/DD × OOS+/N × signal R Exp), añade strategy si correlación con cualquier ya elegida &lt; umbral.
        Detecta <strong>duplicados funcionales</strong> (mismo edge aunque reglas SQX difieran).
        <span style="color:var(--accent);">Criterio SQX clásico: <strong>Mensual 0.30</strong>.</span>
      </p>

      <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-bottom:14px;padding:10px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;">
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;">
          <span>Resample:</span>
          <select id="cvc-corr-resample" style="background:var(--surface);border:1px solid var(--border);color:var(--text);padding:3px 6px;border-radius:4px;font-size:12px;">
            <option value="blocks"${resample==='blocks'?' selected':''}>OOS blocks (default)</option>
            <option value="daily"${resample==='daily'?' selected':''}>Diaria</option>
            <option value="weekly"${resample==='weekly'?' selected':''}>Semanal</option>
            <option value="monthly"${resample==='monthly'?' selected':''}>Mensual (SQX clásico)</option>
          </select>
          <span style="color:var(--text2);font-size:11px;">${resampleLabels[resample]}</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;">
          <span>Umbral correlación:</span>
          <input type="range" id="cvc-corr-threshold" min="0.10" max="0.95" step="0.05" value="${threshold}" style="width:150px;">
          <strong id="cvc-corr-threshold-val" style="color:var(--accent);min-width:42px;">${threshold.toFixed(2)}</strong>
        </label>
        <div style="font-size:12px;color:var(--text2);">
          <strong style="color:#22c55e;">${portfolio.selected.length}</strong> seleccionadas /
          <strong style="color:#ff6b6b;">${portfolio.rejected.length}</strong> descartadas /
          ${parsedList.length} total
        </div>
        <button id="cvc-portfolio-copy" class="export-btn" style="margin-left:auto;font-size:11px;">📋 Copiar nombres</button>
      </div>
      <div style="font-size:11px;color:var(--text2);margin-bottom:10px;font-style:italic;">${resampleHint[resample]}</div>

      <details open style="margin-bottom:14px;">
        <summary style="cursor:pointer;font-weight:700;color:#22c55e;padding:6px 0;">⭐ Portfolio seleccionado (${portfolio.selected.length})</summary>
        <div style="overflow-x:auto;margin-top:8px;">
          <table class="cvc-table cvc-table-compact">
            <thead><tr><th>#</th><th>Strategy</th><th>PF</th><th>Ret/DD</th><th>NP</th><th>Max DD</th><th>R Exp</th><th>OOS+</th><th>Score</th><th>Max corr</th></tr></thead>
            <tbody>${selRows}</tbody>
          </table>
        </div>
      </details>

      <details style="margin-bottom:14px;">
        <summary style="cursor:pointer;font-weight:700;color:#ff6b6b;padding:6px 0;">🗑️ Descartadas por correlación (${portfolio.rejected.length})</summary>
        <div style="overflow-x:auto;margin-top:8px;">
          <table class="cvc-table cvc-table-compact">
            <thead><tr><th>Strategy</th><th>PF</th><th>Ret/DD</th><th>NP</th><th>OOS+</th><th>Motivo</th></tr></thead>
            <tbody>${rejRows}</tbody>
          </table>
        </div>
      </details>

      <details open>
        <summary style="cursor:pointer;font-weight:700;padding:6px 0;">🔥 Heatmap correlación (${data.items.length}×${data.items.length})</summary>
        <div style="margin-top:8px;">${heatmapHTML}</div>
      </details>

      <textarea id="cvc-portfolio-names" style="display:none;">${selectedNamesList}</textarea>
    `;
  }

  // Wiring del slider + selector resample + botón copiar.
  // IMPORTANTE: container es el <div id="cvc-decorrelation-panel">; al re-renderizar
  // se reemplaza su innerHTML (no outerHTML) para preservar el wrapper y sus IDs.
  function wireDecorrelationSection(container, parsedList, currentOpts = {}) {
    if (!container) return;

    const slider = container.querySelector('#cvc-corr-threshold');
    const valSpan = container.querySelector('#cvc-corr-threshold-val');
    const resampleSel = container.querySelector('#cvc-corr-resample');
    const copyBtn = container.querySelector('#cvc-portfolio-copy');

    // Estado vivo (threshold + resample) que se hereda al re-renderizar
    const state = {
      threshold: currentOpts.threshold != null ? currentOpts.threshold
                : (slider ? parseFloat(slider.value) : 0.70),
      resample: currentOpts.resample || (resampleSel ? resampleSel.value : 'blocks'),
    };

    function rerender() {
      const newHTML = renderDecorrelationSection(parsedList, state);
      container.innerHTML = newHTML;
      wireDecorrelationSection(container, parsedList, state);
    }

    if (slider) {
      let timer;
      slider.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        if (valSpan) valSpan.textContent = v.toFixed(2);
        state.threshold = v;
        clearTimeout(timer);
        timer = setTimeout(rerender, 300);
      });
    }
    if (resampleSel) {
      resampleSel.addEventListener('change', (e) => {
        state.resample = e.target.value;
        rerender();
      });
    }
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const txt = container.querySelector('#cvc-portfolio-names')?.value || '';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(txt).then(() => {
            copyBtn.textContent = '✓ Copiado';
            setTimeout(() => { copyBtn.textContent = '📋 Copiar nombres'; }, 1500);
          }).catch(() => {
            copyBtn.textContent = '✗ Error';
          });
        }
      });
    }
  }

  // ---------- HTML rendering for synthetic OOS ----------
  function renderSyntheticOOS(parsed) {
    const r = runSyntheticOOS(parsed);
    if (!r) return '<p>Sin datos.</p>';
    if (r.error) return `<p style="color:var(--text2)">${r.error}</p>`;

    const blocks = r.oos.blocks;
    const regimeBlocks = r.regimeBlocks;
    const assetKey = r.assetKey;

    // Tabla bloques OOS + régime
    let blockRows = '';
    blocks.forEach((b, i) => {
      const reg = regimeBlocks?.[i];
      const regLabel = reg ? reg.regime : '—';
      const regGroup = reg ? reg.group : null;
      const regClass = regGroup === 'BULL' ? '#5dd95d' : regGroup === 'BEAR' ? '#ff6b6b' : regGroup === 'RANGE' ? '#fbbf24' : 'var(--text2)';
      const npColor = b.netProfit > 0 ? '#5dd95d' : b.netProfit < 0 ? '#ff6b6b' : 'var(--text2)';
      blockRows += `
        <tr>
          <td><strong>OOS${b.idx}</strong></td>
          <td style="font-family:Consolas,monospace;font-size:11px;">${b.startMonth}→${b.endMonth}</td>
          <td style="color:${regClass};font-weight:600;">${regLabel}</td>
          <td>${reg ? reg.pctChange.toFixed(1) + '%' : '—'}</td>
          <td style="color:${npColor};font-family:Consolas,monospace;">${fmtCur(b.netProfit, 0)}</td>
          <td>${b.trades}</td>
          <td>${b.trades > 0 ? (b.wins / b.trades * 100).toFixed(0) + '%' : '—'}</td>
          <td>${b.cagrDD.toFixed(2)}</td>
        </tr>
      `;
    });

    // EGT pills por régime
    let egtSummary = '<p style="color:var(--text2);">EGT no disponible (sin activo en catálogo)</p>';
    if (r.egt) {
      const verdictColor = r.egt.verdict === 'STRONG' ? '#22c55e' : r.egt.verdict === 'COMPLIANT' ? '#86efac'
                       : r.egt.verdict === 'DEFENSIVE' ? '#fbbf24' : r.egt.verdict === 'INSUFFICIENT' ? '#a5b4fc' : '#ff6b6b';
      const verdictIcon = r.egt.verdict === 'STRONG' ? '⭐' : r.egt.verdict === 'COMPLIANT' ? '✓'
                      : r.egt.verdict === 'DEFENSIVE' ? '⚠' : r.egt.verdict === 'INSUFFICIENT' ? '❓' : '❌';
      egtSummary = `
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">
          <span style="font-size:14px;font-weight:700;color:${verdictColor};">${verdictIcon} EGT v2: ${r.egt.verdict}</span>
          <span style="font-size:11px;color:var(--text2);">Régime dominante: <strong>${r.egt.dominantRegime || '?'}</strong></span>
          <span style="font-size:11px;color:var(--text2);">Dirección: <strong>${r.direction.dir}</strong></span>
        </div>
      `;
      if (r.egt.avgByGroup) {
        let regimePills = '';
        for (const g of ['BULL', 'BEAR', 'RANGE']) {
          const av = r.egt.avgByGroup[g];
          if (av == null) {
            regimePills += `<span class="cvc-egt-tag cvc-egt-insufficient">${g} n/a</span>`;
            continue;
          }
          const cls = r.egt.strongByRegime?.[g] ? 'cvc-egt-strong'
                    : r.egt.passByRegime?.[g] ? 'cvc-egt-compliant'
                    : 'cvc-egt-risk';
          regimePills += `<span class="cvc-egt-tag ${cls}">${g} ${av.toFixed(2)}</span> `;
        }
        egtSummary += `<div style="display:flex;gap:6px;flex-wrap:wrap;">${regimePills}</div>`;
      }
    }

    // Health pills
    let healthSummary = '<p style="color:var(--text2);">Salud temporal no calculable.</p>';
    if (r.health) {
      const statusColor = r.health.status === 'fresh' ? '#22c55e'
                       : r.health.status === 'recovered' ? '#86efac'
                       : r.health.status === 'old_peak' ? '#fbbf24'
                       : '#ff6b6b';
      healthSummary = `
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:12px;">
          <span style="color:${statusColor};font-weight:700;font-size:13px;">${r.health.status.toUpperCase()}</span>
          <span class="cvc-health-pill ${r.health.passPeak ? 'cvc-health-good' : 'cvc-health-bad'}">peak: OOS${r.health.peakBlock}</span>
          <span class="cvc-health-pill ${r.health.passDD ? 'cvc-health-good' : 'cvc-health-bad'}">DD@close: ${(r.health.ddAtClose*100).toFixed(1)}%</span>
          <span class="cvc-health-pill ${r.health.passRecovery ? 'cvc-health-good' : 'cvc-health-bad'}">recovery: ${r.health.recoveryIndex != null ? (r.health.recoveryIndex*100).toFixed(0) + '%' : 'n/a'}</span>
        </div>
      `;
    }

    // Coherence pill
    let cohSummary = '';
    if (r.coherence) {
      const cohMap = { OK:'cvc-coh-ok', OK_MEAN_REVERT:'cvc-coh-mean-revert', SUSPICIOUS:'cvc-coh-suspicious',
                       WEAK:'cvc-coh-weak', BROKEN:'cvc-coh-broken' };
      const cls = cohMap[r.coherence.verdict] || 'cvc-coh-na';
      const icon = r.coherence.verdict === 'OK' ? '✓' : r.coherence.verdict === 'OK_MEAN_REVERT' ? '🌊'
                : r.coherence.verdict === 'BROKEN' ? '❌' : r.coherence.verdict === 'WEAK' ? '⚠'
                : r.coherence.verdict === 'SUSPICIOUS' ? '⚠' : '?';
      cohSummary = `<span class="cvc-coh-pill ${cls}">${icon} Coherencia: ${r.coherence.verdict}</span>`;
    }

    // Archetype
    let archSummary = '';
    if (r.archetype) {
      const archMap = { TREND_FOLLOWING:'cvc-arch-trend', MEAN_REVERT:'cvc-arch-meanrev',
                        SCALPER:'cvc-arch-scalper', BREAKOUT:'cvc-arch-breakout', UNKNOWN:'cvc-arch-unknown' };
      const cls = archMap[r.archetype.archetype] || 'cvc-arch-unknown';
      const icon = r.archetype.archetype === 'TREND_FOLLOWING' ? '📈' : r.archetype.archetype === 'MEAN_REVERT' ? '🌊'
                : r.archetype.archetype === 'SCALPER' ? '⚡' : r.archetype.archetype === 'BREAKOUT' ? '💥' : '❓';
      archSummary = `<span class="cvc-arch-pill ${cls}">${icon} ${r.archetype.archetype} (${r.archetype.confidence})</span>`;
    }

    // ONGOING DD bandera roja
    let ongoingSummary = '';
    if (r.ongoingDD) {
      const o = r.ongoingDD;
      const sevColor = o.severity === 'AT_MAX_DD' ? '#dc2626'
                     : o.severity === 'SEVERE' ? '#ef4444'
                     : o.severity === 'WARNING' ? '#f59e0b'
                     : o.severity === 'NORMAL_DD' ? '#fbbf24'
                     : '#22c55e';
      const sevIcon = o.severity === 'AT_MAX_DD' ? '🚨'
                    : o.severity === 'SEVERE' ? '🛑'
                    : o.severity === 'WARNING' ? '⚠'
                    : o.severity === 'NORMAL_DD' ? '📉'
                    : '✓';
      const sevLabel = o.severity === 'AT_MAX_DD' ? 'EN MAX DD HISTÓRICO AHORA'
                     : o.severity === 'SEVERE' ? 'BACHE EXTREMO'
                     : o.severity === 'WARNING' ? 'BACHE EN CURSO'
                     : o.severity === 'NORMAL_DD' ? 'DD normal'
                     : 'EN PEAK';
      const ddColor = o.passDD ? '#22c55e' : '#ef4444';
      const timeColor = o.passTime ? '#22c55e' : '#ef4444';
      const isPeakRow = o.currentDD <= 0
        ? `<div style="font-size:11px;color:#22c55e;">✓ equity al cierre = ATH (sin bache activo)</div>`
        : `
          <div style="display:flex;gap:10px;flex-wrap:wrap;font-size:11px;margin-top:4px;">
            <span>ATH: <strong>${fmtCur(o.ath, 0)}</strong> el <strong>${o.athDate}</strong></span>
            <span>Cierre: <strong>${fmtCur(o.finalBalance, 0)}</strong> el <strong>${o.lastTradeDate}</strong></span>
            <span style="color:${ddColor};">Current DD: <strong>${fmtCur(o.currentDD, 0)} (${o.currentDDPct.toFixed(2)}%)</strong> ${o.passDD ? '✓' : '✗ ≥' + o.ddPctCutoff + '%'}</span>
            <span style="color:${timeColor};">Sin recuperar: <strong>${o.daysSinceATH} días</strong> ${o.passTime ? '✓' : '✗ ≥' + o.daysCutoff + 'd'}</span>
            ${o.isAtMaxDD ? '<span style="color:#dc2626;font-weight:700;">🚨 = MAX DD histórico EVER</span>' : ''}
          </div>`;
      ongoingSummary = `
        <div class="cvc-stat-card" style="border-color:${sevColor};margin-bottom:12px;${o.severity === 'AT_MAX_DD' ? 'box-shadow:0 0 16px rgba(220,38,38,.35);' : ''}">
          <div class="cvc-stat-label">🩺 ONGOING DD (trade-by-trade)</div>
          <div class="cvc-stat-value" style="color:${sevColor};font-size:15px;">${sevIcon} ${sevLabel}</div>
          ${isPeakRow}
        </div>
      `;
    }

    // Verdict consolidado
    const v = r.verdict;
    const vColor = v.criticalFlag ? '#dc2626'
                 : v.passCount === 4 ? '#22c55e'
                 : v.passCount === 3 ? '#86efac'
                 : v.passCount === 2 ? '#fbbf24'
                 : '#ff6b6b';

    const assetInfo = assetKey
      ? `<span style="font-size:11px;color:var(--text2);">activo catálogo: <strong>${assetKey}</strong></span>`
      : `<span style="font-size:11px;color:#fbbf24;">⚠ activo no detectado en catálogo — régime/EGT no disponible</span>`;

    return `
      <p style="font-size:12px;color:var(--text2);margin:0 0 10px;">
        ${r.oos.blocks.length} bloques OOS sintéticos generados desde fechas de trades
        (${r.oos.startStr} → ${r.oos.endStr}) · ${assetInfo}
        ${r.regimeError ? '<br><span style="color:#ff6b6b;">⚠ ' + r.regimeError + '</span>' : ''}
      </p>

      ${ongoingSummary}

      <div class="cvc-stat-card" style="margin-bottom:14px;border-color:${vColor};box-shadow:0 0 12px ${vColor}30;">
        <div class="cvc-stat-label">Veredicto consolidado</div>
        <div class="cvc-stat-value" style="color:${vColor};font-size:20px;">${v.label}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;font-size:11px;">
          <span style="color:${v.F2_EGT.pass ? '#22c55e' : '#ff6b6b'};">${v.F2_EGT.pass ? '✓' : '✗'} EGT v2: ${v.F2_EGT.verdict}</span>
          <span style="color:${v.F3_Health.pass ? '#22c55e' : '#ff6b6b'};" title="Bloques OOS: ${v.F3_Health.blocksPass ? '✓' : '✗'} · Ongoing DD: ${v.F3_Health.ongoingPass ? '✓' : '✗ ' + v.F3_Health.ongoingSeverity}">${v.F3_Health.pass ? '✓' : '✗'} Salud: ${v.F3_Health.status}${v.F3_Health.blocksPass && !v.F3_Health.ongoingPass ? ' (' + v.F3_Health.ongoingSeverity + ')' : ''}</span>
          <span style="color:${v.F4_RegimeSurvival.pass ? '#22c55e' : '#ff6b6b'};" title="Filtro #4 v2 — Supervivencia por régime · ${v.F4_RegimeSurvival.assetClass} · modo ${v.F4_RegimeSurvival.mode} · ${v.F4_RegimeSurvival.detail}">${v.F4_RegimeSurvival.pass ? '✓' : '✗'} #4 ${v.F4_RegimeSurvival.verdict} (${v.F4_RegimeSurvival.positive}/${v.F4_RegimeSurvival.total} OOS+)</span>
          <span style="color:${v.F5_Recovery.pass ? '#22c55e' : '#ff6b6b'};">${v.F5_Recovery.pass ? '✓' : '✗'} Recovery ${v.F5_Recovery.value != null ? (v.F5_Recovery.value*100).toFixed(0) + '%' : 'n/a'}</span>
        </div>
      </div>

      <div style="margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        ${archSummary} ${cohSummary}
      </div>

      <div style="margin-bottom:10px;">${egtSummary}</div>
      <div style="margin-bottom:14px;">${healthSummary}</div>

      <div style="overflow-x:auto;">
        <table class="cvc-table cvc-table-compact">
          <thead><tr>
            <th>OOS</th><th>Periodo</th><th>Régime</th><th>%Δ activo</th>
            <th>Net P/L</th><th>Trades</th><th>Win%</th><th>CAGR/DD</th>
          </tr></thead>
          <tbody>${blockRows}</tbody>
        </table>
      </div>
    `;
  }

  function renderForensicsCard(parsed) {
    if (!parsed || !parsed.trades || !parsed.trades.length) {
      return '<div class="cvc-empty-state">Sin trades para analizar.</div>';
    }
    const stats = analyzeTrades(parsed.trades);
    const audit = parsed.strategy_xml ? global.SQXParser.auditStrategyXml(parsed.strategy_xml) : null;

    const firstT = parsed.trades[0].open_time;
    const lastT = parsed.trades[parsed.trades.length - 1].close_time;
    const layerInfo = detectLayer(parsed);
    const badge = renderLayerBadge(layerInfo);

    return `
      <div class="cvc-forensics-header">
        <div>
          <div style="font-size:14px;font-weight:600;color:var(--text);display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span>${parsed.header.strategy_name || parsed.file_name}</span>
            ${badge}
          </div>
          <div style="font-size:12px;color:var(--text2);">${parsed.header.symbol || '—'} · ${parsed.header.chart_name || '—'}</div>
          <div style="font-size:11px;color:var(--text2);">${firstT.toISOString().slice(0, 10)} → ${lastT.toISOString().slice(0, 10)} · ${parsed.trades.length} trades</div>
        </div>
      </div>

      <details class="cvc-forensics-section" open>
        <summary><strong>Resumen general</strong></summary>
        <div class="cvc-forensics-body">${renderSummary(stats)}</div>
      </details>

      <details class="cvc-forensics-section" open>
        <summary><strong>🔍 Auditoría Blocksettings (Source code)</strong></summary>
        <div class="cvc-forensics-body">${renderAudit(audit, parsed.header)}</div>
      </details>

      <details class="cvc-forensics-section">
        <summary><strong>⏰ Performance por hora del día</strong></summary>
        <div class="cvc-forensics-body">${renderHours(stats)}</div>
      </details>

      <details class="cvc-forensics-section">
        <summary><strong>📅 Performance por día de semana</strong></summary>
        <div class="cvc-forensics-body">${renderDays(stats)}</div>
      </details>

      <details class="cvc-forensics-section">
        <summary><strong>📊 MAE / MFE</strong></summary>
        <div class="cvc-forensics-body">${renderMaeMfe(stats)}</div>
      </details>

      <details class="cvc-forensics-section">
        <summary><strong>📈 R-multiples</strong></summary>
        <div class="cvc-forensics-body">${renderR(stats)}</div>
      </details>

      <details class="cvc-forensics-section">
        <summary><strong>📆 Año a año</strong></summary>
        <div class="cvc-forensics-body">${renderYears(stats)}</div>
      </details>

      <details class="cvc-forensics-section" open>
        <summary><strong>🧪 OOS sintético + EGT v2 + Salud temporal (sin CSV)</strong></summary>
        <div class="cvc-forensics-body">${renderSyntheticOOS(parsed)}</div>
      </details>
    `;
  }

  function renderInto(container, parsed) {
    container.innerHTML = renderForensicsCard(parsed);
  }

  // ---------- multi-file render ----------
  function renderMultiInto(container, parsedList) {
    if (!parsedList || !parsedList.length) {
      container.innerHTML = '<div class="cvc-empty-state">Carga uno o más archivos .sqx.</div>';
      return;
    }
    // Detectar modo del mining + layer por strategy
    const modeInfo = detectMiningMode(parsedList);
    const layerByIdx = modeInfo.layers;

    const tabs = parsedList.map((p, i) => {
      const name = (p.header.strategy_name || p.file_name).replace(/^Strategy\s+/i, 'S_');
      const layer = layerByIdx[i]?.layer;
      const layerDot = layer === 'capa1' ? '🔵' : layer === 'capa2' ? '🟣' : layer === 'mixed' ? '⚠' : '';
      return `<button class="cvc-forensics-tab${i === 0 ? ' active' : ''}" data-fidx="${i}" title="${layerByIdx[i]?.layer?.toUpperCase()}: ${(layerByIdx[i]?.reasons||[]).join(' · ')}">${layerDot} ${name}</button>`;
    }).join('');

    container.innerHTML = `
      ${renderMiningModeBanner(modeInfo)}
      <div class="cvc-forensics-tabs">${tabs}</div>
      <div class="cvc-forensics-panel" id="cvc-forensics-panel"></div>
    `;
    const panel = container.querySelector('#cvc-forensics-panel');
    const tabBtns = container.querySelectorAll('.cvc-forensics-tab');
    function show(i) {
      tabBtns.forEach((b, k) => b.classList.toggle('active', k === i));
      panel.innerHTML = renderForensicsCard(parsedList[i]);
    }
    tabBtns.forEach((b, i) => b.addEventListener('click', () => show(i)));
    show(0);
  }

  // ---------- export ----------
  global.SQXTradeAnalysis = {
    analyzeTrades,
    renderInto,
    renderMultiInto,
    renderForensicsCard,
    // Synthetic OOS pipeline (sin CSV)
    generateOOSBlocks,
    computeOngoingDD,
    detectCatalogAsset,
    extractIndicatorsFromXml,
    detectTimeframeMinutes,
    buildMockStrategy,
    runSyntheticOOS,
    renderSyntheticOOS,
    // Portfolio descorrelacionado
    pearson,
    buildCorrelationMatrix,
    selectDecorrelatedPortfolio,
    renderDecorrelationSection,
    wireDecorrelationSection,
    // Detección Capa 1 / Capa 2
    detectLayer,
    detectMiningMode,
    renderLayerBadge,
    renderMiningModeBanner,
    // Filtro #4 v2 — Supervivencia por régime
    detectAssetClass,
    detectOwnRegime,
    cvcFilter4v2,
    compute5Filters,
  };
})(typeof window !== 'undefined' ? window : globalThis);
