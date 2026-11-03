// Arranque de la app: carga los datos, registra las secciones y comprueba si hay versión nueva.
import * as store from './store.js';
import { $, APP_VERSION } from './util.js';
import { flushAll, loadState } from './state.js';
import { HOOKS, applyTheme, initEvents, render } from './ui.js';
import { restoreRest } from './training.js';
import { maybeOnboard } from './onboarding.js';
import { initSync } from './sync.js';
// Cada sección registra sus vistas, hojas y acciones al cargarse
import './food.js';
import './progress.js';
import './settings.js';

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });
window.addEventListener('pagehide', flushAll);

/* ---------- aviso de versión nueva ---------- */

async function checkUpdate() {
  if (location.protocol !== 'https:') return;
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const { version } = await r.json();
    if (version && version !== APP_VERSION) showUpdate(version);
  } catch (e) { /* sin conexión */ }
}

function showUpdate(version) {
  const el = $('#update');
  if (!el || !el.hidden) return;
  el.innerHTML = `<span>Hay una versión nueva (${version})</span><button type="button" class="btn small" id="update-btn">Actualizar</button>`;
  el.hidden = false;
  $('#update-btn').addEventListener('click', async () => {
    flushAll();
    el.innerHTML = '<span>Actualizando…</span>';
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) { /* se recarga igualmente */ }
    setTimeout(() => location.reload(), 300);
  });
}

/* ---------- arranque ---------- */

async function boot() {
  initEvents();
  try {
    await loadState();
  } catch (e) {
    $('#view').innerHTML = '<div class="notice"><p>No se pueden leer los datos guardados en este navegador. Si estás en navegación privada, ábrela en una pestaña normal.</p></div>';
    return;
  }
  applyTheme();
  render();
  restoreRest();
  maybeOnboard();
  initSync();
  store.askPersist();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  checkUpdate();
  HOOKS.visible.push(checkUpdate);
}
boot();
