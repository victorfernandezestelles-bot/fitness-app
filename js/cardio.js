// Cardio y otras actividades: no suman series por músculo, pero cuentan como día entrenado
import { $, addDays, csvNum, csvText, dayLabel, deliverFile, durLabel, esc, fmt, inputVal, num, today, uid } from './util.js';
import { S, saveActivities } from './state.js';
import { mondayOf } from './derived.js';
import { ACTIONS, SHEETS, pageList, popSheet, pushSheet, render, renderSheets, toast, undoable } from './ui.js';

export const ACT_TYPES = [
  ['caminata', 'Caminata larga'], ['carrera', 'Carrera'], ['bici', 'Bici'], ['eliptica', 'Elíptica'],
  ['comba', 'Comba'], ['baloncesto', 'Baloncesto'], ['natacion', 'Natación'], ['movilidad', 'Movilidad'], ['otro', 'Otro'],
];
export const ACT_NAME = Object.fromEntries(ACT_TYPES);
export const INTENSITY = [['suave', 'Suave'], ['moderada', 'Moderada'], ['intensa', 'Intensa']];
const INT_NAME = Object.fromEntries(INTENSITY);
// Tipos en los que tiene sentido apuntar la distancia
const WITH_KM = new Set(['caminata', 'carrera', 'bici', 'natacion', 'eliptica']);

export const activitiesSorted = () => Object.values(S.activities).sort((a, b) => (b.date + (b.at || '')).localeCompare(a.date + (a.at || '')));
export const actName = (a) => (a.type === 'otro' && a.name ? a.name : ACT_NAME[a.type] || 'Actividad');

export function activitySummary(a) {
  return [durLabel(a.min * 60000), INT_NAME[a.intensity], a.km != null ? `${fmt(a.km, 2)} km` : '', a.kcal != null ? `${fmt(a.kcal)} kcal` : ''].filter(Boolean).join(' · ');
}

// Resumen de una semana (lunes a domingo)
export function weekActivities(monday) {
  const end = addDays(monday, 6);
  const list = Object.values(S.activities).filter((a) => a.date >= monday && a.date <= end);
  return { list, count: list.length, min: list.reduce((s, a) => s + (a.min || 0), 0), km: list.reduce((s, a) => s + (a.km || 0), 0) };
}

export function viewCardio() {
  const monday = mondayOf(today());
  const wk = weekActivities(monday);
  const all = activitiesSorted();
  return `
  <button type="button" class="btn wide big" data-act="act-new">+ Apuntar actividad</button>

  <section class="card">
    <div class="card-head"><h2>Esta semana</h2></div>
    <div class="stats">
      <div><span class="stat-l">Actividades</span><span class="stat-v">${wk.count}</span></div>
      <div><span class="stat-l">Tiempo</span><span class="stat-v">${wk.min ? durLabel(wk.min * 60000) : '0 min'}</span></div>
      ${wk.km ? `<div><span class="stat-l">Distancia</span><span class="stat-v">${fmt(wk.km, 1)}<small> km</small></span></div>` : ''}
    </div>
    <p class="hint">El cardio no suma series por músculo, pero el día cuenta como entrenado en el calendario.</p>
  </section>

  <section class="card">
    <div class="card-head"><h2>Últimas actividades</h2></div>
    ${all.length ? (() => {
      const pl = pageList('activities', all, 15, (a) => `<li><button type="button" class="row" data-act="act-open" data-id="${a.id}">
        <span class="row-main">${esc(actName(a))}</span>
        <span class="row-sub">${dayLabel(a.date)} · ${activitySummary(a)}${a.note ? ' · ' + esc(a.note) : ''}</span>
        <span class="row-side">${fmt(a.min)} <small>min</small></span>
      </button></li>`);
      return `<ul class="list">${pl.html}</ul>${pl.more}`;
    })() : '<p class="empty">Apunta aquí tus caminatas largas, carreras, bici, partidos o sesiones de movilidad.</p>'}
  </section>`;
}

