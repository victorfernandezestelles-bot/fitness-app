// Infraestructura de interfaz: avisos, pestañas, hojas superpuestas y registro de eventos.
// Los módulos de cada sección (comida, entreno, progreso, ajustes) registran aquí sus vistas,
// hojas y acciones; este módulo no importa ninguno de ellos.
import { $, esc } from './util.js';
import { S } from './state.js';

export const VIEWS = {};   // pestaña -> { html(), after?() }
export const SHEETS = {};  // tipo de hoja -> { title(s), render(s), mount?(s, root), keep? }
export const ACTIONS = {}; // data-act -> (el, top, act)
export const INPUTS = {};  // data-input -> (el, top)
export const CHANGES = {}; // data-change o '#id' -> (el, top)
export const FORMS = {};   // data-form -> (form, top)
export const HOOKS = { sheetChange: [], resize: [], visible: [] };

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
    if (fn) await fn(el, topSheet(), el.dataset.act, ev);
  });
  document.addEventListener('input', (ev) => {
    const fn = INPUTS[ev.target.dataset.input];
    if (fn) fn(ev.target, topSheet());
  });
  document.addEventListener('change', (ev) => {
    const el = ev.target;
    const fn = CHANGES[el.dataset.change] || CHANGES['#' + el.id];
    if (fn) fn(el, topSheet());
  });
  document.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const fn = FORMS[ev.target.dataset.form];
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
