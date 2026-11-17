// Informe por periodo (resumen y día a día) e historial de series por músculo
import { MUSCLES, MUSCLE_NAME } from './exercises.js';
import { $, addDays, cap, dateLong, dateShort, deliverFile, durLabel, esc, fmt, isDate, parseISO, plural, signed, today } from './util.js';
import { MEALS, S } from './state.js';
import { MEASURES, datesBetween, exName, isEffective, isSeg, mondayOf, muscleHistory, periodReport, qtyLabel, setsText, weekReport, workoutDuration } from './derived.js';
import { ACTIONS, SHEETS, chartTooltip, pushSheet, render, renderSheets, repLine, toast } from './ui.js';
import { tonIndOn, tonSwitch } from './training.js';
import { actName } from './cardio.js';

// La última semana completa: el informe de una semana sale el lunes siguiente
export const lastFullWeek = () => addDays(mondayOf(today()), -7);

const weekTitle = (mon) => `Semana del ${dateShort(mon)} al ${dateShort(addDays(mon, 6))}`;

export function reportCard() {
  const mon = lastFullWeek();
  const r = weekReport(mon);
  const anything = r.weight.n || r.kcal.n || r.steps.n || r.strength.sessions || r.cardio.count || r.sleep.n;
  return `
  <section class="card">
    <div class="card-head"><h2>Informe semanal</h2><span class="muted">${dateShort(mon)} – ${dateShort(addDays(mon, 6))}</span></div>
    ${anything ? `<p class="muted">${[
      r.weight.avg != null ? `${fmt(r.weight.avg, 1)} kg de media${r.weight.change != null ? ` (${signed(r.weight.change)} kg)` : ''}` : '',
      r.kcal.n ? `${fmt(r.kcal.avg)} kcal de media` : '',
      r.strength.sessions ? plural(r.strength.sessions, 'sesión de fuerza', 'sesiones de fuerza') : '',
    ].filter(Boolean).join(' · ')}</p>` : '<p class="muted">La semana pasada no hay datos apuntados.</p>'}
    <button type="button" class="btn ghost wide top-gap" data-act="report-open">Ver o compartir un informe</button>
  </section>`;
}


/* ---------- informe por periodo ---------- */

const MAX_DAYS = 366;
const PRESETS = [['7d', 'Últimos 7 días'], ['lastweek', 'Semana pasada'], ['30d', 'Últimos 30 días'], ['custom', 'Elegir fechas']];
const numDate = (d) => d.split('-').reverse().join('/');
const longDate = (d) => `${cap(dateLong(d))} · ${numDate(d)}`;

// Fechas del periodo elegido
export function reportRange(s) {
  const t = today();
  if (s.preset === '7d') return [addDays(t, -6), t];
  if (s.preset === '30d') return [addDays(t, -29), t];
  if (s.preset === 'custom' && s.from && s.to) return [s.from, s.to];
  const mon = lastFullWeek();
  return [mon, addDays(mon, 6)];
}
const periodTitle = (from, to) => (from === to ? `Informe del ${numDate(from)}` : `Informe del ${numDate(from)} al ${numDate(to)}`);

// Una línea por ejercicio: series efectivas y, si las hay, las RIR
function exerciseLine(we) {
  const eff = (we.sets || []).filter((st) => st.t !== 'w' && isEffective(st));
  if (!eff.length) return null;
  const rir = eff.filter((st) => !isSeg(st) && st.rir != null).map((st) => fmt(st.rir));
  return { name: exName(we), sets: setsText(eff), rir: rir.length ? rir.join('/') : '' };
}

