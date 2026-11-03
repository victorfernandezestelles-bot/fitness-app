import { BASICS, BASICS_BY_ID, KEYS, MACROS, MICROS, kcalFrom, mult, sumNut } from './nutrients.js';
import { offProduct, offSearch } from './off.js';
import { checksumOk, decodeGray, imageDataToGray } from './barcode.js';
import { $, addDays, cap, dateLong, dayLabel, esc, fmt, inputVal, iso, norm, num, plural, today, uid } from './util.js';
import { MEALS, MEAL_NAME, S, saveDay, saveFoods, saveRecipes, saveSettings, saveWeights } from './state.js';
import { allFoods, dayMarks, dayOf, defaultQty, defaultUnit, ensureDay, favItems, favKey, getFood, goalsFor, guessMeal, hasTrainGoals, isFav, isTrainDay, itemName, needsBackup, nutFor, parseUnit, pluralEs, qtyLabel, recentItems, recipeTotals, unitCode } from './derived.js';
import { ACTIONS, CHANGES, FORMS, HOOKS, INPUTS, SHEETS, VIEWS, closeSheets, pageList, popSheet, popTo, pushSheet, render, renderSheets, replaceTop, setTab, toast, undoable } from './ui.js';
import { isLoggedIn, rpc } from './sync.js';
import { accessState, coachNotice, errorText, linkNotice } from './account.js';

/* ---------- vista: Hoy ---------- */

export function bar(value, goal, cls) {
  if (!goal) return '';
  const pct = Math.min(100, (value / goal) * 100);
  return `<div class="meter ${cls}" role="presentation"><span style="width:${pct.toFixed(1)}%"></span></div>`;
}

