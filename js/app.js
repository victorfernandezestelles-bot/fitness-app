import { MACROS, MICROS, KEYS, kcalFrom, scale, mult, sumNut, BASICS, BASICS_BY_ID } from './nutrients.js';
import * as store from './store.js';
import { offProduct, offSearch } from './off.js';
import { decodeGray, imageDataToGray, checksumOk } from './barcode.js';
import { MUSCLES, MUSCLE_NAME, EXERCISES, EXERCISES_BY_ID, e1rm } from './exercises.js';

const APP_VERSION = '0.2.0';

const MEALS = [
  ['desayuno', 'Desayuno'],
  ['comida', 'Comida'],
  ['merienda', 'Merienda'],
  ['cena', 'Cena'],
  ['otros', 'Entre horas'],
];
const MEAL_NAME = Object.fromEntries(MEALS);

/* ---------- utilidades ---------- */

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const fmt = (n, d = 0) => (n == null || Number.isNaN(n) ? '–' : Number(n).toLocaleString('es-ES', { maximumFractionDigits: d }));
const inputVal = (n, d = 2) => (n == null ? '' : String(Math.round(n * 10 ** d) / 10 ** d).replace('.', ','));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => iso(new Date());
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const dateLong = (s) => new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(parseISO(s));
const dateShort = (s) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(parseISO(s));
function dayLabel(s) {
  const t = today();
  if (s === t) return 'Hoy';
  if (s === addDays(t, -1)) return 'Ayer';
  if (s === addDays(t, 1)) return 'Mañana';
  const l = dateLong(s);
  return l.charAt(0).toUpperCase() + l.slice(1);
}

/* ---------- estado ---------- */

const S = {
  settings: { goals: { kcal: null, p: null, c: null, f: null, steps: null }, lastBackup: null },
  foods: {},
  recipes: {},
  days: {},
  weights: {},
  exercises: {},
  routines: {},
  workouts: {},
  ui: { tab: 'hoy', date: today(), lib: 'recetas', libQ: '', range: 90, week: null },
  sheets: [],
};

/* ---------- guardado ---------- */

const pending = new Map();
function persist(key, getter) {
  if (pending.has(key)) clearTimeout(pending.get(key).t);
  const t = setTimeout(() => flushKey(key), 250);
  pending.set(key, { t, getter });
}
function flushKey(key) {
  const p = pending.get(key);
  if (!p) return;
  pending.delete(key);
  const value = p.getter();
  const op = value == null ? store.del(key) : store.put(key, value);
  op.catch(() => toast('No se ha podido guardar. Comprueba el espacio del teléfono.'));
}
function flushAll() { for (const key of [...pending.keys()]) { clearTimeout(pending.get(key).t); flushKey(key); } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });
window.addEventListener('pagehide', flushAll);

const saveSettings = () => persist('settings', () => S.settings);
const saveFoods = () => persist('foods', () => S.foods);
const saveRecipes = () => persist('recipes', () => S.recipes);
const saveWeights = () => persist('weights', () => S.weights);
const saveExercises = () => persist('exercises', () => S.exercises);
const saveRoutines = () => persist('routines', () => S.routines);
const saveWorkout = (id) => persist('wk:' + id, () => S.workouts[id] || null);
function saveDay(date) {
  persist('day:' + date, () => {
    const d = S.days[date];
    if (!d || (!d.entries.length && d.steps == null)) { delete S.days[date]; return null; }
    return d;
  });
}

async function loadState() {
  const all = await store.loadAll();
  if (all.settings) S.settings = { ...S.settings, ...all.settings, goals: { ...S.settings.goals, ...(all.settings.goals || {}) } };
  S.foods = all.foods || {};
  S.recipes = all.recipes || {};
  S.weights = all.weights || {};
  S.exercises = all.exercises || {};
  S.routines = all.routines || {};
  S.days = {};
  S.workouts = {};
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith('day:')) S.days[k.slice(4)] = v;
    else if (k.startsWith('wk:')) S.workouts[k.slice(3)] = v;
  }
}

/* ---------- datos derivados ---------- */

const getFood = (id) => S.foods[id] || BASICS_BY_ID[id] || null;
function allFoods() {
  const own = Object.values(S.foods);
  const ownIds = new Set(own.map((f) => f.id));
  return [...own, ...BASICS.filter((b) => !ownIds.has(b.id))];
}
const dayOf = (date) => S.days[date] || { entries: [], steps: null };
function ensureDay(date) {
  if (!S.days[date]) S.days[date] = { entries: [], steps: null };
  return S.days[date];
}

function recipeTotals(r) {
  const parts = [];
  let missing = 0;
  let weight = 0;
  for (const it of r.items) {
    const f = getFood(it.foodId);
    if (!f) { missing++; continue; }
    parts.push(scale(f.per100, it.g || 0));
    weight += it.g || 0;
  }
  const { tot } = sumNut(parts);
  return { total: tot, missing, rawWeight: weight };
}

// Nutrientes de un elemento (alimento o receta) para una cantidad y unidad
function nutFor(item, qty, unit) {
  if (item.type === 'food') {
    const f = getFood(item.id);
    return f ? scale(f.per100, qty) : null;
  }
  const r = S.recipes[item.id];
  if (!r) return null;
  const { total } = recipeTotals(r);
  if (unit === 'g') return r.cookedG ? mult(total, qty / r.cookedG) : null;
  return mult(total, qty / (r.servings || 1));
}

function itemName(item) {
  if (item.type === 'food') return getFood(item.id)?.name || 'Alimento borrado';
  return S.recipes[item.id]?.name || 'Receta borrada';
}

const qtyLabel = (qty, unit) => (unit === 'rac' ? `${fmt(qty, 2)} ${qty === 1 ? 'ración' : 'raciones'}` : `${fmt(qty, 0)} g`);

function recentItems(limit = 12) {
  const out = [];
  const seen = new Set();
  const dates = Object.keys(S.days).sort().reverse().slice(0, 45);
  for (const d of dates) {
    const entries = [...S.days[d].entries].reverse();
    for (const e of entries) {
      const key = e.type + ':' + e.ref;
      if (seen.has(key)) continue;
      if (e.type === 'food' ? !getFood(e.ref) : !S.recipes[e.ref]) continue;
      seen.add(key);
      out.push({ type: e.type, id: e.ref, qty: e.qty, unit: e.unit });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/* ---------- avisos ---------- */

let toastTimer;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
}

/* ---------- navegación ---------- */

function setTab(tab) {
  S.ui.tab = tab;
  render();
  window.scrollTo(0, 0);
}

function render() {
  document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === S.ui.tab ? 'page' : 'false'));
  const view = $('#view');
  if (S.ui.tab === 'hoy') view.innerHTML = viewHoy();
  else if (S.ui.tab === 'alimentos') { view.innerHTML = viewAlimentos(); fillLibList(); }
  else if (S.ui.tab === 'entreno') view.innerHTML = viewEntreno();
  else if (S.ui.tab === 'progreso') { view.innerHTML = viewProgreso(); drawCharts(); }
  else view.innerHTML = viewAjustes();
}

/* ---------- vista: Hoy ---------- */

function bar(value, goal, cls) {
  if (!goal) return '';
  const pct = Math.min(100, (value / goal) * 100);
  return `<div class="meter ${cls}" role="presentation"><span style="width:${pct.toFixed(1)}%"></span></div>`;
}

function viewHoy() {
  const date = S.ui.date;
  const day = dayOf(date);
  const { tot, have, count } = sumNut(day.entries.map((e) => e.n));
  const g = S.settings.goals;
  const kcal = tot.kcal || 0;
  const hasGoals = g.kcal != null;
  const weight = S.weights[date];
  const backupDue = needsBackup();

  const macroCell = (k, label, cls) => `
    <div class="macro ${cls}">
      <span class="macro-name"><i class="dot"></i>${label}</span>
      <span class="macro-val"><b>${fmt(tot[k], 0)}</b>${g[k] ? `<small> / ${fmt(g[k])} g</small>` : '<small> g</small>'}</span>
      ${bar(tot[k] || 0, g[k], cls)}
    </div>`;

  const meals = MEALS.map(([key, label]) => {
    const list = day.entries.filter((e) => e.meal === key);
    const mk = list.reduce((a, e) => a + (e.n.kcal || 0), 0);
    return `
    <section class="meal">
      <div class="meal-head">
        <h2>${label}</h2>
        ${list.length ? `<span class="meal-kcal">${fmt(mk)} kcal</span>` : ''}
        <button class="btn-add" type="button" data-act="add" data-meal="${key}" aria-label="Añadir a ${label}">+ Añadir</button>
      </div>
      ${list.length ? `<ul class="entries">${list.map((e) => `
        <li><button class="entry" type="button" data-act="edit-entry" data-id="${e.id}">
          <span class="e-name">${esc(e.name)}</span>
          <span class="e-kcal">${fmt(e.n.kcal)}</span>
          <span class="e-sub">${qtyLabel(e.qty, e.unit)} · P ${fmt(e.n.p, 0)} · H ${fmt(e.n.c, 0)} · G ${fmt(e.n.f, 0)}</span>
        </button></li>`).join('')}</ul>` : ''}
    </section>`;
  }).join('');

  const detailRows = [...MACROS.slice(1), ...MICROS].map((n) => {
    const partial = count && have[n.k] < count;
    const v = have[n.k] ? tot[n.k] : null;
    const pct = n.vrn && v != null ? `${fmt((v / n.vrn) * 100)} %` : '';
    return `<tr class="${n.sub ? 'sub' : ''}">
      <th scope="row">${n.l}</th>
      <td>${v == null ? '–' : fmt(v, n.d ?? 1)} ${v == null ? '' : n.u}${partial && v != null ? '<sup title="Faltan datos de algún alimento">*</sup>' : ''}</td>
      <td class="pct">${pct}</td>
    </tr>`;
  }).join('');
  const anyPartial = count && KEYS.some((k) => have[k] && have[k] < count);

  return `
  <header class="topbar">
    <button class="icon-btn" type="button" data-act="day-prev" aria-label="Día anterior">‹</button>
    <button class="topbar-title" type="button" data-act="day-today">${dayLabel(date)}<small>${date === today() ? dateLong(date) : (date > today() ? '' : 'Volver a hoy')}</small></button>
    <button class="icon-btn" type="button" data-act="day-next" aria-label="Día siguiente">›</button>
  </header>

  ${backupDue ? `<div class="notice"><p>Hace más de una semana que no guardas una copia de tus datos.</p><button type="button" class="btn small" data-act="export-json">Guardar copia</button></div>` : ''}

  <section class="label" aria-label="Resumen del día">
    <div class="label-top">
      <span class="eyebrow">Valor energético</span>
      ${hasGoals ? `<span class="eyebrow right">${kcal <= g.kcal ? `Quedan ${fmt(g.kcal - kcal)} kcal` : `${fmt(kcal - g.kcal)} kcal por encima`}</span>` : ''}
    </div>
    <div class="kcal-row">
      <span class="kcal-big">${fmt(kcal)}</span>
      <span class="kcal-unit">${hasGoals ? `/ ${fmt(g.kcal)} kcal` : 'kcal'}</span>
    </div>
    ${bar(kcal, g.kcal, 'm-kcal')}
    <div class="macros">
      ${macroCell('p', 'Proteínas', 'm-p')}
      ${macroCell('c', 'Hidratos', 'm-c')}
      ${macroCell('f', 'Grasas', 'm-f')}
    </div>
    ${hasGoals ? '' : `<p class="hint">Pon tus objetivos diarios en <button type="button" class="link" data-act="goto" data-tab="ajustes">Ajustes</button> para ver cuánto te queda.</p>`}
  </section>

  <section class="quick">
    <label class="quick-field">
      <span>Pasos</span>
      <input id="steps-in" type="text" inputmode="numeric" enterkeyhint="done" placeholder="0" value="${day.steps == null ? '' : day.steps}" data-change="steps">
      ${g.steps ? `<small>de ${fmt(g.steps)}</small>` : ''}
    </label>
    <label class="quick-field">
      <span>Peso</span>
      <input id="weight-in" type="text" inputmode="decimal" enterkeyhint="done" placeholder="kg" value="${inputVal(weight, 2)}" data-change="weight">
      <small>kg</small>
    </label>
  </section>

  ${meals}

  <details class="detail">
    <summary>Información nutricional completa</summary>
    <div class="table-wrap">
      <table class="nut-table">
        <thead><tr><th scope="col">Nutriente</th><th scope="col">Total</th><th scope="col">% VRN</th></tr></thead>
        <tbody>${detailRows}</tbody>
      </table>
    </div>
    <p class="hint">% VRN: porcentaje del valor de referencia de nutrientes de la UE para un adulto.${anyPartial ? ' * Algún alimento de hoy no tiene ese dato, así que el total real es mayor.' : ''}</p>
  </details>`;
}

function needsBackup() {
  const hasData = Object.keys(S.days).length > 0 || Object.keys(S.weights).length > 0 || Object.keys(S.workouts).length > 0;
  if (!hasData) return false;
  const last = S.settings.lastBackup;
  if (!last) {
    const first = Object.keys(S.days).concat(Object.keys(S.weights)).sort()[0];
    return first && first <= addDays(today(), -7);
  }
  return last.slice(0, 10) <= addDays(today(), -8);
}

