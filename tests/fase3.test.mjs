// Fase 3 de la revisión: fechas locales y datos mal formados
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { S, migrate, SCHEMA, mergeSettings } from '../js/state.js';
import { localDay } from '../js/util.js';
import { periodVolume, workoutVolume, dayKcal } from '../js/derived.js';
import { today } from '../js/util.js';

function reset() {
  Object.assign(S, migrate({}, SCHEMA));
  S.settings = mergeSettings({});
  S.ui = { tab: 'hoy', date: today(), more: {} };
  S.sheets = [];
}

test('una marca de tiempo del servidor se convierte al día local', () => {
  process.env.TZ = 'Europe/Madrid';
  const ts = '2026-11-16T23:30:00+00:00'; // en Madrid ya es día 17
  assert.equal(localDay(ts), new Date(ts).toLocaleDateString('sv'));
  assert.equal(localDay('2026-11-17'), '2026-11-17', 'un día se queda como está');
  assert.equal(localDay('no es fecha'), 'no es fech');
});

test('un músculo desconocido no rompe el recuento', () => {
  reset();
  S.exercises['u-raro'] = { id: 'u-raro', name: 'Raro', primary: ['musculo-inventado', 'pecho'], secondary: ['otro-raro'] };
  S.workouts.w = { id: 'w', date: '2026-10-28', exercises: [{ exId: 'u-raro', sets: [{ kg: 50, reps: 10, t: 'n', done: true }] }] };
  const pv = periodVolume('2026-10-26', '2026-11-01');
  assert.equal(pv.vol.pecho, 1);
  assert.equal(pv.ton.pecho, 500);
  assert.equal('musculo-inventado' in pv.vol, false);
  const wv = workoutVolume(S.workouts.w);
  assert.deepEqual(Object.keys(wv.vol), ['pecho']);
});

test('una comida sin valores no rompe las calorías del día', () => {
  reset();
  S.days['2026-11-01'] = { entries: [{ id: 'a' }, { id: 'b', n: { kcal: 300 } }], steps: null };
  assert.equal(dayKcal('2026-11-01'), 300);
});
