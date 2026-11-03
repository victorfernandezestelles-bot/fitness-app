import { BASICS, BASICS_BY_ID, mult, scale, sumNut } from './nutrients.js';
import { EXERCISES, EXERCISES_BY_ID, MUSCLES, MUSCLE_NAME, defaultCfg, e1rm } from './exercises.js';
import { $, addDays, fmt, norm, parseISO, today } from './util.js';
import { S } from './state.js';

/* ---------- datos derivados ---------- */

export const getFood = (id) => S.foods[id] || BASICS_BY_ID[id] || null;
export function allFoods() {
  const own = Object.values(S.foods);
  const ownIds = new Set(own.map((f) => f.id));
  return [...own, ...BASICS.filter((b) => !ownIds.has(b.id))];
}
export const dayOf = (date) => S.days[date] || { entries: [], steps: null };

export function isTrainDay(date) {
  const d = S.days[date];
  if (d?.type) return d.type === 'train';
  return Object.values(S.workouts).some((w) => w.date === date);
}
export const hasTrainGoals = () => Object.values(S.settings.goalsTrain || {}).some((v) => v != null);
export function goalsFor(date) {
  const g = S.settings.goals;
  if (!hasTrainGoals() || !isTrainDay(date)) return g;
  const t = S.settings.goalsTrain;
  return { kcal: t.kcal ?? g.kcal, p: t.p ?? g.p, c: t.c ?? g.c, f: t.f ?? g.f, steps: g.steps };
}
export function ensureDay(date) {
  if (!S.days[date]) S.days[date] = { entries: [], steps: null };
  return S.days[date];
}

export function recipeTotals(r) {
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
/* ---------- unidades («2 huevos») ----------
   Una entrada por unidades guarda unit = 'u:<gramos de una>:<nombre>', así sigue siendo
   correcta aunque luego cambie el peso de la unidad del alimento. */
export const unitCode = (g, n) => `u:${g}:${n}`;
export function parseUnit(unit) {
  if (typeof unit !== 'string' || !unit.startsWith('u:')) return null;
  const i = unit.indexOf(':', 2);
  const g = Number(unit.slice(2, i));
  return g > 0 ? { g, n: unit.slice(i + 1) || 'unidad' } : null;
}
export const pluralEs = (w, n) => (n === 1 || !w ? w : /[aeiouáéó]$/i.test(w) ? w + 's' : /z$/i.test(w) ? w.slice(0, -1) + 'ces' : w + 'es');
export const gramsOf = (qty, unit) => { const u = parseUnit(unit); return u ? qty * u.g : qty; };

export function nutFor(item, qty, unit) {
  if (item.type === 'food') {
    const f = getFood(item.id);
    return f ? scale(f.per100, gramsOf(qty, unit)) : null;
  }
  const r = S.recipes[item.id];
  if (!r) return null;
  const { total } = recipeTotals(r);
  if (unit === 'g') return r.cookedG ? mult(total, qty / r.cookedG) : null;
  return mult(total, qty / (r.servings || 1));
}

export function itemName(item) {
  if (item.type === 'food') return getFood(item.id)?.name || 'Alimento borrado';
  return S.recipes[item.id]?.name || 'Receta borrada';
}

export function qtyLabel(qty, unit) {
  if (unit === 'ud') return 'a mano';
  if (unit === 'rac') return `${fmt(qty, 2)} ${qty === 1 ? 'ración' : 'raciones'}`;
  const u = parseUnit(unit);
  if (u) return `${fmt(qty, 2)} ${pluralEs(u.n, qty)} (${fmt(qty * u.g, 0)} g)`;
  return `${fmt(qty, 0)} g`;
}

/* ---------- favoritos ---------- */
export const favKey = (type, id) => `${type}:${id}`;
export const isFav = (type, id) => !!S.settings.favs?.[favKey(type, id)];
export function favItems() {
  const rec = recentItems(60);
  return Object.keys(S.settings.favs || {}).map((k) => {
    const i = k.indexOf(':');
    const type = k.slice(0, i), id = k.slice(i + 1);
    if (type === 'food' ? !getFood(id) : !S.recipes[id]) return null;
    const last = rec.find((r) => r.type === type && r.id === id);
    return { type, id, qty: last?.qty ?? null, unit: last?.unit ?? null };
  }).filter(Boolean).sort((a, b) => itemName(a).localeCompare(itemName(b), 'es'));
}

// Cantidad por defecto al apuntar algo (la misma que propone la hoja de cantidad)
export function defaultUnit(it) {
  if (it.type !== 'food') return 'rac';
  const f = getFood(it.id);
  return f?.unitG ? unitCode(f.unitG, f.unitName || 'unidad') : 'g';
}
export function defaultQty(it) {
  if (it.type !== 'food') return 1;
  const f = getFood(it.id);
  return f?.unitG ? 1 : f?.servingG || 100;
}

/* ---------- calendario de cumplimiento ---------- */
export const dayKcal = (date) => dayOf(date).entries.reduce((a, e) => a + (e.n.kcal || 0), 0);
// Día entrenado de verdad: un entrenamiento de fuerza con algo apuntado o una actividad
export function trainedOn(date) {
  if (Object.values(S.workouts).some((w) => w.date === date && w.exercises.length)) return true;
  return Object.values(S.activities || {}).some((a) => a.date === date);
}
export function dayMarks(date) {
  const day = dayOf(date);
  const g = goalsFor(date);
  const kcal = dayKcal(date);
  return {
    kcal: !!(g.kcal && day.entries.length && Math.abs(kcal - g.kcal) <= g.kcal * 0.1),
    steps: !!(g.steps && day.steps != null && day.steps >= g.steps),
    train: trainedOn(date),
  };
}

// La comida que toca según la hora
export function guessMeal(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 5 && h < 11) return 'desayuno';
  if (h >= 11 && h < 16.5) return 'comida';
  if (h >= 16.5 && h < 20) return 'merienda';
  if (h >= 20 && h < 23.5) return 'cena';
  return 'otros';
}

