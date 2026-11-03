// Plantillas del entrenador (supabase/006-plantillas.sql): recetas y planes del día que prepara
// y comparte con sus clientes. El cliente puede guardar la receta en las suyas o apuntar el plan en su diario.
// Cada plantilla lleva dentro los alimentos propios que usa, para que el cliente los tenga aunque no existan en su app.
import { BASICS_BY_ID, mult, scale, sumNut } from './nutrients.js';
import { $, dateShort, esc, fmt, inputVal, num, plural, today, uid } from './util.js';
import { GUARD, MEALS, MEAL_NAME, S, saveDay, saveFoods, saveRecipes } from './state.js';
import { ensureDay, recipeTotals } from './derived.js';
import { ACTIONS, CHANGES, INPUTS, SHEETS, closeSheets, popSheet, pushSheet, render, renderSheets, toast } from './ui.js';
import { rpc } from './sync.js';
import { coachInbox, errorText, markTemplatesSeen, templatesSeen } from './account.js';

const KIND = { plan: 'Plan del día', recipe: 'Receta' };

/* ---------- cálculos comunes ---------- */

// Un alimento de la plantilla: primero los que lleva dentro, luego los básicos de la app
const foodIn = (payload, id) => payload?.foods?.[id] || BASICS_BY_ID[id] || null;
const itemNut = (payload, it) => { const f = foodIn(payload, it.foodId); return f ? scale(f.per100, it.g || 0) : null; };
const totalOf = (payload, items) => sumNut(items.map((it) => itemNut(payload, it)).filter(Boolean)).tot;
const macroLine = (n) => `${fmt(n.kcal)} kcal · P ${fmt(n.p, 0)} · H ${fmt(n.c, 0)} · G ${fmt(n.f, 0)}`;

// Alimentos propios que usan estos ingredientes (los básicos ya los tiene todo el mundo)
function ownFoods(items) {
  const out = {};
  for (const it of items) if (!BASICS_BY_ID[it.foodId] && S.foods[it.foodId]) out[it.foodId] = structuredClone(S.foods[it.foodId]);
  return out;
}

function planHTML(payload) {
  const items = payload.items || [];
  const meals = MEALS.map(([key, label]) => {
    const list = items.filter((it) => (it.meal || 'otros') === key);
    if (!list.length) return '';
    const t = totalOf(payload, list);
    return `<div class="tpl-meal"><h4>${label} <span class="muted">${fmt(t.kcal)} kcal</span></h4>
      <ul>${list.map((it) => { const f = foodIn(payload, it.foodId); const n = itemNut(payload, it); return `<li><span>${esc(f?.name || 'Alimento')}</span><span class="muted">${fmt(it.g)} g${n ? ` · ${fmt(n.kcal)} kcal` : ''}</span></li>`; }).join('')}</ul></div>`;
  }).join('');
  return `${payload.note ? `<p class="req-msg">${esc(payload.note)}</p>` : ''}
    <p class="tpl-total"><b>Total del día:</b> ${macroLine(totalOf(payload, items))}</p>
    ${meals || '<p class="empty">El plan está vacío.</p>'}`;
}

function recipeHTML(payload) {
  const r = payload.recipe || {};
  const items = r.items || [];
  const tot = totalOf(payload, items);
  const sv = r.servings || 1;
  return `<p class="tpl-total"><b>Por ración:</b> ${macroLine(mult(tot, 1 / sv))}</p>
    <p class="muted">Salen ${fmt(sv, 1)} ${sv === 1 ? 'ración' : 'raciones'}${r.cookedG ? ` · plato hecho ${fmt(r.cookedG)} g` : ''}</p>
    <h3 class="list-title">Ingredientes</h3>
    <ul class="tpl-ings">${items.map((it) => `<li><span>${esc(foodIn(payload, it.foodId)?.name || 'Alimento')}</span><span class="muted">${fmt(it.g)} g</span></li>`).join('')}</ul>`;
}

const summary = (t) => {
  if (t.kind === 'plan') return macroLine(totalOf(t.payload, t.payload.items || []));
  const r = t.payload.recipe || {};
  return `${macroLine(mult(totalOf(t.payload, r.items || []), 1 / (r.servings || 1)))} por ración`;
};

/* ---------- entrenador ---------- */