/* ---------- vista: Alimentos ---------- */

function viewAlimentos() {
  const tabs = [['recetas', 'Recetas'], ['propios', 'Mis alimentos'], ['basicos', 'Básicos']];
  const lib = S.ui.lib;
  return `
  <header class="page-head">
    <h1>Alimentos</h1>
    <p class="lede">Tus recetas, los productos que has escaneado y una lista de básicos con valores medios.</p>
  </header>
  <div class="segmented" role="tablist">
    ${tabs.map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === lib}" data-act="lib" data-lib="${k}">${l}</button>`).join('')}
  </div>
  <div class="lib-actions">
    <input id="lib-q" type="search" placeholder="Buscar" value="${esc(S.ui.libQ)}" autocomplete="off" data-input="libq">
    ${lib === 'recetas' ? '<button type="button" class="btn" data-act="new-recipe">Nueva receta</button>' : ''}
    ${lib === 'propios' ? '<button type="button" class="btn" data-act="new-food">Nuevo</button><button type="button" class="btn ghost" data-act="scan-lib">Escanear</button>' : ''}
  </div>
  <div id="lib-list"></div>`;
}

function fillLibList() {
  const el = $('#lib-list');
  if (!el) return;
  const q = norm(S.ui.libQ);
  const lib = S.ui.lib;
  if (lib === 'recetas') {
    const list = Object.values(S.recipes).filter((r) => norm(r.name).includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    if (!list.length) {
      el.innerHTML = q ? '<p class="empty">Ninguna receta coincide.</p>' : `
        <div class="empty-card">
          <h3>Guarda tus platos de siempre</h3>
          <p>Crea una receta como «Pasta con carne» con los ingredientes y gramos que usas normalmente. Después la añades al diario en un toque, por raciones o por gramos del plato.</p>
          <button type="button" class="btn" data-act="new-recipe">Crear la primera receta</button>
        </div>`;
      return;
    }
    el.innerHTML = `<ul class="list">${list.map((r) => {
      const { total } = recipeTotals(r);
      const per = mult(total, 1 / (r.servings || 1));
      return `<li><button type="button" class="row" data-act="open-recipe" data-id="${r.id}">
        <span class="row-main">${esc(r.name)}</span>
        <span class="row-sub">${r.items.length} ingredientes · ${r.servings || 1} ${r.servings === 1 ? 'ración' : 'raciones'}</span>
        <span class="row-side">${fmt(per.kcal)} <small>kcal/ración</small></span>
      </button></li>`;
    }).join('')}</ul>`;
    return;
  }
  const source = lib === 'propios' ? Object.values(S.foods) : BASICS;
  const list = source.filter((f) => norm(f.name + ' ' + (f.brand || '')).includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  if (!list.length) {
    el.innerHTML = q ? '<p class="empty">Nada coincide con la búsqueda.</p>' : `
      <div class="empty-card">
        <h3>Aún no tienes alimentos propios</h3>
        <p>Escanea el código de barras de un producto o créalo a mano con los datos de su etiqueta. Se guardará aquí para la próxima vez.</p>
        <div class="btn-row"><button type="button" class="btn" data-act="scan-lib">Escanear</button><button type="button" class="btn ghost" data-act="new-food">Crear a mano</button></div>
      </div>`;
    return;
  }
  el.innerHTML = `<ul class="list">${list.map((f) => foodRow(f, 'open-food')).join('')}</ul>
    ${lib === 'basicos' ? '<p class="hint">Valores medios orientativos por 100 g. Para un producto concreto, mejor escanear su etiqueta.</p>' : ''}`;
}

function foodRow(f, act, extra = '') {
  const p = f.per100 || {};
  return `<li><button type="button" class="row" data-act="${act}" data-type="food" data-id="${esc(f.id)}" ${extra}>
    <span class="row-main">${esc(f.name)}</span>
    <span class="row-sub">${f.brand ? esc(f.brand) + ' · ' : ''}P ${fmt(p.p, 1)} · H ${fmt(p.c, 1)} · G ${fmt(p.f, 1)}</span>
    <span class="row-side">${fmt(p.kcal)} <small>kcal/100 g</small></span>
  </button></li>`;
}

/* ---------- vista: Progreso ---------- */

function weightSeries(days) {
  const from = addDays(today(), -days + 1);
  const dates = Object.keys(S.weights).filter((d) => d >= addDays(from, -6)).sort();
  const pts = [];
  for (const d of dates) {
    if (d < from) continue;
    // Media de los registros de los 7 días que terminan en esta fecha
    const win = dates.filter((x) => x <= d && x > addDays(d, -7));
    const avg = win.reduce((a, x) => a + S.weights[x], 0) / win.length;
    pts.push({ d, w: S.weights[d], avg });
  }
  return pts;
}

function viewProgreso() {
  const all = Object.keys(S.weights).sort();
  const last = all.length ? all[all.length - 1] : null;
  const series = weightSeries(36500);
  const lastAvg = series.length ? series[series.length - 1].avg : null;
  const weekAgo = series.filter((p) => p.d <= addDays(last || today(), -7)).pop();
  const change = lastAvg != null && weekAgo ? lastAvg - weekAgo.avg : null;
  const t = today();

  const stepDays = [];
  for (let i = 13; i >= 0; i--) { const d = addDays(t, -i); stepDays.push(d); }
  const stepVals = stepDays.map((d) => dayOf(d).steps);
  const stepAvgList = stepVals.slice(-7).filter((v) => v != null);
  const stepAvg = stepAvgList.length ? stepAvgList.reduce((a, b) => a + b, 0) / stepAvgList.length : null;

  // Media de calorías de los últimos 7 días con registros
  const kcalDays = [];
  for (let i = 0; i < 7; i++) {
    const d = dayOf(addDays(t, -i));
    if (d.entries.length) kcalDays.push(d.entries.reduce((a, e) => a + (e.n.kcal || 0), 0));
  }
  const kcalAvg = kcalDays.length ? kcalDays.reduce((a, b) => a + b, 0) / kcalDays.length : null;

  const ranges = [[30, 'Mes'], [90, '3 meses'], [365, 'Año']];
  return `
  <header class="page-head">
    <h1>Progreso</h1>
  </header>

  <section class="card">
    <div class="card-head">
      <h2>Peso</h2>
      <div class="segmented small" role="tablist">
        ${ranges.map(([n, l]) => `<button type="button" role="tab" aria-selected="${S.ui.range === n}" data-act="range" data-range="${n}">${l}</button>`).join('')}
      </div>
    </div>
    <div class="stats">
      <div><span class="stat-l">Último</span><span class="stat-v">${last ? fmt(S.weights[last], 1) : '–'}<small> kg</small></span><span class="stat-s">${last ? dateShort(last) : 'sin datos'}</span></div>
      <div><span class="stat-l">Media 7 días</span><span class="stat-v">${fmt(lastAvg, 1)}<small> kg</small></span></div>
      <div><span class="stat-l">Cambio semanal</span><span class="stat-v">${change == null ? '–' : (change > 0 ? '+' : change < 0 ? '−' : '') + fmt(Math.abs(change), 2)}<small> kg</small></span><span class="stat-s">de la media</span></div>
    </div>
    <div class="legend">
      <span><i class="lg-dot"></i>Peso diario</span>
      <span><i class="lg-line"></i>Media 7 días</span>
    </div>
    <div class="chart" id="weight-chart"></div>
    <form class="inline-form" data-form="weight">
      <label>Fecha <input type="date" id="wf-date" value="${t}" max="${t}"></label>
      <label>Peso (kg) <input type="text" id="wf-kg" inputmode="decimal" placeholder="75,4"></label>
      <button class="btn" type="submit">Guardar</button>
    </form>
    ${all.length ? `<details class="detail compact"><summary>Todos los registros (${all.length})</summary>
      <ul class="list tight">${[...all].reverse().map((d) => `<li class="row static"><span class="row-main">${dateLong(d)}</span><span class="row-side">${fmt(S.weights[d], 2)} kg</span><button type="button" class="icon-btn small" data-act="del-weight" data-date="${d}" aria-label="Borrar el peso del ${dateLong(d)}">×</button></li>`).join('')}</ul>
    </details>` : ''}
  </section>

  <section class="card">
    <div class="card-head"><h2>Pasos</h2><span class="muted">últimos 14 días</span></div>
    <div class="stats">
      <div><span class="stat-l">Media 7 días</span><span class="stat-v">${fmt(stepAvg)}</span></div>
      <div><span class="stat-l">Objetivo</span><span class="stat-v">${fmt(S.settings.goals.steps)}</span></div>
    </div>
    <div class="chart" id="steps-chart"></div>
  </section>

  <section class="card">
    <div class="card-head"><h2>Calorías</h2></div>
    <div class="stats">
      <div><span class="stat-l">Media 7 días</span><span class="stat-v">${fmt(kcalAvg)}<small> kcal</small></span><span class="stat-s">${kcalDays.length} ${kcalDays.length === 1 ? 'día' : 'días'} con registro</span></div>
      <div><span class="stat-l">Objetivo</span><span class="stat-v">${fmt(S.settings.goals.kcal)}<small> kcal</small></span></div>
    </div>
  </section>`;
}

const SVGNS = 'http://www.w3.org/2000/svg';
function niceStep(range, target) {
  const raw = range / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * pow;
}

function drawCharts() {
  drawWeightChart();
  drawStepsChart();
}

function chartTooltip(host) {
  let tip = host.querySelector('.tip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; host.appendChild(tip); }
  return tip;
}

function drawWeightChart() {
  const host = $('#weight-chart');
  if (!host) return;
  const pts = weightSeries(S.ui.range);
  if (pts.length < 2) {
    host.innerHTML = `<p class="chart-empty">${pts.length ? 'Con dos registros o más verás aquí la evolución.' : 'Apunta tu peso cada mañana, en ayunas, y verás aquí la evolución y la media de 7 días.'}</p>`;
    return;
  }
  const W = Math.max(280, host.clientWidth);
  const H = 200;
  const m = { l: 38, r: 12, t: 12, b: 26 };
  const t0 = parseISO(addDays(today(), -S.ui.range + 1)).getTime();
  const t1 = parseISO(today()).getTime();
  const xs = (d) => m.l + ((parseISO(d).getTime() - t0) / (t1 - t0 || 1)) * (W - m.l - m.r);
  let lo = Math.min(...pts.map((p) => Math.min(p.w, p.avg)));
  let hi = Math.max(...pts.map((p) => Math.max(p.w, p.avg)));
  if (hi - lo < 2) { const c = (hi + lo) / 2; lo = c - 1; hi = c + 1; }
  const step = niceStep(hi - lo, 4);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ys = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);

  let g = '';
  for (let v = lo; v <= hi + 1e-9; v += step) {
    const y = ys(v).toFixed(1);
    g += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}"/><text class="axis" x="${m.l - 6}" y="${y}" dy="0.32em" text-anchor="end">${fmt(v, 1)}</text>`;
  }
  // Etiquetas de fecha: inicio, mitad y hoy
  const labelsX = [addDays(today(), -S.ui.range + 1), addDays(today(), -Math.round(S.ui.range / 2)), today()];
  labelsX.forEach((d, i) => {
    g += `<text class="axis" x="${xs(d).toFixed(1)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}">${dateShort(d)}</text>`;
  });
  const dots = pts.map((p) => `<circle class="w-dot" cx="${xs(p.d).toFixed(1)}" cy="${ys(p.w).toFixed(1)}" r="3"/>`).join('');
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${xs(p.d).toFixed(1)},${ys(p.avg).toFixed(1)}`).join('');
  const lastP = pts[pts.length - 1];
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Evolución del peso: último ${fmt(lastP.w, 1)} kg, media de 7 días ${fmt(lastP.avg, 1)} kg">
    ${g}${dots}<path class="w-avg" d="${path}"/>
    <circle class="w-end" cx="${xs(lastP.d).toFixed(1)}" cy="${ys(lastP.avg).toFixed(1)}" r="4.5"/>
    <line class="cross" y1="${m.t}" y2="${H - m.b}" x1="0" x2="0" visibility="hidden"/>
  </svg>`;
  const svg = host.querySelector('svg');
  const cross = svg.querySelector('.cross');
  const tip = chartTooltip(host);
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * W;
    let best = pts[0];
    for (const p of pts) if (Math.abs(xs(p.d) - x) < Math.abs(xs(best.d) - x)) best = p;
    const bx = xs(best.d);
    cross.setAttribute('x1', bx); cross.setAttribute('x2', bx); cross.setAttribute('visibility', 'visible');
    tip.innerHTML = `<b>${dateShort(best.d)}</b><span>Peso ${fmt(best.w, 2)} kg</span><span>Media ${fmt(best.avg, 2)} kg</span>`;
    tip.hidden = false;
    const left = (bx / W) * r.width;
    tip.style.left = `${Math.min(Math.max(left, 60), r.width - 60)}px`;
  };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
}

