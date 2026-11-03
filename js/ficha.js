// Ficha de un cliente (solo lectura): resumen de la semana, diario, entrenos y progreso.
// Los datos los da el servidor (supabase/004-ficha-cliente.sql) solo si el vínculo está en curso.
// Para pintar se reutilizan los cálculos de la app: mientras se genera el HTML, S apunta un momento
// a los datos del cliente y vuelve a los propios al terminar (es síncrono: nada se guarda ni se sincroniza entremedias).
import { MUSCLE_NAME } from './exercises.js';
import { bodyPair } from './bodymap.js';
import { $, addDays, dateLong, dateShort, dayLabel, durLabel, esc, fmt, parseISO, plural, today } from './util.js';
import { MEALS, S } from './state.js';
import { MEASURES, dayOf, exName, goalsFor, hasTrainGoals, isEffective, mondayOf, qtyLabel, setText, weekLevels, weekReport, weekVolume, workoutDuration, workoutLevels, workoutStats, workoutVolume, workoutsSorted } from './derived.js';
import { ACTIONS, SHEETS, pageList, pushSheet, render, toast } from './ui.js';
import { mapLegend } from './training.js';
import { drawSeries } from './progress.js';
import { actName, activitiesSorted } from './cardio.js';
import { lastFullWeek } from './report.js';
import { dataFromRows, rpc } from './sync.js';
import { errorText } from './account.js';

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
    c.data = dataFromRows(await rpc('trainer_client_rows', { p_link: id }));
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
    </section>`;
}

/* ---------- ficha ---------- */

const TABS = [['resumen', 'Resumen'], ['diario', 'Diario'], ['entrenos', 'Entrenos'], ['progreso', 'Progreso']];
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
  if (f.data) body = withData(f.data, SECTIONS[tab] || resumen);
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
  if ((S.ui.ftab || 'resumen') === 'progreso') drawSeries(document.getElementById('fc-weight'), weightPts, 'kg', 1);
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
          <span>${we.sets.map((x) => `<span class="fc-set${x.t === 'w' ? ' warm' : ''}${x.t === 'w' || isEffective(x) ? '' : ' undone'}">${x.t === 'w' ? 'C ' : ''}${setText(x)}${x.rir != null ? ` <small>RIR ${x.rir}</small>` : ''}</span>`).join('')}</span>
        </li>`).join('')}</ul>
        <p class="hint">C = serie de calentamiento. Las series tachadas no se marcaron como hechas.</p>`;
    });
  },
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
  'fc-report': () => pushSheet({ type: 'fc-report', link: S.ui.client, monday: lastFullWeek() }),
});