const data = { list: null, error: '' };
let loading = false;
let clients = []; // los clientes del entrenador (los pone clients.js al cargar la lista)
export function setTemplateClients(list) { clients = (list || []).filter((c) => c.status === 'active' || c.status === 'blocked'); }
export function resetTemplates() { data.list = null; data.error = ''; clientTpls = null; }

async function load(force = false) {
  if (loading || (!force && (data.list || data.error))) return;
  loading = true;
  try { data.list = await rpc('trainer_templates'); data.error = ''; } catch (e) { data.error = errorText(e); }
  loading = false;
  if (S.ui.tab === 'clientes' && S.ui.ctab === 'plantillas' && !S.sheets.length) render();
}

export function viewPlantillas() {
  load();
  const list = data.list;
  const row = (t) => `<li><button type="button" class="row" data-act="tpl-open" data-id="${t.id}">
      <span class="row-main">${esc(t.name)} <em class="tag">${KIND[t.kind]}</em></span>
      <span class="row-sub">${summary(t)} · ${t.shared_with.length ? `compartida con ${plural(t.shared_with.length, 'cliente', 'clientes')}` : 'sin compartir'}</span>
    </button></li>`;
  return `
    <div class="btn-row two top-gap">
      <button type="button" class="btn" data-act="tpl-new-plan">+ Plan del día</button>
      <button type="button" class="btn ghost" data-act="tpl-new-recipe">+ Una de mis recetas</button>
    </div>
    <p class="hint">Prepara planes de comidas y recetas y compártelos con los clientes que quieras. Ellos pueden apuntar el plan en su diario o guardar la receta en las suyas.</p>
    ${data.error ? `<div class="notice"><p>${esc(data.error)}</p></div>` : ''}
    ${!list ? (data.error ? '' : '<p class="muted">Cargando plantillas…</p>') : list.length ? `<ul class="list top-gap">${list.map(row).join('')}</ul>` : '<p class="empty">Aún no tienes plantillas.</p>'}`;
}

const tplById = (id) => (data.list || []).find((t) => t.id === Number(id));

SHEETS['tpl-plan'] = {
  title: (s) => (s.draft.id ? 'Editar plan del día' : 'Nuevo plan del día'),
  render: (s) => {
    const d = s.draft;
    return `
      <label class="field"><span>Nombre</span><input id="tp-name" type="text" maxlength="120" value="${esc(d.name)}" placeholder="p. ej. Día de entreno 2.200 kcal" autocomplete="off"></label>
      <label class="field top-gap"><span>Indicaciones (opcional)</span><textarea id="tp-note" rows="2" maxlength="1000" placeholder="p. ej. Puedes cambiar el arroz por patata.">${esc(d.note || '')}</textarea></label>
      ${MEALS.map(([key, label]) => {
        const list = d.items.map((it, i) => [it, i]).filter(([it]) => (it.meal || 'otros') === key);
        return `<div class="tpl-ed-meal">
          <div class="tpl-ed-head"><h3>${label}</h3><button type="button" class="btn ghost small" data-act="tpl-add" data-meal="${key}">+ Añadir</button></div>
          ${list.length ? `<ul class="ingredients">${list.map(([it, i]) => {
            const f = foodIn({ foods: S.foods }, it.foodId);
            return `<li>
              <span class="ing-name">${esc(f ? f.name : 'Alimento borrado')}</span>
              <span class="input-unit small"><input type="text" inputmode="decimal" value="${inputVal(it.g, 1)}" data-input="tplg" data-idx="${i}" aria-label="Gramos de ${esc(f?.name || '')}"><em>g</em></span>
              <button type="button" class="icon-btn small" data-act="tpl-item-del" data-idx="${i}" aria-label="Quitar ${esc(f?.name || 'alimento')}">×</button>
            </li>`;
          }).join('')}</ul>` : ''}
        </div>`;
      }).join('')}
      <p class="tpl-total" id="tpl-tot"></p>
      <div class="sheet-actions"><button type="button" class="btn primary" data-act="tpl-plan-save" ${s.busy ? 'disabled' : ''}>${s.busy ? 'Guardando…' : 'Guardar plan'}</button></div>`;
  },
  mount: (s) => planTotals(s),
};