function drawStepsChart() {
  const host = $('#steps-chart');
  if (!host) return;
  const t = today();
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(addDays(t, -i));
  const vals = days.map((d) => dayOf(d).steps);
  if (!vals.some((v) => v != null)) {
    host.innerHTML = '<p class="chart-empty">Apunta tus pasos en la pantalla Hoy. Puedes copiarlos de la app Salud.</p>';
    return;
  }
  const goal = S.settings.goals.steps;
  const W = Math.max(280, host.clientWidth);
  const H = 170;
  const m = { l: 38, r: 8, t: 12, b: 24 };
  const max = Math.max(goal || 0, ...vals.map((v) => v || 0)) * 1.08;
  const step = niceStep(max, 3);
  const top = Math.ceil(max / step) * step;
  const ys = (v) => m.t + (1 - v / top) * (H - m.t - m.b);
  const bw = (W - m.l - m.r) / days.length;
  let g = '';
  for (let v = 0; v <= top + 1e-9; v += step) {
    const y = ys(v).toFixed(1);
    g += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}"/><text class="axis" x="${m.l - 6}" y="${y}" dy="0.32em" text-anchor="end">${v >= 1000 ? fmt(v / 1000, 1) + ' mil' : fmt(v)}</text>`;
  }
  const bars = days.map((d, i) => {
    const v = vals[i];
    const x = m.l + i * bw + 2;
    const w = Math.max(2, bw - 4);
    const lbl = i % 2 === 1 || days.length < 8 ? `<text class="axis" x="${(x + w / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${parseISO(d).getDate()}</text>` : '';
    if (v == null) return lbl;
    const y = ys(v);
    const h = H - m.b - y;
    const r = Math.min(4, w / 2, h);
    return `<path class="s-bar${goal && v >= goal ? ' hit' : ''}" data-i="${i}" d="M${x},${H - m.b}V${(y + r).toFixed(1)}Q${x},${y.toFixed(1)} ${x + r},${y.toFixed(1)}H${(x + w - r).toFixed(1)}Q${x + w},${y.toFixed(1)} ${x + w},${(y + r).toFixed(1)}V${H - m.b}Z"/>${lbl}`;
  }).join('');
  const goalLine = goal ? `<line class="goal" x1="${m.l}" x2="${W - m.r}" y1="${ys(goal).toFixed(1)}" y2="${ys(goal).toFixed(1)}"/><text class="axis goal-l" x="${m.l + 4}" y="${(ys(goal) - 5).toFixed(1)}" text-anchor="start">objetivo ${fmt(goal)}</text>` : '';
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Pasos de los últimos 14 días">${g}${bars}${goalLine}</svg>`;
  const svg = host.querySelector('svg');
  const tip = chartTooltip(host);
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(days.length - 1, Math.floor((x - m.l) / bw)));
    tip.innerHTML = `<b>${dateShort(days[i])}</b><span>${vals[i] == null ? 'Sin dato' : fmt(vals[i]) + ' pasos'}</span>`;
    tip.hidden = false;
    tip.style.left = `${Math.min(Math.max(((m.l + (i + 0.5) * bw) / W) * r.width, 60), r.width - 60)}px`;
  };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', () => { tip.hidden = true; });
}

/* ---------- vista: Ajustes ---------- */

function viewAjustes() {
  const g = S.settings.goals;
  const field = (id, label, value, unit) => `
    <label class="field"><span>${label}</span>
      <span class="input-unit"><input id="${id}" type="text" inputmode="decimal" value="${value == null ? '' : inputVal(value, 0)}" placeholder="–"><em>${unit}</em></span>
    </label>`;
  const nDays = Object.keys(S.days).length;
  const nFoods = Object.keys(S.foods).length;
  const nRec = Object.keys(S.recipes).length;
  const nWk = Object.keys(S.workouts).length;
  const last = S.settings.lastBackup;
  return `
  <header class="page-head"><h1>Ajustes</h1></header>

  <section class="card">
    <div class="card-head"><h2>Objetivos diarios</h2></div>
    <form data-form="goals" class="form-grid">
      ${field('g-kcal', 'Calorías', g.kcal, 'kcal')}
      ${field('g-p', 'Proteínas', g.p, 'g')}
      ${field('g-c', 'Hidratos', g.c, 'g')}
      ${field('g-f', 'Grasas', g.f, 'g')}
      ${field('g-steps', 'Pasos', g.steps, 'pasos')}
      <p class="hint full" id="goal-check"></p>
      <button class="btn full" type="submit">Guardar objetivos</button>
    </form>
  </section>

  <section class="card">
    <div class="card-head"><h2>Tus datos</h2></div>
    <p class="muted">Se guardan solo en este teléfono: ${nDays} días de diario, ${nWk} entrenamientos, ${nFoods} alimentos propios y ${nRec} recetas.
      ${last ? `Última copia: ${dateLong(last.slice(0, 10))}.` : 'Aún no has guardado ninguna copia.'}</p>
    <div class="stack">
      <button type="button" class="btn" data-act="export-json">Guardar copia completa (.json)</button>
      <button type="button" class="btn ghost" data-act="export-csv-diario">Exportar comidas para Excel (.csv)</button>
      <button type="button" class="btn ghost" data-act="export-csv-resumen">Exportar resumen diario, peso y pasos (.csv)</button>
      <button type="button" class="btn ghost" data-act="export-csv-entrenos">Exportar entrenamientos (.csv)</button>
      <button type="button" class="btn ghost" data-act="import">Restaurar una copia…</button>
    </div>
    <p class="hint">La copia completa sirve para restaurar todo si cambias de móvil o borras la app. Los .csv se abren en Excel.</p>
  </section>

  <section class="card">
    <div class="card-head"><h2>Zona peligrosa</h2></div>
    <button type="button" class="btn danger" data-act="wipe">Borrar todos los datos</button>
  </section>

  <p class="foot">Fitness ${APP_VERSION} · Datos de productos: <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a> (ODbL)</p>`;
}

/* ---------- hojas (pantallas superpuestas) ---------- */

const SHEETS = {};
function pushSheet(s) { S.sheets.push(s); renderSheets(); }
function popSheet() { S.sheets.pop(); renderSheets(); }
function replaceTop(s) { S.sheets[S.sheets.length - 1] = s; renderSheets(); }
function closeSheets() { S.sheets = []; renderSheets(); }
function popTo(sheet) { while (S.sheets.length && S.sheets[S.sheets.length - 1] !== sheet) S.sheets.pop(); renderSheets(); }

