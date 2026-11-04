// Infraestructura de interfaz: avisos, pestañas, hojas superpuestas y registro de eventos.
// Los módulos de cada sección (comida, entreno, progreso, ajustes) registran aquí sus vistas,
// hojas y acciones; este módulo no importa ninguno de ellos.
import { $, esc, today } from './util.js';
import { S } from './state.js';

export const VIEWS = {};   // pestaña -> { html(), after?() }
export const SHEETS = {};  // tipo de hoja -> { title(s), render(s), mount?(s, root), keep? }
export const ACTIONS = {}; // data-act -> (el, top, act)
export const INPUTS = {};  // data-input -> (el, top)
export const CHANGES = {}; // data-change o '#id' -> (el, top)
export const FORMS = {};   // data-form -> (form, top)
export const HOOKS = { sheetChange: [], resize: [], visible: [] };

// Solo lectura (cuenta pendiente o bloqueada): solo se permiten las acciones de mirar, exportar y de la cuenta
export const ACCESS = {
  readOnly: false,
  acts: new Set(['goto', 'sheet-close', 'sheet-back', 'sheet-back-or-close', 'more', 'confirm-ok',
    'day-prev', 'day-next', 'day-today', 'calendar', 'cal-month', 'cal-day', 'cal-today', 'edit-entry', 'lib',
    'open-workout', 'open-routines', 'open-library', 'routine-open', 'ex-history', 'ex-filter', 'vol-history', 'volh-m',
    'week-prev', 'week-next', 'wtab', 'wview', 'wk-ex-toggle', 'act-open', 'range', 'report-open', 'report-week', 'report-copy',
    'ph-list', 'ph-open', 'ph-compare', 'ph-pose', 'theme', 'text-size', 'aj-jump', 'exp-ex', 'exp-metric', 'exp-range', 'exp-pct',
    'export-json', 'export-csv-diario', 'export-csv-resumen', 'export-csv-entrenos', 'export-csv-actividades', 'export-photos']),
  inputs: new Set(['libq', 'pickq', 'ex-q', 'admin-q']),
  forms: new Set(['sync-login', 'acct-code', 'acct-delete']),
};
const allowed = (kind, name) => !ACCESS.readOnly || String(name).startsWith('sync-') || String(name).startsWith('acct-') || ACCESS[kind].has(name);
const readOnlyToast = () => toast('Solo lectura: tu cuenta no está activa.');

/* ---------- avisos (con «Deshacer» opcional) ---------- */

