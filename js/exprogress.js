// Progreso en los ejercicios: gráfica de cómo evoluciona cada ejercicio elegido a lo largo del tiempo.
// Sale en Progreso (los datos propios) y en la ficha del cliente para su entrenador (los del cliente):
// las dos llaman a exProgressCard() mientras S tiene los datos que toca, y la gráfica se dibuja después.
import { e1rm } from './exercises.js';
import { $, addDays, dateShort, esc, fmt, niceStep, parseISO, today } from './util.js';
import { S } from './state.js';
import { exName, exerciseHistory, isEffective } from './derived.js';
import { ACTIONS, chartTooltip, render, toast } from './ui.js';

export const METRICS = {
  e1rm: { l: '1RM estimado', s: '1RM', u: 'kg', d: 1, hint: 'El peso que podrías levantar una sola vez, estimado con tu mejor serie de cada sesión (fórmula de Epley, series de hasta 12 repeticiones).' },
  peso: { l: 'Peso máximo', s: 'Peso máx.', u: 'kg', d: 1, hint: 'El peso más alto que moviste en una serie efectiva de cada sesión.' },
  vol: { l: 'Volumen', s: 'Volumen', u: 'kg', d: 0, hint: 'Kilos × repeticiones de todas las series efectivas de cada sesión.' },
  reps: { l: 'Repeticiones', s: 'Reps', u: 'reps', d: 0, hint: 'Las repeticiones de tu mejor serie de cada sesión. Útil en ejercicios con tu propio peso.' },
};
const RANGES = [['3m', '3 meses', 91], ['6m', '6 meses', 182], ['1a', '1 año', 365], ['all', 'Todo', null]];
const MAX = 4;

// Valor de cada sesión según la medida (de la más antigua a la más reciente)
function sessions(exId) {
  return exerciseHistory(exId).slice().reverse().map((h) => {
    const sets = h.sets.filter(isEffective);
    const kgs = sets.map((s) => s.kg || 0);
    const bestSet = sets.reduce((b, s) => {
      const v = e1rm(s.kg, s.reps) ?? 0;
      return !b || v > b.v || (v === b.v && (s.reps || 0) > (b.s.reps || 0)) ? { s, v } : b;
    }, null)?.s;
    return {
      date: h.date,
      e1rm: h.best,
      peso: kgs.length && Math.max(...kgs) > 0 ? Math.max(...kgs) : null,
      // El volumen incluye las bajadas y los bloques (dropset, rest-pause); el resto, solo las series principales
      vol: (h.all || sets).filter(isEffective).reduce((a, s) => a + (s.kg || 0) * (s.reps || 0), 0) || null,
      reps: sets.length ? Math.max(...sets.map((s) => s.reps || 0)) || null : null,
      top: bestSet ? `${bestSet.kg ? fmt(bestSet.kg, 2) + ' kg' : 'sin peso'} × ${bestSet.reps ?? '–'}` : '',
    };
  });
}

// Ejercicios hechos alguna vez, de más a menos sesiones
function doneExercises() {
  const count = new Map();
  for (const w of Object.values(S.workouts)) {
    for (const we of w.exercises || []) {
      if (!we.sets?.some(isEffective)) continue;
      if (!count.has(we.exId)) count.set(we.exId, { id: we.exId, name: exName(we), n: 0, last: '' });
      const c = count.get(we.exId);
      c.n++;
      if (w.date > c.last) c.last = w.date;
    }
  }
  return [...count.values()].sort((a, b) => b.n - a.n || b.last.localeCompare(a.last));
}

// Lo elegido se recuerda en este dispositivo (en la ficha, uno por cliente)
const KEY = (ctx) => 'exprog:' + ctx;
function readSel(ctx, done) {
  let st = {};
  try { st = JSON.parse(localStorage.getItem(KEY(ctx)) || '{}') || {}; } catch (e) { st = {}; }
  const valid = new Set(done.map((d) => d.id));
  let ids = Array.isArray(st.ids) ? st.ids.filter((id) => valid.has(id)) : [];
  if (!ids.length && !st.touched) ids = done.slice(0, 3).map((d) => d.id);
  return { ids, metric: METRICS[st.metric] ? st.metric : 'e1rm', range: RANGES.some(([k]) => k === st.range) ? st.range : '6m', pct: !!st.pct, touched: !!st.touched };
}
function writeSel(ctx, st) {
  try { localStorage.setItem(KEY(ctx), JSON.stringify(st)); } catch (e) { /* sin almacenamiento */ }
}

const stash = {}; // ctx -> lo que hay que dibujar

