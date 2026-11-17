// Informe por periodo: resumen y día a día
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { S, migrate, SCHEMA, mergeSettings } from '../js/state.js';
import { periodReport, datesBetween, weekVolume, periodVolume } from '../js/derived.js';
import { today } from '../js/util.js';

const near = (a, b, tol = 0.001) => assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}`);
function reset() {
  Object.assign(S, migrate({}, SCHEMA));
  S.settings = mergeSettings({});
  S.ui = { tab: 'hoy', date: today(), more: {} };
  S.sheets = [];
}

test('fechas entre dos días, incluidos los extremos y el cambio de mes', () => {
  assert.deepEqual(datesBetween('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  assert.deepEqual(datesBetween('2026-11-05', '2026-11-05'), ['2026-11-05']);
  assert.deepEqual(datesBetween('2026-11-06', '2026-11-05'), []);
});

test('el volumen de una semana es el del periodo de lunes a domingo', () => {
  reset();
  S.workouts.w = { id: 'w', date: '2026-10-28', exercises: [{ exId: 'x-press-banca', sets: [{ kg: 80, reps: 8, t: 'n', done: true }] }] };
  assert.deepEqual(weekVolume('2026-10-26'), periodVolume('2026-10-26', '2026-11-01'));
});

test('informe de un periodo: resumen, día a día y tendencia del peso', () => {
  reset();
  S.settings.goals = { kcal: 2300, p: null, c: null, f: null, steps: 10000 };
  S.weights['2026-10-01'] = 90; S.weights['2026-10-03'] = 89.6; S.weights['2026-10-28'] = 88.4; S.weights['2026-10-30'] = 88;
  S.weights['2026-11-02'] = 70; // fuera del periodo
  S.days['2026-10-02'] = { entries: [{ meal: 'comida', name: 'Arroz', qty: 100, unit: 'g', n: { kcal: 2200, p: 170, c: 200, f: 60 } }], steps: 12000, sleep: 7 };
  S.days['2026-10-03'] = { entries: [{ meal: 'cena', name: 'Pollo', qty: 150, unit: 'g', n: { kcal: 2400, p: 150, c: 220, f: 80 } }], steps: 8000 };
  S.days['2026-10-04'] = { entries: [], steps: null };
  S.workouts.w = { id: 'w', date: '2026-10-15', name: 'Pecho', exercises: [{ exId: 'x-press-banca', sets: [{ kg: 60, reps: 10, t: 'w', done: true }, { kg: 80, reps: 8, t: 'n', done: true, rir: 1 }] }] };
  S.workouts.vacio = { id: 'vacio', date: '2026-10-16', exercises: [] };
  S.activities = { a: { id: 'a', date: '2026-10-20', type: 'carrera', min: 30 } };
  S.measures = { '2026-10-25': { cintura: 103.5 } };
  const r = periodReport('2026-10-01', '2026-10-31');
  assert.equal(r.n, 31);
  assert.deepEqual(r.days.map((x) => x.d), ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-15', '2026-10-20', '2026-10-25', '2026-10-28', '2026-10-30'], 'solo días con algo apuntado, en orden');
  assert.equal(r.kcal.n, 2);
  assert.equal(r.kcal.avg, 2300);
  assert.equal(r.kcal.goal, 2300);
  assert.equal(r.kcal.p, 160);
  assert.equal(r.steps.hit, 1);
  assert.equal(r.sleep.avg, 7);
  assert.equal(r.weight.n, 4);
  assert.equal(r.weight.first.weight, 90);
  assert.equal(r.weight.last.weight, 88);
  near(r.weight.trend, 88.2 - 89.8);
  assert.equal(r.strength.sessions, 1, 'un entreno sin ejercicios no cuenta');
  assert.equal(r.strength.sets, 1, 'el calentamiento no cuenta');
  assert.equal(r.cardio.count, 1);
  near(r.muscles.find((m) => m.k === 'pecho').wk, 7 / 31);
  assert.equal(r.days.find((x) => x.d === '2026-10-02').food.kcal, 2200);
});

test('un periodo corto no calcula tendencia y uno vacío no falla', () => {
  reset();
  S.weights['2026-10-01'] = 90; S.weights['2026-10-05'] = 89;
  assert.equal(periodReport('2026-10-01', '2026-10-07').weight.trend, null);
  const r = periodReport('2025-01-01', '2025-01-31');
  assert.equal(r.days.length, 0);
  assert.equal(r.weight.avg, null);
  assert.equal(r.kcal.avg, null);
});

test('tonelaje directo: kg × repeticiones solo en los músculos principales, sin calentamiento', async () => {
  reset();
  const { workoutVolume, setTonnage, muscleHistory } = await import('../js/derived.js');
  const { getEx } = await import('../js/derived.js');
  const banca = getEx('x-press-banca');
  S.workouts.w = { id: 'w', date: '2026-10-28', exercises: [{ exId: 'x-press-banca', sets: [
    { kg: 40, reps: 10, t: 'w', done: true }, // calentamiento: no cuenta
    { kg: 80, reps: 8, t: 'n', done: true },
    { kg: 80, reps: 6, t: 'n', done: true },
    { kg: 60, reps: 5, t: 'd', done: true }, // la bajada sí cuenta
    { kg: 80, reps: null, t: 'n', done: false }, // vacía: no cuenta
  ] }] };
  assert.equal(setTonnage(S.workouts.w.exercises[0].sets), 80 * 8 + 80 * 6 + 60 * 5);
  const wv = workoutVolume(S.workouts.w);
  for (const m of banca.primary) assert.equal(wv.ton[m], 1420);
  for (const m of banca.secondary) assert.equal(wv.ton[m] || 0, 0, 'el secundario no suma tonelaje directo');
  for (const m of banca.secondary) assert.equal(wv.tonInd[m], 1420, 'pero sí indirecto');
  for (const m of banca.primary) assert.equal(wv.tonInd[m] || 0, 0);
  const pv = periodVolume('2026-10-26', '2026-11-01');
  for (const m of banca.primary) assert.equal(pv.ton[m], 1420);
  for (const m of banca.secondary) assert.equal(pv.tonInd[m], 1420, 'el indirecto se guarda aparte');
  assert.equal(muscleHistory(banca.primary[0], 3).length, 3);
  assert.ok(muscleHistory(banca.secondary[0], 3).every((d) => d.kg === 0 && 'kgInd' in d));
});