// Contenido del informe; text = true para la versión en texto
function dayParts(x, withFoods) {
  const out = { food: '', meals: [], body: '', workouts: [], activities: [], measures: '' };
  if (x.food) {
    const g = x.goals?.kcal;
    out.food = `${fmt(x.food.kcal)} kcal${g ? ` (objetivo ${fmt(g)})` : ''} · P ${fmt(x.food.p)} · H ${fmt(x.food.c)} · G ${fmt(x.food.f)} g`;
    if (withFoods) {
      out.meals = MEALS.map(([k, l]) => {
        const list = x.entries.filter((e) => (e.meal || 'otros') === k);
        return list.length ? { l, items: list.map((e) => `${e.name || 'Alimento'} ${qtyLabel(e.qty, e.unit)}`) } : null;
      }).filter(Boolean);
    }
  }
  out.body = [x.steps != null ? `${fmt(x.steps)} pasos` : '', x.weight != null ? `${fmt(x.weight, 1)} kg` : '', x.sleep != null ? `${fmt(x.sleep, 1)} h de sueño` : ''].filter(Boolean).join(' · ');
  out.workouts = x.workouts.map((w) => {
    const dur = workoutDuration(w);
    return { title: `${w.name || 'Entreno'}${dur ? ` (${durLabel(dur)})` : ''}`, lines: w.exercises.map(exerciseLine).filter(Boolean) };
  });
  out.activities = x.activities.map((a) => [actName(a), a.min ? `${fmt(a.min)} min` : '', a.km ? `${fmt(a.km, 1)} km` : '', a.kcal ? `${fmt(a.kcal)} kcal` : ''].filter(Boolean).join(' · '));
  if (x.measures) out.measures = MEASURES.filter((m) => x.measures[m.k] != null).map((m) => `${m.l.toLowerCase()} ${fmt(x.measures[m.k], 1)} ${m.u}`).join(', ');
  return out;
}

function summaryLines(r) {
  const goalSteps = S.settings.goals.steps;
  const out = [];
  const w = r.weight;
  if (w.n) {
    const sub = w.n === 1 ? `una pesada (${numDate(w.first.d)})`
      : `${w.n} pesadas · de ${fmt(w.first.weight, 1)} kg (${numDate(w.first.d)}) a ${fmt(w.last.weight, 1)} kg (${numDate(w.last.d)})`;
    out.push(['Peso', `${fmt(w.avg, 1)} kg de media`, sub + (w.trend != null ? ` · primera semana frente a la última: ${signed(w.trend)} kg` : '')]);
  } else out.push(['Peso', '–', 'sin pesadas']);
  out.push(r.kcal.n ? ['Calorías', `${fmt(r.kcal.avg)} kcal de media`, `${r.kcal.n} de ${r.n} días apuntados${r.kcal.goal ? ` · objetivo medio ${fmt(r.kcal.goal)}` : ''}`] : ['Calorías', '–', 'ningún día apuntado']);
  if (r.kcal.n) out.push(['Macros', `P ${fmt(r.kcal.p)} · H ${fmt(r.kcal.c)} · G ${fmt(r.kcal.f)} g`, 'media de los días apuntados']);
  out.push(r.steps.n ? ['Pasos', `${fmt(r.steps.avg)} de media`, `${plural(r.steps.n, 'día', 'días')}${r.steps.hit != null ? ` · ${r.steps.hit} con el objetivo de ${fmt(goalSteps)}` : ''}`] : ['Pasos', '–', 'sin datos']);
  out.push(r.sleep.n ? ['Sueño', `${fmt(r.sleep.avg, 1)} h de media`, plural(r.sleep.n, 'noche', 'noches')] : ['Sueño', '–', 'sin datos']);
  out.push(['Fuerza', plural(r.strength.sessions, 'sesión', 'sesiones'), `${r.strength.sets} series efectivas`]);
  out.push(['Cardio y actividades', plural(r.cardio.count, 'actividad', 'actividades'), r.cardio.count ? durLabel(r.cardio.min * 60000) : '']);
  return out;
}

function reportHTML(r, withFoods) {
  const muscles = r.muscles.length ? `<h3 class="list-title">Series por músculo</h3>
    <p class="hint">${r.n >= 7 ? 'Media por semana del periodo; la zona buena es de 10 a 20.' : 'Total del periodo.'}</p>
    <div class="rep-muscles">${r.muscles.map((m) => { const v = r.n >= 7 ? m.wk : m.v; return `<span class="rep-m${r.n >= 7 && v >= 10 && v <= 20 ? ' in' : ''}">${esc(m.l)} <b>${fmt(v, 1)}</b></span>`; }).join('')}</div>` : '';
  const days = r.days.map((x) => {
    const p = dayParts(x, withFoods);
    return `<article class="rep-day">
      <h4>${longDate(x.d)}</h4>
      ${p.food ? `<p><b>Comida:</b> ${esc(p.food)}</p>` : ''}
      ${p.meals.length ? `<ul class="rep-list">${p.meals.map((m) => `<li><b>${esc(m.l)}:</b> ${esc(m.items.join(', '))}</li>`).join('')}</ul>` : ''}
      ${p.body ? `<p>${esc(p.body)}</p>` : ''}
      ${p.workouts.map((w) => `<p><b>Entreno «${esc(w.title)}»</b></p>
        <ul class="rep-list">${w.lines.map((l) => `<li>${esc(l.name)}: ${esc(l.sets)}${l.rir ? ` <span class="muted">· RIR ${esc(l.rir)}</span>` : ''}</li>`).join('')}</ul>`).join('')}
      ${p.activities.map((a) => `<p><b>Actividad:</b> ${esc(a)}</p>`).join('')}
      ${p.measures ? `<p><b>Medidas:</b> ${esc(p.measures)}</p>` : ''}
    </article>`;
  }).join('');
  return `<div class="rep-doc">
    <h3 class="rep-title">${periodTitle(r.from, r.to)}</h3>
    <div class="rep">${summaryLines(r).map(([l, v, sub]) => repLine(esc(l), esc(v), esc(sub))).join('')}</div>
    ${muscles}
    <h3 class="list-title">Día a día</h3>
    ${days || '<p class="empty">No hay nada apuntado en estas fechas.</p>'}
  </div>`;
}

