/**
 * analyzer.js - Motor de Análisis y Certificación SQX
 * Integrado en SQX Edge Pipeline v7.0
 */

const ASSET_PRESETS = {
  FOREX: { 
    min_pf: 1.4, min_win: 55, max_dd: 15, min_retdd: 4.0, min_sqn: 2.0, min_rexp: 0.15,
    regex: /EUR|GBP|USD|JPY|AUD|CAD|CHF|NZD/i 
  },
  INDICES: { 
    min_pf: 1.5, min_win: 52, max_dd: 20, min_retdd: 5.0, min_sqn: 2.5, min_rexp: 0.20,
    regex: /USA|NAS|NDX|DAX|GER|US30|DOW|SP500/i 
  },
  CRYPTO: { 
    min_pf: 1.8, min_win: 45, max_dd: 30, min_retdd: 6.0, min_sqn: 3.0, min_rexp: 0.30,
    regex: /BTC|ETH|SOL|BNB|XRP/i 
  },
  GENERIC: { min_pf: 1.4, min_win: 50, max_dd: 20, min_retdd: 4.0, min_sqn: 2.0, min_rexp: 0.15 }
};

let analyzerState = {
  strategies: [],
  currentPreset: 'GENERIC',
  currentStrategyId: null
};

/**
 * Inicialización del módulo
 */
function initAnalyzer() {
  const fileInput = document.getElementById('analyzer-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', handleFileSelect);
  }

  // Sincronización de scroll doble
  const topProxy = document.getElementById('analyzer-top-scroll');
  const resultsContainer = document.getElementById('analyzer-results');
  
  if (topProxy && resultsContainer) {
    topProxy.addEventListener('scroll', () => {
      const wrap = resultsContainer.querySelector('.analyzer-table-wrap');
      if (wrap) wrap.scrollLeft = topProxy.scrollLeft;
    });
    
    // El scroll inverso se maneja mediante delegación en renderAnalyzer
  }
}

/**
 * Procesa el CSV de SQX
 */
