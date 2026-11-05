// Ficha de un cliente (solo lectura): resumen de la semana, diario, entrenos y progreso,
// más las notas del entrenador y sus propuestas de objetivos (supabase/005-notas-objetivos.sql).
// Los datos los da el servidor (supabase/004-ficha-cliente.sql) solo si el vínculo está en curso.
// Para pintar se reutilizan los cálculos de la app: mientras se genera el HTML, S apunta un momento
// a los datos del cliente y vuelve a los propios al terminar (es síncrono: nada se guarda ni se sincroniza entremedias).
import { MUSCLE_NAME } from './exercises.js';
import { bodyPair } from './bodymap.js';
import { $, addDays, dateLong, dateShort, dayLabel, durLabel, esc, fmt, inputVal, num, parseISO, plural, today } from './util.js';
import { MEALS, S } from './state.js';
import { MEASURES, SEG_LABEL, dayOf, exName, goalsFor, hasTrainGoals, isEffective, isSeg, mondayOf, qtyLabel, setText, weekLevels, weekReport, weekVolume, workoutDuration, workoutLevels, workoutStats, workoutVolume, workoutsSorted } from './derived.js';
import { ACTIONS, CHANGES, INPUTS, SHEETS, closeSheets, pageList, pushSheet, render, renderSheets, toast } from './ui.js';
import { mapLegend } from './training.js';
import { drawSeries } from './progress.js';
import { actName, activitiesSorted } from './cardio.js';
import { lastFullWeek } from './report.js';
import { dataFromRows, rpc } from './sync.js';
import { errorText, myProfile } from './account.js';
import { drawExProgress, exProgressCard } from './exprogress.js';

const cache = {}; // id del vínculo -> { data, at, error, loading }
const SWAP = ['settings', 'days', 'workouts', 'foods', 'recipes', 'weights', 'exercises', 'routines', 'measures', 'activities'];

function withData(d, fn) {
  const own = {};
  for (const k of SWAP) { own[k] = S[k]; S[k] = d[k]; }
  try { return fn(); } finally { for (const k of SWAP) S[k] = own[k]; }
}

export async function loadFicha(id, force = false) {
  const c = cache[id] || (cache[id] = {});
  if (c.loading || (!force && (c.data || c.error))) return;
  c.loading = true;
  try {
    const [rows, notes, props, photos] = await Promise.all([
      rpc('trainer_client_rows', { p_link: id }),
      rpc('trainer_notes', { p_link: id }).catch(() => null),
      rpc('trainer_proposals', { p_link: id }).catch(() => null),
      rpc('trainer_photos', { p_link: id }).catch(() => []),
    ]);
    c.data = dataFromRows(rows);
    c.notes = notes;
    c.props = props;
    c.photos = photoSessions(photos);
    c.at = Date.now();
    c.error = '';
  } catch (e) {
    c.error = errorText(e);
  }
  c.loading = false;
  if (S.ui.tab === 'clientes' && S.ui.client === id && !S.sheets.length) render();
}
export function forgetFichas() { for (const k of Object.keys(cache)) delete cache[k]; }

const model = () => (S.settings.profile?.sex === 'm' ? 'mujer' : 'hombre');
const sumDay = (day) => day.entries.reduce((a, e) => { for (const k of ['kcal', 'p', 'c', 'f']) a[k] += e.n?.[k] || 0; return a; }, { kcal: 0, p: 0, c: 0, f: 0 });
const of = (v, goal, unit = '', d = 0) => `${fmt(v, d)}${unit}${goal != null ? ` <small class="muted">/ ${fmt(goal, d)}${unit}</small>` : ''}`;
const line = (label, value, sub = '') => `<div class="rep-line"><span class="rep-l">${label}</span><span class="rep-v">${value}</span>${sub ? `<span class="rep-s">${sub}</span>` : ''}</div>`;
const signed = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '±') + fmt(Math.abs(v), d);

/* ---------- resumen ---------- */