export function reportText(r, withFoods) {
  const out = [periodTitle(r.from, r.to), ''];
  for (const [l, v, sub] of summaryLines(r)) if (v !== '–') out.push(`${l}: ${v}${sub ? ` (${sub})` : ''}`);
  if (r.muscles.length) out.push(`Series por músculo${r.n >= 7 ? ' (media por semana)' : ''}: ${r.muscles.map((m) => `${m.l} ${fmt(r.n >= 7 ? m.wk : m.v, 1)}`).join(', ')}`);
  for (const x of r.days) {
    const p = dayParts(x, withFoods);
    out.push('', `— ${longDate(x.d)}`);
    if (p.food) out.push(`Comida: ${p.food}`);
    for (const m of p.meals) out.push(`  ${m.l}: ${m.items.join(', ')}`);
    if (p.body) out.push(p.body);
    for (const w of p.workouts) {
      out.push(`Entreno «${w.title}»`);
      for (const l of w.lines) out.push(`  ${l.name}: ${l.sets}${l.rir ? ` · RIR ${l.rir}` : ''}`);
    }
    for (const a of p.activities) out.push(`Actividad: ${a}`);
    if (p.measures) out.push(`Medidas: ${p.measures}`);
  }
  return out.join('\n');
}

SHEETS.report = {
  title: () => 'Informe',
  render: (s) => {
    const [from, to] = reportRange(s);
    const r = periodReport(from, to);
    return `
      <div class="chips" role="group" aria-label="Periodo">
        ${PRESETS.map(([k, l]) => `<button type="button" class="chip${s.preset === k ? ' on' : ''}" data-act="rep-preset" data-v="${k}" aria-pressed="${s.preset === k}">${l}</button>`).join('')}
      </div>
      ${s.preset === 'custom' ? `<div class="grid2 top-gap">
        <label class="field"><span>Desde</span><input id="rep-from" type="date" value="${from}" max="${today()}"></label>
        <label class="field"><span>Hasta</span><input id="rep-to" type="date" value="${to}" max="${today()}"></label>
      </div>
      <button type="button" class="btn wide top-gap" data-act="rep-range">Ver estas fechas</button>` : ''}
      <button type="button" class="chip top-gap${s.foods ? ' on' : ''}" data-act="rep-foods" aria-pressed="${!!s.foods}">Incluir cada alimento</button>
      ${reportHTML(r, s.foods)}
      <textarea id="rep-text" class="rep-text" rows="4" readonly aria-label="Informe en texto">${esc(reportText(r, s.foods))}</textarea>
      <p class="hint">El informe lleva datos de salud: compártelo solo con quien tú quieras.</p>
      <div class="sheet-actions rep-actions">
        <button type="button" class="btn primary" data-act="rep-share">Compartir</button>
        <button type="button" class="btn" data-act="rep-print">PDF</button>
        <button type="button" class="btn ghost" data-act="rep-file">Archivo</button>
      </div>`;
  },
};

// Estilos del archivo .html del informe (se abre en cualquier navegador y se puede imprimir)
const FILE_CSS = `body{font:15px/1.45 -apple-system,system-ui,sans-serif;color:#1d1d1f;max-width:760px;margin:24px auto;padding:0 16px}
h3{margin:22px 0 8px;font-size:17px}h4{margin:0 0 6px;font-size:15px}p{margin:4px 0}.muted,.hint{color:#6e6e73}.hint{font-size:13px}
.rep-line{display:grid;grid-template-columns:1fr auto;gap:2px 12px;padding:6px 0;border-bottom:1px solid #e5e5ea}.rep-v{font-weight:600}
.rep-s{grid-column:1/-1;color:#6e6e73;font-size:13px}.rep-muscles{display:flex;flex-wrap:wrap;gap:6px}.rep-m{border:1px solid #d2d2d7;border-radius:8px;padding:2px 8px}
.rep-day{padding:10px 0;border-bottom:1px solid #e5e5ea;break-inside:avoid}.rep-list{margin:2px 0 6px;padding-left:20px}.rep-title{font-size:20px}`;

