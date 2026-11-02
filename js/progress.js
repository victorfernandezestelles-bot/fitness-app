import { $, addDays, dateLong, dateShort, fmt, inputVal, niceStep, num, parseISO, plural, today } from './util.js';
import { S, saveMeasures, saveSettings, saveWeights } from './state.js';
import { KCAL_PER_KG, MEASURES, MEASURE_BY_K, dataEnergy, dayOf, formulaEnergy, latestMeasure, latestWeight, measureSeries, mondayOf, navyBodyFat, weeklyWeights, weightSeries } from './derived.js';
import { ACTIONS, CHANGES, FORMS, HOOKS, SHEETS, VIEWS, chartTooltip, closeSheets, pageList, pushSheet, render, toast, undoable } from './ui.js';
import { reportCard } from './report.js';
import { fillPhotoCard, photoCard } from './photos.js';

export function viewProgreso() {
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

  // Sueño: medias de las últimas 7 y 30 noches apuntadas
  const sleepAvg = (n) => {
    const v = [];
    for (let i = 0; i < n; i++) { const x = dayOf(addDays(t, -i)).sleep; if (x != null) v.push(x); }
    return v.length ? { avg: v.reduce((a, b) => a + b, 0) / v.length, n: v.length } : null;
  };
  const sl7 = sleepAvg(7);
  const sl30 = sleepAvg(30);

  // Media de calorías de los últimos 7 días con registros
  const kcalDays = [];
  for (let i = 1; i <= 7; i++) {
    const d = dayOf(addDays(t, -i));
    if (d.entries.length) kcalDays.push(d.entries.reduce((a, e) => a + (e.n.kcal || 0), 0));
  }
  const kcalAvg = kcalDays.length ? kcalDays.reduce((a, b) => a + b, 0) / kcalDays.length : null;

  const ranges = [[30, 'Mes'], [90, '3 meses'], [365, 'Año']];
  return `
  <header class="page-head">
    <h1>Progreso</h1>
  </header>

  ${reportCard()}

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
    ${viewWeekly()}
    ${all.length ? (() => {
      const pl = pageList('weights', [...all].reverse(), 30, (d) => `<li class="row static"><span class="row-main">${dateLong(d)}</span><span class="row-side">${fmt(S.weights[d], 2)} kg</span><button type="button" class="icon-btn small" data-act="del-weight" data-date="${d}" aria-label="Borrar el peso del ${dateLong(d)}">×</button></li>`);
      return `<details class="detail compact" ${S.ui.more?.weights ? 'open' : ''}><summary>Todos los registros (${all.length})</summary>
      <ul class="list tight">${pl.html}</ul>${pl.more}
    </details>`;
    })() : ''}
  </section>

  ${viewEnergy()}

  ${viewMeasures()}

  ${photoCard()}

  <section class="card">
    <div class="card-head"><h2>Pasos</h2><span class="muted">últimos 14 días</span></div>
    <div class="stats">
      <div><span class="stat-l">Media 7 días</span><span class="stat-v">${fmt(stepAvg)}</span></div>
      <div><span class="stat-l">Objetivo</span><span class="stat-v">${fmt(S.settings.goals.steps)}</span></div>
    </div>
    <div class="chart" id="steps-chart"></div>
  </section>

  <section class="card">
    <div class="card-head"><h2>Sueño</h2><span class="muted">últimos 14 días</span></div>
    <div class="stats">
      <div><span class="stat-l">Media 7 días</span><span class="stat-v">${sl7 ? fmt(sl7.avg, 1) : '–'}<small> h</small></span>${sl7 ? `<span class="stat-s">${plural(sl7.n, 'noche apuntada', 'noches apuntadas')}</span>` : ''}</div>
      <div><span class="stat-l">Media 30 días</span><span class="stat-v">${sl30 ? fmt(sl30.avg, 1) : '–'}<small> h</small></span>${sl30 ? `<span class="stat-s">${plural(sl30.n, 'noche apuntada', 'noches apuntadas')}</span>` : ''}</div>
    </div>
    <div class="chart" id="sleep-chart"></div>
  </section>

  <section class="card">
    <div class="card-head"><h2>Calorías</h2></div>
    <div class="stats">
      <div><span class="stat-l">Media 7 días</span><span class="stat-v">${fmt(kcalAvg)}<small> kcal</small></span><span class="stat-s">${kcalDays.length} ${kcalDays.length === 1 ? 'día' : 'días'} con registro, sin contar hoy</span></div>
      <div><span class="stat-l">Objetivo</span><span class="stat-v">${fmt(S.settings.goals.kcal)}<small> kcal</small></span></div>
    </div>
  </section>`;
}