function resumen() {
  const mon = mondayOf(today());
  const r = weekReport(mon);
  const sofar = Math.min(7, Math.round((parseISO(today()) - parseISO(mon)) / 864e5) + 1);
  const g = S.settings.goals;
  const vol = weekVolume(mon);
  const goalRow = (label, k, u) => (g[k] != null ? `<span class="fc-goal"><b>${fmt(g[k])}${u}</b> ${label}</span>` : '');
  const goals = [goalRow('kcal', 'kcal', ''), goalRow('proteínas', 'p', ' g'), goalRow('hidratos', 'c', ' g'), goalRow('grasas', 'f', ' g'), goalRow('pasos', 'steps', '')].filter(Boolean);
  const gt = S.settings.goalsTrain;
  return `
    <section class="card">
      <div class="card-head"><h2>Esta semana</h2><span class="muted">${dateShort(mon)} – ${dateShort(addDays(mon, 6))}</span></div>
      <div class="rep">
        ${line('Días apuntados', `${r.kcal.n} de ${sofar}`)}
        ${line('Calorías', r.kcal.n ? `${fmt(r.kcal.avg)} kcal` : '–', r.kcal.n ? `media${r.kcal.goal ? ` · objetivo ${fmt(r.kcal.goal)}` : ''}` : '')}
        ${r.kcal.n ? line('Proteínas', `${fmt(r.kcal.protein)} g`, `media${g.p != null ? ` · objetivo ${fmt(g.p)} g` : ''}`) : ''}
        ${line('Peso', r.weight.avg != null ? `${fmt(r.weight.avg, 1)} kg` : '–', r.weight.avg != null ? `media de ${plural(r.weight.n, 'pesada', 'pesadas')}${r.weight.change != null ? ` · ${signed(r.weight.change)} kg frente a la anterior` : ''}` : 'sin pesadas')}
        ${line('Fuerza', plural(r.strength.sessions, 'sesión', 'sesiones'), `${r.strength.sets} series efectivas`)}
        ${r.cardio.count ? line('Cardio y actividades', plural(r.cardio.count, 'actividad', 'actividades'), durLabel(r.cardio.min * 60000)) : ''}
        ${r.steps.n ? line('Pasos', fmt(r.steps.avg), `media de ${plural(r.steps.n, 'día', 'días')}`) : ''}
      </div>
      ${vol.sets ? `<h3 class="list-title">Músculos trabajados</h3>${bodyPair(weekLevels(vol.vol), '', model())}${mapLegend('week')}` : ''}
      <button type="button" class="btn ghost wide top-gap" data-act="fc-report">Informe semanal completo</button>
    </section>
    <section class="card">
      <div class="card-head"><h2>Sus objetivos</h2></div>
      ${goals.length ? `<p class="fc-goals">${goals.join('')}</p>` : '<p class="muted">No ha puesto objetivos.</p>'}
      ${hasTrainGoals() ? `<p class="hint">Los días de entreno: ${[gt.kcal != null ? `${fmt(gt.kcal)} kcal` : '', gt.p != null ? `${fmt(gt.p)} g de proteínas` : '', gt.c != null ? `${fmt(gt.c)} g de hidratos` : '', gt.f != null ? `${fmt(gt.f)} g de grasas` : ''].filter(Boolean).join(' · ')}.</p>` : ''}
    </section>`;
}

/* ---------- diario ---------- */

function diario() {
  const date = S.ui.fdate || today();
  const day = dayOf(date);
  const t = sumDay(day);
  const g = goalsFor(date);
  const mon = mondayOf(date);
  const week = Array.from({ length: 7 }, (_, k) => addDays(mon, k));
  const weight = S.weights[date];
  const meals = MEALS.map(([key, label]) => {
    const list = day.entries.filter((e) => (e.meal || 'otros') === key);
    if (!list.length) return '';
    const kcal = list.reduce((a, e) => a + (e.n?.kcal || 0), 0);
    return `<section class="meal">
      <div class="meal-head"><h2>${label}</h2><span class="meal-kcal">${fmt(kcal)} kcal</span></div>
      <ul class="entries">${list.map((e) => `<li><div class="entry static">
        <span class="e-name">${esc(e.name)}</span>
        <span class="e-kcal">${fmt(e.n?.kcal)}</span>
        <span class="e-sub">${qtyLabel(e.qty, e.unit)} · P ${fmt(e.n?.p, 0)} · H ${fmt(e.n?.c, 0)} · G ${fmt(e.n?.f, 0)}</span>
      </div></li>`).join('')}</ul>
    </section>`;
  }).join('');
  return `
    <div class="cal-nav">
      <button type="button" class="icon-btn" data-act="fc-day" data-d="-1" aria-label="Día anterior">‹</button>
      <h3 class="cal-title">${dayLabel(date)}${dayLabel(date) !== dateLong(date) ? ` <small class="muted">${dateLong(date)}</small>` : ''}</h3>
      <button type="button" class="icon-btn" data-act="fc-day" data-d="1" aria-label="Día siguiente" ${date >= today() ? 'disabled' : ''}>›</button>
    </div>
    <div class="fc-week" role="group" aria-label="Semana">
      ${week.map((d) => {
        const k = sumDay(dayOf(d)).kcal;
        return `<button type="button" class="fc-wd${d === date ? ' on' : ''}" data-act="fc-day-set" data-v="${d}" ${d > today() ? 'disabled' : ''} aria-pressed="${d === date}">
          <span>${new Intl.DateTimeFormat('es-ES', { weekday: 'narrow' }).format(parseISO(d))}</span><b>${dayOf(d).entries.length ? fmt(k) : '–'}</b></button>`;
      }).join('')}
    </div>
    <section class="card fc-day">
      <div class="fc-macros">
        <div><span class="stat-l">Calorías</span><span class="stat-v">${of(t.kcal, g.kcal)}</span></div>
        <div><span class="stat-l">Proteínas</span><span class="stat-v">${of(t.p, g.p, ' g')}</span></div>
        <div><span class="stat-l">Hidratos</span><span class="stat-v">${of(t.c, g.c, ' g')}</span></div>
        <div><span class="stat-l">Grasas</span><span class="stat-v">${of(t.f, g.f, ' g')}</span></div>
      </div>
      <p class="muted top-gap">${[
        day.steps != null ? `${fmt(day.steps)} pasos` : '',
        day.sleep != null ? `${fmt(day.sleep, 1)} h de sueño` : '',
        weight != null ? `${fmt(weight, 1)} kg` : '',
      ].filter(Boolean).join(' · ') || 'Sin pasos, sueño ni peso este día.'}</p>
    </section>
    ${meals || '<p class="empty">No apuntó comidas este día.</p>'}`;
}