/* Historial de series de un músculo: últimas 12 semanas con la zona de 10 a 20 */
SHEETS['vol-history'] = {
  title: () => 'Por semana',
  render: (s) => `
    <div class="segmented" role="tablist" aria-label="Qué medir">
      <button type="button" role="tab" aria-selected="${s.metric !== 'kg'}" data-act="volh-metric" data-v="sets">Series</button>
      <button type="button" role="tab" aria-selected="${s.metric === 'kg'}" data-act="volh-metric" data-v="kg">Tonelaje</button>
    </div>
    ${s.metric === 'kg' ? tonSwitch() : ''}
    <div class="chips scroll top-gap" role="group" aria-label="Músculo">
      ${MUSCLES.map((m) => `<button type="button" class="chip${s.m === m.k ? ' on' : ''}" data-act="volh-m" data-m="${m.k}" aria-pressed="${s.m === m.k}">${m.l}</button>`).join('')}
    </div>
    <h3 class="cal-title top-gap">${MUSCLE_NAME[s.m]}</h3>
    <div class="chart" id="volh-chart"></div>
    ${s.metric === 'kg'
    ? `<p class="hint">${tonIndOn() ? 'Tonelaje directo más indirecto: kg × repeticiones de las series efectivas de los ejercicios en los que este músculo es principal, más los de aquellos en los que es secundario.' : 'Tonelaje directo: kg × repeticiones de las series efectivas, solo de los ejercicios en los que este músculo es el principal.'} Con el peso corporal solo cuenta el lastre que apuntes.</p>`
    : '<p class="hint"><span class="zone-key"></span> Zona de 10 a 20 series por semana. Cada serie suma 1 al músculo principal y 0,5 a los secundarios.</p>'}`,
  mount: (s) => drawVolHistory(s.m, s.metric === 'kg' ? 'kg' : 'v'),
};

function drawVolHistory(m, key = 'v') {
  const host = $('#volh-chart');
  if (!host) return;
  const data = muscleHistory(m, 12);
  const kg = key === 'kg';
  const ind = kg && tonIndOn();
  const val = (d) => (ind ? d.kg + d.kgInd : d[key]);
  const W = Math.max(280, host.clientWidth);
  const H = 190;
  const mg = { l: 30, r: 8, t: 12, b: 24 };
  const maxV = Math.max(...data.map(val));
  // Escala: series hasta un múltiplo de 4; kg hasta un número redondo
  const step = kg ? Math.max(500, 10 ** Math.floor(Math.log10(Math.max(maxV, 1))) / 2) : 4;
  const top = kg ? Math.max(1000, Math.ceil((maxV * 1.08) / step) * step) : Math.max(24, Math.ceil(maxV / 4) * 4 + 2);
  const ticks = kg ? [0, top / 2, top] : [0, 10, 20].filter((x) => x <= top);
  const ys = (v) => mg.t + (1 - v / top) * (H - mg.t - mg.b);
  const bw = (W - mg.l - mg.r) / data.length;
  let g = kg ? '' : `<rect class="zone" x="${mg.l}" width="${W - mg.l - mg.r}" y="${ys(20).toFixed(1)}" height="${(ys(10) - ys(20)).toFixed(1)}"/>`;
  for (const v of ticks) {
    const y = ys(v).toFixed(1);
    const lbl = kg && v >= 1000 ? `${fmt(v / 1000, 1)}t` : fmt(v);
    g += `<line class="grid" x1="${mg.l}" x2="${W - mg.r}" y1="${y}" y2="${y}"/><text class="axis" x="${mg.l - 6}" y="${y}" dy="0.32em" text-anchor="end">${lbl}</text>`;
  }
  const bars = data.map((d, i) => {
    const x = mg.l + i * bw + 3;
    const w = Math.max(2, bw - 6);
    const lbl = i % 2 === 1 ? `<text class="axis" x="${(x + w / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${parseISO(d.mon).getDate()}/${parseISO(d.mon).getMonth() + 1}</text>` : '';
    if (!val(d)) return lbl;
    const y = ys(val(d));
    const h = H - mg.b - y;
    const r = Math.min(4, w / 2, h);
    return `<path class="s-bar${!kg && d.v >= 10 ? ' hit' : ''}" d="M${x},${H - mg.b}V${(y + r).toFixed(1)}Q${x},${y.toFixed(1)} ${x + r},${y.toFixed(1)}H${(x + w - r).toFixed(1)}Q${x + w},${y.toFixed(1)} ${x + w},${(y + r).toFixed(1)}V${H - mg.b}Z"/>${lbl}`;
  }).join('');
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${kg ? (ind ? 'Tonelaje directo e indirecto semanal' : 'Tonelaje directo semanal') : 'Series semanales'} de ${MUSCLE_NAME[m]} en las últimas 12 semanas">${g}${bars}</svg>`;
  const svg = host.querySelector('svg');
  const tip = chartTooltip(host);
  const move = (ev) => {
    const rc = svg.getBoundingClientRect();
    const x = ((ev.clientX - rc.left) / rc.width) * W;
    const i = Math.max(0, Math.min(data.length - 1, Math.floor((x - mg.l) / bw)));
    tip.innerHTML = `<b>Semana del ${dateShort(data[i].mon)}</b><span>${fmt(data[i].v, 1)} series · ${fmt(data[i].kg)} kg directos${ind ? ` · ${fmt(data[i].kgInd)} kg indirectos` : ''}</span>`;
    tip.hidden = false;
    tip.style.left = `${Math.min(Math.max(((mg.l + (i + 0.5) * bw) / W) * rc.width, 60), rc.width - 60)}px`;
  };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', () => { tip.hidden = true; });
}