function planTotals(s) {
  const el = document.getElementById('tpl-tot');
  if (el) el.innerHTML = s.draft.items.length ? `<b>Total:</b> ${macroLine(totalOf({ foods: S.foods }, s.draft.items))}` : '<span class="muted">Añade alimentos a cada comida.</span>';
}
const keepTyped = (s) => {
  const n = document.getElementById('tp-name');
  if (n) s.draft.name = n.value;
  const t = document.getElementById('tp-note');
  if (t) s.draft.note = t.value;
};
INPUTS.tplg = (el, top) => { top.draft.items[Number(el.dataset.idx)].g = num(el.value) || 0; planTotals(top); };

SHEETS['tpl-recipe-pick'] = {
  title: () => 'Compartir una receta',
  render: () => {
    const list = Object.values(S.recipes).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    if (!list.length) return '<p class="empty">No tienes recetas. Créalas en Alimentos › Recetas y vuelve aquí.</p>';
    return `<p class="muted">Elige una de tus recetas. Se guarda una copia: si luego la cambias, podrás actualizar la plantilla.</p>
      <ul class="list top-gap">${list.map((r) => {
        const per = mult(recipeTotals(r).total, 1 / (r.servings || 1));
        return `<li><button type="button" class="row" data-act="tpl-recipe-make" data-id="${esc(r.id)}">
          <span class="row-main">${esc(r.name)}</span><span class="row-sub">${macroLine(per)} por ración</span></button></li>`;
      }).join('')}</ul>`;
  },
};

const recipePayload = (r) => ({
  srcId: r.id,
  recipe: { name: r.name, servings: r.servings || 1, cookedG: r.cookedG ?? null, items: r.items.map(({ foodId, g }) => ({ foodId, g })) },
  foods: ownFoods(r.items),
});

SHEETS.tpl = {
  title: (s) => tplById(s.id)?.name || 'Plantilla',
  render: (s) => {
    const t = tplById(s.id);
    if (!t) return '<p class="empty">Esta plantilla ya no existe.</p>';
    if (!s.sel) s.sel = new Set(t.shared_with);
    const src = t.kind === 'recipe' ? S.recipes[t.payload.srcId] : null;
    return `
      <p class="sheet-sub"><em class="tag">${KIND[t.kind]}</em> · actualizada el ${dateShort(t.updated_at.slice(0, 10))}</p>
      ${t.kind === 'plan' ? planHTML(t.payload) : recipeHTML(t.payload)}
      <h3 class="list-title">Compartir con</h3>
      ${clients.length ? `<div class="tpl-share">
        <label class="check"><input type="checkbox" data-change="tpl-all" ${clients.every((c) => s.sel.has(c.link_id)) ? 'checked' : ''}> Todos mis clientes</label>
        ${clients.map((c) => `<label class="check"><input type="checkbox" data-change="tpl-sel" data-id="${c.link_id}" ${s.sel.has(c.link_id) ? 'checked' : ''}> ${esc(c.name || c.email)}</label>`).join('')}
      </div>
      <button type="button" class="btn wide top-gap" data-act="tpl-share" ${s.busy ? 'disabled' : ''}>Guardar con quién se comparte</button>` : '<p class="muted">Todavía no tienes clientes.</p>'}
      <div class="sheet-actions">
        <button type="button" class="btn danger ghost" data-act="tpl-del">Borrar</button>
        ${t.kind === 'plan' ? '<button type="button" class="btn ghost" data-act="tpl-edit">Editar</button>'
          : src ? '<button type="button" class="btn ghost" data-act="tpl-refresh">Actualizar con mi receta</button>' : ''}
      </div>`;
  },
};

/* ---------- cliente ---------- */

let clientTpls = null; // contenido de las plantillas compartidas conmigo

async function loadClientTpls() {
  try { clientTpls = await rpc('client_templates'); } catch (e) { toast(errorText(e)); }
}

export function tplNew() {
  const seen = templatesSeen();
  return (coachInbox()?.templates || []).filter((t) => t.at > seen).length;
}

SHEETS['coach-tpls'] = {
  title: () => 'Plantillas de tu entrenador',
  render: () => {
    const list = coachInbox()?.templates || [];
    if (!list.length) return '<p class="empty">Tu entrenador aún no ha compartido ninguna plantilla contigo.</p>';
    return `<ul class="list">${list.map((t) => `<li><button type="button" class="row" data-act="acct-tpl-open" data-id="${t.id}">
      <span class="row-main">${esc(t.name)} <em class="tag">${KIND[t.kind]}</em></span>
      <span class="row-sub">${dateShort(t.at.slice(0, 10))}</span></button></li>`).join('')}</ul>`;
  },
};

