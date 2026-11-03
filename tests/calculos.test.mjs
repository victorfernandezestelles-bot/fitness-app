// Pruebas de los cálculos de la app. Se ejecutan con: npm test  (o node --test tests/)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { S, migrate, SCHEMA, mergeSettings } from '../js/state.js';
import {
  recipeTotals, nutFor, weekVolume, suggestion, dataEnergy, navyBodyFat, weeklyWeights,
  isTrainDay, goalsFor, workoutDuration, nextInRotation, workoutStats, lastPerformance,
  dayMarks, guessMeal, favItems, weekReport, muscleHistory, mondayOf,
  parseUnit, unitCode, qtyLabel, pluralEs, defaultUnit, defaultQty,
} from '../js/derived.js';
import { kcalFrom, scale, sumNut, BASICS_BY_ID } from '../js/nutrients.js';
import { defaultCfg, EXERCISES_BY_ID, e1rm } from '../js/exercises.js';
import { addDays, today } from '../js/util.js';

const near = (a, b, tol = 0.05) => assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}`);

function reset() {
  Object.assign(S, migrate({}, SCHEMA));
  S.settings = mergeSettings({});
  S.ui = { tab: 'hoy', date: today(), more: {} };
  S.sheets = [];
}

test('energía con el criterio europeo (4/4/9 y 2 kcal por g de fibra)', () => {
  assert.equal(kcalFrom({ p: 10, c: 20, f: 5, fi: 4 }), 4 * 10 + 4 * 20 + 9 * 5 + 2 * 4);
});

test('escalar y sumar nutrientes cuenta qué datos faltan', () => {
  const a = scale({ kcal: 100, p: 10, ca: 50 }, 150);
  assert.equal(a.kcal, 150);
  assert.equal(a.ca, 75);
  assert.equal(a.fe, null);
  const { tot, have, count } = sumNut([a, scale({ kcal: 200, p: 5 }, 100)]);
  assert.equal(tot.kcal, 350);
  assert.equal(have.ca, 1);
  assert.equal(count, 2);
});

test('receta por raciones y por gramos del plato cocinado', () => {
  reset();
  S.foods.arroz = { id: 'arroz', name: 'Arroz', per100: { kcal: 350, p: 7, c: 79, f: 0.6 } };
  S.foods.pollo = { id: 'pollo', name: 'Pollo', per100: { kcal: 110, p: 23, c: 0, f: 2 } };
  S.recipes.r = { id: 'r', name: 'Arroz con pollo', servings: 2, cookedG: 800, items: [{ foodId: 'arroz', g: 200 }, { foodId: 'pollo', g: 300 }] };
  const { total } = recipeTotals(S.recipes.r);
  assert.equal(total.kcal, 700 + 330);
  near(nutFor({ type: 'recipe', id: 'r' }, 1, 'rac').kcal, 515);
  near(nutFor({ type: 'recipe', id: 'r' }, 400, 'g').kcal, 515);
});

test('series por músculo: 1 al principal, 0,5 al secundario, sin calentamientos', () => {
  reset();
  const mon = '2026-11-02';
  S.workouts.w = {
    id: 'w', date: '2026-11-03', exercises: [
      { exId: 'x-press-banca', sets: [{ kg: 40, reps: 10, t: 'w' }, { kg: 80, reps: 8, t: 'n' }, { kg: 80, reps: 7, t: 'n' }, { kg: null, reps: null, t: 'n' }] },
    ],
  };
  const { vol, sets, sessions } = weekVolume(mon);
  assert.equal(sessions, 1);
  assert.equal(sets, 2);
  assert.equal(vol.pecho, 2);
  assert.equal(vol.triceps, 1);
  assert.equal(vol['delt-ant'], 1);
  assert.equal(workoutStats(S.workouts.w).tonnage, 80 * 8 + 80 * 7);
});

test('doble progresión: sube peso solo si todas las series llegan al máximo', () => {
  const cfg = { min: 6, max: 12, inc: 2.5 };
  assert.equal(suggestion({ sets: [{ kg: 80, reps: 12 }, { kg: 80, reps: 12 }] }, cfg).type, 'up');
  assert.equal(suggestion({ sets: [{ kg: 80, reps: 12 }, { kg: 80, reps: 12 }] }, cfg).kg, 82.5);
  assert.equal(suggestion({ sets: [{ kg: 80, reps: 12 }, { kg: 80, reps: 10 }] }, cfg).type, 'reps');
  assert.equal(suggestion({ sets: [{ kg: 80, reps: 5 }, { kg: 80, reps: 4 }] }, cfg).type, 'down');
  assert.equal(suggestion(null, cfg), null);
});

test('rangos por defecto: compuestos 6-12, aislamientos 10-20, mancuernas de 2 en 2 kg', () => {
  assert.deepEqual(defaultCfg(EXERCISES_BY_ID['x-press-banca']), { min: 6, max: 12, inc: 2.5 });
  assert.deepEqual(defaultCfg(EXERCISES_BY_ID['x-elev-laterales']), { min: 10, max: 20, inc: 2.5 });
  assert.equal(defaultCfg(EXERCISES_BY_ID['x-press-mancuernas']).inc, 2);
  near(e1rm(100, 5), 116.67, 0.01);
  assert.equal(e1rm(100, 15), null);
});

test('última vez: la sesión anterior con ese ejercicio, sin la actual', () => {
  reset();
  S.workouts.a = { id: 'a', date: '2026-10-01', exercises: [{ exId: 'x-katana', sets: [{ kg: 20, reps: 12, t: 'n' }] }] };
  S.workouts.b = { id: 'b', date: '2026-10-05', exercises: [{ exId: 'x-katana', sets: [{ kg: 22.5, reps: 10, t: 'n' }] }] };
  S.workouts.c = { id: 'c', date: '2026-10-08', exercises: [{ exId: 'x-katana', sets: [{ kg: null, reps: null, t: 'n' }] }] };
  const last = lastPerformance('x-katana', S.workouts.c);
  assert.equal(last.date, '2026-10-05');
  assert.equal(last.sets[0].kg, 22.5);
});

test('gasto real: 2.300 kcal/día bajando 0,1 kg/día da unas 3.070 kcal', () => {
  reset();
  for (let i = 1; i <= 30; i++) {
    const d = addDays(today(), -i);
    S.weights[d] = 108 - (30 - i) * 0.1;
    S.days[d] = { entries: [{ n: { kcal: 2300 } }], steps: null };
  }
  const e = dataEnergy();
  assert.equal(e.ready, true);
  near(e.tdee, 3070, 1);
  near(e.weekly, -0.7, 0.001);
});

test('gasto real: sin datos suficientes no se calcula', () => {
  reset();
  for (let i = 1; i <= 5; i++) S.weights[addDays(today(), -i)] = 100;
  assert.equal(dataEnergy().ready, false);
});

test('% de grasa (fórmula de la Marina) para un hombre', () => {
  reset();
  S.settings.profile = { sex: 'h', height: 181, birthYear: 2003, activity: 1.55 };
  S.measures = { '2026-10-31': { cintura: 104.5, cuello: 41.5 } };
  near(navyBodyFat(), 26.8, 0.1);
});

test('medias semanales de peso de lunes a domingo', () => {
  reset();
  const mon = addDays(today(), -((new Date().getDay() + 6) % 7));
  S.weights[addDays(mon, -7)] = 100;
  S.weights[addDays(mon, -6)] = 102;
  const weeks = weeklyWeights(2);
  assert.equal(weeks[1].avg, 101);
  assert.equal(weeks[1].count, 2);
});

test('día de entreno: objetivos de entreno solo si hay entreno o se marca a mano', () => {
  reset();
  S.settings.goals = { kcal: 2300, p: 180, c: 220, f: 70, steps: 10000 };
  S.settings.goalsTrain = { kcal: 2600, p: null, c: 280, f: null };
  const d = '2026-11-03';
  assert.equal(goalsFor(d).kcal, 2300);
  S.workouts.w = { id: 'w', date: d, exercises: [] };
  assert.equal(isTrainDay(d), true);
  assert.equal(goalsFor(d).kcal, 2600);
  assert.equal(goalsFor(d).p, 180);
  S.days[d] = { entries: [], type: 'rest' };
  assert.equal(goalsFor(d).kcal, 2300);
});

test('duración del entreno: solo si empezó y terminó en la app el mismo día', () => {
  assert.equal(workoutDuration({ start: '2026-11-02T10:00:00Z', end: '2026-11-02T11:05:00Z' }), 65 * 60000);
  assert.equal(workoutDuration({ start: '2026-11-01T10:00:00Z', end: '2026-11-02T11:05:00Z' }), null);
  assert.equal(workoutDuration({ start: '2026-11-02T10:00:00Z', end: null }), null);
});

test('rotación de rutinas: avanza por sesiones hechas', () => {
  reset();
  for (const [i, n] of ['A1', 'B1', 'A2'].entries()) S.routines[n] = { id: n, name: n, group: 'g', seq: i, items: [] };
  assert.equal(nextInRotation().name, 'A1');
  S.workouts.w1 = { id: 'w1', date: '2026-11-01', start: '2026-11-01T10:00:00Z', routineId: 'A1', exercises: [] };
  assert.equal(nextInRotation().name, 'B1');
  S.workouts.w2 = { id: 'w2', date: '2026-11-02', start: '2026-11-02T10:00:00Z', routineId: 'A2', exercises: [] };
  assert.equal(nextInRotation().name, 'A1');
});

test('migración: completa datos antiguos sin perder nada y es repetible', () => {
  const old = {
    settings: { goals: { kcal: 2400 } },
    days: { '2026-10-01': { entries: [{ meal: 'cena', type: 'quick', name: 'X', n: { kcal: 500 } }], steps: 9000 } },
    workouts: { w1: { date: '2026-10-01', exercises: [{ exId: 'x-press-banca', sets: [{ kg: 80, reps: 8 }] }] } },
    weights: { '2026-10-01': 100 },
  };
  const m = migrate(old, 1);
  const e = m.days['2026-10-01'].entries[0];
  assert.ok(e.id);
  assert.equal(e.n.kcal, 500);
  assert.equal(e.n.fe, null);
  assert.equal(m.days['2026-10-01'].steps, 9000);
  assert.deepEqual(m.workouts.w1.exercises[0].sets[0], { kg: 80, reps: 8, t: 'n', done: false });
  assert.equal(m.workouts.w1.id, 'w1');
  assert.equal(m.settings.goals.kcal, 2400);
  assert.equal(m.settings.theme, 'auto');
  assert.equal(m.weights['2026-10-01'], 100);
  assert.equal(old.days['2026-10-01'].entries[0].id, undefined, 'no modifica el original');
  const again = migrate(m, SCHEMA);
  assert.deepEqual(again.days, m.days);
});

test('calendario: calorías a ±10 %, pasos cumplidos y entreno', () => {
  reset();
  S.settings.goals = { kcal: 2000, p: null, c: null, f: null, steps: 10000 };
  const d = '2026-10-20';
  S.days[d] = { entries: [{ n: { kcal: 2150 } }], steps: 9999 };
  assert.deepEqual(dayMarks(d), { kcal: true, steps: false, train: false });
  S.days[d].entries[0].n.kcal = 2250;
  S.days[d].steps = 10000;
  S.workouts.w = { id: 'w', date: d, exercises: [{ exId: 'x-katana', sets: [] }] };
  assert.deepEqual(dayMarks(d), { kcal: false, steps: true, train: true });
  // Un entreno vacío (empezado y sin ejercicios) no cuenta
  S.workouts.w.exercises = [];
  assert.equal(dayMarks(d).train, false);
  // Sin objetivo no hay punto
  S.settings.goals.kcal = null;
  S.days[d].entries[0].n.kcal = 2000;
  assert.equal(dayMarks(d).kcal, false);
});

test('la comida que toca según la hora', () => {
  const at = (h, m = 0) => guessMeal(new Date(2026, 10, 2, h, m));
  assert.equal(at(8), 'desayuno');
  assert.equal(at(14), 'comida');
  assert.equal(at(17), 'merienda');
  assert.equal(at(21), 'cena');
  assert.equal(at(1), 'otros');
});

test('favoritos: con la cantidad de la última vez y sin los borrados', () => {
  reset();
  S.foods.yog = { id: 'yog', name: 'Yogur', per100: { kcal: 60 } };
  S.recipes.r = { id: 'r', name: 'Arroz con pollo', servings: 2, items: [] };
  S.settings.favs = { 'food:yog': true, 'recipe:r': true, 'food:borrado': true };
  S.days['2026-10-30'] = { entries: [{ type: 'food', ref: 'yog', qty: 125, unit: 'g', n: { kcal: 75 } }] };
  const f = favItems();
  assert.equal(f.length, 2);
  assert.deepEqual(f.map((x) => x.id), ['r', 'yog']);
  assert.equal(f.find((x) => x.id === 'yog').qty, 125);
  assert.equal(f.find((x) => x.id === 'r').qty, null);
});

test('informe semanal: medias, cambio de peso, cardio y medidas', () => {
  reset();
  S.settings.goals = { kcal: 2300, p: null, c: null, f: null, steps: 10000 };
  const mon = '2026-10-26';
  S.weights['2026-10-20'] = 105; S.weights['2026-10-22'] = 105.4;
  S.weights['2026-10-27'] = 104.6; S.weights['2026-10-30'] = 104.4;
  S.days['2026-10-26'] = { entries: [{ n: { kcal: 2200, p: 170 } }], steps: 12000, sleep: 7 };
  S.days['2026-10-27'] = { entries: [{ n: { kcal: 2400, p: 150 } }], steps: 8000, sleep: 8 };
  S.workouts.w = { id: 'w', date: '2026-10-28', exercises: [{ exId: 'x-press-banca', sets: [{ kg: 80, reps: 8, t: 'n', done: true }] }] };
  S.activities = { a: { id: 'a', date: '2026-11-01', type: 'carrera', min: 30 }, b: { id: 'b', date: '2026-11-02', type: 'bici', min: 60 } };
  S.measures = { '2026-10-19': { cintura: 105 }, '2026-10-31': { cintura: 103.5, brazo: 40 } };
  const r = weekReport(mon);
  near(r.weight.avg, 104.5, 0.001);
  near(r.weight.change, -0.7, 0.001);
  assert.equal(r.kcal.n, 2);
  assert.equal(r.kcal.avg, 2300);
  assert.equal(r.kcal.protein, 160);
  assert.equal(r.steps.hit, 1);
  assert.equal(r.sleep.avg, 7.5);
  assert.equal(r.strength.sessions, 1);
  assert.equal(r.cardio.count, 1, 'la del lunes siguiente no cuenta');
  assert.equal(r.muscles[0].k, 'pecho');
  near(r.measures.find((m) => m.k === 'cintura').d, -1.5, 0.001);
  assert.equal(r.measures.find((m) => m.k === 'brazo').d, null);
});

test('historial de series de un músculo: 12 semanas terminando en la actual', () => {
  reset();
  const mon = mondayOf(today());
  S.workouts.w = { id: 'w', date: addDays(mon, -7), exercises: [{ exId: 'x-press-banca', sets: [{ kg: 80, reps: 8, t: 'n', done: true }, { kg: 80, reps: 8, t: 'n', done: true }] }] };
  const h = muscleHistory('pecho', 12);
  assert.equal(h.length, 12);
  assert.equal(h[11].mon, mon);
  assert.equal(h[10].v, 2);
  assert.equal(h[11].v, 0);
});

test('migración 2 → 3: añade la colección de actividades sin tocar lo demás', () => {
  const m = migrate({ settings: {}, weights: { '2026-10-01': 100 } }, 2);
  assert.deepEqual(m.activities, {});
  assert.equal(m.weights['2026-10-01'], 100);
  const m2 = migrate({ activities: { x: { date: '2026-10-01', type: 'bici', min: 40 } } }, 2);
  assert.equal(m2.activities.x.id, 'x');
});

test('unidades: «2 huevos» se calcula por los gramos de cada huevo', () => {
  reset();
  const it = { type: 'food', id: 'b-huevo-l' };
  assert.equal(defaultUnit(it), 'u:60:huevo');
  assert.equal(defaultQty(it), 1);
  const dos = nutFor(it, 2, 'u:60:huevo');
  const gramos = nutFor(it, 120, 'g');
  near(dos.kcal, gramos.kcal, 0.001);
  near(dos.p, 15.12, 0.01);
  assert.deepEqual(parseUnit(unitCode(52, 'huevo')), { g: 52, n: 'huevo' });
  assert.equal(parseUnit('g'), null);
  assert.equal(qtyLabel(2, 'u:60:huevo'), '2 huevos (120 g)');
  assert.equal(qtyLabel(1, 'u:60:huevo'), '1 huevo (60 g)');
  assert.equal(pluralEs('yogur', 2), 'yogures');
  assert.equal(pluralEs('nuez', 3), 'nueces');
  assert.equal(defaultUnit({ type: 'food', id: 'b-arroz' }), 'g');
});

test('huevos por talla: mismos valores por 100 g, distinto peso por huevo', () => {
  const ids = ['b-huevo-m', 'b-huevo-l', 'b-huevo-xl', 'b-huevo-campero'];
  const eggs = ids.map((id) => BASICS_BY_ID[id]);
  assert.ok(eggs.every(Boolean));
  assert.deepEqual(eggs.map((e) => e.unitG), [52, 60, 68, 60]);
  assert.ok(eggs.every((e) => e.per100.kcal === eggs[0].per100.kcal && e.per100.vd === 2));
});