let renderedSheet = null;
function renderSheets() {
  const root = $('#sheet-root');
  const top = S.sheets[S.sheets.length - 1];
  if (!top || top.type !== 'scanner') stopScanner();
  if (!top) {
    root.hidden = true;
    root.innerHTML = '';
    const wasOpen = renderedSheet !== null;
    renderedSheet = null;
    document.body.classList.remove('sheet-open');
    if (wasOpen) render();
    return;
  }
  if (renderedSheet === top && top.type === 'scanner') return;
  const prevBody = root.querySelector('.sheet-body');
  if (renderedSheet && prevBody) renderedSheet._scroll = prevBody.scrollTop;
  const same = renderedSheet === top;
  const wasOpen = !root.hidden;
  renderedSheet = top;
  const def = SHEETS[top.type];
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

/* Selector de alimentos (para el diario o para una receta) */
SHEETS.picker = {
  title: (s) => (s.mode === 'recipe' ? 'Añadir ingrediente' : `Añadir a ${MEAL_NAME[s.meal]}`),
  render: (s) => `
    <div class="pick-tools">
      <input id="pick-q" type="search" placeholder="Busca un alimento${s.mode === 'diary' ? ' o receta' : ''}" value="${esc(s.q || '')}" autocomplete="off" data-input="pickq">
      <div class="btn-row">
        <button type="button" class="btn" data-act="scan">Escanear código</button>
        <button type="button" class="btn ghost" data-act="pick-new-food">Crear a mano</button>
      </div>
    </div>
    <div id="pick-list"></div>
    <div id="off-list"></div>`,
  mount: (s) => { fillPickList(s); },
};

function fillPickList(s) {
  const el = $('#pick-list');
  if (!el) return;
  const q = norm(s.q || '');
  let html = '';
  if (!q && s.mode === 'diary') {
    const rec = recentItems();
    if (rec.length) {
      html += `<h3 class="list-title">Recientes</h3><ul class="list">${rec.map((r) => {
        const n = nutFor(r, r.qty, r.unit);
        return `<li><button type="button" class="row" data-act="pick" data-type="${r.type}" data-id="${esc(r.id)}" data-qty="${r.qty}" data-unit="${r.unit}">
          <span class="row-main">${esc(itemName(r))}</span>
          <span class="row-sub">${qtyLabel(r.qty, r.unit)} la última vez</span>
          <span class="row-side">${fmt(n?.kcal)} <small>kcal</small></span>
        </button></li>`;
      }).join('')}</ul>`;
    }
  }
  if (s.mode === 'diary') {
    const recs = Object.values(S.recipes).filter((r) => norm(r.name).includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    if (recs.length) {
      html += `<h3 class="list-title">Recetas</h3><ul class="list">${recs.map((r) => {
        const per = mult(recipeTotals(r).total, 1 / (r.servings || 1));
        return `<li><button type="button" class="row" data-act="pick" data-type="recipe" data-id="${r.id}">
          <span class="row-main">${esc(r.name)}</span>
          <span class="row-sub">Receta · P ${fmt(per.p, 0)} · H ${fmt(per.c, 0)} · G ${fmt(per.f, 0)}</span>
          <span class="row-side">${fmt(per.kcal)} <small>kcal/ración</small></span>
        </button></li>`;
      }).join('')}</ul>`;
    }
  }
  if (q) {
    const foods = allFoods().filter((f) => norm(f.name + ' ' + (f.brand || '')).includes(q))
      .sort((a, b) => (a.source === 'basico') - (b.source === 'basico') || a.name.localeCompare(b.name, 'es'))
      .slice(0, 40);
    html += foods.length ? `<h3 class="list-title">Alimentos</h3><ul class="list">${foods.map((f) => foodRow(f, 'pick')).join('')}</ul>` : '<p class="empty">No tienes ningún alimento con ese nombre.</p>';
    html += `<button type="button" class="btn ghost wide" data-act="off-search">Buscar «${esc(s.q.trim())}» en Open Food Facts</button>`;
  } else {
    const own = Object.values(S.foods).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    if (own.length) html += `<h3 class="list-title">Mis alimentos</h3><ul class="list">${own.map((f) => foodRow(f, 'pick')).join('')}</ul>`;
    html += `<h3 class="list-title">Básicos</h3><ul class="list">${BASICS.map((f) => foodRow(f, 'pick')).join('')}</ul>`;
  }
  el.innerHTML = html;
}

let offAbort = 0;
async function runOffSearch(s) {
  const el = $('#off-list');
  const q = (s.q || '').trim();
  if (!el || !q) return;
  const token = ++offAbort;
  el.innerHTML = '<p class="muted center">Buscando en Open Food Facts…</p>';
  try {
    const res = await offSearch(q);
    if (token !== offAbort || !$('#off-list')) return;
    s.offResults = res;
    el.innerHTML = res.length ? `<h3 class="list-title">Open Food Facts</h3><ul class="list">${res.map((p, i) => `
      <li><button type="button" class="row" data-act="pick-off" data-idx="${i}">
        <span class="row-main">${esc(p.name)}</span>
        <span class="row-sub">${p.brand ? esc(p.brand) + ' · ' : ''}P ${fmt(p.per100.p, 1)} · H ${fmt(p.per100.c, 1)} · G ${fmt(p.per100.f, 1)}</span>
        <span class="row-side">${fmt(p.per100.kcal)} <small>kcal/100 g</small></span>
      </button></li>`).join('')}</ul>` : '<p class="empty">Open Food Facts no ha encontrado nada con ese nombre.</p>';
  } catch (e) {
    if (token === offAbort && $('#off-list')) el.innerHTML = '<p class="empty">No se ha podido conectar con Open Food Facts. Comprueba la conexión o crea el alimento a mano.</p>';
  }
}

function ctxThen(ctx) {
  return ctx.mode === 'recipe' ? { mode: 'recipe', recipeSheet: ctx.recipeSheet } : { mode: 'diary', meal: ctx.meal, date: ctx.date };
}

// El usuario ha elegido un alimento o receta desde un selector
function choose(item, then, opts = {}) {
  if (then && then.mode === 'recipe') {
    const f = getFood(item.id);
    then.recipeSheet.draft.items.push({ foodId: item.id, g: f?.servingG || 100 });
    popTo(then.recipeSheet);
    return;
  }
  if (!then) { popSheet(); return; }
  const q = { type: 'qty', item, meal: then.meal, date: then.date, qty: opts.qty, unit: opts.unit };
  if (opts.replace) replaceTop(q); else pushSheet(q);
}

/* Cantidad */
SHEETS.qty = {
  title: (s) => (s.entryId ? 'Editar' : itemName(s.item)),
  render: (s) => {
    const it = s.item;
    let qty = s.qty;
    let unit = s.unit;
    let base = '';
    let chips = [];
    let unitToggle = '';
    if (it.type === 'food') {
      const f = getFood(it.id);
      unit = 'g';
      if (qty == null) qty = f?.servingG || 100;
      chips = [...new Set([f?.servingG, 50, 100, 150, 200].filter(Boolean))];
      base = f ? `${fmt(f.per100.kcal)} kcal · P ${fmt(f.per100.p, 1)} · H ${fmt(f.per100.c, 1)} · G ${fmt(f.per100.f, 1)} por 100 g${f.servingG ? ` · ración ${fmt(f.servingG)} g` : ''}` : '';
    } else {
      const r = S.recipes[it.id];
      if (!unit) unit = 'rac';
      if (qty == null) qty = unit === 'rac' ? 1 : (r?.cookedG ? Math.round(r.cookedG / (r.servings || 1)) : 300);
      chips = unit === 'rac' ? [0.5, 1, 1.5, 2] : [200, 300, 400, 500];
      if (r?.cookedG) {
        unitToggle = `<div class="segmented small" role="tablist">
          <button type="button" role="tab" aria-selected="${unit === 'rac'}" data-act="qty-unit" data-unit="rac">Raciones</button>
          <button type="button" role="tab" aria-selected="${unit === 'g'}" data-act="qty-unit" data-unit="g">Gramos del plato</button>
        </div>`;
      }
      const per = r ? mult(recipeTotals(r).total, 1 / (r.servings || 1)) : null;
      base = per ? `Receta de ${r.servings || 1} ${r.servings === 1 ? 'ración' : 'raciones'} · ${fmt(per.kcal)} kcal por ración${r.cookedG ? ` · ${fmt(r.cookedG)} g cocinada` : ''}` : '';
    }
    s.qty = qty; s.unit = unit;
    const meal = s.meal || 'comida';
    return `
      ${s.entryId ? `<p class="sheet-sub"><b>${esc(itemName(it))}</b></p>` : ''}
      <p class="sheet-sub">${base}</p>
      ${unitToggle}
      <div class="qty-row">
        <input id="qty-in" type="text" inputmode="decimal" value="${inputVal(qty, 2)}" data-input="qty" aria-label="Cantidad">
        <span class="qty-unit">${unit === 'rac' ? 'raciones' : 'g'}</span>
      </div>
      <div class="chips">${chips.map((c) => `<button type="button" class="chip" data-act="qty-chip" data-v="${c}">${fmt(c, 2)}${unit === 'g' ? ' g' : ''}</button>`).join('')}</div>
      <div id="qty-prev" class="prev"></div>
      <div class="field"><span>Comida</span>
        <div class="chips">${MEALS.map(([k, l]) => `<button type="button" class="chip${k === meal ? ' on' : ''}" data-act="qty-meal" data-meal="${k}" aria-pressed="${k === meal}">${l}</button>`).join('')}</div>
      </div>
      <div class="sheet-actions">
        ${s.entryId ? '<button type="button" class="btn danger ghost" data-act="entry-del">Quitar</button>' : ''}
        <button type="button" class="btn primary" data-act="qty-save">${s.entryId ? 'Guardar' : 'Añadir'}</button>
      </div>`;
  },
  mount: (s) => { updateQtyPreview(s); },
};

function qtyNut(s) {
  const n = nutFor(s.item, s.qty || 0, s.unit);
  if (n) return n;
  // Si el alimento o la receta ya no existen, se recalcula a partir de la entrada guardada
  if (s.entryId) {
    const e = dayOf(s.date).entries.find((x) => x.id === s.entryId);
    if (e && e.qty) return mult(e.n, (s.qty || 0) / e.qty);
  }
  return null;
}

function updateQtyPreview(s) {
  const el = $('#qty-prev');
  if (!el) return;
  const n = qtyNut(s);
  if (!n) { el.innerHTML = '<p class="muted">No hay datos para calcular.</p>'; return; }
  el.innerHTML = `
    <div class="prev-kcal"><b>${fmt(n.kcal)}</b> kcal</div>
    <div class="prev-macros">
      <span class="m-p"><i class="dot"></i>P <b>${fmt(n.p, 1)}</b> g</span>
      <span class="m-c"><i class="dot"></i>H <b>${fmt(n.c, 1)}</b> g</span>
      <span class="m-f"><i class="dot"></i>G <b>${fmt(n.f, 1)}</b> g</span>
    </div>`;
}

function saveQty(s) {
  const qty = s.qty;
  if (!qty || qty <= 0) { toast('Pon una cantidad mayor que cero.'); return; }
  const n = qtyNut(s);
  if (!n) { toast('No se puede calcular este alimento.'); return; }
  const day = ensureDay(s.date);
  const entry = {
    id: s.entryId || uid(),
    meal: s.meal || 'comida',
    type: s.item.type,
    ref: s.item.id,
    name: itemName(s.item),
    qty,
    unit: s.unit,
    n,
  };
  if (s.entryId) {
    const i = day.entries.findIndex((e) => e.id === s.entryId);
    const exists = s.item.type === 'food' ? getFood(s.item.id) : S.recipes[s.item.id];
    if (i >= 0) {
      if (!exists) entry.name = day.entries[i].name; // conserva el nombre si el original se borró
      day.entries[i] = entry;
    }
  } else day.entries.push(entry);
  saveDay(s.date);
  closeSheets();
  S.ui.tab = 'hoy';
  S.ui.date = s.date;
  render();
  toast(s.entryId ? 'Guardado' : `Añadido a ${MEAL_NAME[entry.meal]}`);
}

/* Escáner de códigos de barras */
SHEETS.scanner = {
  title: () => 'Escanear código de barras',
  render: () => `
    <div class="scan-box">
      <video id="scan-video" playsinline muted autoplay></video>
      <div class="scan-guide" aria-hidden="true"><span></span></div>
    </div>
    <p id="scan-status" class="scan-status">Abriendo la cámara…</p>
    <p class="hint center">Pon el código en horizontal dentro del recuadro, a unos 15–20 cm.</p>
    <form class="inline-form" data-form="manual-code">
      <label>O escribe el número <input id="code-in" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="8410000000000" autocomplete="off"></label>
      <button class="btn" type="submit">Buscar</button>
    </form>`,
  mount: (s) => { startScanner(s); },
};

let scan = null;
async function startScanner(sheet) {
  stopScanner();
  const video = $('#scan-video');
  const status = $('#scan-status');
  const state = { sheet, stream: null, timer: null, stopped: false, detector: null };
  scan = state;
  if (!navigator.mediaDevices?.getUserMedia) {
    status.textContent = 'Este navegador no permite usar la cámara. Escribe el número de debajo del código.';
    return;
  }
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
  } catch (e) {
    if (state.stopped) return;
    status.textContent = 'No se ha podido abrir la cámara. Si la denegaste, actívala en Ajustes del iPhone › Safari › Cámara. También puedes escribir el número.';
    return;
  }
  if (state.stopped) { state.stream.getTracks().forEach((t) => t.stop()); return; }
  video.srcObject = state.stream;
  try { await video.play(); } catch (e) { /* iOS a veces necesita un toque */ }
  status.textContent = 'Buscando un código…';
  if ('BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes('ean_13')) state.detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    } catch (e) { /* sin detector nativo */ }
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const tick = async () => {
    if (state.stopped) return;
    let code = null;
    try {
      if (video.readyState >= 2 && video.videoWidth) {
        if (state.detector) {
          const found = await state.detector.detect(video);
          const hit = found.find((b) => /^\d{8,13}$/.test(b.rawValue));
          if (hit) code = hit.rawValue.length === 12 ? '0' + hit.rawValue : hit.rawValue;
        } else {
          const vw = video.videoWidth, vh = video.videoHeight;
          const sw = vw * 0.86, sh = Math.min(vh * 0.36, sw * 0.6);
          const sx = (vw - sw) / 2, sy = (vh - sh) / 2;
          const k = Math.min(1, 1100 / sw);
          canvas.width = Math.round(sw * k);
          canvas.height = Math.round(sh * k);
          ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
          const gray = imageDataToGray(ctx.getImageData(0, 0, canvas.width, canvas.height));
          code = decodeGray(gray, canvas.width, canvas.height, { lines: 15, vertical: false, minVotes: 2 });
        }
      }
    } catch (e) { /* fotograma no disponible */ }
    if (state.stopped) return;
    if (code) {
      if (navigator.vibrate) navigator.vibrate(40);
      stopScanner();
      handleCode(code, sheet);
      return;
    }
    state.timer = setTimeout(tick, state.detector ? 150 : 90);
  };
  tick();
}

function stopScanner() {
  if (!scan) return;
  scan.stopped = true;
  clearTimeout(scan.timer);
  if (scan.stream) scan.stream.getTracks().forEach((t) => t.stop());
  scan = null;
}

async function handleCode(code, scannerSheet) {
  const ctx = scannerSheet.ctx;
  const then = ctx ? ctxThen(ctx) : null;
  const local = allFoods().find((f) => f.barcode === code);
  if (local) {
    if (then) choose({ type: 'food', id: local.id }, then, { replace: true });
    else replaceTop({ type: 'food', draft: structuredClone(local), then: null });
    return;
  }
  const status = $('#scan-status');
  if (status) status.textContent = `Código ${code}. Buscando en Open Food Facts…`;
  let p = null;
  let offline = false;
  try { p = await offProduct(code); } catch (e) { offline = true; }
  if (S.sheets[S.sheets.length - 1] !== scannerSheet) return;
  if (p && p.hasNutrition) {
    replaceTop({ type: 'food', draft: { ...p, id: null, source: 'off' }, then, note: 'Datos de Open Food Facts. Compáralos con la etiqueta antes de guardar.' });
  } else if (p) {
    replaceTop({ type: 'food', draft: { name: p.name, brand: p.brand, barcode: code, servingG: p.servingG, per100: {}, id: null, source: 'etiqueta' }, then, note: 'Open Food Facts conoce el producto pero no sus valores. Cópialos de la etiqueta (por 100 g).' });
  } else {
    replaceTop({ type: 'food', draft: { name: '', barcode: code, per100: {}, id: null, source: 'etiqueta' }, then,
      note: offline ? 'Sin conexión para consultar Open Food Facts. Puedes copiar los valores de la etiqueta (por 100 g).' : 'Este código no está en Open Food Facts. Copia los valores de la etiqueta (por 100 g) y quedará guardado para la próxima vez.' });
  }
}

/* Editor de alimento */
SHEETS.food = {
  title: (s) => (s.draft.id && S.foods[s.draft.id] ? 'Editar alimento' : s.draft.source === 'basico' ? 'Alimento básico' : 'Nuevo alimento'),
  render: (s) => {
    const d = s.draft;
    const p = d.per100 || {};
    const isBasic = d.source === 'basico' && !S.foods[d.id];
    const nf = (n) => `
      <label class="nut-field${n.sub ? ' sub' : ''}">
        <span>${n.l}</span>
        <span class="input-unit"><input id="nf-${n.k}" type="text" inputmode="decimal" value="${inputVal(p[n.k], 2)}" placeholder="–"><em>${n.u}</em></span>
      </label>`;
    return `
      ${s.note ? `<p class="notice small">${esc(s.note)}</p>` : ''}
      ${isBasic ? '<p class="notice small">Es un alimento básico con valores medios. Si cambias algo, se guardará como alimento propio.</p>' : ''}
      <label class="field"><span>Nombre</span><input id="ff-name" type="text" value="${esc(d.name || '')}" placeholder="p. ej. Yogur griego natural" autocomplete="off"></label>
      <div class="form-grid">
        <label class="field"><span>Marca</span><input id="ff-brand" type="text" value="${esc(d.brand || '')}" placeholder="Opcional" autocomplete="off"></label>
        <label class="field"><span>Ración habitual</span><span class="input-unit"><input id="ff-serving" type="text" inputmode="decimal" value="${inputVal(d.servingG, 0)}" placeholder="–"><em>g</em></span></label>
      </div>
      <label class="field"><span>Código de barras</span><input id="ff-code" type="text" inputmode="numeric" value="${esc(d.barcode || '')}" placeholder="Opcional" autocomplete="off"></label>
      <div class="nut-box" role="group" aria-labelledby="nut-box-t">
        <p class="nut-box-title" id="nut-box-t">Información nutricional por 100 g</p>
        ${MACROS.map(nf).join('')}
        <p class="hint">Si dejas vacío el valor energético, se calcula con proteínas, hidratos, grasas y fibra.</p>
      </div>
      <details class="detail compact" ${MICROS.some((m) => p[m.k] != null) ? 'open' : ''}>
        <summary>Vitaminas y minerales (opcional)</summary>
        <div class="nut-box plain">${MICROS.map(nf).join('')}</div>
      </details>
      <div class="sheet-actions">
        ${d.id && S.foods[d.id] && !s.then ? '<button type="button" class="btn danger ghost" data-act="food-del">Borrar</button>' : ''}
        <button type="button" class="btn primary" data-act="food-save">${s.then ? (s.then.mode === 'recipe' ? 'Guardar y añadir a la receta' : 'Guardar y elegir cantidad') : 'Guardar'}</button>
      </div>`;
  },
};

function readFoodForm(s) {
  const d = s.draft;
  const per100 = {};
  for (const n of [...MACROS, ...MICROS]) per100[n.k] = num($('#nf-' + n.k)?.value);
  if (per100.kcal == null && (per100.p != null || per100.c != null || per100.f != null)) per100.kcal = kcalFrom(per100);
  return {
    ...d,
    name: $('#ff-name').value.trim(),
    brand: $('#ff-brand').value.trim(),
    servingG: num($('#ff-serving').value),
    barcode: $('#ff-code').value.replace(/\D/g, ''),
    per100,
  };
}

function saveFood(s) {
  const f = readFoodForm(s);
  if (!f.name) { toast('Ponle un nombre.'); $('#ff-name').focus(); return; }
  if (f.per100.kcal == null) { toast('Falta el valor energético o los macros.'); return; }
  if (f.barcode && !checksumOk(f.barcode) && f.barcode.length >= 8) toast('Ojo: el código de barras no parece válido.');
  // Un básico que no se ha tocado no se copia; si se modifica, se guarda como propio con el mismo id
  const basic = f.id ? BASICS_BY_ID[f.id] : null;
  const unchangedBasic = basic && !S.foods[f.id] && f.name === basic.name && !f.brand && !f.barcode
    && (f.servingG ?? null) === (basic.servingG ?? null)
    && KEYS.every((k) => (f.per100[k] ?? null) === (basic.per100[k] ?? null));
  if (!unchangedBasic) {
    if (!f.id) f.id = uid();
    if (f.source === 'basico') f.source = 'propio';
    f.updated = new Date().toISOString();
    S.foods[f.id] = f;
    saveFoods();
  }
  if (s.then) {
    choose({ type: 'food', id: f.id }, s.then, { replace: true });
  } else {
    popSheet();
    if (S.ui.tab === 'alimentos') fillLibList();
    toast('Alimento guardado');
  }
}

/* Editor de receta */
SHEETS.recipe = {
  title: (s) => (s.isNew ? 'Nueva receta' : 'Receta'),
  render: (s) => {
    const d = s.draft;
    return `
      <label class="field"><span>Nombre</span><input id="rf-name" type="text" value="${esc(d.name)}" placeholder="p. ej. Pasta con carne" autocomplete="off" data-input="rname"></label>
      <div class="form-grid">
        <label class="field"><span>Raciones que salen</span><input id="rf-serv" type="text" inputmode="decimal" value="${inputVal(d.servings, 2)}" data-input="rserv"></label>
        <label class="field"><span>Peso del plato hecho</span><span class="input-unit"><input id="rf-cooked" type="text" inputmode="decimal" value="${inputVal(d.cookedG, 0)}" placeholder="Opcional" data-input="rcooked"><em>g</em></span></label>
      </div>
      <p class="hint">Con el peso del plato ya cocinado podrás apuntar los gramos que te sirves en vez de raciones.</p>
      <h3 class="list-title">Ingredientes</h3>
      <ul class="ingredients">${d.items.map((it, i) => {
        const f = getFood(it.foodId);
        return `<li>
          <span class="ing-name">${esc(f ? f.name : 'Alimento borrado')}</span>
          <span class="input-unit small"><input type="text" inputmode="decimal" value="${inputVal(it.g, 1)}" data-input="rgrams" data-idx="${i}" aria-label="Gramos de ${esc(f?.name || '')}"><em>g</em></span>
          <button type="button" class="icon-btn small" data-act="ing-del" data-idx="${i}" aria-label="Quitar ${esc(f?.name || 'ingrediente')}">×</button>
        </li>`;
      }).join('')}</ul>
      ${d.items.length ? '' : '<p class="empty">Añade los ingredientes con los gramos que usas normalmente (en crudo).</p>'}
      <button type="button" class="btn ghost wide" data-act="ing-add">+ Añadir ingrediente</button>
      <div id="rec-tot" class="rec-tot"></div>
      <div class="sheet-actions">
        ${s.isNew ? '' : '<button type="button" class="btn danger ghost" data-act="recipe-del">Borrar</button>'}
        <button type="button" class="btn primary" data-act="recipe-save">Guardar receta</button>
      </div>`;
  },
  mount: (s) => updateRecipeTotals(s),
};

function updateRecipeTotals(s) {
  const el = $('#rec-tot');
  if (!el) return;
  const d = s.draft;
  if (!d.items.length) { el.innerHTML = ''; return; }
  const { total, rawWeight } = recipeTotals(d);
  const sv = d.servings || 1;
  const per = mult(total, 1 / sv);
  el.innerHTML = `
    <table class="nut-table compact">
      <thead><tr><th></th><th scope="col">Receta entera</th><th scope="col">Por ración</th></tr></thead>
      <tbody>
        <tr><th scope="row">Energía</th><td>${fmt(total.kcal)} kcal</td><td><b>${fmt(per.kcal)} kcal</b></td></tr>
        <tr><th scope="row">Proteínas</th><td>${fmt(total.p, 1)} g</td><td>${fmt(per.p, 1)} g</td></tr>
        <tr><th scope="row">Hidratos</th><td>${fmt(total.c, 1)} g</td><td>${fmt(per.c, 1)} g</td></tr>
        <tr><th scope="row">Grasas</th><td>${fmt(total.f, 1)} g</td><td>${fmt(per.f, 1)} g</td></tr>
      </tbody>
    </table>
    <p class="hint">Ingredientes en crudo: ${fmt(rawWeight)} g${d.cookedG ? ` · plato hecho: ${fmt(d.cookedG)} g (${fmt((total.kcal / d.cookedG) * 100)} kcal por 100 g)` : ''}.</p>`;
}

function saveRecipe(s) {
  const d = s.draft;
  d.name = $('#rf-name').value.trim();
  if (!d.name) { toast('Ponle un nombre a la receta.'); $('#rf-name').focus(); return; }
  if (!d.items.length) { toast('Añade al menos un ingrediente.'); return; }
  if (!d.servings || d.servings <= 0) d.servings = 1;
  d.updated = new Date().toISOString();
  S.recipes[d.id] = structuredClone(d);
  saveRecipes();
  popSheet();
  if (S.ui.tab === 'alimentos') fillLibList();
  toast('Receta guardada');
}

/* Confirmación dentro de la app (sin diálogos del navegador) */
SHEETS.confirm = {
  title: (s) => s.title,
  render: (s) => `
    <p>${esc(s.text)}</p>
    <div class="sheet-actions">
      <button type="button" class="btn ghost" data-act="sheet-back-or-close">Cancelar</button>
      <button type="button" class="btn ${s.danger ? 'danger' : 'primary'}" data-act="confirm-ok">${esc(s.ok)}</button>
    </div>`,
};

/* ---------- entrenamiento ---------- */

const getEx = (id) => S.exercises[id] || EXERCISES_BY_ID[id] || null;
function allExercises() {
  const own = Object.values(S.exercises);
  const ownIds = new Set(own.map((e) => e.id));
  return [...own, ...EXERCISES.filter((e) => !ownIds.has(e.id))].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
const exName = (we) => getEx(we.exId)?.name || we.name || 'Ejercicio borrado';
const mondayOf = (s) => { const d = parseISO(s); return addDays(s, -((d.getDay() + 6) % 7)); };
const emptySet = () => ({ kg: null, reps: null, t: 'n', done: false });
const isEffective = (st) => st.t !== 'w' && (st.done || (st.reps || 0) > 0);
const workoutsSorted = () => Object.values(S.workouts).sort((a, b) => (b.date + (b.start || '')).localeCompare(a.date + (a.start || '')));
const setText = (st) => `${st.kg == null ? '–' : fmt(st.kg, 2)}×${st.reps == null ? '–' : st.reps}`;
const musclesText = (ex) => {
  if (!ex) return '';
  const p = ex.primary.map((m) => MUSCLE_NAME[m]).join(', ');
  const s = ex.secondary.map((m) => MUSCLE_NAME[m]).join(', ');
  return p + (s ? ` · también ${s.toLowerCase()}` : '');
};

function workoutStats(w) {
  let sets = 0;
  let tonnage = 0;
  for (const we of w.exercises) {
    for (const st of we.sets) {
      if (!isEffective(st)) continue;
      sets++;
      tonnage += (st.kg || 0) * (st.reps || 0);
    }
  }
  return { sets, tonnage };
}

function weekVolume(monday) {
  const end = addDays(monday, 6);
  const vol = Object.fromEntries(MUSCLES.map((m) => [m.k, 0]));
  const byMuscle = Object.fromEntries(MUSCLES.map((m) => [m.k, {}]));
  let sessions = 0;
  let sets = 0;
  for (const w of Object.values(S.workouts)) {
    if (w.date < monday || w.date > end) continue;
    sessions++;
    for (const we of w.exercises) {
      const ex = getEx(we.exId);
      const n = we.sets.filter(isEffective).length;
      if (!ex || !n) continue;
      sets += n;
      const name = exName(we);
      for (const m of ex.primary) { vol[m] += n; byMuscle[m][name] = (byMuscle[m][name] || 0) + n; }
      for (const m of ex.secondary) { vol[m] += n / 2; byMuscle[m][name] = (byMuscle[m][name] || 0) + n / 2; }
    }
  }
  return { vol, byMuscle, sessions, sets };
}

// Series de la sesión anterior en la que apareció el ejercicio
function lastPerformance(exId, current) {
  for (const w of workoutsSorted()) {
    if (current && (w.id === current.id || w.date > current.date)) continue;
    const we = w.exercises.find((x) => x.exId === exId);
    if (!we) continue;
    const sets = we.sets.filter(isEffective);
    if (sets.length) return { date: w.date, sets };
  }
  return null;
}

function exerciseHistory(exId) {
  const out = [];
  for (const w of workoutsSorted()) {
    for (const we of w.exercises) {
      if (we.exId !== exId) continue;
      const sets = we.sets.filter(isEffective);
      if (!sets.length) continue;
      let best = null;
      for (const st of sets) {
        const v = e1rm(st.kg, st.reps);
        if (v != null && (best == null || v > best)) best = v;
      }
      out.push({ date: w.date, wid: w.id, sets, best });
    }
  }
  return out;
}

function newWorkout(fromRoutine) {
  const w = {
    id: uid(),
    date: today(),
    name: fromRoutine ? fromRoutine.name : 'Entrenamiento',
    routineId: fromRoutine?.id || null,
    start: new Date().toISOString(),
    end: null,
    exercises: [],
  };
  if (fromRoutine) {
    for (const it of fromRoutine.items) {
      const n = Math.max(1, it.sets || 3);
      w.exercises.push({ exId: it.exId, name: getEx(it.exId)?.name || '', sets: Array.from({ length: n }, emptySet) });
    }
  }
  S.workouts[w.id] = w;
  saveWorkout(w.id);
  return w;
}

function viewEntreno() {
  if (!S.ui.week) S.ui.week = mondayOf(today());
  const monday = S.ui.week;
  const { vol, byMuscle, sessions, sets } = weekVolume(monday);
  const open = workoutsSorted().find((w) => !w.end);
  const max = Math.max(22, ...Object.values(vol)) * 1.05;
  const pct = (v) => `${((v / max) * 100).toFixed(1)}%`;
  const groups = [...new Set(MUSCLES.map((m) => m.g))];
  const thisWeek = monday === mondayOf(today());

  const rows = groups.map((g) => `
    <h3 class="vol-group">${g}</h3>
    ${MUSCLES.filter((m) => m.g === g).map((m) => {
      const v = vol[m.k];
      const detail = Object.entries(byMuscle[m.k]).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${esc(n)} ${fmt(c, 1)}`).join(' · ');
      return `<div class="vol-row${v ? '' : ' zero'}" title="${detail}">
        <span class="vol-name">${m.l}</span>
        <span class="vol-bar" role="presentation"><span class="vol-zone" style="left:${pct(10)};width:${pct(10)}"></span><span class="vol-fill${v >= 10 ? ' in' : ''}" style="width:${pct(v)}"></span></span>
        <span class="vol-val">${fmt(v, 1)}</span>
      </div>`;
    }).join('')}`).join('');

  const recent = workoutsSorted().slice(0, 12);
  return `
  <header class="page-head">
    <h1>Entreno</h1>
  </header>

  ${open ? `<button type="button" class="live-card" data-act="open-workout" data-id="${open.id}">
      <span class="eyebrow">En curso</span>
      <b>${esc(open.name)}</b>
      <span class="muted">${open.exercises.length} ejercicios · ${workoutStats(open).sets} series hechas · toca para seguir</span>
    </button>` : `<button type="button" class="btn wide big" data-act="start-workout">Empezar entrenamiento</button>`}

  <div class="btn-row two">
    <button type="button" class="btn ghost" data-act="open-routines">Rutinas</button>
    <button type="button" class="btn ghost" data-act="open-library">Ejercicios</button>
  </div>

  <section class="card">
    <div class="card-head">
      <h2>Series por músculo</h2>
      <div class="week-nav">
        <button type="button" class="icon-btn small" data-act="week-prev" aria-label="Semana anterior">‹</button>
        <span>${thisWeek ? 'Esta semana' : `${dateShort(monday)} – ${dateShort(addDays(monday, 6))}`}</span>
        <button type="button" class="icon-btn small" data-act="week-next" aria-label="Semana siguiente" ${thisWeek ? 'disabled' : ''}>›</button>
      </div>
    </div>
    <p class="muted small-text">${sessions} ${sessions === 1 ? 'entrenamiento' : 'entrenamientos'} · ${sets} series efectivas. Cada serie suma 1 al músculo principal y 0,5 a los secundarios.</p>
    <div class="vol">${rows}</div>
    <p class="hint"><span class="zone-key"></span> Zona de 10 a 20 series semanales, el rango que se suele usar como referencia para ganar músculo.</p>
  </section>

  <section class="card">
    <div class="card-head"><h2>Últimos entrenamientos</h2></div>
    ${recent.length ? `<ul class="list">${recent.map((w) => {
      const st = workoutStats(w);
      return `<li><button type="button" class="row" data-act="open-workout" data-id="${w.id}">
        <span class="row-main">${esc(w.name)}${w.end ? '' : ' <em class="tag">en curso</em>'}</span>
        <span class="row-sub">${dayLabel(w.date)} · ${w.exercises.length} ejercicios · ${fmt(st.tonnage)} kg movidos</span>
        <span class="row-side">${st.sets} <small>series</small></span>
      </button></li>`;
    }).join('')}</ul>` : '<p class="empty">Aún no hay entrenamientos. Empieza uno vacío o crea una rutina con tus ejercicios habituales.</p>'}
  </section>`;
}

/* Empezar: vacío o desde una rutina */
SHEETS.start = {
  title: () => 'Empezar entrenamiento',
  render: () => {
    const routines = Object.values(S.routines).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    return `
      <button type="button" class="btn wide" data-act="start-empty">Entrenamiento vacío</button>
      <h3 class="list-title">Desde una rutina</h3>
      ${routines.length ? `<ul class="list">${routines.map((r) => `<li><button type="button" class="row" data-act="start-routine" data-id="${r.id}">
        <span class="row-main">${esc(r.name)}</span>
        <span class="row-sub">${r.items.map((it) => esc(getEx(it.exId)?.name || '')).join(', ')}</span>
        <span class="row-side">${r.items.reduce((a, it) => a + (it.sets || 0), 0)} <small>series</small></span>
      </button></li>`).join('')}</ul>` : '<p class="empty">No tienes rutinas. Créalas en Entreno › Rutinas para empezar con los ejercicios ya puestos.</p>'}`;
  },
};

/* Sesión de entrenamiento */
SHEETS.workout = {
  title: (s) => (S.workouts[s.id]?.end ? 'Entrenamiento' : 'Entrenando'),
  render: (s) => {
    const w = S.workouts[s.id];
    if (!w) return '<p class="empty">Este entrenamiento ya no existe.</p>';
    const exs = w.exercises.map((we, i) => {
      const ex = getEx(we.exId);
      const last = lastPerformance(we.exId, w);
      let n = 0;
      const rows = we.sets.map((st, j) => {
        const warm = st.t === 'w';
        if (!warm) n++;
        const ph = !warm && last ? last.sets[n - 1] : null;
        return `<tr class="${st.done ? 'done' : ''}${warm ? ' warm' : ''}">
          <td><button type="button" class="set-type" data-act="set-type" data-i="${i}" data-j="${j}" aria-label="Serie ${warm ? 'de calentamiento' : n}. Toca para cambiar el tipo">${warm ? 'C' : n}</button></td>
          <td><input type="text" inputmode="decimal" data-input="set-kg" data-i="${i}" data-j="${j}" value="${inputVal(st.kg, 2)}" placeholder="${ph ? inputVal(ph.kg, 2) : 'kg'}" aria-label="Kilos"></td>
          <td><input type="text" inputmode="numeric" data-input="set-reps" data-i="${i}" data-j="${j}" value="${st.reps ?? ''}" placeholder="${ph ? ph.reps ?? '' : 'reps'}" aria-label="Repeticiones"></td>
          <td><button type="button" class="set-done" data-act="set-done" data-i="${i}" data-j="${j}" aria-pressed="${!!st.done}" aria-label="Serie hecha">✓</button></td>
          <td><button type="button" class="set-del" data-act="set-del" data-i="${i}" data-j="${j}" aria-label="Quitar serie">×</button></td>
        </tr>`;
      }).join('');
      return `
      <section class="wk-ex">
        <div class="wk-ex-head">
          <button type="button" class="wk-ex-name" data-act="ex-history" data-id="${esc(we.exId)}">${esc(exName(we))}</button>
          <button type="button" class="icon-btn small" data-act="wk-ex-del" data-i="${i}" aria-label="Quitar ${esc(exName(we))}">×</button>
        </div>
        <p class="wk-muscles">${esc(musclesText(ex))}</p>
        ${last ? `<p class="wk-last">Última vez (${dateShort(last.date)}): ${last.sets.map(setText).join(' · ')}</p>` : ''}
        <table class="sets">
          <thead><tr><th scope="col">Serie</th><th scope="col">Kg</th><th scope="col">Reps</th><th scope="col"><span class="sr">Hecha</span></th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <button type="button" class="btn ghost small" data-act="set-add" data-i="${i}">+ Serie</button>
      </section>`;
    }).join('');
    const st = workoutStats(w);
    return `
      <div class="form-grid">
        <label class="field"><span>Nombre</span><input id="wk-name" type="text" value="${esc(w.name)}" data-input="wk-name" autocomplete="off"></label>
        <label class="field"><span>Fecha</span><input id="wk-date" type="date" value="${w.date}" max="${today()}" data-change="wk-date"></label>
      </div>
      ${exs || '<p class="empty">Añade el primer ejercicio. Si lo has hecho antes, verás lo que levantaste la última vez.</p>'}
      <button type="button" class="btn wide" data-act="wk-ex-add">+ Añadir ejercicio</button>
      <p class="hint">${st.sets} series efectivas · ${fmt(st.tonnage)} kg movidos. Toca el número de una serie para marcarla como calentamiento (C), que no cuenta para el volumen.</p>
      <div class="sheet-actions">
        <button type="button" class="btn danger ghost" data-act="wk-del">Borrar</button>
        <button type="button" class="btn primary" data-act="wk-finish">${w.end ? 'Hecho' : 'Terminar'}</button>
      </div>`;
  },
};

/* Selector de ejercicios */
SHEETS['ex-picker'] = {
  title: () => 'Añadir ejercicio',
  render: (s) => `
    <div class="pick-tools">
      <input id="ex-q" type="search" placeholder="Buscar ejercicio" value="${esc(s.q || '')}" autocomplete="off" data-input="ex-q">
      <div class="chips scroll">
        <button type="button" class="chip${!s.muscle ? ' on' : ''}" data-act="ex-filter" data-m="">Todos</button>
        ${MUSCLES.map((m) => `<button type="button" class="chip${s.muscle === m.k ? ' on' : ''}" data-act="ex-filter" data-m="${m.k}">${m.l}</button>`).join('')}
      </div>
    </div>
    <div id="ex-list"></div>
    <button type="button" class="btn ghost wide" data-act="ex-new">Crear un ejercicio nuevo</button>`,
  mount: (s) => fillExList(s),
};

function fillExList(s) {
  const el = $('#ex-list');
  if (!el) return;
  const words = norm(s.q || '').split(/\s+/).filter(Boolean);
  const list = allExercises().filter((e) => words.every((w) => norm(e.name).includes(w)) && (!s.muscle || e.primary.includes(s.muscle) || e.secondary.includes(s.muscle)));
  el.innerHTML = list.length ? `<ul class="list">${list.map((e) => `<li><button type="button" class="row" data-act="${s.mode === 'library' ? 'ex-history' : 'ex-pick'}" data-id="${esc(e.id)}">
      <span class="row-main">${esc(e.name)}${e.builtin === false || !EXERCISES_BY_ID[e.id] ? ' <em class="tag">propio</em>' : ''}</span>
      <span class="row-sub">${esc(musclesText(e))}</span>
    </button></li>`).join('')}</ul>` : '<p class="empty">Ningún ejercicio coincide. Puedes crearlo.</p>';
}

function addExerciseTo(target, exId) {
  if (target.type === 'workout') {
    const w = S.workouts[target.id];
    const last = lastPerformance(exId, w);
    const n = last ? last.sets.length : 3;
    w.exercises.push({ exId, name: getEx(exId)?.name || '', sets: Array.from({ length: n }, emptySet) });
    saveWorkout(w.id);
  } else if (target.type === 'routine') {
    target.draft.items.push({ exId, sets: 3 });
  }
  target._scroll = 1e6; // baja hasta el ejercicio añadido
  popTo(target);
}

/* Crear o editar un ejercicio y sus músculos */
SHEETS['ex-edit'] = {
  title: (s) => (s.isNew ? 'Nuevo ejercicio' : 'Músculos del ejercicio'),
  render: (s) => {
    const d = s.draft;
    const chips = (role) => MUSCLES.map((m) => {
      const on = d[role].includes(m.k);
      return `<button type="button" class="chip${on ? ' on' : ''}" data-act="ex-muscle" data-role="${role}" data-m="${m.k}" aria-pressed="${on}">${m.l}</button>`;
    }).join('');
    const isBuiltin = !!EXERCISES_BY_ID[d.id];
    return `
      <label class="field"><span>Nombre</span><input id="exf-name" type="text" value="${esc(d.name)}" placeholder="p. ej. Press inclinado en Smith" autocomplete="off" data-input="exf-name"></label>
      <div class="field"><span>Músculos principales <small>(cuentan 1 serie)</small></span><div class="chips">${chips('primary')}</div></div>
      <div class="field"><span>Músculos secundarios <small>(cuentan media serie)</small></span><div class="chips">${chips('secondary')}</div></div>
      <div class="sheet-actions">
        ${!s.isNew && !isBuiltin ? '<button type="button" class="btn danger ghost" data-act="ex-del">Borrar</button>' : ''}
        ${!s.isNew && isBuiltin && S.exercises[d.id] ? '<button type="button" class="btn ghost" data-act="ex-reset">Restablecer</button>' : ''}
        <button type="button" class="btn primary" data-act="ex-save">${s.then ? 'Guardar y añadir' : 'Guardar'}</button>
      </div>`;
  },
};

/* Historial de un ejercicio */
SHEETS['ex-history'] = {
  title: (s) => getEx(s.id)?.name || 'Ejercicio',
  render: (s) => {
    const ex = getEx(s.id);
    const hist = exerciseHistory(s.id);
    let bestSet = null;
    let best = null;
    for (const h of hist) {
      for (const st of h.sets) {
        const v = e1rm(st.kg, st.reps);
        if (v != null && (best == null || v > best)) { best = v; bestSet = st; }
      }
    }
    return `
      <p class="sheet-sub">${esc(musclesText(ex))}</p>
      <button type="button" class="btn ghost small" data-act="ex-edit" data-id="${esc(s.id)}">Editar músculos</button>
      <div class="stats top-gap">
        <div><span class="stat-l">1RM estimado</span><span class="stat-v">${fmt(best, 1)}<small> kg</small></span></div>
        <div><span class="stat-l">Mejor serie</span><span class="stat-v">${bestSet ? setText(bestSet) : '–'}</span></div>
        <div><span class="stat-l">Sesiones</span><span class="stat-v">${hist.length}</span></div>
      </div>
      <div class="chart" id="ex-chart"></div>
      ${hist.length ? `<h3 class="list-title">Historial</h3><ul class="list">${hist.map((h) => `<li class="row static hist">
          <span class="row-main">${dayLabel(h.date)}</span>
          <span class="row-sub">${h.sets.map(setText).join(' · ')}</span>
          <span class="row-side">${h.best ? fmt(h.best, 1) : '–'} <small>1RM est.</small></span>
        </li>`).join('')}</ul>` : '<p class="empty">Aún no has hecho este ejercicio.</p>'}
      <p class="hint">1RM estimado con la fórmula de Epley a partir de series de hasta 12 repeticiones.</p>`;
  },
  mount: (s) => drawExChart(s.id),
};

function drawExChart(exId) {
  const host = $('#ex-chart');
  if (!host) return;
  const pts = exerciseHistory(exId).filter((h) => h.best != null).reverse();
  if (pts.length < 2) { host.innerHTML = ''; return; }
  const W = Math.max(280, host.clientWidth);
  const H = 170;
  const m = { l: 38, r: 12, t: 12, b: 24 };
  const t0 = parseISO(pts[0].date).getTime();
  const t1 = Math.max(parseISO(pts[pts.length - 1].date).getTime(), t0 + 864e5);
  const xs = (d) => m.l + ((parseISO(d).getTime() - t0) / (t1 - t0)) * (W - m.l - m.r);
  let lo = Math.min(...pts.map((p) => p.best));
  let hi = Math.max(...pts.map((p) => p.best));
  if (hi - lo < 5) { lo -= 2.5; hi += 2.5; }
  const step = niceStep(hi - lo, 4);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ys = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
  let g = '';
  for (let v = lo; v <= hi + 1e-9; v += step) {
    const y = ys(v).toFixed(1);
    g += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}"/><text class="axis" x="${m.l - 6}" y="${y}" dy="0.32em" text-anchor="end">${fmt(v)}</text>`;
  }
  g += `<text class="axis" x="${m.l}" y="${H - 6}">${dateShort(pts[0].date)}</text><text class="axis" x="${W - m.r}" y="${H - 6}" text-anchor="end">${dateShort(pts[pts.length - 1].date)}</text>`;
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${xs(p.date).toFixed(1)},${ys(p.best).toFixed(1)}`).join('');
  const dots = pts.map((p) => `<circle class="w-end" cx="${xs(p.date).toFixed(1)}" cy="${ys(p.best).toFixed(1)}" r="3.5"/>`).join('');
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Evolución del 1RM estimado">${g}<path class="w-avg" d="${path}"/>${dots}</svg>`;
}