export function drawCharts() {
  drawWeightChart();
  drawStepsChart();
  drawSleepChart();
  if (S.ui.measureK) {
    const m = MEASURE_BY_K[S.ui.measureK];
    drawSeries($('#measure-chart'), measureSeries(m.k), m.u, 1);
  }
}

export function drawWeightChart() {
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

export function drawStepsChart() {
  drawDayBars('steps-chart', (d) => dayOf(d).steps, {
    goal: S.settings.goals.steps,
    axis: (v) => (v >= 1000 ? fmt(v / 1000, 1) + ' mil' : fmt(v)),
    tip: (v) => fmt(v) + ' pasos',
    goalText: (g) => `objetivo ${fmt(g)}`,
    empty: 'Apunta tus pasos en la pantalla Hoy. Puedes copiarlos de la app Salud.',
    label: 'Pasos de los últimos 14 días',
  });
}

export function drawSleepChart() {
  drawDayBars('sleep-chart', (d) => dayOf(d).sleep, {
    goal: 8,
    axis: (v) => fmt(v) + ' h',
    tip: (v) => fmt(v, 1) + ' h de sueño',
    goalText: () => '8 h',
    empty: 'Apunta las horas que has dormido en la pantalla Hoy.',
    label: 'Horas de sueño de los últimos 14 días',
    minTop: 9,
  });
}

// Barras de los últimos 14 días con línea de objetivo y detalle al tocar
export function drawDayBars(id, valueOf, o) {
  const host = $('#' + id);
  if (!host) return;
  const t = today();
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(addDays(t, -i));
  const vals = days.map(valueOf);
  if (!vals.some((v) => v != null)) {
    host.innerHTML = `<p class="chart-empty">${o.empty}</p>`;
    return;
  }
  const goal = o.goal;
  const W = Math.max(280, host.clientWidth);
  const H = 170;
  const m = { l: 38, r: 8, t: 12, b: 24 };
  const max = Math.max(o.minTop || 0, goal || 0, ...vals.map((v) => v || 0)) * 1.08;
  const step = niceStep(max, 3);
  const top = Math.ceil(max / step) * step;
  const ys = (v) => m.t + (1 - v / top) * (H - m.t - m.b);
  const bw = (W - m.l - m.r) / days.length;
  let g = '';
  for (let v = 0; v <= top + 1e-9; v += step) {
    const y = ys(v).toFixed(1);
    g += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}"/><text class="axis" x="${m.l - 6}" y="${y}" dy="0.32em" text-anchor="end">${o.axis(v)}</text>`;
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
  const goalLine = goal ? `<line class="goal" x1="${m.l}" x2="${W - m.r}" y1="${ys(goal).toFixed(1)}" y2="${ys(goal).toFixed(1)}"/><text class="axis goal-l" x="${m.l + 4}" y="${(ys(goal) - 5).toFixed(1)}" text-anchor="start">${o.goalText(goal)}</text>` : '';
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${o.label}">${g}${bars}${goalLine}</svg>`;
  const svg = host.querySelector('svg');
  const tip = chartTooltip(host);
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(days.length - 1, Math.floor((x - m.l) / bw)));
    tip.innerHTML = `<b>${dateShort(days[i])}</b><span>${vals[i] == null ? 'Sin dato' : o.tip(vals[i])}</span>`;
    tip.hidden = false;
    tip.style.left = `${Math.min(Math.max(((m.l + (i + 0.5) * bw) / W) * r.width, 60), r.width - 60)}px`;
  };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', () => { tip.hidden = true; });
}

