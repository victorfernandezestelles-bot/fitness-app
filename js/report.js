// Informe semanal (lunes a domingo) e historial de series por músculo
import { MUSCLES, MUSCLE_NAME } from './exercises.js';
import { $, addDays, dateShort, durLabel, esc, fmt, parseISO, plural, today } from './util.js';
import { S } from './state.js';
import { mondayOf, muscleHistory, weekReport } from './derived.js';
import { ACTIONS, SHEETS, chartTooltip, pushSheet, render, renderSheets, toast } from './ui.js';

// La última semana completa: el informe de una semana sale el lunes siguiente
export const lastFullWeek = () => addDays(mondayOf(today()), -7);

const signed = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '±') + fmt(Math.abs(v), d);
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
    <button type="button" class="btn ghost wide top-gap" data-act="report-open">Ver el informe</button>
  </section>`;
}

function line(label, value, sub = '') {
  return `<div class="rep-line"><span class="rep-l">${label}</span><span class="rep-v">${value}</span>${sub ? `<span class="rep-s">${sub}</span>` : ''}</div>`;
}

SHEETS.report = {
  title: () => 'Informe semanal',
  render: (s) => {
    const r = weekReport(s.monday);
    const canNext = s.monday < lastFullWeek();
    const cur = s.monday === mondayOf(today());
    const goalSteps = S.settings.goals.steps;
    return `
      <div class="cal-nav">
        <button type="button" class="icon-btn" data-act="report-week" data-d="-7" aria-label="Semana anterior">‹</button>
        <h3 class="cal-title">${weekTitle(s.monday)}${cur ? ' <small class="muted">(en curso)</small>' : ''}</h3>
        <button type="button" class="icon-btn" data-act="report-week" data-d="7" aria-label="Semana siguiente" ${canNext || s.monday < mondayOf(today()) ? '' : 'disabled'}>›</button>
      </div>
      <div class="rep">
        ${line('Peso', r.weight.avg != null ? `${fmt(r.weight.avg, 1)} kg` : '–', r.weight.avg != null ? `media de ${plural(r.weight.n, 'pesada', 'pesadas')}${r.weight.change != null ? ` · ${signed(r.weight.change)} kg frente a la semana anterior` : ''}` : 'sin pesadas')}
        ${line('Calorías', r.kcal.n ? `${fmt(r.kcal.avg)} kcal` : '–', r.kcal.n ? `media de ${r.kcal.n} de 7 días apuntados${r.kcal.goal ? ` · objetivo ${fmt(r.kcal.goal)}` : ''}` : 'ningún día apuntado')}
        ${r.kcal.n ? line('Proteínas', `${fmt(r.kcal.protein)} g`, 'media de los días apuntados') : ''}
        ${line('Pasos', r.steps.n ? fmt(r.steps.avg) : '–', r.steps.n ? `media de ${plural(r.steps.n, 'día', 'días')}${r.steps.hit != null ? ` · ${r.steps.hit} con el objetivo de ${fmt(goalSteps)}` : ''}` : 'sin datos')}
        ${line('Sueño', r.sleep.n ? `${fmt(r.sleep.avg, 1)} h` : '–', r.sleep.n ? `media de ${plural(r.sleep.n, 'noche', 'noches')}` : 'sin datos')}
        ${line('Fuerza', plural(r.strength.sessions, 'sesión', 'sesiones'), `${r.strength.sets} series efectivas`)}
        ${line('Cardio y actividades', plural(r.cardio.count, 'actividad', 'actividades'), r.cardio.count ? durLabel(r.cardio.min * 60000) : '')}
      </div>
      ${r.muscles.length ? `<h3 class="list-title">Series por músculo</h3>
        <div class="rep-muscles">${r.muscles.map((m) => `<span class="rep-m${m.v >= 10 && m.v <= 20 ? ' in' : ''}">${m.l} <b>${fmt(m.v, 1)}</b></span>`).join('')}</div>` : ''}
      ${r.measures.length ? `<h3 class="list-title">Medidas</h3>
        <div class="rep">${r.measures.map((m) => line(m.l, `${fmt(m.v, 1)} ${m.u}`, m.d != null ? `${signed(m.d)} ${m.u} desde la anterior` : 'primera medida')).join('')}</div>` : ''}
      <textarea id="rep-text" class="rep-text" rows="6" readonly aria-label="Informe en texto">${esc(reportText(r))}</textarea>
      <div class="sheet-actions"><button type="button" class="btn primary" data-act="report-copy">Copiar como texto</button></div>`;
  },
};

export function reportText(r) {
  const out = [weekTitle(r.monday)];
  if (r.weight.avg != null) out.push(`Peso: ${fmt(r.weight.avg, 1)} kg de media${r.weight.change != null ? ` (${signed(r.weight.change)} kg)` : ''}`);
  if (r.kcal.n) out.push(`Calorías: ${fmt(r.kcal.avg)} kcal de media, ${r.kcal.n} de 7 días apuntados${r.kcal.goal ? ` (objetivo ${fmt(r.kcal.goal)})` : ''}`);
  if (r.kcal.n) out.push(`Proteínas: ${fmt(r.kcal.protein)} g de media`);
  if (r.steps.n) out.push(`Pasos: ${fmt(r.steps.avg)} de media${r.steps.hit != null ? `, ${r.steps.hit} ${r.steps.hit === 1 ? 'día' : 'días'} con el objetivo` : ''}`);
  if (r.sleep.n) out.push(`Sueño: ${fmt(r.sleep.avg, 1)} h de media (${plural(r.sleep.n, 'noche', 'noches')})`);
  out.push(`Fuerza: ${plural(r.strength.sessions, 'sesión', 'sesiones')}, ${r.strength.sets} series`);
  if (r.cardio.count) out.push(`Cardio y actividades: ${plural(r.cardio.count, 'actividad', 'actividades')}, ${durLabel(r.cardio.min * 60000)}`);
  if (r.muscles.length) out.push(`Series por músculo: ${r.muscles.map((m) => `${m.l} ${fmt(m.v, 1)}`).join(', ')}`);
  if (r.measures.length) out.push(`Medidas: ${r.measures.map((m) => `${m.l.toLowerCase()} ${fmt(m.v, 1)} ${m.u}${m.d != null ? ` (${signed(m.d)})` : ''}`).join(', ')}`);
  return out.join('\n');
}

/* Historial de series de un músculo: últimas 12 semanas con la zona de 10 a 20 */
SHEETS['vol-history'] = {
  title: () => 'Series por semana',
  render: (s) => `
    <div class="chips scroll" role="group" aria-label="Músculo">
      ${MUSCLES.map((m) => `<button type="button" class="chip${s.m === m.k ? ' on' : ''}" data-act="volh-m" data-m="${m.k}" aria-pressed="${s.m === m.k}">${m.l}</button>`).join('')}
    </div>
    <h3 class="cal-title top-gap">${MUSCLE_NAME[s.m]}</h3>
    <div class="chart" id="volh-chart"></div>
    <p class="hint"><span class="zone-key"></span> Zona de 10 a 20 series por semana. Cada serie suma 1 al músculo principal y 0,5 a los secundarios.</p>`,
  mount: (s) => drawVolHistory(s.m),
};

function drawVolHistory(m) {
  const host = $('#volh-chart');
  if (!host) return;
  const data = muscleHistory(m, 12);
  const W = Math.max(280, host.clientWidth);
  const H = 190;
  const mg = { l: 30, r: 8, t: 12, b: 24 };
  const top = Math.max(24, Math.ceil(Math.max(...data.map((d) => d.v)) / 4) * 4 + 2);
  const ys = (v) => mg.t + (1 - v / top) * (H - mg.t - mg.b);
  const bw = (W - mg.l - mg.r) / data.length;
  let g = `<rect class="zone" x="${mg.l}" width="${W - mg.l - mg.r}" y="${ys(20).toFixed(1)}" height="${(ys(10) - ys(20)).toFixed(1)}"/>`;
  for (const v of [0, 10, 20].filter((x) => x <= top)) {
    const y = ys(v).toFixed(1);
    g += `<line class="grid" x1="${mg.l}" x2="${W - mg.r}" y1="${y}" y2="${y}"/><text class="axis" x="${mg.l - 6}" y="${y}" dy="0.32em" text-anchor="end">${v}</text>`;
  }
  const bars = data.map((d, i) => {
    const x = mg.l + i * bw + 3;
    const w = Math.max(2, bw - 6);
    const lbl = i % 2 === 1 ? `<text class="axis" x="${(x + w / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${parseISO(d.mon).getDate()}/${parseISO(d.mon).getMonth() + 1}</text>` : '';
    if (!d.v) return lbl;
    const y = ys(d.v);
    const h = H - mg.b - y;
    const r = Math.min(4, w / 2, h);
    return `<path class="s-bar${d.v >= 10 ? ' hit' : ''}" d="M${x},${H - mg.b}V${(y + r).toFixed(1)}Q${x},${y.toFixed(1)} ${x + r},${y.toFixed(1)}H${(x + w - r).toFixed(1)}Q${x + w},${y.toFixed(1)} ${x + w},${(y + r).toFixed(1)}V${H - mg.b}Z"/>${lbl}`;
  }).join('');
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Series semanales de ${MUSCLE_NAME[m]} en las últimas 12 semanas">${g}${bars}</svg>`;
  const svg = host.querySelector('svg');
  const tip = chartTooltip(host);
  const move = (ev) => {
    const rc = svg.getBoundingClientRect();
    const x = ((ev.clientX - rc.left) / rc.width) * W;
    const i = Math.max(0, Math.min(data.length - 1, Math.floor((x - mg.l) / bw)));
    tip.innerHTML = `<b>Semana del ${dateShort(data[i].mon)}</b><span>${fmt(data[i].v, 1)} series</span>`;
    tip.hidden = false;
    tip.style.left = `${Math.min(Math.max(((mg.l + (i + 0.5) * bw) / W) * rc.width, 60), rc.width - 60)}px`;
  };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', () => { tip.hidden = true; });
}

Object.assign(ACTIONS, {
  'report-open': () => pushSheet({ type: 'report', monday: lastFullWeek() }),
  'report-week': (el, top) => {
    const next = addDays(top.monday, Number(el.dataset.d));
    if (next > mondayOf(today())) return;
    top.monday = next;
    renderSheets();
  },
  'report-copy': async () => {
    const ta = $('#rep-text');
    const text = ta.value;
    try {
      await navigator.clipboard.writeText(text);
      toast('Informe copiado');
    } catch (e) {
      ta.focus();
      ta.select();
      try { document.execCommand('copy'); toast('Informe copiado'); } catch (e2) { toast('Selecciona el texto y cópialo'); }
    }
  },
  'vol-history': (el) => pushSheet({ type: 'vol-history', m: el.dataset.m }),
  'volh-m': (el, top) => { top.m = el.dataset.m; renderSheets(); },
});