/* Rutinas */
SHEETS.routines = {
  title: () => 'Rutinas',
  render: () => {
    const list = Object.values(S.routines).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    return `
      <button type="button" class="btn wide" data-act="routine-new">Nueva rutina</button>
      ${list.length ? `<ul class="list top-gap">${list.map((r) => `<li><button type="button" class="row" data-act="routine-open" data-id="${r.id}">
        <span class="row-main">${esc(r.name)}</span>
        <span class="row-sub">${r.items.map((it) => esc(getEx(it.exId)?.name || '')).join(', ') || 'Sin ejercicios'}</span>
        <span class="row-side">${r.items.reduce((a, it) => a + (it.sets || 0), 0)} <small>series</small></span>
      </button></li>`).join('')}</ul>` : '<p class="empty">Una rutina es tu plantilla de un día de gimnasio, por ejemplo «Empuje» o «Pierna», con sus ejercicios y el número de series.</p>'}`;
  },
};

SHEETS.routine = {
  title: (s) => (s.isNew ? 'Nueva rutina' : 'Rutina'),
  render: (s) => {
    const d = s.draft;
    return `
      <label class="field"><span>Nombre</span><input id="rt-name" type="text" value="${esc(d.name)}" placeholder="p. ej. Empuje" autocomplete="off" data-input="rt-name"></label>
      <h3 class="list-title">Ejercicios</h3>
      <ul class="ingredients">${d.items.map((it, i) => `<li>
        <span class="ing-name">${esc(getEx(it.exId)?.name || 'Ejercicio borrado')}</span>
        <span class="input-unit small"><input type="text" inputmode="numeric" value="${it.sets}" data-input="rt-sets" data-idx="${i}" aria-label="Series"><em>series</em></span>
        <button type="button" class="icon-btn small" data-act="rt-del-item" data-idx="${i}" aria-label="Quitar">×</button>
      </li>`).join('')}</ul>
      ${d.items.length ? '' : '<p class="empty">Añade los ejercicios en el orden en que los haces.</p>'}
      <button type="button" class="btn ghost wide" data-act="rt-add">+ Añadir ejercicio</button>
      <div class="sheet-actions">
        ${s.isNew ? '' : '<button type="button" class="btn danger ghost" data-act="rt-delete">Borrar</button>'}
        ${s.isNew ? '' : '<button type="button" class="btn ghost" data-act="rt-start">Empezar</button>'}
        <button type="button" class="btn primary" data-act="rt-save">Guardar</button>
      </div>`;
  },
};

