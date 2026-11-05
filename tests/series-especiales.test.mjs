// Dropset, rest-pause y trabajo de agarre en el recuento de series. Se ejecutan con: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { S, migrate, SCHEMA, mergeSettings } from '../js/state.js';
import {
  setLoad, setsText, weekVolume, workoutVolume, workoutStats, lastPerformance, exerciseHistory, mondayOf, musclesText, getEx,
} from '../js/derived.js';
import { today } from '../js/util.js';

const near = (a, b, tol = 0.001) => assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}`);
const set = (kg, reps, t = 'n', done = true) => ({ kg, reps, t, done });

function reset() {
  Object.assign(S, migrate({}, SCHEMA));
  S.settings = mergeSettings({});
  S.ui = { tab: 'hoy', date: today(), more: {} };
  S.sheets = [];
}

test('rest-pause: 1 + 0,5 + 0,25 = 1,75 series (y +0,25 cada bloque más)', () => {
  near(setLoad([set(60, 10), set(60, 4, 'rp'), set(60, 3, 'rp')]), 1.75);
  near(setLoad([set(60, 10), set(60, 4, 'rp'), set(60, 3, 'rp'), set(60, 2, 'rp')]), 2);
});

test('dropset: 1 + 0,5 + 0,5 = 2 series', () => {
  near(setLoad([set(60, 10), set(45, 8, 'd'), set(35, 6, 'd')]), 2);
});

test('el calentamiento y las filas sin hacer no cuentan; cada serie reinicia el rest-pause', () => {
  near(setLoad([set(20, 10, 'w'), set(60, 10), set(60, 4, 'rp'), set(60, 10), set(60, 4, 'rp'), set(null, null, 'rp', false)]), 3);
});

test('ejemplo de jalón: dorsal 1,75, bíceps ~0,9 y antebrazo por el agarre', () => {
  reset();
  const w = { id: 'w1', date: today(), start: null, end: null, name: 'Espalda',
    exercises: [{ exId: 'x-jalon-pecho', sets: [set(60, 10), set(60, 4, 'rp'), set(60, 3, 'rp')] }] };
  S.workouts = { w1: w };
  const { vol } = weekVolume(mondayOf(today()));
  near(vol.dorsal, 1.75);
  near(vol.biceps, 0.875);
  near(vol['delt-post'], 0.875);
  near(vol.antebrazo, 1.75 * 0.25);
  near(workoutVolume(w).vol.antebrazo, 1.75 * 0.25);
  // En el resumen, las series siguen siendo las principales; el tonelaje sí suma los bloques
  const st = workoutStats(w);
  assert.equal(st.sets, 1);
  assert.equal(st.tonnage, 60 * 17);
  assert.match(musclesText(getEx('x-jalon-pecho')), /agarre: antebrazo/);
});

test('el agarre no se suma donde el antebrazo ya cuenta (dominadas)', () => {
  reset();
  S.workouts = { w1: { id: 'w1', date: today(), exercises: [{ exId: 'x-dominadas', sets: [set(0, 8)] }] } };
  near(weekVolume(mondayOf(today())).vol.antebrazo, 0.5);
});

test('el 1RM y «la última vez» solo usan las series principales', () => {
  reset();
  S.workouts = { w1: { id: 'w1', date: '2026-01-05', exercises: [{ exId: 'x-curl-barra', sets: [set(30, 10), set(20, 12, 'd'), set(30, 5, 'rp')] }] } };
  const last = lastPerformance('x-curl-barra');
  assert.equal(last.sets.length, 1);
  assert.equal(last.all.length, 3);
  const h = exerciseHistory('x-curl-barra');
  assert.equal(h[0].sets.length, 1);
  assert.equal(setsText(last.all), '30×10 (DS 20×12) (RP +5)');
});

test('texto de rest-pause y dropset', () => {
  assert.equal(setsText([set(60, 10), set(60, 4, 'rp'), set(60, 3, 'rp'), set(55, 10)]), '60×10 (RP +4 +3) · 55×10');
  assert.equal(setsText([set(60, 10), set(45, 8, 'd'), set(35, 6, 'd')]), '60×10 (DS 45×8, 35×6)');
});

test('restaurar una copia antigua conserva las bajadas y los bloques', () => {
  const d = migrate({ workouts: { w1: { id: 'w1', date: '2026-01-05', exercises: [{ exId: 'x-remo-t', sets: [set(60, 10), set(45, 8, 'd'), set(60, 3, 'rp'), set(20, 10, 'w'), set(1, 1, 'raro')] }] } } }, 1);
  assert.deepEqual(d.workouts.w1.exercises[0].sets.map((x) => x.t), ['n', 'd', 'rp', 'w', 'n']);
});