export function viewHoy() {
  const date = S.ui.date;
  const day = dayOf(date);
  const { tot, have, count } = sumNut(day.entries.map((e) => e.n));
  const g = goalsFor(date);
  const kcal = tot.kcal || 0;
  const train = isTrainDay(date);
  const hasGoals = g.kcal != null;
  const weight = S.weights[date];
  const backupDue = needsBackup();

  const macroCell = (k, label, cls) => `
    <div class="macro ${cls}">
      <span class="macro-name"><i class="dot"></i>${label}</span>
      <span class="macro-val"><b>${fmt(tot[k], 0)}</b>${g[k] ? `<small> / ${fmt(g[k])} g</small>` : '<small> g</small>'}</span>
      ${bar(tot[k] || 0, g[k], cls)}
    </div>`;

  const filled = MEALS.filter(([key]) => day.entries.some((e) => e.meal === key));
  const empty = MEALS.filter(([key]) => !day.entries.some((e) => e.meal === key));
  const meals = filled.map(([key, label]) => {
    const list = day.entries.filter((e) => e.meal === key);
    const mk = list.reduce((a, e) => a + (e.n.kcal || 0), 0);
    return `
    <section class="meal">
      <div class="meal-head">
        <h2>${label}</h2>
        <span class="meal-kcal">${fmt(mk)} kcal</span>
        <button class="btn-add" type="button" data-act="add" data-meal="${key}" aria-label="Añadir a ${label}">+ Añadir</button>
      </div>
      <ul class="entries">${list.map((e) => `
        <li><button class="entry" type="button" data-act="edit-entry" data-id="${e.id}">
          <span class="e-name">${esc(e.name)}</span>
          <span class="e-kcal">${fmt(e.n.kcal)}</span>
          <span class="e-sub">${qtyLabel(e.qty, e.unit)} · P ${fmt(e.n.p, 0)} · H ${fmt(e.n.c, 0)} · G ${fmt(e.n.f, 0)}</span>
        </button></li>`).join('')}</ul>
    </section>`;
  }).join('') + (empty.length ? `
    <section class="meal-empty" aria-label="Comidas sin apuntar">
      <span class="eyebrow">${filled.length ? 'Sin apuntar' : 'Aún no has apuntado nada'}</span>
      <div class="chips">${empty.map(([key, label]) => `<button type="button" class="chip" data-act="add" data-meal="${key}" aria-label="Añadir a ${label}">+ ${label}</button>`).join('')}</div>
    </section>` : '');
  const fabMeal = date === today() ? guessMeal() : (empty[0]?.[0] || 'comida');

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
    <button class="topbar-title" type="button" data-act="calendar" aria-label="${dayLabel(date)}, ${dateLong(date)}. Abrir el calendario">${dayLabel(date)}<small>${norm(dayLabel(date)) === norm(dateLong(date)) ? 'Calendario' : dateLong(date)} <span aria-hidden="true">▾</span></small></button>
    <button class="icon-btn" type="button" data-act="day-next" aria-label="Día siguiente">›</button>
  </header>

  ${date !== today() ? '<div class="back-today"><button type="button" class="btn ghost small" data-act="day-today">Volver a hoy</button></div>' : ''}

  ${linkNotice()}
  ${coachNotice()}

  ${backupDue ? `<div class="notice"><p>Hace más de una semana que no guardas una copia de tus datos.</p><button type="button" class="btn small" data-act="export-json">Guardar copia</button></div>` : ''}

  ${hasTrainGoals() ? `<div class="day-type">
      <span><b>${train ? 'Día de entreno' : 'Día de descanso'}</b> · objetivos de ${train ? 'entreno' : 'descanso'}</span>
      <button type="button" class="btn ghost small" data-act="day-type">Cambiar a ${train ? 'descanso' : 'entreno'}</button>
    </div>` : ''}

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
    <label class="quick-field">
      <span>Sueño</span>
      <input id="sleep-in" type="text" inputmode="decimal" enterkeyhint="done" placeholder="h" value="${inputVal(day.sleep, 2)}" data-change="sleep">
      <small>h</small>
    </label>
  </section>

  ${meals}

  <button type="button" class="btn ghost wide top-gap" data-act="copy-open" data-mode="day">Copiar las comidas de otro día…</button>
  <button type="button" class="fab" data-act="add" data-meal="${fabMeal}" aria-label="Añadir a ${MEAL_NAME[fabMeal]}">+ Añadir <small>${MEAL_NAME[fabMeal]}</small></button>

  <details class="detail">
    <summary>Información nutricional completa</summary>
    <div class="table-wrap">
      <table class="nut-table">
        <thead><tr><th scope="col">Nutriente</th><th scope="col">Total</th><th scope="col">% VRN</th></tr></thead>
        <tbody>${detailRows}</tbody>
      </table>
    </div>
    <p class="hint">% VRN: porcentaje del valor de referencia de nutrientes de la UE para un adulto.${anyPartial ? ' * Algún alimento de hoy no tiene ese dato, así que el total real es mayor.' : ''}</p>
  </details>
  <div class="fab-space"></div>`;
}

/* ---------- vista: Alimentos ---------- */

export function viewAlimentos() {
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

export function fillLibList() {
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
  const pl = pageList('lib-' + lib + '-' + q, list, 40, (f) => foodRow(f, 'open-food'));
  el.innerHTML = `<ul class="list">${pl.html}</ul>${pl.more}
    ${lib === 'basicos' ? '<p class="hint">Valores medios orientativos por 100 g. Para un producto concreto, mejor escanear su etiqueta.</p>' : ''}`;
}

export function foodRow(f, act, extra = '') {
  const p = f.per100 || {};
  return `<li><button type="button" class="row" data-act="${act}" data-type="food" data-id="${esc(f.id)}" ${extra}>
    <span class="row-main">${esc(f.name)}</span>
    <span class="row-sub">${f.brand ? esc(f.brand) + ' · ' : ''}P ${fmt(p.p, 1)} · H ${fmt(p.c, 1)} · G ${fmt(p.f, 1)}</span>
    <span class="row-side">${fmt(p.kcal)} <small>kcal/100 g</small></span>
  </button></li>`;
}

/* Calendario de cumplimiento */
SHEETS.calendar = {
  title: () => 'Calendario',
  render: (s) => {
    const [y, m] = s.month.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const lead = (first.getDay() + 6) % 7;
    const nDays = new Date(y, m, 0).getDate();
    const t = today();
    const mn = first.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    const monthName = mn.charAt(0).toUpperCase() + mn.slice(1);
    const hasK = S.settings.goals.kcal != null;
    const hasS = S.settings.goals.steps != null;
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<span class="cal-cell pad"></span>';
    const count = { kcal: 0, steps: 0, train: 0 };
    for (let dnum = 1; dnum <= nDays; dnum++) {
      const d = `${s.month}-${String(dnum).padStart(2, '0')}`;
      const future = d > t;
      const mk = future ? {} : dayMarks(d);
      for (const k of Object.keys(count)) if (mk[k]) count[k]++;
      const label = [dateLong(d), mk.kcal && 'calorías en objetivo', mk.steps && 'pasos cumplidos', mk.train && 'entrenado'].filter(Boolean).join(', ');
      cells += `<button type="button" class="cal-cell${d === t ? ' today' : ''}${d === S.ui.date ? ' sel' : ''}${future ? ' future' : ''}" data-act="cal-day" data-d="${d}" aria-label="${label}" ${future ? 'disabled' : ''}>
        <span class="cal-n">${dnum}</span>
        <span class="cal-dots" aria-hidden="true">${mk.kcal ? '<i class="d-kcal"></i>' : ''}${mk.steps ? '<i class="d-steps"></i>' : ''}${mk.train ? '<i class="d-train"></i>' : ''}</span>
      </button>`;
    }
    const nextOff = s.month >= t.slice(0, 7);
    return `
      <div class="cal-nav">
        <button type="button" class="icon-btn" data-act="cal-month" data-d="-1" aria-label="Mes anterior">‹</button>
        <h3 class="cal-title">${monthName}</h3>
        <button type="button" class="icon-btn" data-act="cal-month" data-d="1" aria-label="Mes siguiente" ${nextOff ? 'disabled' : ''}>›</button>
      </div>
      <div class="cal-grid" role="grid">
        ${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => `<span class="cal-wd" aria-hidden="true">${d}</span>`).join('')}
        ${cells}
      </div>
      <ul class="cal-legend">
        <li><i class="d-kcal"></i> Calorías a ±10 % del objetivo <b>${hasK ? plural(count.kcal, 'día', 'días') : '–'}</b></li>
        <li><i class="d-steps"></i> Pasos cumplidos <b>${hasS ? plural(count.steps, 'día', 'días') : '–'}</b></li>
        <li><i class="d-train"></i> Entrenamiento (fuerza o cardio) <b>${plural(count.train, 'día', 'días')}</b></li>
      </ul>
      ${!hasK || !hasS ? `<p class="hint">${!hasK && !hasS ? 'Pon objetivos de calorías y pasos' : !hasK ? 'Pon un objetivo de calorías' : 'Pon un objetivo de pasos'} en Ajustes para ver esos puntos.</p>` : ''}
      <div class="sheet-actions"><button type="button" class="btn ghost" data-act="cal-today">Ir a hoy</button></div>`;
  },
};

/* Selector de alimentos (para el diario o para una receta) */
SHEETS.picker = {
  title: (s) => (s.mode === 'recipe' ? 'Añadir ingrediente' : `Añadir a ${MEAL_NAME[s.meal]}`),
  render: (s) => `
    <div class="pick-tools">
      <input id="pick-q" type="search" placeholder="Busca un alimento${s.mode === 'diary' ? ' o receta' : ''}" value="${esc(s.q || '')}" autocomplete="off" data-input="pickq">
      <div class="btn-row">
        <button type="button" class="btn" data-act="scan">Escanear código</button>
        ${s.mode === 'diary' ? '<button type="button" class="btn ghost" data-act="quick-new">Macros a mano</button>' : ''}
        <button type="button" class="btn ghost" data-act="pick-new-food">Crear alimento</button>
      </div>
      ${s.mode === 'diary' ? repeatBlock(s) : ''}
    </div>
    <div id="pick-list"></div>
    <div id="off-list"></div>`,
  mount: (s) => { fillPickList(s); },
};

export function fillPickList(s) {
  const el = $('#pick-list');
  if (!el) return;
  const q = norm(s.q || '');
  let html = '';
  if (!q && s.mode === 'diary') {
    const favs = favItems();
    if (favs.length) {
      html += `<h3 class="list-title">Favoritos</h3><ul class="list">${favs.map((r) => {
        const n = nutFor(r, r.qty ?? defaultQty(r), r.unit ?? defaultUnit(r));
        return `<li><button type="button" class="row" data-act="pick" data-type="${r.type}" data-id="${esc(r.id)}" ${r.qty != null ? `data-qty="${r.qty}" data-unit="${r.unit}"` : ''}>
          <span class="row-main"><span class="star" aria-hidden="true">★</span> ${esc(itemName(r))}</span>
          <span class="row-sub">${r.qty != null ? qtyLabel(r.qty, r.unit) + ' la última vez' : (r.type === 'recipe' ? 'Receta' : 'Alimento')}</span>
          <span class="row-side">${fmt(n?.kcal)} <small>kcal</small></span>
        </button></li>`;
      }).join('')}</ul>`;
    }
    const rec = recentItems();
    s.recent = rec;
    if (rec.length) {
      html += `<h3 class="list-title">Recientes</h3><ul class="list">${rec.map((r, idx) => {
        if (r.type === 'quick') {
          return `<li><button type="button" class="row" data-act="pick-quick" data-idx="${idx}">
          <span class="row-main">${esc(r.name)}</span>
          <span class="row-sub">A mano · P ${fmt(r.n.p, 0)} · H ${fmt(r.n.c, 0)} · G ${fmt(r.n.f, 0)}</span>
          <span class="row-side">${fmt(r.n.kcal)} <small>kcal</small></span>
        </button></li>`;
        }
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
export async function runOffSearch(s) {
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

export function ctxThen(ctx) {
  return ctx.mode === 'recipe' ? { mode: 'recipe', recipeSheet: ctx.recipeSheet } : { mode: 'diary', meal: ctx.meal, date: ctx.date };
}

// El usuario ha elegido un alimento o receta desde un selector
export function choose(item, then, opts = {}) {
  if (then && then.mode === 'recipe') {
    const f = getFood(item.id);
    // Un plan del día (plantilla del entrenador) también guarda en qué comida va
    const meal = then.recipeSheet.addMeal;
    then.recipeSheet.draft.items.push({ foodId: item.id, g: f?.servingG || 100, ...(meal ? { meal } : {}) });
    popTo(then.recipeSheet);
    return;
  }
  if (!then) { popSheet(); return; }
  const q = { type: 'qty', item, meal: then.meal, date: then.date, qty: opts.qty, unit: opts.unit };
  if (opts.replace) replaceTop(q); else pushSheet(q);
}

/* Repetir y copiar comidas */
export function repeatBlock(s) {
  const prev = addDays(s.date, -1);
  const list = dayOf(prev).entries.filter((e) => e.meal === s.meal);
  const kcal = list.reduce((a, e) => a + (e.n.kcal || 0), 0);
  const meal = MEAL_NAME[s.meal].toLowerCase();
  return `<div class="repeat">
    ${list.length ? `<button type="button" class="repeat-btn" data-act="copy-yesterday">
        <b>Repetir ${meal} de ayer</b>
        <span>${list.map((e) => esc(e.name)).join(', ')} · ${fmt(kcal)} kcal</span>
      </button>` : ''}
    <button type="button" class="link" data-act="copy-open" data-mode="meal">Copiar ${meal} de otro día…</button>
  </div>`;
}

export function copyEntries(from, to, meal) {
  const src = dayOf(from).entries.filter((e) => !meal || e.meal === meal);
  if (!src.length) return 0;
  const day = ensureDay(to);
  for (const e of src) day.entries.push({ ...structuredClone(e), id: uid() });
  saveDay(to);
  return src.length;
}

SHEETS.copy = {
  title: (s) => (s.mode === 'day' ? 'Copiar comidas de otro día' : `Copiar ${MEAL_NAME[s.meal].toLowerCase()}`),
  render: (s) => {
    if (!s.from) s.from = addDays(s.date, -1);
    const src = dayOf(s.from).entries.filter((e) => s.mode === 'day' || e.meal === s.meal);
    const kcal = src.reduce((a, e) => a + (e.n.kcal || 0), 0);
    const groups = MEALS.map(([k, l]) => {
      const list = src.filter((e) => e.meal === k);
      if (!list.length) return '';
      return `<h3 class="list-title">${l}</h3><ul class="list">${list.map((e) => `<li class="row static">
        <span class="row-main">${esc(e.name)}</span><span class="row-side">${fmt(e.n.kcal)} <small>kcal</small></span><span></span>
        <span class="row-sub">${qtyLabel(e.qty, e.unit)}</span></li>`).join('')}</ul>`;
    }).join('');
    return `
      <label class="field"><span>Copiar desde el día</span><input id="copy-from" type="date" value="${s.from}" max="${today()}" data-change="copy-from"></label>
      ${src.length ? groups : `<p class="empty">El ${dateLong(s.from)} no tiene nada apuntado${s.mode === 'day' ? '' : ` en ${MEAL_NAME[s.meal].toLowerCase()}`}.</p>`}
      <div class="sheet-actions">
        <button type="button" class="btn primary" data-act="copy-run" ${src.length ? '' : 'disabled'}>Copiar ${src.length} ${src.length === 1 ? 'alimento' : 'alimentos'} (${fmt(kcal)} kcal) a ${dayLabel(s.date).toLowerCase()}</button>
      </div>`;
  },
};

/* Macros a mano */
SHEETS.quick = {
  title: (s) => (s.entryId ? 'Editar macros a mano' : 'Macros a mano'),
  render: (s) => {
    const d = s.draft;
    const f = (id, label, v, unit) => `<label class="nut-field"><span>${label}</span><span class="input-unit"><input id="${id}" type="text" inputmode="decimal" value="${inputVal(v, 1)}" placeholder="–"><em>${unit}</em></span></label>`;
    const meal = s.meal || 'comida';
    return `
      <p class="sheet-sub">Para platos que no puedes pesar, como la comida del comedor. Si dejas vacías las calorías, se calculan con los macros.</p>
      <label class="field"><span>Nombre</span><input id="q-name" type="text" value="${esc(d.name || '')}" placeholder="p. ej. Comedor: lentejas y pollo" autocomplete="off"></label>
      <div class="nut-box">
        ${f('q-kcal', 'Calorías', d.kcal, 'kcal')}
        ${f('q-p', 'Proteínas', d.p, 'g')}
        ${f('q-c', 'Hidratos', d.c, 'g')}
        ${f('q-f', 'Grasas', d.f, 'g')}
        ${f('q-fi', 'Fibra (opcional)', d.fi, 'g')}
      </div>
      <div class="field top-gap"><span>Comida</span>
        <div class="chips">${MEALS.map(([k, l]) => `<button type="button" class="chip${k === meal ? ' on' : ''}" data-act="qty-meal" data-meal="${k}" aria-pressed="${k === meal}">${l}</button>`).join('')}</div>
      </div>
      <div class="sheet-actions">
        ${s.entryId ? '<button type="button" class="btn danger ghost" data-act="entry-del">Quitar</button>' : ''}
        <button type="button" class="btn primary" data-act="quick-save">${s.entryId ? 'Guardar' : 'Añadir'}</button>
      </div>`;
  },
};

export function saveQuick(s) {
  const n = {};
  for (const k of KEYS) n[k] = null;
  n.p = num($('#q-p').value);
  n.c = num($('#q-c').value);
  n.f = num($('#q-f').value);
  n.fi = num($('#q-fi').value);
  n.kcal = num($('#q-kcal').value);
  if (n.kcal == null && (n.p != null || n.c != null || n.f != null)) n.kcal = kcalFrom(n);
  if (n.kcal == null) { toast('Pon las calorías o al menos un macro.'); return; }
  const name = $('#q-name').value.trim() || 'Comida a mano';
  const day = ensureDay(s.date);
  const entry = { id: s.entryId || uid(), meal: s.meal || 'comida', type: 'quick', ref: null, name, qty: 1, unit: 'ud', n };
  if (s.entryId) {
    const i = day.entries.findIndex((e) => e.id === s.entryId);
    if (i >= 0) day.entries[i] = entry;
  } else day.entries.push(entry);
  saveDay(s.date);
  S.ui.tab = 'hoy';
  S.ui.date = s.date;
  closeSheets();
  toast(s.entryId ? 'Guardado' : `Añadido a ${MEAL_NAME[entry.meal]}`);
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
      const own = f?.unitG ? unitCode(f.unitG, f.unitName || 'unidad') : null;
      if (unit !== 'g' && !parseUnit(unit)) unit = own || 'g';
      const pu = parseUnit(unit);
      if (qty == null) qty = pu ? 1 : f?.servingG || 100;
      chips = pu ? [0.5, 1, 2, 3, 4] : [...new Set([f?.servingG, 50, 100, 150, 200].filter(Boolean))];
      const uCode = pu ? unit : own;
      if (uCode) {
        const un = parseUnit(uCode);
        unitToggle = `<div class="segmented small" role="tablist">
          <button type="button" role="tab" aria-selected="${!pu}" data-act="qty-unit" data-unit="g">Gramos</button>
          <button type="button" role="tab" aria-selected="${!!pu}" data-act="qty-unit" data-unit="${esc(uCode)}">${esc(cap(pluralEs(un.n, 2)))} (${fmt(un.g)} g)</button>
        </div>`;
      }
      base = f ? `${fmt(f.per100.kcal)} kcal · P ${fmt(f.per100.p, 1)} · H ${fmt(f.per100.c, 1)} · G ${fmt(f.per100.f, 1)} por 100 g${f.unitG ? ` · 1 ${esc(f.unitName || 'unidad')} = ${fmt(f.unitG)} g` : f.servingG ? ` · ración ${fmt(f.servingG)} g` : ''}` : '';
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
      <button type="button" class="fav-btn${isFav(it.type, it.id) ? ' on' : ''}" data-act="fav" aria-pressed="${isFav(it.type, it.id)}">${isFav(it.type, it.id) ? '★ En favoritos' : '☆ Añadir a favoritos'}</button>
      ${unitToggle}
      <div class="qty-row">
        <input id="qty-in" type="text" inputmode="decimal" value="${inputVal(qty, 2)}" data-input="qty" aria-label="Cantidad">
        <span class="qty-unit">${unit === 'rac' ? 'raciones' : parseUnit(unit) ? esc(pluralEs(parseUnit(unit).n, 2)) : 'g'}</span>
      </div>
      <div class="chips">${chips.map((c) => `<button type="button" class="chip" data-act="qty-chip" data-v="${c}">${c === 0.5 && parseUnit(unit) ? '½' : fmt(c, 2)}${unit === 'g' ? ' g' : ''}</button>`).join('')}</div>
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

export function qtyNut(s) {
  const n = nutFor(s.item, s.qty || 0, s.unit);
  if (n) return n;
  // Si el alimento o la receta ya no existen, se recalcula a partir de la entrada guardada
  if (s.entryId) {
    const e = dayOf(s.date).entries.find((x) => x.id === s.entryId);
    if (e && e.qty) return mult(e.n, (s.qty || 0) / e.qty);
  }
  return null;
}

export function updateQtyPreview(s) {
  const el = $('#qty-prev');
  if (!el) return;
  const n = qtyNut(s);
  if (!n) { el.innerHTML = '<p class="muted">No hay datos para calcular.</p>'; return; }
  const pu = parseUnit(s.unit);
  el.innerHTML = `
    <div class="prev-kcal"><b>${fmt(n.kcal)}</b> kcal${pu ? `<small> · ${fmt((s.qty || 0) * pu.g)} g</small>` : ''}</div>
    <div class="prev-macros">
      <span class="m-p"><i class="dot"></i>P <b>${fmt(n.p, 1)}</b> g</span>
      <span class="m-c"><i class="dot"></i>H <b>${fmt(n.c, 1)}</b> g</span>
      <span class="m-f"><i class="dot"></i>G <b>${fmt(n.f, 1)}</b> g</span>
    </div>`;
}

export function saveQty(s) {
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
  keep: true,
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
export async function startScanner(sheet) {
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

export function stopScanner() {
  if (!scan) return;
  scan.stopped = true;
  clearTimeout(scan.timer);
  if (scan.stream) scan.stream.getTracks().forEach((t) => t.stop());
  scan = null;
}

export async function handleCode(code, scannerSheet) {
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
    return;
  }
  // Base de alimentos de la app: productos que Open Food Facts no tiene y que ha añadido otro usuario
  if (status) status.textContent = `Código ${code}. Buscando en la base de la app…`;
  const shared = offline ? null : await sharedFood(code);
  if (S.sheets[S.sheets.length - 1] !== scannerSheet) return;
  if (shared) {
    replaceTop({ type: 'food', draft: { name: shared.name, brand: shared.brand, barcode: code, servingG: shared.serving_g, unitName: shared.unit_name || undefined, unitG: shared.unit_g || undefined, per100: shared.per100, id: null, source: 'comunidad' },
      then, shared: { code, mine: shared.mine }, shareOffer: shared.mine,
      note: 'Datos que ha añadido otro usuario de la app (este producto no está en Open Food Facts). Compáralos con la etiqueta antes de guardar.' });
  } else if (p) {
    // Nombre y marca vienen de Open Food Facts: no se ofrecen para la base de la app (licencia ODbL)
    replaceTop({ type: 'food', draft: { name: p.name, brand: p.brand, barcode: code, servingG: p.servingG, per100: {}, id: null, source: 'etiqueta' }, then, note: 'Open Food Facts conoce el producto pero no sus valores. Cópialos de la etiqueta (por 100 g).' });
  } else {
    replaceTop({ type: 'food', draft: { name: '', barcode: code, per100: {}, id: null, source: 'etiqueta' }, then, shareOffer: !offline && canShareFoods(),
      note: offline ? 'Sin conexión para consultar Open Food Facts. Puedes copiar los valores de la etiqueta (por 100 g).' : 'Este código no está en Open Food Facts. Copia los valores de la etiqueta (por 100 g) y quedará guardado para la próxima vez.' });
  }
}

const canShareFoods = () => isLoggedIn() && accessState() === 'active';
async function sharedFood(code) {
  if (!canShareFoods()) return null;
  try { return await rpc('shared_food_get', { p_code: code }); } catch (e) { return null; }
}
async function shareFood(f) {
  try {
    const r = await rpc('shared_food_put', { p_code: f.barcode, p_name: f.name, p_brand: f.brand || '', p_per100: f.per100, p_serving_g: f.servingG ?? null, p_unit_name: f.unitName ?? null, p_unit_g: f.unitG ?? null });
    if (r === 'created') toast('Gracias: el producto queda disponible para los demás usuarios');
    else if (r === 'updated') toast('Producto actualizado en la base de la app');
  } catch (e) { toast('No se ha podido compartir el producto: ' + errorText(e)); }
}

SHEETS['food-report'] = {
  title: () => 'Avisar de un error',
  render: (s) => `
    <p class="muted">Cuéntanos qué no coincide con la etiqueta. El equipo de la app lo revisará.</p>
    <label class="field top-gap"><span>Qué está mal</span><textarea id="fr-msg" rows="3" maxlength="500" placeholder="p. ej. La etiqueta dice 250 kcal, no 300">${esc(s.msg || '')}</textarea></label>
    <div class="sheet-actions"><button type="button" class="btn primary" data-act="food-report-send">Enviar aviso</button></div>`,
};

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
      <div class="form-grid">
        <label class="field"><span>Unidad (opcional)</span><input id="ff-uname" type="text" value="${esc(d.unitName || '')}" placeholder="p. ej. huevo" autocomplete="off" autocapitalize="off"></label>
        <label class="field"><span>Peso de una</span><span class="input-unit"><input id="ff-ug" type="text" inputmode="decimal" value="${inputVal(d.unitG, 0)}" placeholder="–"><em>g</em></span></label>
      </div>
      <p class="hint">Con una unidad podrás apuntar «2 huevos» en vez de gramos.</p>
      <label class="field"><span>Código de barras</span><input id="ff-code" type="text" inputmode="numeric" value="${esc(d.barcode || '')}" placeholder="Opcional" autocomplete="off"></label>
      ${s.shareOffer ? `<label class="check top-gap"><input type="checkbox" id="ff-share" checked> ${s.shared?.mine ? 'Actualizar también el producto en la base de la app' : 'Compartir este producto con los demás usuarios de la app'}</label>
        <p class="hint">Así quien escanee este código lo encontrará hecho. Se comparten el nombre, la marca y los valores, nunca quién lo ha añadido.</p>` : ''}
      ${s.shared && !s.shared.mine ? '<p class="hint top-gap"><button type="button" class="link" data-act="food-report">¿No coincide con la etiqueta? Avisar del error</button></p>' : ''}
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

export function readFoodForm(s) {
  const d = s.draft;
  const per100 = {};
  for (const n of [...MACROS, ...MICROS]) per100[n.k] = num($('#nf-' + n.k)?.value);
  if (per100.kcal == null && (per100.p != null || per100.c != null || per100.f != null)) per100.kcal = kcalFrom(per100);
  return {
    ...d,
    name: $('#ff-name').value.trim(),
    brand: $('#ff-brand').value.trim(),
    servingG: num($('#ff-serving').value),
    unitName: $('#ff-uname').value.trim().toLowerCase() || null,
    unitG: num($('#ff-ug').value),
    barcode: $('#ff-code').value.replace(/\D/g, ''),
    per100,
  };
}

export function saveFood(s) {
  const f = readFoodForm(s);
  if (!f.name) { toast('Ponle un nombre.'); $('#ff-name').focus(); return; }
  if (f.per100.kcal == null) { toast('Falta el valor energético o los macros.'); return; }
  if (f.barcode && !checksumOk(f.barcode) && f.barcode.length >= 8) toast('Ojo: el código de barras no parece válido.');
  if (f.unitG != null && f.unitG <= 0) f.unitG = null;
  if (f.unitG && !f.unitName) f.unitName = 'unidad';
  if (!f.unitG) { delete f.unitG; delete f.unitName; }
  // Un básico que no se ha tocado no se copia; si se modifica, se guarda como propio con el mismo id
  const basic = f.id ? BASICS_BY_ID[f.id] : null;
  const unchangedBasic = basic && !S.foods[f.id] && f.name === basic.name && !f.brand && !f.barcode
    && (f.servingG ?? null) === (basic.servingG ?? null)
    && (f.unitG ?? null) === (basic.unitG ?? null) && (f.unitName ?? null) === (basic.unitName ?? null)
    && KEYS.every((k) => (f.per100[k] ?? null) === (basic.per100[k] ?? null));
  if (s.shareOffer && $('#ff-share')?.checked && /^\d{8,14}$/.test(f.barcode || '')) shareFood(f);
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

export function updateRecipeTotals(s) {
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

export function saveRecipe(s) {
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

/* ---------- acciones ---------- */

Object.assign(ACTIONS, {
  'day-prev': async (el, top, act) => {
      S.ui.date = addDays(S.ui.date, -1); render();
  },
  'day-next': async (el, top, act) => {
      S.ui.date = addDays(S.ui.date, 1); render();
  },
  'day-today': async (el, top, act) => {
      S.ui.date = today(); render();
  },
  'calendar': () => pushSheet({ type: 'calendar', month: S.ui.date.slice(0, 7) }),
  'cal-month': (el, top) => {
    const [y, m] = top.month.split('-').map(Number);
    const d = new Date(y, m - 1 + Number(el.dataset.d), 1);
    top.month = iso(d).slice(0, 7);
    renderSheets();
  },
  'cal-day': (el) => { S.ui.date = el.dataset.d; closeSheets(); setTab('hoy'); },
  'cal-today': () => { S.ui.date = today(); closeSheets(); setTab('hoy'); },
  'fav': (el, top) => {
    const k = favKey(top.item.type, top.item.id);
    const favs = { ...(S.settings.favs || {}) };
    if (favs[k]) delete favs[k]; else favs[k] = true;
    S.settings.favs = favs;
    saveSettings();
    renderSheets();
  },
  'add': async (el, top, act) => {
      pushSheet({ type: 'picker', mode: 'diary', meal: el.dataset.meal, date: S.ui.date, q: '' });
  },
  'edit-entry': async (el, top, act) => {
      const e = dayOf(S.ui.date).entries.find((x) => x.id === el.dataset.id);
      if (e && e.type === 'quick') { pushSheet({ type: 'quick', meal: e.meal, date: S.ui.date, entryId: e.id, draft: { name: e.name, ...e.n } }); return; }
      if (e) pushSheet({ type: 'qty', item: { type: e.type, id: e.ref }, meal: e.meal, date: S.ui.date, qty: e.qty, unit: e.unit, entryId: e.id });
      return;
  },
  'pick': async (el, top, act) => {
      const item = { type: el.dataset.type, id: el.dataset.id };
      const opts = el.dataset.qty ? { qty: Number(el.dataset.qty), unit: el.dataset.unit } : {};
      choose(item, ctxThen(top), opts);
      return;
  },
  'quick-new': async (el, top, act) => {
      pushSheet({ type: 'quick', meal: top.meal, date: top.date, draft: { name: '' } });
  },
  'pick-quick': async (el, top, act) => {
      const r = top.recent?.[Number(el.dataset.idx)];
      if (r) pushSheet({ type: 'quick', meal: top.meal, date: top.date, draft: { name: r.name, ...r.n } });
      return;
  },
  'quick-save': async (el, top, act) => {
      saveQuick(top);
  },
  'copy-yesterday': async (el, top, act) => {
      const n = copyEntries(addDays(top.date, -1), top.date, top.meal);
      S.ui.tab = 'hoy'; S.ui.date = top.date;
      const meal = MEAL_NAME[top.meal];
      closeSheets();
      toast(`${meal}: ${n} ${n === 1 ? 'alimento copiado' : 'alimentos copiados'}`);
      return;
  },
  'copy-open': async (el, top, act) => {
      const mode = el.dataset.mode;
      if (mode === 'day') pushSheet({ type: 'copy', mode: 'day', date: S.ui.date });
      else pushSheet({ type: 'copy', mode: 'meal', meal: top.meal, date: top.date });
      return;
  },
  'copy-run': async (el, top, act) => {
      const n = copyEntries(top.from, top.date, top.mode === 'day' ? null : top.meal);
      S.ui.tab = 'hoy'; S.ui.date = top.date;
      closeSheets();
      toast(`${n} ${n === 1 ? 'alimento copiado' : 'alimentos copiados'}`);
      return;
  },
  'day-type': async (el, top, act) => {
      const d = ensureDay(S.ui.date);
      d.type = isTrainDay(S.ui.date) ? 'rest' : 'train';
      saveDay(S.ui.date);
      render();
      return;
  },
  'pick-new-food': async (el, top, act) => {
      pushSheet({ type: 'food', draft: { name: top.q || '', per100: {}, id: null, source: 'etiqueta' }, then: ctxThen(top) });
  },
  'off-search': async (el, top, act) => {
      runOffSearch(top);
  },
  'pick-off': async (el, top, act) => {
      const p = top.offResults?.[Number(el.dataset.idx)];
      if (!p) return;
      const local = p.barcode && allFoods().find((f) => f.barcode === p.barcode);
      if (local) choose({ type: 'food', id: local.id }, ctxThen(top));
      else pushSheet({ type: 'food', draft: { ...p, id: null, source: 'off' }, then: ctxThen(top), note: 'Datos de Open Food Facts. Compáralos con la etiqueta antes de guardar.' });
      return;
  },
  'scan': async (el, top, act) => {
      pushSheet({ type: 'scanner', ctx: top });
  },
  'scan-lib': async (el, top, act) => {
      pushSheet({ type: 'scanner', ctx: null });
  },
  'qty-chip': async (el, top, act) => {
      top.qty = Number(el.dataset.v);
      $('#qty-in').value = inputVal(top.qty, 2);
      updateQtyPreview(top);
      return;
  },
  'qty-unit': async (el, top) => {
      const to = el.dataset.unit;
      if (top.unit === to) return;
      // Entre gramos y unidades se convierte la cantidad (2 huevos → 120 g); en recetas se empieza de nuevo
      const from = parseUnit(top.unit), dest = parseUnit(to);
      if (top.item.type === 'food' && top.qty) {
        if (from && to === 'g') top.qty = Math.round(top.qty * from.g);
        else if (dest && top.unit === 'g') top.qty = Math.max(0.5, Math.round((top.qty / dest.g) * 2) / 2);
        else top.qty = null;
      } else top.qty = null;
      top.unit = to;
      renderSheets();
  },
  'qty-meal': async (el, top, act) => {
      top.meal = el.dataset.meal;
      el.parentElement.querySelectorAll('.chip').forEach((c) => { const on = c === el; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on); });
      return;
  },
  'qty-save': async (el, top, act) => {
      saveQty(top);
  },
  'entry-del': async (el, top) => {
      const date = top.date;
      const day = ensureDay(date);
      const idx = day.entries.findIndex((e) => e.id === top.entryId);
      if (idx < 0) { closeSheets(); return; }
      const old = day.entries[idx];
      S.ui.tab = 'hoy';
      S.ui.date = date;
      closeSheets();
      undoable(`«${old.name}» quitado`,
        () => { day.entries.splice(idx, 1); saveDay(date); render(); },
        () => { const d = ensureDay(date); d.entries.splice(Math.min(idx, d.entries.length), 0, old); saveDay(date); render(); });
  },
  'lib': async (el, top, act) => {
      S.ui.lib = el.dataset.lib; render();
  },
  'new-recipe': async (el, top, act) => {
      pushSheet({ type: 'recipe', isNew: true, draft: { id: uid(), name: '', servings: 1, cookedG: null, items: [] } });
  },
  'open-recipe': async (el, top, act) => {
      const r = S.recipes[el.dataset.id];
      if (r) pushSheet({ type: 'recipe', isNew: false, draft: structuredClone(r) });
      return;
  },
  'ing-add': async (el, top, act) => {
      pushSheet({ type: 'picker', mode: 'recipe', recipeSheet: top, q: '' });
  },
  'ing-del': async (el, top, act) => {
      top.draft.items.splice(Number(el.dataset.idx), 1); renderSheets();
  },
  'recipe-save': async (el, top, act) => {
      saveRecipe(top);
  },
  'recipe-del': async (el, top) => {
      const id = top.draft.id;
      const old = S.recipes[id];
      closeSheets();
      if (!old) return;
      undoable(`Receta «${old.name}» borrada`,
        () => { delete S.recipes[id]; saveRecipes(); render(); },
        () => { S.recipes[id] = old; saveRecipes(); render(); });
  },
  'new-food': async (el, top, act) => {
      pushSheet({ type: 'food', draft: { name: '', per100: {}, id: null, source: 'etiqueta' }, then: null });
  },
  'open-food': async (el, top, act) => {
      const f = getFood(el.dataset.id);
      if (f) pushSheet({ type: 'food', draft: structuredClone(f), then: null });
      return;
  },
  'food-report': (el, top) => pushSheet({ type: 'food-report', code: top.shared?.code }),
  'food-report-send': async (el, top) => {
    top.msg = $('#fr-msg').value;
    try {
      await rpc('shared_food_report', { p_code: top.code, p_reason: top.msg });
      popSheet();
      toast('Gracias por avisar');
    } catch (e) { toast(errorText(e)); }
  },
  'food-save': async (el, top, act) => {
      saveFood(top);
  },
  'food-del': async (el, top) => {
      const id = top.draft.id;
      const old = S.foods[id];
      closeSheets();
      undoable(`«${old.name}» borrado`,
        () => { delete S.foods[id]; saveFoods(); render(); },
        () => { S.foods[id] = old; saveFoods(); render(); });
  },
});

/* ---------- registro de vistas, escritura y formularios ---------- */

VIEWS.hoy = { html: viewHoy };
VIEWS.alimentos = { html: viewAlimentos, after: fillLibList };

// La cámara se apaga en cuanto la hoja del escáner deja de estar delante
HOOKS.sheetChange.push((top) => { if (!top || top.type !== 'scanner') stopScanner(); });

// Al volver a la app otro día, el diario salta a la fecha nueva
let lastToday = today();
HOOKS.visible.push(() => {
  if (today() === lastToday) return;
  if (S.ui.date === lastToday) S.ui.date = today();
  lastToday = today();
  if (!S.sheets.length) render();
});

Object.assign(INPUTS, {
  libq: (el) => { S.ui.libQ = el.value; fillLibList(); },
  pickq: (el, top) => { top.q = el.value; fillPickList(top); const off = $('#off-list'); if (off) off.innerHTML = ''; },
  qty: (el, top) => { top.qty = num(el.value); updateQtyPreview(top); },
  rname: (el, top) => { top.draft.name = el.value; },
  rserv: (el, top) => { top.draft.servings = num(el.value); updateRecipeTotals(top); },
  rcooked: (el, top) => { top.draft.cookedG = num(el.value); updateRecipeTotals(top); },
  rgrams: (el, top) => { top.draft.items[Number(el.dataset.idx)].g = num(el.value) || 0; updateRecipeTotals(top); },
});

Object.assign(CHANGES, {
  'copy-from': (el, top) => { if (top && el.value) { top.from = el.value; renderSheets(); } },
  steps: (el) => {
    const v = num(el.value);
    const day = ensureDay(S.ui.date);
    day.steps = v == null ? null : Math.round(v);
    saveDay(S.ui.date);
    toast(v == null ? 'Pasos borrados' : 'Pasos guardados');
  },
  sleep: (el) => {
    let v = num(el.value);
    if (v != null && (v < 0 || v > 24)) { toast('Pon las horas dormidas, de 0 a 24.'); return; }
    if (v != null) v = Math.round(v * 4) / 4;
    const day = ensureDay(S.ui.date);
    day.sleep = v;
    if (v == null) delete day.sleep;
    saveDay(S.ui.date);
    el.value = inputVal(v, 2);
    toast(v == null ? 'Sueño borrado' : 'Sueño guardado');
  },
  weight: (el) => {
    const v = num(el.value);
    if (v != null && (v < 20 || v > 400)) { toast('Ese peso no parece correcto.'); return; }
    if (v == null) delete S.weights[S.ui.date]; else S.weights[S.ui.date] = v;
    saveWeights();
    toast(v == null ? 'Peso borrado' : 'Peso guardado');
  },
});

FORMS['manual-code'] = (form, top) => {
  const code = $('#code-in').value.replace(/\D/g, '');
  if (code.length < 8) { toast('El código tiene 8 o 13 cifras.'); return; }
  stopScanner();
  handleCode(code, top);
};