export function viewWeekly() {
  const weeks = weeklyWeights(8);
  if (weeks.filter((w) => w.avg != null).length < 1) return '';
  const rows = weeks.map((w, i) => {
    if (w.avg == null) return '';
    const prev = weeks.slice(i + 1).find((x) => x.avg != null);
    const diff = prev ? w.avg - prev.avg : null;
    const pct = prev ? (diff / prev.avg) * 100 : null;
    const sign = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');
    return `<tr>
      <th scope="row">${w.mon === mondayOf(today()) ? 'Esta' : dateShort(w.mon)}</th>
      <td><b>${fmt(w.avg, 2)}</b></td>
      <td>${diff == null ? '–' : `${sign(diff)}${fmt(Math.abs(diff), 2)} kg`}</td>
      <td class="pct">${pct == null ? '' : `${sign(pct)}${fmt(Math.abs(pct), 1)} %`}</td>
      <td class="pct">${w.count}/7</td>
    </tr>`;
  }).join('');
  return `<details class="detail compact" open>
    <summary>Medias semanales</summary>
    <div class="table-wrap"><table class="nut-table compact">
      <thead><tr><th scope="col">Semana del</th><th scope="col">Media (kg)</th><th scope="col">Cambio</th><th scope="col">%</th><th scope="col">Pesajes</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="hint">Compara medias semanales y no pesajes sueltos: el peso de un día sube y baja con el agua, la sal o la comida del día anterior.</p>
  </details>`;
}

export function viewEnergy() {
  const de = dataEnergy();
  const fe = formulaEnergy();
  const g = S.settings.goals;
  const rate = S.settings.rate ?? -0.5;
  const tdee = de.ready ? de.tdee : fe?.tdee;
  const w = latestWeight();
  let body = '';
  if (de.ready) {
    body = `<div class="stats">
        <div><span class="stat-l">Tu mantenimiento</span><span class="stat-v">${fmt(Math.round(de.tdee / 10) * 10)}<small> kcal</small></span><span class="stat-s">según tus datos</span></div>
        <div><span class="stat-l">Comes de media</span><span class="stat-v">${fmt(de.kcalAvg)}<small> kcal</small></span><span class="stat-s">${de.intakeDays} días apuntados</span></div>
        <div><span class="stat-l">Tendencia</span><span class="stat-v">${de.weekly > 0 ? '+' : de.weekly < 0 ? '−' : ''}${fmt(Math.abs(de.weekly), 2)}<small> kg/sem</small></span><span class="stat-s">${de.weightDays} pesajes</span></div>
      </div>
      <p class="hint">Calculado con las últimas 4 semanas: lo que comes de media menos lo que explica el cambio de tu peso (1 kg ≈ 7.700 kcal). Solo es fiable si apuntas todo lo que comes.${fe ? ` La fórmula daría ${fmt(Math.round(fe.tdee / 10) * 10)} kcal.` : ''}</p>`;
  } else {
    body = `<div class="stats">
        <div><span class="stat-l">Mantenimiento ${fe ? 'orientativo' : ''}</span><span class="stat-v">${fe ? fmt(Math.round(fe.tdee / 10) * 10) : '–'}<small> kcal</small></span><span class="stat-s">${fe ? 'según fórmula' : 'faltan datos'}</span></div>
      </div>
      <p class="hint">${fe ? 'Es una estimación con fórmula (Mifflin-St Jeor y tu nivel de actividad). ' : `Rellena tu sexo, año de nacimiento, altura y actividad en <button type="button" class="link" data-act="goto" data-tab="ajustes">Ajustes</button> para una primera estimación. `}
      Para calcular tu gasto real hacen falta 14 días con comidas apuntadas y 8 pesajes en las últimas 4 semanas: llevas ${de.intakeDays} días y ${de.weightDays} pesajes.</p>`;
  }
  let calc = '';
  if (tdee) {
    const target = Math.round((tdee + (rate * KCAL_PER_KG) / 7) / 10) * 10;
    const floor = fe ? fe.bmr : 1500;
    const pct = w ? (rate / w) * 100 : null;
    calc = `<div class="calc">
      <label class="field"><span>Ritmo que buscas</span>
        <span class="input-unit"><input id="rate-in" type="text" inputmode="decimal" value="${inputVal(rate, 2)}" data-change="rate"><em>kg/semana</em></span>
      </label>
      <p>Para ${rate < 0 ? 'bajar' : rate > 0 ? 'subir' : 'mantener'}${rate ? ` ${fmt(Math.abs(rate), 2)} kg por semana${pct ? ` (${fmt(Math.abs(pct), 1)} % de tu peso)` : ''}` : ' tu peso'}, come unas <b>${fmt(target)} kcal</b> al día${g.kcal ? `; tu objetivo ahora es de ${fmt(g.kcal)}` : ''}.</p>
      ${target < floor ? `<p class="notice small">Está por debajo de ${fe ? 'tu metabolismo basal' : '1.500 kcal'}. Es mejor un ritmo más suave.</p>` : ''}
      <button type="button" class="btn ghost small" data-act="use-target" data-kcal="${target}">Usar ${fmt(target)} kcal como objetivo</button>
    </div>`;
  }
  return `<section class="card">
    <div class="card-head"><h2>Gasto calórico</h2></div>
    ${body}
    ${calc}
  </section>`;
}

