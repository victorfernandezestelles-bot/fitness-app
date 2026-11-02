// Pruebas de los cálculos de la app. Se ejecutan con: npm test  (o node --test tests/)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { S, migrate, SCHEMA, mergeSettings } from '../js/state.js';
import {
  recipeTotals, nutFor, weekVolume, suggestion, dataEnergy, navyBodyFat, weeklyWeights,
  isTrainDay, goalsFor, workoutDuration, nextInRotation, workoutStats, lastPerformance,
} from '../js/derived.js';
import { kcalFrom, scale, sumNut } from '../js/nutrients.js';
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