function saveRoutineDraft(s) {
  const d = s.draft;
  d.name = $('#rt-name').value.trim();
  if (!d.name) { toast('Ponle un nombre a la rutina.'); return false; }
  if (!d.items.length) { toast('Añade al menos un ejercicio.'); return false; }
  d.items.forEach((it) => { it.sets = Math.max(1, Math.round(it.sets || 1)); });
  S.routines[d.id] = structuredClone(d);
  saveRoutines();
  return true;
}

function openWorkout(id) {
  pushSheet({ type: 'workout', id });
}

async function exportCsvEntrenos() {
  const rows = [['fecha', 'entrenamiento', 'ejercicio', 'serie', 'tipo', 'kg', 'repeticiones', '1RM estimado (kg)', 'músculos principales'].join(';')];
  for (const w of [...workoutsSorted()].reverse()) {
    for (const we of w.exercises) {
      const ex = getEx(we.exId);
      let n = 0;
      for (const st of we.sets) {
        if (!isEffective(st) && st.t !== 'w') continue;
        const warm = st.t === 'w';
        if (!warm) n++;
        rows.push([w.date, w.name, exName(we), warm ? '' : n, warm ? 'calentamiento' : 'efectiva', csvNum(st.kg, 2), st.reps ?? '',
          csvNum(warm ? null : e1rm(st.kg, st.reps), 1), (ex?.primary || []).map((m) => MUSCLE_NAME[m]).join(', ')].map(csvText).join(';'));
      }
    }
  }
  await deliverFile(`fitness-entrenos-${today()}.csv`, '﻿' + rows.join('\r\n'), 'text/csv');
}