export function exProgressCard(ctx) {
  const done = doneExercises();
  const st = readSel(ctx, done);
  const m = METRICS[st.metric];
  const days = RANGES.find(([k]) => k === st.range)[2];
  const from = days ? addDays(today(), -days + 1) : '0000-00-00';
  const series = st.ids.map((id, i) => {
    const pts = sessions(id).filter((p) => p.date >= from && p[st.metric] != null).map((p) => ({ d: p.date, v: p[st.metric], top: p.top }));
    return { id, i, name: done.find((d) => d.id === id)?.name || 'Ejercicio', pts };
  });
  const pct = st.pct && series.length > 1;
  stash[ctx] = { series, m, pct };
  const sel = new Set(st.ids);
  const self = ctx === 'me';
  if (!done.length) {
    return `<section class="card" id="exp-${esc(ctx)}">
      <div class="card-head"><h2>Progreso en los ejercicios</h2></div>
      <p class="muted">${self ? 'Cuando registres entrenos de fuerza verás aquí cómo progresas en cada ejercicio.' : 'Todavía no ha registrado entrenos de fuerza.'}</p>
    </section>`;
  }
  const summary = series.map((s) => {
    if (!s.pts.length) return `<li class="row static exp-row"><span class="row-main"><i class="exp-dot s${s.i + 1}"></i>${esc(s.name)}</span><span class="row-sub">Sin sesiones en este periodo</span></li>`;
    const a = s.pts[0], b = s.pts[s.pts.length - 1];
    const diff = b.v - a.v;
    const rel = a.v ? (diff / a.v) * 100 : null;
    const sign = diff > 0 ? '+' : diff < 0 ? '−' : '±';
    return `<li class="row static exp-row">
      <span class="row-main"><i class="exp-dot s${s.i + 1}"></i>${esc(s.name)}</span>
      <span class="row-sub">${s.pts.length === 1 ? 'Una sesión' : `${s.pts.length} sesiones`} · última el ${dateShort(b.d)} (${esc(b.top)})</span>
      <span class="row-side"><span class="exp-val"><b>${fmt(b.v, m.d)}</b> ${m.u}</span>${s.pts.length > 1 ? `<small class="exp-chg ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${sign}${fmt(Math.abs(diff), m.d)}${rel != null ? ` (${sign}${fmt(Math.abs(rel), 0)} %)` : ''}</small>` : ''}</span>
    </li>`;
  }).join('');
  return `
  <section class="card" id="exp-${esc(ctx)}">
    <div class="card-head"><h2>Progreso en los ejercicios</h2><span class="muted">${m.l}</span></div>
    <p class="hint exp-lead">Elige hasta ${MAX} ejercicios para ver cómo evolucionan.</p>
    <div class="chips scroll exp-ex" role="group" aria-label="Ejercicios">
      ${done.map((d) => { const i = st.ids.indexOf(d.id); return `<button type="button" class="chip${sel.has(d.id) ? ' on exp-on s' + (i + 1) : ''}" data-act="exp-ex" data-ctx="${esc(ctx)}" data-id="${esc(d.id)}" aria-pressed="${sel.has(d.id)}">${sel.has(d.id) ? `<i class="exp-dot s${i + 1}"></i>` : ''}${esc(d.name)} <small>${d.n}</small></button>`; }).join('')}
    </div>
    <div class="exp-opts">
      <div class="segmented small" role="tablist" aria-label="Qué medir">
        ${Object.entries(METRICS).map(([k, v]) => `<button type="button" role="tab" aria-selected="${st.metric === k}" data-act="exp-metric" data-ctx="${esc(ctx)}" data-v="${k}" aria-label="${v.l}">${v.s}</button>`).join('')}
      </div>
      <div class="segmented small" role="tablist" aria-label="Periodo">
        ${RANGES.map(([k, l]) => `<button type="button" role="tab" aria-selected="${st.range === k}" data-act="exp-range" data-ctx="${esc(ctx)}" data-v="${k}">${l}</button>`).join('')}
      </div>
      ${series.length > 1 ? `<label class="check exp-pct"><input type="checkbox" data-act="exp-pct" data-ctx="${esc(ctx)}" ${st.pct ? 'checked' : ''}> Comparar en % desde la primera sesión</label>` : ''}
    </div>
    ${series.length ? `<div class="chart exp-chart" id="exp-chart-${esc(ctx)}"></div>
      <ul class="list tight">${summary}</ul>` : '<p class="muted top-gap">Toca un ejercicio para verlo en la gráfica.</p>'}
    <p class="hint">${m.hint}</p>
  </section>`;
}

export function drawExProgress(ctx) {
  const host = document.getElementById('exp-chart-' + ctx);
  const data = stash[ctx];
  if (!host || !data) return;
  const { series, m, pct } = data;
  const lines = series.map((s) => ({ ...s, pts: pct && s.pts.length ? s.pts.map((p) => ({ ...p, y: (p.v / s.pts[0].v - 1) * 100 })) : s.pts.map((p) => ({ ...p, y: p.v })) }));
  const all = lines.flatMap((s) => s.pts);
  if (!all.length) { host.innerHTML = '<p class="chart-empty">No hay sesiones de estos ejercicios en el periodo elegido.</p>'; return; }
  const W = Math.max(280, host.clientWidth);
  const H = 200;
  const mg = { l: pct ? 52 : 42, r: 12, t: 14, b: 24 };
  const ds = all.map((p) => p.d).sort();
  const d0 = ds[0], d1 = ds[ds.length - 1];
  const t0 = parseISO(d0).getTime();
  const t1 = Math.max(parseISO(d1).getTime(), t0 + 7 * 864e5);
  const xs = (d) => mg.l + ((parseISO(d).getTime() - t0) / (t1 - t0)) * (W - mg.l - mg.r);
  let lo = Math.min(...all.map((p) => p.y));
  let hi = Math.max(...all.map((p) => p.y));
  if (pct) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  if (hi - lo < (pct ? 4 : 2)) { const c = (hi + lo) / 2, half = pct ? 2 : 1; lo = c - half; hi = c + half; }
  const step = niceStep(hi - lo, 4);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ys = (v) => mg.t + (1 - (v - lo) / (hi - lo)) * (H - mg.t - mg.b);
  const lab = (v) => (pct ? `${v > 0 ? '+' : ''}${fmt(v, 0)} %` : fmt(v, m.d >= 1 && step < 1 ? 1 : 0));
  let g = '';
  for (let v = lo; v <= hi + 1e-9; v += step) {
    const y = ys(v).toFixed(1);
    g += `<line class="grid${pct && Math.abs(v) < 1e-9 ? ' zero' : ''}" x1="${mg.l}" x2="${W - mg.r}" y1="${y}" y2="${y}"/><text class="axis" x="${mg.l - 6}" y="${y}" dy="0.32em" text-anchor="end">${lab(v)}</text>`;
  }
  g += `<text class="axis" x="${mg.l}" y="${H - 6}">${dateShort(d0)}</text>${d1 !== d0 ? `<text class="axis" x="${W - mg.r}" y="${H - 6}" text-anchor="end">${dateShort(d1)}</text>` : ''}`;
  const paths = lines.map((s) => {
    if (!s.pts.length) return '';
    const d = s.pts.map((p, i) => `${i ? 'L' : 'M'}${xs(p.d).toFixed(1)},${ys(p.y).toFixed(1)}`).join('');
    const dots = s.pts.map((p) => `<circle class="exp-pt s${s.i + 1}" cx="${xs(p.d).toFixed(1)}" cy="${ys(p.y).toFixed(1)}" r="3.5"/>`).join('');
    return `<path class="exp-line s${s.i + 1}" d="${d}"/>${dots}`;
  }).join('');
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(`${m.l} de ${lines.map((s) => s.name).join(', ')}`)}">${g}<line class="cross" y1="${mg.t}" y2="${H - mg.b}" visibility="hidden"/>${paths}</svg>`;
  const svg = host.querySelector('svg');
  const cross = svg.querySelector('.cross');
  const tip = chartTooltip(host);
  const move = (ev) => {
    const rc = svg.getBoundingClientRect();
    const x = ((ev.clientX - rc.left) / rc.width) * W;
    let best = null;
    for (const p of all) { const dx = Math.abs(xs(p.d) - x); if (!best || dx < best.dx) best = { dx, d: p.d }; }
    const rows = lines.map((s) => ({ s, p: s.pts.find((q) => q.d === best.d) })).filter((r) => r.p);
    tip.innerHTML = `<b>${dateShort(best.d)}</b>${rows.map(({ s, p }) => `<span><i class="exp-dot s${s.i + 1}"></i>${esc(s.name)}: ${fmt(p.v, m.d)} ${m.u}${pct ? ` (${p.y > 0 ? '+' : ''}${fmt(p.y, 0)} %)` : ''}</span>`).join('')}`;
    tip.hidden = false;
    const cx = xs(best.d);
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    const half = tip.offsetWidth / 2 + 4;
    tip.style.left = `${Math.min(Math.max((cx / W) * rc.width, half), rc.width - half)}px`;
  };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
}

// Los cambios rehacen la pantalla en la que esté la tarjeta (Progreso o la ficha)
function change(el, fn) {
  const ctx = el.dataset.ctx;
  let st = {};
  try { st = JSON.parse(localStorage.getItem(KEY(ctx)) || '{}') || {}; } catch (e) { st = {}; }
  const cur = loadStateFromDom(el, st);
  if (fn(cur) === false) return;
  writeSel(ctx, { ...cur, touched: true });
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
}
// Lo que se ve ahora (ids en su orden), para no perder la selección por defecto
function loadStateFromDom(el, st) {
  const card = el.closest('.card');
  const ids = [...card.querySelectorAll('.exp-ex .chip.on')].map((b) => b.dataset.id);
  return { ids, metric: st.metric || 'e1rm', range: st.range || '6m', pct: !!st.pct };
}

Object.assign(ACTIONS, {
  'exp-ex': (el) => change(el, (st) => {
    const id = el.dataset.id;
    if (st.ids.includes(id)) st.ids = st.ids.filter((x) => x !== id);
    else if (st.ids.length >= MAX) { toast(`Como mucho ${MAX} ejercicios a la vez.`); return false; }
    else st.ids.push(id);
    return true;
  }),
  'exp-metric': (el) => change(el, (st) => { st.metric = el.dataset.v; }),
  'exp-range': (el) => change(el, (st) => { st.range = el.dataset.v; }),
  'exp-pct': (el) => change(el, (st) => { st.pct = !st.pct; }),
});