SHEETS['coach-tpl'] = {
  title: (s) => (clientTpls || []).find((t) => t.id === s.id)?.name || 'Plantilla',
  render: (s) => {
    if (!clientTpls) return '<p class="muted">Cargando…</p>';
    const t = clientTpls.find((x) => x.id === s.id);
    if (!t) return '<p class="empty">Esta plantilla ya no está disponible.</p>';
    const can = GUARD.canWrite();
    const saved = t.kind === 'recipe' && Object.values(S.recipes).find((r) => r.tplId === t.id);
    return `
      <p class="sheet-sub"><em class="tag">${KIND[t.kind]}</em></p>
      ${t.kind === 'plan' ? planHTML(t.payload) : recipeHTML(t.payload)}
      ${!can ? '<p class="hint top-gap">Podrás usarla cuando tu acceso a la app esté activo.</p>'
        : t.kind === 'plan' ? `
        <label class="field top-gap"><span>Apuntar en el diario del día</span><input id="ct-date" type="date" value="${today()}"></label>
        <p class="hint">Se añade a lo que ya tengas apuntado ese día. Luego puedes cambiar o quitar lo que quieras.</p>
        <div class="sheet-actions"><button type="button" class="btn primary" data-act="acct-tpl-apply">Apuntar en el diario</button></div>`
        : `<div class="sheet-actions"><button type="button" class="btn primary" data-act="acct-tpl-save">${saved ? 'Actualizar mi copia' : 'Guardar en mis recetas'}</button></div>`}`;
  },
};

// Los alimentos propios del entrenador pasan a la biblioteca del cliente (si no los tiene ya)
function importFoods(payload) {
  let n = 0;
  for (const [id, f] of Object.entries(payload.foods || {})) {
    if (S.foods[id] || BASICS_BY_ID[id]) continue;
    S.foods[id] = { ...structuredClone(f), id };
    n++;
  }
  if (n) saveFoods();
}

/* ---------- acciones ---------- */