/* ---------- entrenos ---------- */

function entrenos() {
  const list = workoutsSorted().filter((w) => w.exercises?.length);
  const acts = activitiesSorted().slice(0, 10);
  const pl = pageList('ficha-wk', list, 15, (w) => {
    const st = workoutStats(w);
    const dur = workoutDuration(w);
    return `<li><button type="button" class="row" data-act="fc-wk" data-id="${esc(w.id)}">
      <span class="row-main">${esc(w.name || 'Entreno')}</span>
      <span class="row-sub">${dayLabel(w.date)} · ${plural(st.sets, 'serie', 'series')}${dur ? ` · ${durLabel(dur)}` : ''}${st.tonnage ? ` · ${fmt(st.tonnage)} kg` : ''}</span>
    </button></li>`;
  });
  return `
    <h3 class="list-title">Fuerza</h3>
    ${list.length ? `<ul class="list">${pl.html}</ul>${pl.more}` : '<p class="empty">Todavía no ha registrado entrenos.</p>'}
    ${acts.length ? `<h3 class="list-title">Cardio y actividades</h3>
      <ul class="list">${acts.map((a) => `<li class="row static">
        <span class="row-main">${esc(actName(a))}</span>
        <span class="row-sub">${dayLabel(a.date)}${a.min ? ` · ${a.min} min` : ''}${a.km ? ` · ${fmt(a.km, 1)} km` : ''}${a.kcal ? ` · ${fmt(a.kcal)} kcal` : ''}</span>
      </li>`).join('')}</ul>` : ''}`;
}

/* ---------- progreso ---------- */

let weightPts = [];

function progreso() {
  const dates = Object.keys(S.weights).sort();
  const from = addDays(today(), -119);
  weightPts = dates.filter((d) => d >= from).map((d) => ({ d, v: S.weights[d] }));
  const last = dates[dates.length - 1];
  const ref = dates.filter((d) => last && d <= addDays(last, -28)).pop();
  const mDates = Object.keys(S.measures).sort();
  const rows = MEASURES.map((m) => {
    const ds = mDates.filter((d) => S.measures[d][m.k] != null);
    if (!ds.length) return '';
    const lastD = ds[ds.length - 1];
    const v = S.measures[lastD][m.k];
    const first = ds.length > 1 ? S.measures[ds[0]][m.k] : null;
    return line(m.l, `${fmt(v, 1)} ${m.u}`, `${dateShort(lastD)}${first != null ? ` · ${signed(v - first)} ${m.u} desde el ${dateShort(ds[0])}` : ''}`);
  }).filter(Boolean);
  return `
    <section class="card">
      <div class="card-head"><h2>Peso</h2>${last ? `<span class="muted">${dateShort(last)}</span>` : ''}</div>
      ${last ? `<p class="fc-big">${fmt(S.weights[last], 1)} kg${ref ? ` <small class="muted">${signed(S.weights[last] - S.weights[ref])} kg en 4 semanas</small>` : ''}</p>
        <div class="chart" id="fc-weight"></div>
        ${weightPts.length < 2 ? '<p class="hint">Hacen falta al menos dos pesadas en los últimos 4 meses para ver la gráfica.</p>' : ''}` : '<p class="muted">No ha registrado su peso.</p>'}
    </section>
    <section class="card">
      <div class="card-head"><h2>Medidas</h2></div>
      ${rows.length ? `<div class="rep">${rows.join('')}</div>` : '<p class="muted">No ha registrado medidas.</p>'}
    </section>
    ${exProgressCard('ficha-' + S.ui.client)}
    ${photosCard()}`;
}