/* ---------- exportar e importar ---------- */

const csvText = (s) => {
  const t = String(s ?? '');
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const csvNum = (n, d = 1) => (n == null ? '' : (Math.round(n * 10 ** d) / 10 ** d).toString().replace('.', ','));

async function deliverFile(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const touch = window.matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare) {
    const file = new File([blob], filename, { type: mime });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return true;
      } catch (e) {
        if (e.name === 'AbortError') return false;
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

async function exportJSON() {
  flushAll();
  const data = {
    app: 'fitness-app',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: S.settings,
    foods: S.foods,
    recipes: S.recipes,
    days: S.days,
    weights: S.weights,
    exercises: S.exercises,
    routines: S.routines,
    workouts: S.workouts,
  };
  const ok = await deliverFile(`fitness-copia-${today()}.json`, JSON.stringify(data), 'application/json');
  if (ok) {
    S.settings.lastBackup = new Date().toISOString();
    saveSettings();
    render();
    toast('Copia preparada');
  }
}

async function exportCsvDiario() {
  const head = ['fecha', 'comida', 'alimento', 'cantidad', 'unidad', ...[...MACROS, ...MICROS].map((n) => `${n.l.replace(/^de (los|las) cuales /, '')} (${n.u})`)];
  const rows = [head.map(csvText).join(';')];
  for (const date of Object.keys(S.days).sort()) {
    for (const e of S.days[date].entries) {
      rows.push([date, MEAL_NAME[e.meal] || e.meal, e.name, csvNum(e.qty, 2), e.unit === 'rac' ? 'raciones' : 'g',
        ...[...MACROS, ...MICROS].map((n) => csvNum(e.n[n.k], n.k === 'kcal' ? 0 : 2))].map(csvText).join(';'));
    }
  }
  await deliverFile(`fitness-comidas-${today()}.csv`, '﻿' + rows.join('\r\n'), 'text/csv');
}

async function exportCsvResumen() {
  const dates = [...new Set([...Object.keys(S.days), ...Object.keys(S.weights)])].sort();
  const rows = [['fecha', 'kcal', 'proteinas (g)', 'hidratos (g)', 'grasas (g)', 'fibra (g)', 'sal (g)', 'pasos', 'peso (kg)'].join(';')];
  for (const d of dates) {
    const day = dayOf(d);
    const { tot } = sumNut(day.entries.map((e) => e.n));
    rows.push([d, csvNum(tot.kcal, 0), csvNum(tot.p), csvNum(tot.c), csvNum(tot.f), csvNum(tot.fi), csvNum(tot.sal, 2),
      day.steps ?? '', csvNum(S.weights[d], 2)].join(';'));
  }
  await deliverFile(`fitness-resumen-${today()}.csv`, '﻿' + rows.join('\r\n'), 'text/csv');
}

async function importFile(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch (e) { toast('Ese archivo no es una copia válida.'); return; }
  if (!data || data.app !== 'fitness-app' || typeof data.days !== 'object') { toast('Ese archivo no es una copia de esta app.'); return; }
  const nDays = Object.keys(data.days || {}).length;
  const nWk = Object.keys(data.workouts || {}).length;
  pushSheet({
    type: 'confirm',
    title: 'Restaurar copia',
    text: `La copia es del ${data.exportedAt ? dateLong(data.exportedAt.slice(0, 10)) : 'día desconocido'} y tiene ${nDays} días de diario y ${nWk} entrenamientos. Sustituirá todos los datos que hay ahora en este teléfono.`,
    ok: 'Restaurar',
    danger: true,
    onOk: async () => {
      flushAll();
      await store.clearAll();
      const entries = [
        ['settings', data.settings || S.settings],
        ['foods', data.foods || {}],
        ['recipes', data.recipes || {}],
        ['weights', data.weights || {}],
        ['exercises', data.exercises || {}],
        ['routines', data.routines || {}],
        ...Object.entries(data.days || {}).map(([d, v]) => ['day:' + d, v]),
        ...Object.entries(data.workouts || {}).map(([id, v]) => ['wk:' + id, v]),
      ];
      await store.putMany(entries);
      await loadState();
      closeSheets();
      render();
      toast('Copia restaurada');
    },
  });
}

/* ---------- eventos ---------- */

document.addEventListener('click', async (ev) => {
  const tabBtn = ev.target.closest('.tab');
  if (tabBtn) { setTab(tabBtn.dataset.tab); return; }
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const top = S.sheets[S.sheets.length - 1];

  switch (act) {
    case 'goto': setTab(el.dataset.tab); break;
    case 'day-prev': S.ui.date = addDays(S.ui.date, -1); render(); break;
    case 'day-next': S.ui.date = addDays(S.ui.date, 1); render(); break;
    case 'day-today': S.ui.date = today(); render(); break;
    case 'add': pushSheet({ type: 'picker', mode: 'diary', meal: el.dataset.meal, date: S.ui.date, q: '' }); break;
    case 'edit-entry': {
      const e = dayOf(S.ui.date).entries.find((x) => x.id === el.dataset.id);
      if (e) pushSheet({ type: 'qty', item: { type: e.type, id: e.ref }, meal: e.meal, date: S.ui.date, qty: e.qty, unit: e.unit, entryId: e.id });
      break;
    }
    case 'pick': {
      const item = { type: el.dataset.type, id: el.dataset.id };
      const opts = el.dataset.qty ? { qty: Number(el.dataset.qty), unit: el.dataset.unit } : {};
      choose(item, ctxThen(top), opts);
      break;
    }
    case 'pick-new-food': pushSheet({ type: 'food', draft: { name: top.q || '', per100: {}, id: null, source: 'etiqueta' }, then: ctxThen(top) }); break;
    case 'off-search': runOffSearch(top); break;
    case 'pick-off': {
      const p = top.offResults?.[Number(el.dataset.idx)];
      if (!p) break;
      const local = p.barcode && allFoods().find((f) => f.barcode === p.barcode);
      if (local) choose({ type: 'food', id: local.id }, ctxThen(top));
      else pushSheet({ type: 'food', draft: { ...p, id: null, source: 'off' }, then: ctxThen(top), note: 'Datos de Open Food Facts. Compáralos con la etiqueta antes de guardar.' });
      break;
    }
    case 'scan': pushSheet({ type: 'scanner', ctx: top }); break;
    case 'scan-lib': pushSheet({ type: 'scanner', ctx: null }); break;
    case 'qty-chip': {
      top.qty = Number(el.dataset.v);
      $('#qty-in').value = inputVal(top.qty, 2);
      updateQtyPreview(top);
      break;
    }
    case 'qty-unit': {
      if (top.unit === el.dataset.unit) break;
      top.unit = el.dataset.unit;
      top.qty = null;
      renderSheets();
      break;
    }
    case 'qty-meal': {
      top.meal = el.dataset.meal;
      el.parentElement.querySelectorAll('.chip').forEach((c) => { const on = c === el; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on); });
      break;
    }
    case 'qty-save': saveQty(top); break;
    case 'entry-del': {
      const day = ensureDay(top.date);
      day.entries = day.entries.filter((e) => e.id !== top.entryId);
      saveDay(top.date);
      closeSheets();
      render();
      toast('Quitado');
      break;
    }
    case 'sheet-close': closeSheets(); break;
    case 'sheet-back': popSheet(); break;
    case 'sheet-back-or-close': if (S.sheets.length > 1) popSheet(); else closeSheets(); break;
    case 'confirm-ok': { const fn = top.onOk; popSheet(); await fn(); break; }
    case 'lib': S.ui.lib = el.dataset.lib; render(); break;
    case 'new-recipe': pushSheet({ type: 'recipe', isNew: true, draft: { id: uid(), name: '', servings: 1, cookedG: null, items: [] } }); break;
    case 'open-recipe': {
      const r = S.recipes[el.dataset.id];
      if (r) pushSheet({ type: 'recipe', isNew: false, draft: structuredClone(r) });
      break;
    }
    case 'ing-add': pushSheet({ type: 'picker', mode: 'recipe', recipeSheet: top, q: '' }); break;
    case 'ing-del': top.draft.items.splice(Number(el.dataset.idx), 1); renderSheets(); break;
    case 'recipe-save': saveRecipe(top); break;
    case 'recipe-del': {
      const id = top.draft.id;
      pushSheet({ type: 'confirm', title: 'Borrar receta', text: `¿Borrar «${top.draft.name}»? Lo que ya apuntaste en el diario se mantiene.`, ok: 'Borrar', danger: true,
        onOk: () => { delete S.recipes[id]; saveRecipes(); closeSheets(); render(); toast('Receta borrada'); } });
      break;
    }
    case 'new-food': pushSheet({ type: 'food', draft: { name: '', per100: {}, id: null, source: 'etiqueta' }, then: null }); break;
    case 'open-food': {
      const f = getFood(el.dataset.id);
      if (f) pushSheet({ type: 'food', draft: structuredClone(f), then: null });
      break;
    }
    case 'food-save': saveFood(top); break;
    case 'food-del': {
      const id = top.draft.id;
      pushSheet({ type: 'confirm', title: 'Borrar alimento', text: `¿Borrar «${top.draft.name}»? Las recetas que lo usan lo mostrarán como borrado.`, ok: 'Borrar', danger: true,
        onOk: () => { delete S.foods[id]; saveFoods(); closeSheets(); render(); toast('Alimento borrado'); } });
      break;
    }
    case 'range': S.ui.range = Number(el.dataset.range); render(); break;
    case 'del-weight': delete S.weights[el.dataset.date]; saveWeights(); render(); break;
    case 'export-json': exportJSON(); break;
    case 'export-csv-diario': exportCsvDiario(); break;
    case 'export-csv-resumen': exportCsvResumen(); break;
    case 'export-csv-entrenos': exportCsvEntrenos(); break;
    /* entrenamiento */
    case 'start-workout': pushSheet({ type: 'start' }); break;
    case 'start-empty': { const w = newWorkout(null); replaceTop({ type: 'workout', id: w.id }); render(); break; }
    case 'start-routine': {
      const r = S.routines[el.dataset.id];
      if (!r) break;
      const w = newWorkout(r);
      replaceTop({ type: 'workout', id: w.id });
      render();
      break;
    }
    case 'open-workout': openWorkout(el.dataset.id); break;
    case 'open-routines': pushSheet({ type: 'routines' }); break;
    case 'open-library': pushSheet({ type: 'ex-picker', mode: 'library', q: '', muscle: '' }); break;
    case 'week-prev': S.ui.week = addDays(S.ui.week, -7); render(); break;
    case 'week-next': S.ui.week = addDays(S.ui.week, 7); render(); break;
    case 'set-type': case 'set-done': case 'set-del': {
      const w = S.workouts[top.id];
      const i = Number(el.dataset.i), j = Number(el.dataset.j);
      const we = w?.exercises[i];
      if (!we) break;
      const st = we.sets[j];
      if (act === 'set-type') st.t = st.t === 'w' ? 'n' : 'w';
      else if (act === 'set-del') we.sets.splice(j, 1);
      else {
        st.done = !st.done;
        // Al marcarla hecha sin datos, copia lo de la última vez
        if (st.done) {
          const kgIn = $(`[data-input="set-kg"][data-i="${i}"][data-j="${j}"]`);
          const repIn = $(`[data-input="set-reps"][data-i="${i}"][data-j="${j}"]`);
          if (st.kg == null && kgIn) st.kg = num(kgIn.placeholder);
          if (st.reps == null && repIn) { const r = num(repIn.placeholder); st.reps = r == null ? null : Math.round(r); }
        }
      }
      saveWorkout(w.id);
      renderSheets();
      break;
    }
    case 'set-add': {
      const w = S.workouts[top.id];
      const we = w.exercises[Number(el.dataset.i)];
      const prev = we.sets[we.sets.length - 1];
      we.sets.push({ kg: prev ? prev.kg : null, reps: prev ? prev.reps : null, t: 'n', done: false });
      saveWorkout(w.id);
      renderSheets();
      break;
    }
    case 'wk-ex-del': {
      const w = S.workouts[top.id];
      w.exercises.splice(Number(el.dataset.i), 1);
      saveWorkout(w.id);
      renderSheets();
      break;
    }
    case 'wk-ex-add': pushSheet({ type: 'ex-picker', mode: 'workout', target: top, q: '', muscle: '' }); break;
    case 'wk-finish': {
      const w = S.workouts[top.id];
      if (!w) { closeSheets(); break; }
      // Limpia series vacías y ejercicios sin series
      w.exercises.forEach((we) => { we.sets = we.sets.filter((st) => st.done || st.kg != null || st.reps != null); });
      w.exercises = w.exercises.filter((we) => we.sets.length);
      const wasOpen = !w.end;
      if (wasOpen) w.end = new Date().toISOString();
      saveWorkout(w.id);
      closeSheets();
      if (wasOpen) toast(`Entrenamiento guardado: ${workoutStats(w).sets} series`);
      break;
    }
    case 'wk-del': {
      const id = top.id;
      pushSheet({ type: 'confirm', title: 'Borrar entrenamiento', text: 'Se borrará este entrenamiento con todas sus series.', ok: 'Borrar', danger: true,
        onOk: () => { delete S.workouts[id]; saveWorkout(id); closeSheets(); toast('Entrenamiento borrado'); } });
      break;
    }
    case 'ex-filter': top.muscle = el.dataset.m; renderSheets(); break;
    case 'ex-pick': addExerciseTo(top.target, el.dataset.id); break;
    case 'ex-new': pushSheet({ type: 'ex-edit', isNew: true, draft: { id: 'u-' + uid(), name: top.q || '', primary: top.muscle ? [top.muscle] : [], secondary: [] }, then: top.target || null }); break;
    case 'ex-history': pushSheet({ type: 'ex-history', id: el.dataset.id }); break;
    case 'ex-edit': {
      const ex = getEx(el.dataset.id);
      if (ex) pushSheet({ type: 'ex-edit', isNew: false, draft: structuredClone(ex) });
      break;
    }
    case 'ex-muscle': {
      const d = top.draft;
      const role = el.dataset.role, other = role === 'primary' ? 'secondary' : 'primary';
      const m = el.dataset.m;
      if (d[role].includes(m)) d[role] = d[role].filter((x) => x !== m);
      else { d[role].push(m); d[other] = d[other].filter((x) => x !== m); }
      renderSheets();
      break;
    }
    case 'ex-save': {
      const d = top.draft;
      d.name = $('#exf-name').value.trim();
      if (!d.name) { toast('Ponle un nombre al ejercicio.'); break; }
      if (!d.primary.length) { toast('Elige al menos un músculo principal.'); break; }
      S.exercises[d.id] = { id: d.id, name: d.name, primary: d.primary, secondary: d.secondary, builtin: !!EXERCISES_BY_ID[d.id] };
      saveExercises();
      toast('Ejercicio guardado');
      if (top.then) addExerciseTo(top.then, d.id);
      else popSheet();
      break;
    }
    case 'ex-reset': delete S.exercises[top.draft.id]; saveExercises(); popSheet(); toast('Músculos restablecidos'); break;
    case 'ex-del': {
      const id = top.draft.id;
      pushSheet({ type: 'confirm', title: 'Borrar ejercicio', text: `¿Borrar «${top.draft.name}»? Los entrenamientos donde aparece lo conservan con su nombre, pero ya no contará para el volumen por músculo.`, ok: 'Borrar', danger: true,
        onOk: () => { delete S.exercises[id]; saveExercises(); closeSheets(); toast('Ejercicio borrado'); } });
      break;
    }
    case 'routine-new': pushSheet({ type: 'routine', isNew: true, draft: { id: uid(), name: '', items: [] } }); break;
    case 'routine-open': { const r = S.routines[el.dataset.id]; if (r) pushSheet({ type: 'routine', isNew: false, draft: structuredClone(r) }); break; }
    case 'rt-add': pushSheet({ type: 'ex-picker', mode: 'routine', target: top, q: '', muscle: '' }); break;
    case 'rt-del-item': top.draft.items.splice(Number(el.dataset.idx), 1); renderSheets(); break;
    case 'rt-save': if (saveRoutineDraft(top)) { popSheet(); toast('Rutina guardada'); } break;
    case 'rt-start': {
      if (!saveRoutineDraft(top)) break;
      const w = newWorkout(S.routines[top.draft.id]);
      S.sheets = [];
      S.ui.tab = 'entreno';
      pushSheet({ type: 'workout', id: w.id });
      render();
      break;
    }
    case 'rt-delete': {
      const id = top.draft.id;
      pushSheet({ type: 'confirm', title: 'Borrar rutina', text: `¿Borrar la rutina «${top.draft.name}»? Los entrenamientos que ya hiciste no se tocan.`, ok: 'Borrar', danger: true,
        onOk: () => { delete S.routines[id]; saveRoutines(); closeSheets(); toast('Rutina borrada'); } });
      break;
    }
    case 'import': $('#import-file').click(); break;
    case 'wipe':
      pushSheet({ type: 'confirm', title: 'Borrar todos los datos', text: 'Se borrarán el diario, el peso, los pasos, los entrenamientos, tus alimentos, recetas y rutinas de este teléfono. Si no tienes una copia, no se podrán recuperar.', ok: 'Borrar todo', danger: true,
        onOk: async () => {
          pending.forEach((p) => clearTimeout(p.t));
          pending.clear();
          await store.clearAll();
          await loadState();
          render();
          toast('Datos borrados');
        } });
      break;
    default: break;
  }
});

document.addEventListener('input', (ev) => {
  const el = ev.target;
  const kind = el.dataset.input;
  if (!kind) return;
  const top = S.sheets[S.sheets.length - 1];
  if (kind === 'libq') { S.ui.libQ = el.value; fillLibList(); }
  else if (kind === 'pickq') { top.q = el.value; fillPickList(top); const off = $('#off-list'); if (off) off.innerHTML = ''; }
  else if (kind === 'qty') { top.qty = num(el.value); updateQtyPreview(top); }
  else if (kind === 'rname') top.draft.name = el.value;
  else if (kind === 'rserv') { top.draft.servings = num(el.value); updateRecipeTotals(top); }
  else if (kind === 'rcooked') { top.draft.cookedG = num(el.value); updateRecipeTotals(top); }
  else if (kind === 'rgrams') { top.draft.items[Number(el.dataset.idx)].g = num(el.value) || 0; updateRecipeTotals(top); }
  else if (kind === 'set-kg' || kind === 'set-reps') {
    const w = S.workouts[top.id];
    const st = w?.exercises[Number(el.dataset.i)]?.sets[Number(el.dataset.j)];
    if (!st) return;
    const v = num(el.value);
    if (kind === 'set-kg') st.kg = v; else st.reps = v == null ? null : Math.round(v);
    saveWorkout(w.id);
  }
  else if (kind === 'wk-name') { const w = S.workouts[top.id]; if (w) { w.name = el.value; saveWorkout(w.id); } }
  else if (kind === 'ex-q') { top.q = el.value; fillExList(top); }
  else if (kind === 'exf-name') top.draft.name = el.value;
  else if (kind === 'rt-name') top.draft.name = el.value;
  else if (kind === 'rt-sets') top.draft.items[Number(el.dataset.idx)].sets = num(el.value) || 1;
});

document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.id === 'import-file') {
    const f = el.files?.[0];
    el.value = '';
    if (f) importFile(f);
    return;
  }
  const kind = el.dataset.change;
  if (kind === 'wk-date') {
    const top = S.sheets[S.sheets.length - 1];
    const w = S.workouts[top?.id];
    if (w && el.value) { w.date = el.value; saveWorkout(w.id); renderSheets(); }
    return;
  }
  if (kind === 'steps') {
    const v = num(el.value);
    const day = ensureDay(S.ui.date);
    day.steps = v == null ? null : Math.round(v);
    saveDay(S.ui.date);
    toast(v == null ? 'Pasos borrados' : 'Pasos guardados');
  } else if (kind === 'weight') {
    const v = num(el.value);
    if (v == null) delete S.weights[S.ui.date];
    else if (v < 20 || v > 400) { toast('Ese peso no parece correcto.'); return; }
    else S.weights[S.ui.date] = v;
    saveWeights();
    toast(v == null ? 'Peso borrado' : 'Peso guardado');
  }
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && ev.target.matches('[data-change]')) ev.target.blur();
  if (ev.key === 'Escape' && S.sheets.length) popSheet();
});