Object.assign(ACTIONS, {
  // Entrenador
  'tpl-new-plan': () => pushSheet({ type: 'tpl-plan', draft: { id: null, name: '', note: '', items: [] } }),
  'tpl-new-recipe': () => pushSheet({ type: 'tpl-recipe-pick' }),
  'tpl-add': (el, top) => {
    keepTyped(top);
    top.addMeal = el.dataset.meal;
    pushSheet({ type: 'picker', mode: 'recipe', recipeSheet: top, q: '' });
  },
  'tpl-item-del': (el, top) => { keepTyped(top); top.draft.items.splice(Number(el.dataset.idx), 1); renderSheets(); },
  'tpl-plan-save': async (el, top) => {
    keepTyped(top);
    const d = top.draft;
    d.name = d.name.trim();
    if (!d.name) { toast('Ponle un nombre al plan.'); return; }
    d.items = d.items.filter((it) => it.g > 0);
    if (!d.items.length) { toast('Añade al menos un alimento con sus gramos.'); renderSheets(); return; }
    top.busy = true; renderSheets();
    try {
      const payload = { note: (d.note || '').trim(), items: d.items.map(({ foodId, g, meal }) => ({ foodId, g, meal: meal || 'otros' })), foods: ownFoods(d.items) };
      const id = await rpc('trainer_template_save', { p_id: d.id, p_kind: 'plan', p_name: d.name, p_payload: payload });
      await load(true);
      closeSheets();
      render();
      pushSheet({ type: 'tpl', id });
      toast('Plan guardado');
    } catch (e) { top.busy = false; renderSheets(); toast(errorText(e)); }
  },
  'tpl-recipe-make': async (el) => {
    const r = S.recipes[el.dataset.id];
    if (!r) return;
    try {
      const id = await rpc('trainer_template_save', { p_id: null, p_kind: 'recipe', p_name: r.name, p_payload: recipePayload(r) });
      await load(true);
      closeSheets();
      render();
      pushSheet({ type: 'tpl', id });
      toast('Receta guardada como plantilla');
    } catch (e) { toast(errorText(e)); }
  },
  'tpl-open': (el) => { const t = tplById(el.dataset.id); if (t) pushSheet({ type: 'tpl', id: t.id }); },
  'tpl-edit': (el, top) => {
    const t = tplById(top.id);
    if (t) pushSheet({ type: 'tpl-plan', draft: { id: t.id, name: t.name, note: t.payload.note || '', items: structuredClone(t.payload.items || []) } });
  },
  'tpl-refresh': async (el, top) => {
    const t = tplById(top.id);
    const r = t && S.recipes[t.payload.srcId];
    if (!r) return;
    try {
      await rpc('trainer_template_save', { p_id: t.id, p_kind: 'recipe', p_name: r.name, p_payload: recipePayload(r) });
      await load(true);
      renderSheets();
      toast('Plantilla actualizada');
    } catch (e) { toast(errorText(e)); }
  },
  'tpl-share': async (el, top) => {
    top.busy = true; renderSheets();
    try {
      await rpc('trainer_template_share', { p_id: top.id, p_links: [...top.sel] });
      await load(true);
      toast(top.sel.size ? `Compartida con ${plural(top.sel.size, 'cliente', 'clientes')}` : 'Ya no se comparte con nadie');
    } catch (e) { toast(errorText(e)); }
    top.busy = false;
    renderSheets();
  },
  'tpl-del': (el, top) => pushSheet({
    type: 'confirm', title: 'Borrar plantilla', ok: 'Borrar', danger: true,
    text: 'Se borrará la plantilla y tus clientes dejarán de verla. Lo que ya hayan guardado o apuntado en su diario se queda.',
    onOk: async () => {
      try { await rpc('trainer_template_delete', { p_id: top.id }); await load(true); closeSheets(); render(); toast('Plantilla borrada'); } catch (e) { toast(errorText(e)); }
    },
  }),

  // Cliente
  'acct-tpls': () => { pushSheet({ type: 'coach-tpls' }); markTemplatesSeen(); },
  'acct-tpl-open': async (el) => {
    const id = Number(el.dataset.id);
    pushSheet({ type: 'coach-tpl', id });
    await loadClientTpls();
    renderSheets();
  },
  'acct-tpl-save': (el, top) => {
    const t = (clientTpls || []).find((x) => x.id === top.id);
    if (!t || !GUARD.canWrite()) return;
    importFoods(t.payload);
    const old = Object.values(S.recipes).find((r) => r.tplId === t.id);
    const r = t.payload.recipe || {};
    const id = old?.id || uid();
    S.recipes[id] = { id, tplId: t.id, name: r.name || t.name, servings: r.servings || 1, cookedG: r.cookedG ?? null, items: structuredClone(r.items || []), updated: new Date().toISOString() };
    saveRecipes();
    popSheet();
    toast(old ? 'Receta actualizada' : 'Guardada en tus recetas');
  },
  'acct-tpl-apply': (el, top) => {
    const t = (clientTpls || []).find((x) => x.id === top.id);
    if (!t || !GUARD.canWrite()) return;
    const date = document.getElementById('ct-date')?.value || today();
    importFoods(t.payload);
    const day = ensureDay(date);
    let n = 0;
    for (const it of t.payload.items || []) {
      const f = foodIn(t.payload, it.foodId);
      if (!f || !(it.g > 0)) continue;
      day.entries.push({ id: uid(), meal: MEAL_NAME[it.meal] ? it.meal : 'otros', type: 'food', ref: it.foodId, name: f.name, qty: it.g, unit: 'g', n: scale(f.per100, it.g) });
      n++;
    }
    saveDay(date);
    closeSheets();
    S.ui.tab = 'hoy';
    S.ui.date = date;
    render();
    toast(`${plural(n, 'alimento apuntado', 'alimentos apuntados')} el ${dateShort(date)}`);
  },
});

// Casillas de con quién se comparte
Object.assign(CHANGES, {
  'tpl-sel': (el, top) => { const id = Number(el.dataset.id); if (el.checked) top.sel.add(id); else top.sel.delete(id); renderSheets(); },
  'tpl-all': (el, top) => { top.sel = el.checked ? new Set(clients.map((c) => c.link_id)) : new Set(); renderSheets(); },
});