/* ---------- fotos compartidas ---------- */

const POSE_L = { frente: 'Frente', lado: 'Lado', espalda: 'Espalda' };
const POSE_ORDER = ['frente', 'lado', 'espalda'];

// Filas por pose → sesiones { set, date, poses: { pose: { id, thumb } } }, de la más reciente a la más antigua
function photoSessions(rows) {
  const by = new Map();
  for (const r of rows || []) {
    if (!by.has(r.set_id)) by.set(r.set_id, { set: r.set_id, date: r.date, poses: {} });
    by.get(r.set_id).poses[r.pose] = { id: r.id, thumb: r.thumb };
  }
  return [...by.values()].sort((a, b) => b.date.localeCompare(a.date));
}

function photosCard() {
  const list = cache[S.ui.client]?.photos || [];
  return `
    <section class="card">
      <div class="card-head"><h2>Fotos</h2>${list.length ? `<span class="muted">${plural(list.length, 'sesión', 'sesiones')}</span>` : ''}</div>
      ${list.length ? `<ul class="list">${list.map((x) => `<li><button type="button" class="row ph-item" data-act="fc-photos" data-set="${esc(x.set)}">
          <span class="row-main">${dateLong(x.date)}</span>
          <span class="row-sub">${POSE_ORDER.filter((p) => x.poses[p]).map((p) => POSE_L[p]).join(', ')}</span>
          <span class="ph-mini">${POSE_ORDER.filter((p) => x.poses[p]).map((p) => `<img src="${x.poses[p].thumb}" alt="">`).join('')}</span>
        </button></li>`).join('')}</ul>
        ${list.length >= 2 ? '<button type="button" class="btn ghost wide top-gap" data-act="fc-ph-compare">Comparar dos fechas</button>' : ''}`
      : '<p class="muted">No ha compartido fotos contigo. Las fotos son privadas: cada cliente decide qué sesiones comparte.</p>'}
    </section>`;
}

const fullCache = new Map();
async function fullPhoto(link, id) {
  if (!fullCache.has(id)) fullCache.set(id, await rpc('trainer_photo', { p_link: link, p_id: id }));
  return fullCache.get(id);
}
const sessionOf = (s, set) => (cache[s.link]?.photos || []).find((x) => x.set === set);

SHEETS['fc-photos'] = {
  title: (s) => { const x = sessionOf(s, s.set); return x ? dateLong(x.date) : 'Fotos'; },
  render: (s) => {
    const x = sessionOf(s, s.set);
    if (!x) return '<p class="empty">Ya no comparte estas fotos.</p>';
    return `<div class="ph-full">${POSE_ORDER.filter((p) => x.poses[p]).map((p) => `<figure><img id="fcf-${p}" src="${x.poses[p].thumb}" alt="${POSE_L[p]}"><figcaption>${POSE_L[p]}</figcaption></figure>`).join('')}</div>`;
  },
  mount: async (s) => {
    const x = sessionOf(s, s.set);
    if (!x) return;
    for (const p of POSE_ORDER.filter((q) => x.poses[q])) {
      try { const src = await fullPhoto(s.link, x.poses[p].id); const el = document.getElementById('fcf-' + p); if (el && src) el.src = src; } catch (e) { /* se queda la miniatura */ }
    }
  },
};

SHEETS['fc-ph-compare'] = {
  title: () => 'Comparar',
  render: (s) => {
    const list = (cache[s.link]?.photos || []).filter((x) => x.poses[s.pose]);
    const opts = (sel) => list.map((x) => `<option value="${esc(x.set)}" ${x.set === sel ? 'selected' : ''}>${dateShort(x.date)}</option>`).join('');
    const pick = (k) => list.find((x) => x.set === s[k]);
    return `
      <div class="chips" role="group" aria-label="Pose">${POSE_ORDER.map((p) => `<button type="button" class="chip${s.pose === p ? ' on' : ''}" data-act="fc-ph-pose" data-v="${p}" aria-pressed="${s.pose === p}">${POSE_L[p]}</button>`).join('')}</div>
      <div class="ph-compare top-gap">
        ${['a', 'b'].map((k) => { const x = pick(k); return `<figure>
          <select data-change="fc-ph-which" data-k="${k}" aria-label="Fecha">${opts(s[k])}</select>
          ${x ? `<img id="fcc-${k}" src="${x.poses[s.pose].thumb}" alt="${POSE_L[s.pose]}, ${dateShort(x.date)}">` : '<p class="muted">Sin foto de esta pose.</p>'}
        </figure>`; }).join('')}
      </div>`;
  },
  mount: async (s) => {
    for (const k of ['a', 'b']) {
      const x = (cache[s.link]?.photos || []).find((y) => y.set === s[k]);
      if (!x?.poses[s.pose]) continue;
      try { const src = await fullPhoto(s.link, x.poses[s.pose].id); const el = document.getElementById('fcc-' + k); if (el && src) el.src = src; } catch (e) { /* miniatura */ }
    }
  },
};