async function copyText(ta, ok) {
  try {
    await navigator.clipboard.writeText(ta.value);
    toast(ok);
  } catch (e) {
    ta.focus();
    ta.select();
    try { document.execCommand('copy'); toast(ok); } catch (e2) { toast('Selecciona el texto y cópialo'); }
  }
}

Object.assign(ACTIONS, {
  'report-open': () => pushSheet({ type: 'report', preset: 'lastweek', foods: false }),
  'rep-preset': (el, top) => {
    top.preset = el.dataset.v;
    if (top.preset === 'custom' && !top.from) { top.to = today(); top.from = addDays(top.to, -13); }
    renderSheets();
  },
  'rep-range': (el, top) => {
    const from = $('#rep-from')?.value;
    const to = $('#rep-to')?.value;
    if (!isDate(from) || !isDate(to)) return toast('Elige las dos fechas.');
    if (from > to) return toast('La fecha «Desde» tiene que ser anterior a «Hasta».');
    if (to > today()) return toast('La fecha «Hasta» no puede ser posterior a hoy.');
    if (datesBetween(from, to).length > MAX_DAYS) return toast('Elige como mucho un año.');
    Object.assign(top, { from, to });
    renderSheets();
  },
  'rep-foods': (el, top) => { top.foods = !top.foods; renderSheets(); },
  'rep-share': async () => {
    const text = $('#rep-text').value;
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    await copyText($('#rep-text'), 'Informe copiado');
  },
  'rep-print': () => {
    const doc = $('.sheet .rep-doc');
    if (!doc || typeof window.print !== 'function') return toast('Este navegador no permite imprimir: usa «Archivo».');
    // Se imprime solo el informe, en una capa aparte que se quita al terminar
    let root = document.getElementById('print-root');
    if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
    root.innerHTML = doc.outerHTML;
    document.documentElement.classList.add('printing');
    const done = () => { document.documentElement.classList.remove('printing'); root.innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { try { window.print(); } catch (e) { done(); toast('No se ha podido abrir la impresión: usa «Archivo».'); } }, 50);
  },
  'rep-file': async () => {
    const doc = $('.sheet .rep-doc');
    if (!doc) return;
    const title = doc.querySelector('.rep-title')?.textContent || 'Informe';
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title><style>${FILE_CSS}</style></head><body>${doc.outerHTML}</body></html>`;
    const name = `fitness-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.html`;
    await deliverFile(name, html, 'text/html');
  },
  'vol-history': (el) => pushSheet({ type: 'vol-history', m: el.dataset.m }),
  'volh-m': (el, top) => { top.m = el.dataset.m; renderSheets(); },
  'volh-metric': (el, top) => { top.metric = el.dataset.v; renderSheets(); },
});