export function viewMeasures() {
  const dates = Object.keys(S.measures).sort();
  const h = S.settings.profile.height;
  if (!dates.length) {
    return `<section class="card">
      <div class="card-head"><h2>Medidas</h2><button type="button" class="btn small" data-act="measure-new">Nueva medición</button></div>
      <p class="muted">Mídete cada 2–4 semanas, por la mañana y en ayunas, siempre en el mismo sitio. Lo mínimo: <b>cintura</b>, <b>hombros</b> y <b>cuello</b>. Con ellas la app calcula tu % de grasa estimado y la relación entre hombros y cintura.</p>
    </section>`;
  }
  const waist = latestMeasure('cintura')?.v;
  const shoulders = latestMeasure('hombros')?.v;
  const bf = navyBodyFat();
  const measured = latestMeasure('grasa')?.v;
  const ratios = `<div class="stats">
      <div><span class="stat-l">Cintura / altura</span><span class="stat-v">${waist && h ? fmt(waist / h, 2) : '–'}</span><span class="stat-s">${waist && h ? (waist / h < 0.5 ? 'por debajo de 0,5' : 'objetivo: menos de 0,5') : 'falta altura o cintura'}</span></div>
      <div><span class="stat-l">Hombros / cintura</span><span class="stat-v">${waist && shoulders ? fmt(shoulders / waist, 2) : '–'}</span><span class="stat-s">cuanto más alto, más forma de V</span></div>
      <div><span class="stat-l">% grasa estimado</span><span class="stat-v">${bf != null ? fmt(bf, 1) : '–'}<small>${bf != null ? ' %' : ''}</small></span><span class="stat-s">${bf != null ? 'fórmula de la Marina' : 'falta cintura, cuello o perfil'}${measured != null ? ` · medido ${fmt(measured, 1)} %` : ''}</span></div>
    </div>`;
  const rows = MEASURES.map((m) => {
    const s = measureSeries(m.k);
    if (!s.length) return '';
    const last = s[s.length - 1];
    const first = s[0];
    const diff = s.length > 1 ? last.v - first.v : null;
    return `<tr><th scope="row">${m.l}</th><td><b>${fmt(last.v, 1)}</b> ${m.u}</td>
      <td>${diff == null ? '–' : `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${fmt(Math.abs(diff), 1)} ${m.u}`}</td>
      <td class="pct">${s.length > 1 ? `desde ${dateShort(first.d)}` : dateShort(last.d)}</td></tr>`;
  }).join('');
  const withSeries = MEASURES.filter((m) => measureSeries(m.k).length >= 2);
  if (!S.ui.measureK || !withSeries.some((m) => m.k === S.ui.measureK)) S.ui.measureK = withSeries[0]?.k || null;
  return `<section class="card">
    <div class="card-head"><h2>Medidas</h2><button type="button" class="btn small" data-act="measure-new">Nueva medición</button></div>
    ${ratios}
    <div class="table-wrap"><table class="nut-table compact">
      <thead><tr><th scope="col">Medida</th><th scope="col">Última</th><th scope="col">Cambio</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${withSeries.length ? `<div class="chips scroll top-gap">${withSeries.map((m) => `<button type="button" class="chip${m.k === S.ui.measureK ? ' on' : ''}" data-act="measure-k" data-k="${m.k}" aria-pressed="${m.k === S.ui.measureK}">${m.l}</button>`).join('')}</div>
      <div class="chart" id="measure-chart"></div>` : ''}
    <details class="detail compact"><summary>Todas las mediciones (${dates.length})</summary>
      <ul class="list tight">${[...dates].reverse().map((d) => `<li><button type="button" class="row" data-act="measure-open" data-date="${d}">
        <span class="row-main">${dateLong(d)}</span>
        <span class="row-sub">${MEASURES.filter((m) => S.measures[d][m.k] != null).map((m) => `${m.l} ${fmt(S.measures[d][m.k], 1)}`).join(' · ')}</span>
      </button></li>`).join('')}</ul>
    </details>
  </section>`;
}