// La más antigua y la más reciente con esa pose
function photoPair(link, pose) {
  const list = (cache[link]?.photos || []).filter((x) => x.poses[pose]);
  return { a: list[list.length - 1]?.set, b: list[0]?.set };
}

CHANGES['fc-ph-which'] = (el, top) => { if (top?.type === 'fc-ph-compare') { top[el.dataset.k] = el.value; renderSheets(); } };

/* ---------- ficha ---------- */

/* ---------- notas y objetivos ---------- */

const GOAL_FIELDS = [['kcal', 'Calorías', 'kcal'], ['p', 'Proteínas', 'g'], ['c', 'Hidratos', 'g'], ['f', 'Grasas', 'g'], ['steps', 'Pasos', '']];
const canWriteCoach = () => ['trainer', 'dev'].includes(myProfile()?.role);
export const goalsText = (g, keys = GOAL_FIELDS) => keys.filter(([k]) => g?.[k] != null).map(([k, l, u]) => `${fmt(g[k])}${u ? ' ' + u : ''} ${k === 'kcal' ? '' : k === 'steps' ? 'pasos' : l.toLowerCase()}`.trim()).join(' · ');

function notasTab(f) {
  const props = f.props || [];
  const last = props[0];
  const g = S.settings.goals;
  const notes = f.notes || [];
  const propLine = !last ? '' : last.status === 'pending'
    ? `<div class="gate-wait"><p>Propuesta enviada el ${dateShort(last.created_at.slice(0, 10))}: pendiente de que la acepte.</p><p class="muted">${goalsText(last.goals) || '–'}</p>${canWriteCoach() ? '<button type="button" class="link" data-act="fc-prop-cancel">Anular la propuesta</button>' : ''}</div>`
    : last.status === 'accepted' ? `<p class="hint">Aceptó tu propuesta del ${dateShort(last.created_at.slice(0, 10))}${last.reply ? `: «${esc(last.reply)}»` : '.'}</p>`
    : last.status === 'rejected' ? `<p class="hint warn-text">Rechazó tu propuesta del ${dateShort(last.created_at.slice(0, 10))}${last.reply ? `: «${esc(last.reply)}»` : '.'}</p>` : '';
  return `
    <section class="card">
      <div class="card-head"><h2>Objetivos</h2></div>
      <p>${goalsText(g) || '<span class="muted">No tiene objetivos puestos.</span>'}</p>
      ${propLine}
      ${canWriteCoach() ? `<button type="button" class="btn ghost wide top-gap" data-act="fc-propose">${last?.status === 'pending' ? 'Cambiar la propuesta' : 'Proponer objetivos'}</button>` : ''}
    </section>
    <section class="card">
      <div class="card-head"><h2>Notas</h2>${canWriteCoach() ? '<button type="button" class="btn small" data-act="fc-note" data-id="">+ Nueva</button>' : ''}</div>
      ${f.notes == null ? '<p class="muted">No se han podido cargar las notas.</p>' : notes.length ? `<ul class="fc-notes">${notes.map((n) => `<li><button type="button" class="fc-note" data-act="fc-note" data-id="${n.id}" ${canWriteCoach() ? '' : 'disabled'}>
          <span class="fc-note-top"><span class="muted">${dateShort(n.created_at.slice(0, 10))}${n.updated_at.slice(0, 16) !== n.created_at.slice(0, 16) ? ' · editada' : ''}</span><em class="tag ${n.visible ? '' : 'tag-off'}">${n.visible ? 'Visible para el cliente' : 'Privada'}</em></span>
          <span class="fc-note-body">${esc(n.body)}</span>
        </button></li>`).join('')}</ul>` : '<p class="muted">Aún no has escrito ninguna nota. Las privadas solo las ves tú; las visibles le aparecen al cliente en su app.</p>'}
    </section>`;
}