async function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const text = await file.text();
  const rows = parseCSV(text);
  
  analyzerState.strategies = rows.map((r, idx) => {
    const rawName = r['Strategy Name'] || '';
    // Extraer números después de "Strategy "
    let stratNum = rawName.replace(/Strategy\s+/i, '').trim();
    if (!stratNum) stratNum = `ID-${idx}`;

    return {
      ...r,
      _id: stratNum,
      _rawName: rawName,
      passed: checkStrategy(r)
    };
  });

  renderAnalyzer();
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  
  // Detectar separador (coma o punto y coma)
  const firstLine = lines[0];
  const sep = firstLine.includes(';') ? ';' : ',';
  
  const headers = firstLine.split(sep).map(h => h.trim().replace(/"/g, ''));
  return lines.slice(1).map(line => {
    const values = line.split(sep).map(v => v.trim().replace(/"/g, ''));
    const obj = {};
    headers.forEach((h, i) => obj[h] = values[i]);
    return obj;
  });
}

function checkStrategy(s) {
  const p = ASSET_PRESETS[analyzerState.currentPreset];
  const metrics = {
    pf: parseFloat(s['Profit Factor']) || 0,
    win: parseFloat(s['Win %']) || 0,
    dd: parseFloat(s['Max DD %']) || 0,
    retdd: parseFloat(s['Ret/DD Ratio']) || 0,
    sqn: parseFloat(s['SQN']) || 0,
    rexp: parseFloat(s['R Expectancy']) || 0
  };

  return metrics.pf >= p.min_pf && 
         metrics.win >= p.min_win && 
         metrics.dd <= p.max_dd && 
         metrics.retdd >= p.min_retdd && 
         metrics.sqn >= p.min_sqn && 
         metrics.rexp >= p.min_rexp;
}

/**
 * Renderizado de la tabla y UI
 */
function renderAnalyzer() {
  const container = document.getElementById('analyzer-results');
  if (!container) return;

  if (analyzerState.strategies.length === 0) {
    container.innerHTML = '<div class="ps-na-text" style="text-align:center; padding:40px;">Sube un DatabankExport.csv para comenzar el análisis...</div>';
    return;
  }

  const html = `
    <div class="analyzer-table-wrap">
      <table class="analyzer-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Strategy Name</th>
            <th>PF</th>
            <th>Win%</th>
            <th>Max DD%</th>
            <th>Ret/DD</th>
            <th>SQN</th>
            <th>R Exp</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${analyzerState.strategies.map(s => renderRow(s)).join('')}
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;
  
  // Sincronizar scroll inverso
  const wrap = container.querySelector('.analyzer-table-wrap');
  const topProxy = document.getElementById('analyzer-top-scroll');
  if (wrap && topProxy) {
    wrap.addEventListener('scroll', () => {
      topProxy.scrollLeft = wrap.scrollLeft;
    });
  }

  // Actualizar ancho del proxy de scroll
  setTimeout(() => {
    const table = container.querySelector('.analyzer-table');
    const proxyInner = topProxy ? topProxy.querySelector('div') : null;
    if (table && proxyInner) {
      proxyInner.style.width = table.offsetWidth + 'px';
      topProxy.style.display = table.offsetWidth > wrap.offsetWidth ? 'block' : 'none';
    }
  }, 100);
}

function renderRow(s) {
  const isPassed = s.passed;
  return `
    <tr>
      <td><span class="metric-badge ${isPassed ? 'badge-passed' : 'badge-failed'}">${isPassed ? 'PASSED' : 'REJECTED'}</span></td>
      <td style="font-weight:700">${s._rawName}</td>
      <td>${s['Profit Factor']}</td>
      <td>${s['Win %']}%</td>
      <td>${s['Max DD %']}%</td>
      <td>${s['Ret/DD Ratio']}</td>
      <td>${s['SQN']}</td>
      <td>${s['R Expectancy']}</td>
      <td>
        <button class="export-btn" onclick="openC2Modal('${s._id}')" ${!isPassed ? 'style="opacity:0.5; cursor:not-allowed;"' : ''}>⚡ C2</button>
      </td>
    </tr>
  `;
}

/**
 * Exportación Institucional (C2)
 */
window.openC2Modal = function(id) {
  const s = analyzerState.strategies.find(x => x._id === id);
  if (!s) return;

  analyzerState.currentStrategyId = id;
  const modal = document.getElementById('analyzer-modal');
  if (modal) {
    modal.style.display = 'flex';
    // Resetear campos
    document.getElementById('c2-activo').value = '';
    document.getElementById('c2-direccion').value = 'LONG';
    document.getElementById('c2-tf').value = '';
    document.getElementById('c2-indicador').value = '';
    document.getElementById('c2-bloque-select').value = 'TENDENCIA';
    document.getElementById('c2-bloque-manual').style.display = 'none';
    document.getElementById('c2-bloque-manual').value = '';
  }
};

window.closeC2Modal = function() {
  const modal = document.getElementById('analyzer-modal');
  if (modal) modal.style.display = 'none';
};

window.toggleBloqueOtro = function(val) {
  const manualInput = document.getElementById('c2-bloque-manual');
  if (manualInput) {
    manualInput.style.display = val === 'OTROS' ? 'block' : 'none';
  }
};

window.confirmC2Export = function() {
  const id = analyzerState.currentStrategyId;
  const s = analyzerState.strategies.find(x => x._id === id);
  if (!s) return;

  const activo = document.getElementById('c2-activo').value.trim().toUpperCase() || 'ASSET';
  const direccion = document.getElementById('c2-direccion').value;
  const tf = document.getElementById('c2-tf').value.trim().toUpperCase() || 'TF';
  const indicador = document.getElementById('c2-indicador').value.trim().toUpperCase() || 'IND';
  
  const bloqueSelect = document.getElementById('c2-bloque-select').value;
  const bloqueManual = document.getElementById('c2-bloque-manual').value.trim().toUpperCase();
  const bloque = bloqueSelect === 'OTROS' ? (bloqueManual || 'OTROS') : bloqueSelect;

  // Nomenclatura Institucional: template_ACTIVO_DIRECCION_TIMEFRAME_INDICADOR_BLOQUE_NUMERO.cfx
  const fileName = `template_${activo}_${direccion}_${tf}_${indicador}_${bloque}_${id}.cfx`;
  
  // Simulación de descarga (en un entorno real aquí generaríamos el ZIP o el archivo .cfx parcheado)
  console.log(`[C2 Export] Generando: ${fileName}`);
  alert(`Estrategia Certificada:\n${fileName}\n\nExportación preparada para Edge Pipeline.`);
  
  closeC2Modal();
};

window.resetAnalyzer = function() {
  if (analyzerState.strategies.length > 0 && !confirm('¿Resetear análisis actual?')) return;
  
  analyzerState.strategies = [];
  analyzerState.currentStrategyId = null;
  
  const fileInput = document.getElementById('analyzer-file-input');
  if (fileInput) fileInput.value = '';
  
  renderAnalyzer();
};

// Exportar funciones globales para el dashboard
window.initAnalyzer = initAnalyzer;
window.handleFileSelect = handleFileSelect;