export function drawSeries(host, pts, unit, dec = 1) {
  if (!host) return;
  if (pts.length < 2) { host.innerHTML = ''; return; }
  const W = Math.max(280, host.clientWidth);
  const H = 160;
  const m = { l: 38, r: 12, t: 12, b: 24 };
  const t0 = parseISO(pts[0].d).getTime();
  const t1 = Math.max(parseISO(pts[pts.length - 1].d).getTime(), t0 + 864e5);
  const xs = (d) => m.l + ((parseISO(d).getTime() - t0) / (t1 - t0)) * (W - m.l - m.r);
  let lo = Math.min(...pts.map((p) => p.v));
  let hi = Math.max(...pts.map((p) => p.v));
  if (hi - lo < 2) { const c = (hi + lo) / 2; lo = c - 1; hi = c + 1; }
  const step = niceStep(hi - lo, 4);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ys = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
  let g = '';
  for (let v = lo; v <= hi + 1e-9; v += step) {
    const y = ys(v).toFixed(1);
    g += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}"/><text class="axis" x="${m.l - 6}" y="${y}" dy="0.32em" text-anchor="end">${fmt(v, dec)}</text>`;
  }
  g += `<text class="axis" x="${m.l}" y="${H - 6}">${dateShort(pts[0].d)}</text><text class="axis" x="${W - m.r}" y="${H - 6}" text-anchor="end">${dateShort(pts[pts.length - 1].d)}</text>`;
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${xs(p.d).toFixed(1)},${ys(p.v).toFixed(1)}`).join('');
  const dots = pts.map((p) => `<circle class="w-end" cx="${xs(p.d).toFixed(1)}" cy="${ys(p.v).toFixed(1)}" r="3.5"/>`).join('');
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Evolución en ${unit}">${g}<path class="w-avg" d="${path}"/>${dots}</svg>`;
}