let toastTimer;
let toastUndo = null;
export function toast(text, opts = {}) {
  const el = $('#toast');
  if (!el) return;
  toastUndo = opts.undo || null;
  el.innerHTML = `<span>${esc(text)}</span>${toastUndo ? '<button type="button" class="toast-undo" data-act="toast-undo">Deshacer</button>' : ''}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; toastUndo = null; }, toastUndo ? 6000 : 2800);
}

// Borra al momento y ofrece deshacer durante unos segundos
export function undoable(text, apply, revert) {
  apply();
  toast(text, { undo: revert });
}

/* ---------- navegación ---------- */

export function setTab(tab) {
  S.ui.tab = tab;
  render();
  window.scrollTo(0, 0);
}

export function render() {
  document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === S.ui.tab ? 'page' : 'false'));
  const v = VIEWS[S.ui.tab] || VIEWS.hoy;
  $('#view').innerHTML = v.html();
  v.after?.();
}

export function chartTooltip(host) {
  let tip = host.querySelector('.tip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; host.appendChild(tip); }
  return tip;
}

// Lista larga: muestra los primeros elementos y un botón «Ver más»
export function pageList(key, items, step, renderItem) {
  const shown = S.ui.more?.[key] || step;
  const html = items.slice(0, shown).map(renderItem).join('');
  const rest = items.length - shown;
  return {
    html,
    more: rest > 0 ? `<button type="button" class="btn ghost small more-btn" data-act="more" data-key="${key}" data-step="${step}">Ver ${Math.min(rest, step)} más (quedan ${rest})</button>` : '',
  };
}

/* ---------- tema ---------- */

export function applyTheme() {
  const t = S.settings.theme || 'auto';
  const root = document.documentElement;
  if (t === 'auto') delete root.dataset.theme; else root.dataset.theme = t;
  root.dataset.text = S.settings.textSize || 'system';
  if (S.settings.bigButtons) root.dataset.big = ''; else delete root.dataset.big;
  const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.setAttribute('content', dark ? '#0E1311' : '#F2F5F3'); m.removeAttribute('media'); });
}

/* ---------- hojas (pantallas superpuestas) ---------- */

export function pushSheet(s) { S.sheets.push(s); renderSheets(); }
export function popSheet() { S.sheets.pop(); renderSheets(); }
export function replaceTop(s) { S.sheets[S.sheets.length - 1] = s; renderSheets(); }
export function closeSheets() { S.sheets = []; renderSheets(); }
export function popTo(sheet) { while (S.sheets.length && S.sheets[S.sheets.length - 1] !== sheet) S.sheets.pop(); renderSheets(); }

let renderedSheet = null;
export function renderSheets() {
  const root = $('#sheet-root');
  const top = S.sheets[S.sheets.length - 1];
  HOOKS.sheetChange.forEach((fn) => fn(top));
  if (!top) {
    root.hidden = true;
    root.innerHTML = '';
    const wasOpen = renderedSheet !== null;
    renderedSheet = null;
    document.body.classList.remove('sheet-open');
    if (wasOpen) render();
    return;
  }
  const def = SHEETS[top.type];
  if (renderedSheet === top && def.keep) return; // hojas que no se repintan (la cámara)
  // Si se va a repintar con el teclado abierto, primero se cierra: en iOS, quitar el campo con el foco
  // dejaba la pantalla en negro o el teclado sobre una hoja vacía
  const focused = document.activeElement;
  if (focused && focused !== document.body && root.contains(focused)) focused.blur();
  const prevBody = root.querySelector('.sheet-body');
  if (renderedSheet && prevBody) renderedSheet._scroll = prevBody.scrollTop;
  const same = renderedSheet === top;
  const wasOpen = !root.hidden;
  renderedSheet = top;
  const back = S.sheets.length > 1;
  root.innerHTML = `
    <div class="backdrop${wasOpen ? ' still' : ''}" data-act="sheet-close"></div>
    <div class="sheet${wasOpen ? ' still' : ''}" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div class="sheet-head">
        <button type="button" class="icon-btn" data-act="${back ? 'sheet-back' : 'sheet-close'}" aria-label="${back ? 'Atrás' : 'Cerrar'}">${back ? '‹' : '×'}</button>
        <h2 id="sheet-title">${esc(def.title(top))}</h2>
        <span class="sheet-head-pad"></span>
      </div>
      <div class="sheet-body">${def.render(top)}</div>
    </div>`;
  root.hidden = false;
  document.body.classList.add('sheet-open');
  const body = root.querySelector('.sheet-body');
  if (body && (same || top._scroll)) body.scrollTop = top._scroll || 0;
  def.mount?.(top, root);
}

/* Confirmación dentro de la app (solo para lo que no se puede deshacer) */
SHEETS.confirm = {
  title: (s) => s.title,
  render: (s) => `
    <p>${esc(s.text)}</p>
    <div class="sheet-actions">
      <button type="button" class="btn ghost" data-act="sheet-back-or-close">Cancelar</button>
      <button type="button" class="btn ${s.danger ? 'danger' : 'primary'}" data-act="confirm-ok">${esc(s.ok)}</button>
    </div>`,
};

Object.assign(ACTIONS, {
  'goto': (el) => setTab(el.dataset.tab),
  'sheet-close': () => closeSheets(),
  'sheet-back': () => popSheet(),
  'sheet-back-or-close': () => { if (S.sheets.length > 1) popSheet(); else closeSheets(); },
  'confirm-ok': async (el, top) => { const fn = top.onOk; popSheet(); await fn(); },
  'toast-undo': () => {
    const fn = toastUndo;
    toastUndo = null;
    $('#toast').hidden = true;
    if (fn) { fn(); toast('Deshecho'); }
  },
  'more': (el) => {
    const key = el.dataset.key;
    const step = Number(el.dataset.step);
    S.ui.more = { ...(S.ui.more || {}), [key]: (S.ui.more?.[key] || step) + step };
    if (S.sheets.length) renderSheets(); else render();
  },
});

/* ---------- eventos ---------- */

const topSheet = () => S.sheets[S.sheets.length - 1];

export function initEvents() {
  document.addEventListener('click', async (ev) => {
    const tabBtn = ev.target.closest('.tab');
    if (tabBtn) { setTab(tabBtn.dataset.tab); return; }
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const fn = ACTIONS[el.dataset.act];
    if (fn && !allowed('acts', el.dataset.act)) { readOnlyToast(); return; }
    if (fn) await fn(el, topSheet(), el.dataset.act, ev);
  });
  document.addEventListener('input', (ev) => {
    const fn = INPUTS[ev.target.dataset.input];
    if (fn && !allowed('inputs', ev.target.dataset.input)) return;
    if (fn) fn(ev.target, topSheet());
  });
  document.addEventListener('change', (ev) => {
    const el = ev.target;
    const fn = CHANGES[el.dataset.change] || CHANGES['#' + el.id];
    if (fn && ACCESS.readOnly && !String(el.dataset.change || '').startsWith('acct-')) { readOnlyToast(); return; }
    if (fn) fn(el, topSheet());
  });
  document.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const fn = FORMS[ev.target.dataset.form];
    if (fn && !allowed('forms', ev.target.dataset.form)) { readOnlyToast(); return; }
    if (fn) fn(ev.target, topSheet());
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target.matches('[data-change]')) ev.target.blur();
    if (ev.key === 'Escape' && S.sheets.length) popSheet();
  });
  let resizeT;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => HOOKS.resize.forEach((fn) => fn()), 150);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') HOOKS.visible.forEach((fn) => fn());
  });
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  if (mq.addEventListener) mq.addEventListener('change', applyTheme);
}

// iOS: al cerrar el teclado dentro de una hoja, a veces parte de la hoja se queda sin pintar (en negro).
// Se fuerza un repintado de la hoja en cuanto no queda ningún campo con el foco.
if (typeof document !== 'undefined') document.addEventListener('focusout', (ev) => {
  if (!ev.target?.closest?.('#sheet-root')) return;
  setTimeout(() => {
    if (document.activeElement?.matches?.('input, textarea, select')) return;
    const sheet = document.querySelector('#sheet-root .sheet');
    if (!sheet) return;
    sheet.style.transform = 'translateZ(0)';
    requestAnimationFrame(() => { sheet.style.transform = ''; });
  }, 60);
});