const TABS = [['resumen', 'Resumen'], ['diario', 'Diario'], ['entrenos', 'Entrenos'], ['progreso', 'Progreso'], ['notas', 'Notas']];
const SECTIONS = { resumen, diario, entrenos, progreso };

function ago(ms) {
  const min = Math.round((Date.now() - ms) / 60000);
  return min < 1 ? 'ahora mismo' : min < 60 ? `hace ${min} min` : `a las ${new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
}

export function fichaHTML(c) {
  loadFicha(c.link_id);
  const f = cache[c.link_id] || {};
  const tab = S.ui.ftab || 'resumen';
  let body;
  if (f.data) body = withData(f.data, tab === 'notas' ? () => notasTab(f) : SECTIONS[tab] || resumen);
  else if (f.error) body = `<div class="notice"><p>${esc(f.error)}</p></div>`;
  else body = '<p class="muted">Cargando sus datos…</p>';
  return `
  <header class="page-head fc-head">
    <button type="button" class="icon-btn" data-act="cl-back" aria-label="Volver a Clientes">‹</button>
    <div class="fc-title"><h1>${esc(c.name || c.email || 'Cliente')}</h1><p class="muted">${esc(c.email || '')}</p></div>
    <button type="button" class="btn ghost small" data-act="cl-manage">Opciones</button>
  </header>
  ${c.status === 'blocked' ? '<div class="notice small"><p>Has pausado su acceso: puede ver sus datos, pero no usar la app.</p></div>' : ''}
  <div class="segmented" role="tablist">
    ${TABS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${tab === k}" data-act="fc-tab" data-v="${k}">${l}</button>`).join('')}
  </div>
  <div class="fc-body">${body}</div>
  <p class="hint fc-foot">Solo lectura${f.at ? ` · datos de ${ago(f.at)}` : ''} · <button type="button" class="link" data-act="fc-reload">Actualizar</button></p>`;
}

export function fichaAfter() {
  if ((S.ui.ftab || 'resumen') === 'progreso') { drawSeries(document.getElementById('fc-weight'), weightPts, 'kg', 1); drawExProgress('ficha-' + S.ui.client); }
}

/* ---------- hojas ---------- */

const dataOf = (s) => cache[s.link]?.data;

SHEETS['fc-workout'] = {
  title: (s) => dataOf(s)?.workouts[s.id]?.name || 'Entreno',
  render: (s) => {
    const d = dataOf(s);
    if (!d?.workouts[s.id]) return '<p class="muted">Este entreno ya no está.</p>';
    return withData(d, () => {
      const w = S.workouts[s.id];
      const st = workoutStats(w);
      const dur = workoutDuration(w);
      const { vol, prim } = workoutVolume(w);
      const list = Object.entries(vol).sort((a, b) => (prim.has(b[0]) - prim.has(a[0])) || b[1] - a[1]);
      return `
        <p class="sheet-sub">${dayLabel(w.date)}${dayLabel(w.date) !== dateLong(w.date) ? ` · ${dateLong(w.date)}` : ''}</p>
        <div class="stats">
          <div><span class="stat-l">Duración</span><span class="stat-v">${dur != null ? durLabel(dur) : '–'}</span></div>
          <div><span class="stat-l">Series</span><span class="stat-v">${st.sets}</span></div>
          <div><span class="stat-l">Kg movidos</span><span class="stat-v">${fmt(st.tonnage)}</span></div>
        </div>
        ${bodyPair(workoutLevels(w), 'big', model())}
        ${mapLegend('session')}
        ${list.length ? `<div class="rep-muscles">${list.map(([m, v]) => `<span class="rep-m${prim.has(m) ? ' in' : ''}">${MUSCLE_NAME[m]} <b>${fmt(v, 1)}</b></span>`).join('')}</div>` : ''}
        <h3 class="list-title">Ejercicios</h3>
        <ul class="fc-exs">${w.exercises.map((we) => `<li>
          <b>${esc(exName(we))}</b>
          <span>${we.sets.map((x) => `<span class="fc-set${x.t === 'w' ? ' warm' : ''}${isSeg(x) ? ' seg' : ''}${x.t === 'w' || isEffective(x) ? '' : ' undone'}">${x.t === 'w' ? 'C ' : isSeg(x) ? `↳ ${SEG_LABEL[x.t]} ` : ''}${setText(x)}${x.rir != null ? ` <small>RIR ${x.rir}</small>` : ''}</span>`).join('')}</span>
        </li>`).join('')}</ul>
        <p class="hint">C = serie de calentamiento. DS = bajada de un dropset y RP = bloque de un rest-pause, de la serie anterior. Las series tachadas no se marcaron como hechas.</p>`;
    });
  },
};

SHEETS['fc-note'] = {
  title: (s) => (s.id ? 'Editar nota' : 'Nueva nota'),
  render: (s) => `
    <label class="field"><span>Nota</span><textarea id="fn-body" rows="6" maxlength="4000" placeholder="p. ej. Le molesta la rodilla izquierda: evitar zancadas.">${esc(s.body || '')}</textarea></label>
    <label class="check top-gap"><input type="checkbox" id="fn-vis" ${s.visible ? 'checked' : ''}> Visible para el cliente</label>
    <p class="hint">Si no la marcas, la nota es privada: solo la ves tú.</p>
    ${s.error ? `<p class="sync-err" role="alert">${esc(s.error)}</p>` : ''}
    <div class="sheet-actions">
      ${s.id ? '<button type="button" class="btn danger ghost" data-act="fc-note-del">Borrar</button>' : ''}
      <button type="button" class="btn primary" data-act="fc-note-save" ${s.busy ? 'disabled' : ''}>${s.busy ? 'Guardando…' : 'Guardar'}</button>
    </div>`,
};

const goalInput = (pre, k, l, u, v) => `<label class="nut-field"><span>${l}</span><span class="input-unit"><input id="${pre}-${k}" type="text" inputmode="numeric" value="${v == null ? '' : inputVal(v, 0)}" placeholder="–" data-input="fp-sum">${u ? `<em>${u}</em>` : ''}</span></label>`;
const macroKcal = (pre) => {
  const v = (k) => num(document.getElementById(`${pre}-${k}`)?.value) || 0;
  return Math.round(v('p') * 4 + v('c') * 4 + v('f') * 9);
};

SHEETS['fc-propose'] = {
  title: () => 'Proponer objetivos',
  render: (s) => {
    const d = dataOf(s);
    const g = s.goals || d?.settings.goals || {};
    const gt = s.goalsTrain || d?.settings.goalsTrain || {};
    return `
      <p class="muted">Se le enviará al cliente para que la acepte o la rechace. Si la acepta, sus objetivos pasan a ser estos.</p>
      <h3 class="list-title">Objetivos diarios</h3>
      <div class="nut-box">${GOAL_FIELDS.map(([k, l, u]) => goalInput('fp', k, l, u, g[k])).join('')}</div>
      <p class="hint" id="fp-sum-txt"></p>
      <details class="top-gap"${Object.values(gt).some((x) => x != null) ? ' open' : ''}><summary>Otros objetivos para los días de entreno (opcional)</summary>
        <div class="nut-box">${GOAL_FIELDS.slice(0, 4).map(([k, l, u]) => goalInput('fpt', k, l, u, gt[k])).join('')}</div>
        <p class="hint">Déjalos vacíos si quieres los mismos todos los días.</p>
      </details>
      <label class="field top-gap"><span>Mensaje (opcional)</span><textarea id="fp-msg" rows="3" maxlength="1000" placeholder="p. ej. Subimos un poco las calorías para recuperar mejor.">${esc(s.msg || '')}</textarea></label>
      ${s.error ? `<p class="sync-err" role="alert">${esc(s.error)}</p>` : ''}
      <div class="sheet-actions"><button type="button" class="btn primary" data-act="fc-propose-send" ${s.busy ? 'disabled' : ''}>${s.busy ? 'Enviando…' : 'Enviar propuesta'}</button></div>`;
  },
  mount: () => sumHint(),
};

function sumHint() {
  const el = document.getElementById('fp-sum-txt');
  if (!el) return;
  const k = macroKcal('fp');
  const goal = num(document.getElementById('fp-kcal')?.value);
  el.textContent = k ? `Las macros suman ${fmt(k)} kcal${goal ? ` (${goal >= k ? fmt(goal - k) + ' por debajo del objetivo' : fmt(k - goal) + ' por encima del objetivo'})` : ''}.` : '';
}
INPUTS['fp-sum'] = () => sumHint();

const readGoals = (pre, fields) => {
  const out = {};
  for (const [k] of fields) {
    const raw = document.getElementById(`${pre}-${k}`)?.value.trim();
    out[k] = raw ? num(raw) : null;
    if (raw && (out[k] == null || out[k] < 0)) return null;
  }
  return out;
};

SHEETS['fc-report'] = {
  title: () => 'Informe semanal',
  render: (s) => (dataOf(s) ? withData(dataOf(s), () => SHEETS.report.render(s)) : ''),
};

/* ---------- acciones ---------- */

Object.assign(ACTIONS, {
  'fc-tab': (el) => { S.ui.ftab = el.dataset.v; render(); },
  'fc-reload': async () => { if (S.ui.client) { await loadFicha(S.ui.client, true); toast('Datos actualizados'); render(); } },
  'fc-day': (el) => {
    const next = addDays(S.ui.fdate || today(), Number(el.dataset.d));
    if (next > today()) return;
    S.ui.fdate = next;
    render();
  },
  'fc-day-set': (el) => { S.ui.fdate = el.dataset.v; render(); },
  'fc-wk': (el) => pushSheet({ type: 'fc-workout', link: S.ui.client, id: el.dataset.id }),
  'fc-photos': (el) => pushSheet({ type: 'fc-photos', link: S.ui.client, set: el.dataset.set }),
  'fc-ph-compare': () => {
    const pose = 'frente';
    pushSheet({ type: 'fc-ph-compare', link: S.ui.client, pose, ...photoPair(S.ui.client, pose) });
  },
  'fc-ph-pose': (el, top) => { top.pose = el.dataset.v; Object.assign(top, photoPair(top.link, top.pose)); renderSheets(); },
  'fc-report': () => pushSheet({ type: 'fc-report', link: S.ui.client, monday: lastFullWeek() }),
  'fc-note': (el) => {
    const n = (cache[S.ui.client]?.notes || []).find((x) => String(x.id) === el.dataset.id);
    pushSheet({ type: 'fc-note', link: S.ui.client, id: n?.id || null, body: n?.body || '', visible: n ? n.visible : false });
  },
  'fc-note-save': async (el, top) => {
    top.body = document.getElementById('fn-body').value;
    top.visible = document.getElementById('fn-vis').checked;
    if (!top.body.trim()) { top.error = 'Escribe la nota.'; renderSheets(); return; }
    top.busy = true; top.error = '';
    renderSheets();
    try {
      await rpc('trainer_note_save', { p_link: top.link, p_id: top.id, p_body: top.body, p_visible: top.visible });
      cache[top.link].notes = await rpc('trainer_notes', { p_link: top.link });
      closeSheets();
      render();
      toast(top.visible ? 'Nota guardada: la verá el cliente' : 'Nota privada guardada');
    } catch (e) {
      top.busy = false; top.error = errorText(e);
      renderSheets();
    }
  },
  'fc-note-del': (el, top) => pushSheet({
    type: 'confirm', title: 'Borrar nota', text: 'La nota se borrará para siempre.', ok: 'Borrar', danger: true,
    onOk: async () => {
      try {
        await rpc('trainer_note_delete', { p_link: top.link, p_id: top.id });
        cache[top.link].notes = await rpc('trainer_notes', { p_link: top.link });
        closeSheets(); render(); toast('Nota borrada');
      } catch (e) { toast(errorText(e)); }
    },
  }),
  'fc-propose': () => {
    const last = (cache[S.ui.client]?.props || [])[0];
    pushSheet(last?.status === 'pending'
      ? { type: 'fc-propose', link: S.ui.client, goals: last.goals, goalsTrain: last.goals_train || {}, msg: last.message }
      : { type: 'fc-propose', link: S.ui.client });
  },
  'fc-propose-send': async (el, top) => {
    const g = readGoals('fp', GOAL_FIELDS);
    const gt = readGoals('fpt', GOAL_FIELDS.slice(0, 4));
    top.msg = document.getElementById('fp-msg').value;
    if (!g || !gt) { top.error = 'Revisa los números: solo cifras, sin negativos.'; renderSheets(); return; }
    if (!Object.values(g).some((v) => v != null)) { top.error = 'Pon al menos un objetivo.'; renderSheets(); return; }
    top.goals = g; top.goalsTrain = gt;
    top.busy = true; top.error = '';
    renderSheets();
    try {
      await rpc('trainer_propose', { p_link: top.link, p_goals: g, p_goals_train: Object.values(gt).some((v) => v != null) ? gt : null, p_message: top.msg });
      cache[top.link].props = await rpc('trainer_proposals', { p_link: top.link });
      closeSheets();
      render();
      toast('Propuesta enviada');
    } catch (e) {
      top.busy = false; top.error = errorText(e);
      renderSheets();
    }
  },
  'fc-prop-cancel': () => {
    const id = S.ui.client;
    const last = (cache[id]?.props || [])[0];
    if (!last) return;
    pushSheet({
      type: 'confirm', title: 'Anular la propuesta', text: 'El cliente dejará de verla.', ok: 'Anular', danger: true,
      onOk: async () => {
        try {
          await rpc('trainer_proposal_cancel', { p_link: id, p_id: last.id });
          cache[id].props = await rpc('trainer_proposals', { p_link: id });
          render(); toast('Propuesta anulada');
        } catch (e) { toast(errorText(e)); }
      },
    });
  },
});