export function recentItems(limit = 12) {
  const out = [];
  const seen = new Set();
  const dates = Object.keys(S.days).sort().reverse().slice(0, 45);
  for (const d of dates) {
    const entries = [...S.days[d].entries].reverse();
    for (const e of entries) {
      const key = e.type === 'quick' ? 'quick:' + norm(e.name) : e.type + ':' + e.ref;
      if (seen.has(key)) continue;
      if (e.type === 'quick') {
        seen.add(key);
        out.push({ type: 'quick', name: e.name, n: e.n });
        if (out.length >= limit) return out;
        continue;
      }
      if (e.type === 'food' ? !getFood(e.ref) : !S.recipes[e.ref]) continue;
      seen.add(key);
      out.push({ type: e.type, id: e.ref, qty: e.qty, unit: e.unit });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export function needsBackup() {
  const hasData = Object.keys(S.days).length > 0 || Object.keys(S.weights).length > 0 || Object.keys(S.workouts).length > 0;
  if (!hasData) return false;
  const last = S.settings.lastBackup;
  if (!last) {
    const first = Object.keys(S.days).concat(Object.keys(S.weights)).sort()[0];
    return first && first <= addDays(today(), -7);
  }
  return last.slice(0, 10) <= addDays(today(), -8);
}

/* ---------- vista: Progreso ---------- */

export function weightSeries(days) {
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

/* ---------- entrenamiento ---------- */

export const getEx = (id) => S.exercises[id] || EXERCISES_BY_ID[id] || null;
export function allExercises() {
  const own = Object.values(S.exercises);
  const ownIds = new Set(own.map((e) => e.id));
  return [...own, ...EXERCISES.filter((e) => !ownIds.has(e.id))].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
export const exName = (we) => getEx(we.exId)?.name || we.name || 'Ejercicio borrado';
export const mondayOf = (s) => { const d = parseISO(s); return addDays(s, -((d.getDay() + 6) % 7)); };
export const emptySet = () => ({ kg: null, reps: null, t: 'n', done: false });
export const isEffective = (st) => st.t !== 'w' && (st.done || (st.reps || 0) > 0);
export const workoutsSorted = () => Object.values(S.workouts).sort((a, b) => (b.date + (b.start || '')).localeCompare(a.date + (a.start || '')));
export const setText = (st) => `${st.kg == null ? '–' : fmt(st.kg, 2)}×${st.reps == null ? '–' : st.reps}`;
export const musclesText = (ex) => {
  if (!ex) return '';
  const p = ex.primary.map((m) => MUSCLE_NAME[m]).join(', ');
  const s = ex.secondary.map((m) => MUSCLE_NAME[m]).join(', ');
  return p + (s ? ` · también ${s.toLowerCase()}` : '');
};

export function workoutStats(w) {
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

export function weekVolume(monday) {
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
export function lastPerformance(exId, current) {
  for (const w of workoutsSorted()) {
    if (current && (w.id === current.id || w.date > current.date)) continue;
    const we = w.exercises.find((x) => x.exId === exId);
    if (!we) continue;
    const sets = we.sets.filter(isEffective);
    if (sets.length) return { date: w.date, sets };
  }
  return null;
}

export function exerciseHistory(exId) {
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

export function workoutDuration(w) {
  if (!w.start || !w.end) return null;
  const ms = Date.parse(w.end) - Date.parse(w.start);
  return ms > 0 && ms < 6 * 3600e3 ? ms : null;
}

export function nextInRotation() {
  const grouped = Object.values(S.routines).filter((r) => r.group);
  if (!grouped.length) return null;
  let group = grouped[0].group;
  let lastSeq = -1;
  for (const w of workoutsSorted()) {
    const r = w.routineId && S.routines[w.routineId];
    if (r && r.group) { group = r.group; lastSeq = r.seq; break; }
  }
  const inGroup = grouped.filter((r) => r.group === group).sort((a, b) => a.seq - b.seq);
  return inGroup.find((r) => r.seq > lastSeq) || inGroup[0];
}

/* Progresión: rango de repeticiones e incremento por ejercicio */
export function exCfg(exId) {
  return { ...defaultCfg(getEx(exId)), ...(S.settings.exCfg?.[exId] || {}) };
}

// Doble progresión: se sube el peso cuando todas las series llegan al tope del rango
export function suggestion(last, cfg) {
  if (!last || !last.sets.length) return null;
  const work = last.sets;
  const topKg = Math.max(...work.map((x) => x.kg || 0));
  const allTop = work.every((x) => (x.reps || 0) >= cfg.max);
  if (allTop && topKg > 0) {
    return { type: 'up', kg: topKg + cfg.inc, text: `Sube a ${fmt(topKg + cfg.inc, 2)} kg: la última vez hiciste ${cfg.max} o más repeticiones en todas las series. Empieza buscando ${cfg.min}.` };
  }
  if (work.every((x) => (x.reps || 0) < cfg.min)) {
    return { type: 'down', text: `La última vez no llegaste a ${cfg.min} repeticiones. Si hoy tampoco llegas, baja un poco el peso.` };
  }
  return { type: 'reps', text: topKg > 0
    ? `Mantén ${fmt(topKg, 2)} kg y busca sumar repeticiones. Subirás cuando hagas ${cfg.max} en todas las series.`
    : `Busca sumar repeticiones hasta ${cfg.max} en todas las series.` };
}

/* ---------- medidas, medias semanales y gasto calórico ---------- */

export const MEASURES = [
  { k: 'cintura', l: 'Cintura', u: 'cm', hint: 'A la altura del ombligo, de pie, relajado y sin apretar la cinta.' },
  { k: 'hombros', l: 'Hombros', u: 'cm', hint: 'Contorno por la parte más ancha de los hombros, con los brazos relajados.' },
  { k: 'pecho', l: 'Pecho', u: 'cm', hint: 'A la altura de los pezones, después de soltar el aire.' },
  { k: 'brazo', l: 'Brazo', u: 'cm', hint: 'Bíceps contraído, por la parte más ancha. Mide siempre el mismo brazo.' },
  { k: 'cuello', l: 'Cuello', u: 'cm', hint: 'Justo por debajo de la nuez. Se usa para estimar el % de grasa.' },
  { k: 'cadera', l: 'Cadera', u: 'cm', hint: 'Por la parte más ancha de los glúteos.' },
  { k: 'muslo', l: 'Muslo', u: 'cm', hint: 'Por la parte más ancha, de pie y relajado.' },
  { k: 'gemelo', l: 'Gemelo', u: 'cm', hint: 'Por la parte más ancha.' },
  { k: 'grasa', l: '% de grasa medido', u: '%', hint: 'Solo si te lo mide una báscula de bioimpedancia o un profesional.' },
];
export const MEASURE_BY_K = Object.fromEntries(MEASURES.map((m) => [m.k, m]));

export const ACTIVITY = [
  [1.2, 'Sedentario: oficina y menos de 5.000 pasos'],
  [1.375, 'Ligero: 5.000–8.000 pasos o 1–3 entrenos por semana'],
  [1.55, 'Moderado: 8.000–12.000 pasos o 3–5 entrenos por semana'],
  [1.725, 'Alto: más de 12.000 pasos y entreno casi a diario'],
  [1.9, 'Muy alto: trabajo físico y entreno a diario'],
];

export const KCAL_PER_KG = 7700; // energía aproximada de 1 kg de peso corporal

export function measureSeries(k) {
  return Object.keys(S.measures).sort().filter((d) => S.measures[d][k] != null).map((d) => ({ d, v: S.measures[d][k] }));
}
export function latestMeasure(k) {
  const s = measureSeries(k);
  return s.length ? s[s.length - 1] : null;
}

// % de grasa estimado con la fórmula de la Marina de EE. UU. (medidas en cm)
export function navyBodyFat() {
  const p = S.settings.profile;
  const h = p.height;
  const waist = latestMeasure('cintura')?.v;
  const neck = latestMeasure('cuello')?.v;
  if (!h || !waist || !neck || !p.sex) return null;
  if (p.sex === 'h') {
    if (waist <= neck) return null;
    return 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(h)) - 450;
  }
  const hip = latestMeasure('cadera')?.v;
  if (!hip) return null;
  return 495 / (1.29579 - 0.35004 * Math.log10(waist + hip - neck) + 0.221 * Math.log10(h)) - 450;
}

export function latestWeight() {
  const ds = Object.keys(S.weights).sort();
  return ds.length ? S.weights[ds[ds.length - 1]] : null;
}

// Metabolismo basal (Mifflin-St Jeor) y gasto con el factor de actividad
export function formulaEnergy() {
  const p = S.settings.profile;
  const w = latestWeight();
  if (!p.sex || !p.birthYear || !p.height || !w) return null;
  const age = new Date().getFullYear() - p.birthYear;
  const bmr = 10 * w + 6.25 * p.height - 5 * age + (p.sex === 'h' ? 5 : -161);
  return { bmr, tdee: bmr * (p.activity || 1.55) };
}

// Gasto real: lo que comes de media menos lo que explica el cambio de peso (últimas 4 semanas)
export function dataEnergy() {
  const end = addDays(today(), -1);
  const start = addDays(end, -27);
  const intake = [];
  for (let i = 0; i < 28; i++) {
    const day = S.days[addDays(start, i)];
    if (!day || !day.entries.length) continue;
    const k = day.entries.reduce((a, e) => a + (e.n.kcal || 0), 0);
    if (k >= 800) intake.push(k); // días con menos se consideran a medio apuntar
  }
  const t0 = parseISO(start).getTime();
  const pts = Object.keys(S.weights).filter((d) => d >= start && d <= end).sort()
    .map((d) => ({ x: Math.round((parseISO(d).getTime() - t0) / 864e5), y: S.weights[d] }));
  const span = pts.length ? pts[pts.length - 1].x - pts[0].x : 0;
  const base = { intakeDays: intake.length, weightDays: pts.length, span };
  if (intake.length < 14 || pts.length < 8 || span < 14) return { ready: false, ...base };
  const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  const slope = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  const kcalAvg = intake.reduce((a, b) => a + b, 0) / intake.length;
  return { ready: true, ...base, kcalAvg, weekly: slope * 7, tdee: kcalAvg - slope * KCAL_PER_KG };
}

export function weeklyWeights(n = 8) {
  const out = [];
  let mon = mondayOf(today());
  for (let i = 0; i < n; i++) {
    const vals = [];
    for (let k = 0; k < 7; k++) { const v = S.weights[addDays(mon, k)]; if (v != null) vals.push(v); }
    out.push({ mon, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, count: vals.length });
    mon = addDays(mon, -7);
  }
  return out; // de la más reciente a la más antigua
}

/* ---------- informe semanal ---------- */
const avgOf = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
function weekWeight(monday) {
  const v = [];
  for (let k = 0; k < 7; k++) { const x = S.weights[addDays(monday, k)]; if (x != null) v.push(x); }
  return { avg: avgOf(v), n: v.length };
}

// Resumen de lunes a domingo: peso, comida, pasos, sueño, entrenos, series y medidas
export function weekReport(monday) {
  const dates = Array.from({ length: 7 }, (_, k) => addDays(monday, k));
  const end = dates[6];
  const w = weekWeight(monday);
  const wPrev = weekWeight(addDays(monday, -7));
  const logged = dates.filter((d) => dayOf(d).entries.length);
  const kcals = logged.map(dayKcal);
  const prot = logged.map((d) => dayOf(d).entries.reduce((a, e) => a + (e.n.p || 0), 0));
  const goalK = logged.map((d) => goalsFor(d).kcal).filter((x) => x != null);
  const stepDays = dates.filter((d) => dayOf(d).steps != null);
  const stepGoal = S.settings.goals.steps;
  const sleeps = dates.map((d) => dayOf(d).sleep).filter((x) => x != null);
  const vol = weekVolume(monday);
  const strength = Object.values(S.workouts).filter((x) => x.date >= monday && x.date <= end && x.exercises.length).length;
  const acts = Object.values(S.activities || {}).filter((a) => a.date >= monday && a.date <= end);
  // Medidas: la última de la semana frente a la anterior de cada medida
  const mDates = Object.keys(S.measures).sort();
  const inWeek = mDates.filter((d) => d >= monday && d <= end);
  const measures = [];
  if (inWeek.length) {
    const last = inWeek[inWeek.length - 1];
    for (const m of MEASURES) {
      const v = S.measures[last][m.k];
      if (v == null) continue;
      const prevDate = mDates.filter((d) => d < last && S.measures[d][m.k] != null).pop();
      measures.push({ k: m.k, l: m.l, u: m.u, v, d: prevDate ? v - S.measures[prevDate][m.k] : null });
    }
  }
  return {
    monday, end,
    weight: { avg: w.avg, n: w.n, change: w.avg != null && wPrev.avg != null ? w.avg - wPrev.avg : null },
    kcal: { avg: avgOf(kcals), n: logged.length, goal: avgOf(goalK), protein: avgOf(prot) },
    steps: { avg: avgOf(stepDays.map((d) => dayOf(d).steps)), n: stepDays.length, hit: stepGoal ? stepDays.filter((d) => dayOf(d).steps >= stepGoal).length : null },
    sleep: { avg: avgOf(sleeps), n: sleeps.length },
    strength: { sessions: strength, sets: vol.sets },
    cardio: { count: acts.length, min: acts.reduce((a, x) => a + (x.min || 0), 0) },
    muscles: MUSCLES.map((m) => ({ k: m.k, l: m.l, v: vol.vol[m.k] })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v),
    measures,
  };
}

// Series de un músculo en las últimas n semanas (de la más antigua a la actual)
export function muscleHistory(m, n = 12) {
  const out = [];
  let mon = mondayOf(today());
  for (let i = 0; i < n; i++) { out.unshift({ mon, v: weekVolume(mon).vol[m] || 0 }); mon = addDays(mon, -7); }
  return out;
}

/* ---------- mapa de músculos ---------- */
// Series de un entreno por músculo (1 al principal, 0,5 al secundario) y qué músculos fueron principales
export function workoutVolume(w) {
  const vol = {};
  const prim = new Set();
  for (const we of w.exercises || []) {
    const ex = getEx(we.exId);
    const n = we.sets.filter(isEffective).length;
    if (!ex || !n) continue;
    for (const m of ex.primary) { vol[m] = (vol[m] || 0) + n; prim.add(m); }
    for (const m of ex.secondary) vol[m] = (vol[m] || 0) + n / 2;
  }
  return { vol, prim };
}
// Entreno: principal = intenso, solo secundario = suave
export function workoutLevels(w) {
  const { vol, prim } = workoutVolume(w);
  return Object.fromEntries(Object.keys(vol).map((m) => [m, prim.has(m) ? 3 : 1]));
}
// Semana: según las series (1-4, 5-9, 10 o más)
export const weekLevels = (vol) => Object.fromEntries(Object.entries(vol).filter(([, v]) => v > 0).map(([m, v]) => [m, v >= 10 ? 3 : v >= 5 ? 2 : 1]));