/* Nueva medición o editar una existente */
SHEETS.measure = {
  title: (s) => (S.measures[s.date] && !s.isNew ? 'Editar medición' : 'Nueva medición'),
  render: (s) => {
    const v = S.measures[s.date] || {};
    return `
      <label class="field"><span>Fecha</span><input id="ms-date" type="date" value="${s.date}" max="${today()}"></label>
      <div class="nut-box">
        ${MEASURES.map((m) => `<label class="nut-field measure"><span>${m.l}<small>${m.hint}</small></span>
          <span class="input-unit"><input id="ms-${m.k}" type="text" inputmode="decimal" value="${inputVal(v[m.k], 1)}" placeholder="–"><em>${m.u}</em></span></label>`).join('')}
      </div>
      <p class="hint">No hace falta rellenarlas todas. Mide siempre en las mismas condiciones para que se puedan comparar.</p>
      <div class="sheet-actions">
        ${S.measures[s.date] && !s.isNew ? '<button type="button" class="btn danger ghost" data-act="measure-del">Borrar</button>' : ''}
        <button type="button" class="btn primary" data-act="measure-save">Guardar</button>
      </div>`;
  },
};

export function saveMeasure(s) {
  const date = $('#ms-date').value || today();
  const vals = {};
  for (const m of MEASURES) {
    const v = num($('#ms-' + m.k).value);
    if (v != null) vals[m.k] = v;
  }
  if (!Object.keys(vals).length) { toast('Rellena al menos una medida.'); return; }
  if (s.date !== date && !s.isNew) delete S.measures[s.date];
  S.measures[date] = { ...(s.isNew ? S.measures[date] || {} : {}), ...vals };
  saveMeasures();
  closeSheets();
  toast('Medición guardada');
}

/* ---------- acciones ---------- */

Object.assign(ACTIONS, {
  'range': async (el, top, act) => {
      S.ui.range = Number(el.dataset.range); render();
  },
  'del-weight': async (el) => {
      const d = el.dataset.date;
      const old = S.weights[d];
      S.ui.more = { ...(S.ui.more || {}), weights: S.ui.more?.weights || 30 }; // mantiene la lista abierta
      undoable(`Peso del ${dateShort(d)} borrado`,
        () => { delete S.weights[d]; saveWeights(); render(); },
        () => { S.weights[d] = old; saveWeights(); render(); });
  },
  'use-target': async (el, top, act) => {
      S.settings.goals.kcal = Number(el.dataset.kcal); saveSettings(); render(); toast(`Objetivo: ${fmt(Number(el.dataset.kcal))} kcal`);
  },
  'measure-new': async (el, top, act) => {
      pushSheet({ type: 'measure', date: today(), isNew: true });
  },
  'measure-open': async (el, top, act) => {
      pushSheet({ type: 'measure', date: el.dataset.date, isNew: false });
  },
  'measure-save': async (el, top, act) => {
      saveMeasure(top);
  },
  'measure-del': async (el, top) => {
      const d = top.date;
      const old = S.measures[d];
      closeSheets();
      undoable(`Medición del ${dateShort(d)} borrada`,
        () => { delete S.measures[d]; saveMeasures(); render(); },
        () => { S.measures[d] = old; saveMeasures(); render(); });
  },
  'measure-k': async (el, top, act) => {
      S.ui.measureK = el.dataset.k; render();
  },
});

/* ---------- registro de vista, cambios y formularios ---------- */

VIEWS.progreso = { html: viewProgreso, after: () => { drawCharts(); fillPhotoCard(); } };
HOOKS.resize.push(() => { if (S.ui.tab === 'progreso' && !S.sheets.length) drawCharts(); });

CHANGES.rate = (el) => {
  const v = num(el.value);
  if (v == null || Math.abs(v) > 2) { toast('Pon un ritmo entre −2 y 2 kg por semana.'); return; }
  S.settings.rate = v;
  saveSettings();
  render();
};

FORMS.weight = () => {
  const d = $('#wf-date').value || today();
  const v = num($('#wf-kg').value);
  if (v == null || v < 20 || v > 400) { toast('Escribe un peso válido en kg.'); return; }
  S.weights[d] = v;
  saveWeights();
  render();
  toast('Peso guardado');
};