SHEETS.activity = {
  title: (s) => (s.isNew ? 'Nueva actividad' : actName(s.draft)),
  render: (s) => {
    const a = s.draft;
    return `
      <div class="field"><span>Tipo</span>
        <div class="chips">${ACT_TYPES.map(([k, l]) => `<button type="button" class="chip${a.type === k ? ' on' : ''}" data-act="act-type" data-v="${k}" aria-pressed="${a.type === k}">${l}</button>`).join('')}</div>
      </div>
      ${a.type === 'otro' ? `<label class="field"><span>Nombre</span><input id="act-name" type="text" value="${esc(a.name || '')}" placeholder="p. ej. pádel" autocomplete="off"></label>` : ''}
      <div class="form-grid">
        <label class="field"><span>Fecha</span><input id="act-date" type="date" value="${a.date}" max="${today()}"></label>
        <label class="field"><span>Duración</span><span class="input-unit"><input id="act-min" type="text" inputmode="numeric" value="${a.min ?? ''}" placeholder="45"><em>min</em></span></label>
      </div>
      <div class="field"><span>Intensidad</span>
        <div class="chips">${INTENSITY.map(([k, l]) => `<button type="button" class="chip${a.intensity === k ? ' on' : ''}" data-act="act-int" data-v="${k}" aria-pressed="${a.intensity === k}">${l}</button>`).join('')}</div>
      </div>
      <div class="form-grid">
        ${WITH_KM.has(a.type) || a.km != null ? `<label class="field"><span>Distancia (opcional)</span><span class="input-unit"><input id="act-km" type="text" inputmode="decimal" value="${inputVal(a.km, 2)}" placeholder="–"><em>km</em></span></label>` : ''}
        <label class="field"><span>Calorías (opcional)</span><span class="input-unit"><input id="act-kcal" type="text" inputmode="numeric" value="${a.kcal ?? ''}" placeholder="–"><em>kcal</em></span></label>
      </div>
      <p class="hint">Las calorías del reloj suelen exagerar. Se guardan como dato, pero no cambian tu objetivo del día.</p>
      <label class="field top-gap"><span>Nota (opcional)</span><input id="act-note" type="text" value="${esc(a.note || '')}" autocomplete="off"></label>
      <div class="sheet-actions">
        ${s.isNew ? '' : '<button type="button" class="btn danger ghost" data-act="act-del">Borrar</button>'}
        <button type="button" class="btn primary" data-act="act-save">Guardar</button>
      </div>`;
  },
};

// Guarda lo escrito en el borrador antes de volver a pintar la hoja
function readDraft(a) {
  const v = (id) => document.getElementById(id);
  if (v('act-name')) a.name = v('act-name').value.trim();
  if (v('act-date')) a.date = v('act-date').value || a.date;
  if (v('act-min')) a.min = num(v('act-min').value);
  if (v('act-km')) a.km = num(v('act-km').value);
  if (v('act-kcal')) a.kcal = num(v('act-kcal').value);
  if (v('act-note')) a.note = v('act-note').value.trim();
}

Object.assign(ACTIONS, {
  'wtab': (el) => { S.ui.wtab = el.dataset.v; render(); },
  'act-new': () => {
    const last = activitiesSorted()[0];
    pushSheet({ type: 'activity', isNew: true, draft: { id: uid(), type: last?.type || 'caminata', date: today(), min: null, intensity: 'moderada', km: null, kcal: null, note: '' } });
  },
  'act-open': (el) => {
    const a = S.activities[el.dataset.id];
    if (a) pushSheet({ type: 'activity', isNew: false, draft: structuredClone(a) });
  },
  'act-type': (el, top) => { readDraft(top.draft); top.draft.type = el.dataset.v; renderSheets(); },
  'act-int': (el, top) => { readDraft(top.draft); top.draft.intensity = el.dataset.v; renderSheets(); },
  'act-save': (el, top) => {
    const a = top.draft;
    readDraft(a);
    if (!a.min || a.min <= 0) { toast('Pon la duración en minutos.'); return; }
    if (a.min > 24 * 60) { toast('Esa duración no parece correcta.'); return; }
    a.min = Math.round(a.min);
    if (a.kcal != null) a.kcal = Math.round(a.kcal);
    if (!a.note) delete a.note;
    if (a.type !== 'otro') delete a.name;
    if (!a.at) a.at = new Date().toISOString();
    S.activities[a.id] = a;
    saveActivities();
    popSheet();
    render();
    toast(top.isNew ? 'Actividad guardada' : 'Cambios guardados');
  },
  'act-del': (el, top) => {
    const a = S.activities[top.draft.id];
    if (!a) return;
    popSheet();
    undoable(`${actName(a)} borrada`,
      () => { delete S.activities[a.id]; saveActivities(); render(); },
      () => { S.activities[a.id] = a; saveActivities(); render(); });
  },
});

export async function exportCsvActividades() {
  const rows = [['fecha', 'actividad', 'minutos', 'intensidad', 'km', 'kcal', 'nota'].join(';')];
  for (const a of [...activitiesSorted()].reverse()) {
    rows.push([a.date, actName(a), a.min, INT_NAME[a.intensity] || '', csvNum(a.km, 2), a.kcal ?? '', a.note || ''].map(csvText).join(';'));
  }
  await deliverFile(`fitness-actividades-${today()}.csv`, '﻿' + rows.join('\r\n'), 'text/csv');
}
