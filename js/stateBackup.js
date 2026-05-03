// =============================================================================
// STATE BACKUP — auto-backup del localStorage al backend (analysis_output/)
//
// Hookea localStorage.setItem para detectar cambios en las 4 keys críticas:
//   - sqx_priority_progress_v1   (tracking SQX Priority)
//   - sqx_pipeline_state_v1      (overrides + funnels + nextAction)
//   - sqx_strategies_user_v1     (estrategias importadas via CSV)
//   - sqx_plan_user_v1           (minings/fases añadidos por UI)
//
// Cada cambio dispara un POST debounced (10s) a /api/state/backup.
// Si el backend no está disponible, el backup se omite silenciosamente
// (el localStorage sigue funcionando — esto solo añade durabilidad cross-PC).
//
// Modal de restauración: botón en Pipeline State header → muestra lista de backups
// → user elige uno → confirma → restaura todas las keys + recarga renders.
// =============================================================================

const STATE_BACKUP_API = 'http://127.0.0.1:5050/api/state';
const STATE_KEYS = [
  'sqx_priority_progress_v1',
  'sqx_pipeline_state_v1',
  'sqx_strategies_user_v1',
  'sqx_plan_user_v1',
];
const BACKUP_DEBOUNCE_MS = 10000;  // 10s tras el último cambio

let _backupTimer = null;
let _backupLastTs = 0;
let _backupInflight = false;

function _collectState() {
  const out = {};
  for (const k of STATE_KEYS) {
    const v = localStorage.getItem(k);
    if (v != null) {
      try { out[k] = JSON.parse(v); }
      catch(e) { out[k] = v; }  // fallback: string crudo
    }
  }
  return out;
}

async function _doBackup() {
  if (_backupInflight) return;
  _backupInflight = true;
  try {
    const body = _collectState();
    if (!Object.keys(body).length) { _backupInflight = false; return; }
    const r = await fetch(STATE_BACKUP_API + '/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      const data = await r.json();
      _backupLastTs = Date.now();
      _updateBackupIndicator('ok', data.filename, data.rotated);
    } else {
      _updateBackupIndicator('err', 'HTTP ' + r.status);
    }
  } catch(e) {
    // Backend no disponible — silenciar (esperado en modo file://)
    _updateBackupIndicator('off', '');
  } finally {
    _backupInflight = false;
  }
}

function _scheduleBackup() {
  if (_backupTimer) clearTimeout(_backupTimer);
  _backupTimer = setTimeout(_doBackup, BACKUP_DEBOUNCE_MS);
  _updateBackupIndicator('pending', '');
}

// ── Hook localStorage.setItem para auto-detectar cambios ─────────────
(function _installLocalStorageHook(){
  const origSet = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function(key, value) {
    origSet(key, value);
    if (STATE_KEYS.includes(key)) _scheduleBackup();
  };
})();

// ── Indicador visual en la UI (badge en header de Pipeline State) ────
function _updateBackupIndicator(state, info, rotated) {
  const el = document.getElementById('state-backup-indicator');
  if (!el) return;
  const cls = { ok:'badge-ok', err:'badge-err', off:'badge-off', pending:'badge-pending' }[state] || '';
  const txt = state === 'ok'      ? '☁ Backup ' + (info || '').replace('state_backup_','').replace('.json','')
            : state === 'pending' ? '☁ Backup en 10s…'
            : state === 'err'     ? '☁ Backup err: ' + info
            : state === 'off'     ? '☁ Backup off (backend desconectado)'
            : '';
  el.className = 'state-backup-badge ' + cls;
  el.textContent = txt;
  el.title = state === 'ok'
    ? 'Último backup: ' + new Date(_backupLastTs).toLocaleString() + (rotated ? ' (rotó ' + rotated + ' viejos)' : '')
    : state === 'off'
    ? 'Arranca run-web.bat para activar backups automáticos. Mientras tanto, exporta manual con el botón ⬇'
    : '';
}

// ── Restaurar desde backup ───────────────────────────────────────────
async function listStateBackups() {
  try {
    const r = await fetch(STATE_BACKUP_API + '/backups');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    return data.backups || [];
  } catch(e) {
    alert('Backend desconectado. Arranca run-web.bat para listar backups.');
    return [];
  }
}

async function restoreStateBackup(filename) {
  try {
    const r = await fetch(STATE_BACKUP_API + '/restore/' + encodeURIComponent(filename));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    const payload = data.payload && data.payload.data;
    if (!payload || typeof payload !== 'object') throw new Error('Backup vacío o corrupto');
    // Aplicar a localStorage (escribimos con el origSet para no re-disparar backup)
    let restored = 0;
    for (const k of STATE_KEYS) {
      if (payload[k] != null) {
        localStorage.setItem(k, JSON.stringify(payload[k]));
        restored++;
      }
    }
    return { ok: true, restored, filename };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

window.openStateRestoreModal = async function() {
  const backups = await listStateBackups();
  if (!backups.length) {
    alert('No hay backups disponibles.\n\nLos backups se generan automáticamente 10s después de cada cambio en el dashboard (mientras run-web.bat esté corriendo).');
    return;
  }
  const opts = backups.map((b, i) => {
    const ts = new Date(b.mtime * 1000).toLocaleString();
    return (i+1).toString().padStart(2,' ') + '. ' + ts + ' — ' + b.size_kb + ' KB';
  }).join('\n');
  const choice = prompt(
    'Backups disponibles (' + backups.length + ', el más reciente arriba):\n\n' +
    opts + '\n\nElige número (1-' + backups.length + ') o cancela:',
    '1'
  );
  if (!choice) return;
  const idx = parseInt(choice, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= backups.length) { alert('Número inválido.'); return; }
  const target = backups[idx];
  if (!confirm('¿Restaurar backup del ' + new Date(target.mtime * 1000).toLocaleString() + '?\n\nSe sobrescribirá el state actual del dashboard (Pipeline State, SQX Priority, Strategies importadas, Plan USER).\n\nRecomendación: pulsa OK aquí, te creará un backup fresco antes de restaurar.')) return;
  // Crear un backup del state actual ANTES de restaurar (safety net)
  await _doBackup();
  // Restaurar
  const result = await restoreStateBackup(target.name);
  if (!result.ok) { alert('Error al restaurar: ' + result.error); return; }
  alert('✓ Restauradas ' + result.restored + ' keys de ' + target.name + '\n\nLa página se va a recargar para aplicar los cambios.');
  location.reload();
};

window.forceStateBackupNow = async function() {
  if (_backupTimer) { clearTimeout(_backupTimer); _backupTimer = null; }
  _updateBackupIndicator('pending', '');
  await _doBackup();
};

// ── Bindings UI (esperan al DOM) ─────────────────────────────────────
function _bindStateBackupUI() {
  const btnNow = document.getElementById('state-backup-now');
  const btnRestore = document.getElementById('state-backup-restore');
  if (btnNow) btnNow.addEventListener('click', window.forceStateBackupNow);
  if (btnRestore) btnRestore.addEventListener('click', window.openStateRestoreModal);
  // Health check inicial: ¿está el backend arriba?
  fetch(STATE_BACKUP_API + '/backups').then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    _updateBackupIndicator('ok', 'listo');
  }).catch(() => _updateBackupIndicator('off', ''));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _bindStateBackupUI);
} else {
  _bindStateBackupUI();
}