document.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const form = ev.target.dataset.form;
  if (form === 'weight') {
    const d = $('#wf-date').value || today();
    const v = num($('#wf-kg').value);
    if (v == null || v < 20 || v > 400) { toast('Escribe un peso válido en kg.'); return; }
    S.weights[d] = v;
    saveWeights();
    render();
    toast('Peso guardado');
  } else if (form === 'goals') {
    const g = S.settings.goals;
    g.kcal = num($('#g-kcal').value);
    g.p = num($('#g-p').value);
    g.c = num($('#g-c').value);
    g.f = num($('#g-f').value);
    g.steps = num($('#g-steps').value);
    saveSettings();
    const fromMacros = (g.p || 0) * 4 + (g.c || 0) * 4 + (g.f || 0) * 9;
    toast('Objetivos guardados');
    const chk = $('#goal-check');
    if (chk && g.kcal && fromMacros) chk.textContent = `Tus macros suman ${fmt(fromMacros)} kcal${Math.abs(fromMacros - g.kcal) > 60 ? `, ${fromMacros > g.kcal ? 'más' : 'menos'} que tu objetivo de ${fmt(g.kcal)}` : ', en línea con tu objetivo'}.`;
  } else if (form === 'manual-code') {
    const code = $('#code-in').value.replace(/\D/g, '');
    if (code.length < 8) { toast('El código tiene 8 o 13 cifras.'); return; }
    const top = S.sheets[S.sheets.length - 1];
    stopScanner();
    handleCode(code, top);
  }
});

let resizeT;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => { if (S.ui.tab === 'progreso') drawCharts(); }, 150);
});

// Al volver a la app otro día, el diario salta a la fecha nueva
let lastToday = today();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && today() !== lastToday) {
    if (S.ui.date === lastToday) S.ui.date = today();
    lastToday = today();
    if (!S.sheets.length) render();
  }
});

/* ---------- arranque ---------- */

async function boot() {
  try {
    await loadState();
  } catch (e) {
    $('#view').innerHTML = '<div class="notice"><p>No se pueden leer los datos guardados en este navegador. Si estás en navegación privada, ábrela en una pestaña normal.</p></div>';
    return;
  }
  render();
  store.askPersist();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
boot();
