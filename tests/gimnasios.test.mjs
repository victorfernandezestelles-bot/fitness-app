// Gimnasios: «la última vez», el historial y la progresión de cada ejercicio van por gimnasio.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { S } = await import('../js/state.js');
const D = await import('../js/derived.js');

const set = (kg, reps) => ({ kg, reps, done: true });
function load() {
  S.settings.gyms = [{ id: 'g1', name: 'Mandor' }, { id: 'g2', name: 'Trabajo' }];
  S.workouts = {
    a: { id: 'a', date: '2026-11-01', start: '2026-11-01T10:00:00Z', gym: 'g1', gymName: 'Mandor', exercises: [{ exId: 'jalon', sets: [set(80, 12)] }] },
    b: { id: 'b', date: '2026-11-03', start: '2026-11-03T10:00:00Z', gym: 'g2', gymName: 'Trabajo', exercises: [{ exId: 'jalon', sets: [set(85, 12)] }] },
    c: { id: 'c', date: '2026-11-05', start: '2026-11-05T10:00:00Z', exercises: [{ exId: 'jalon', sets: [set(70, 10)] }] },
  };
}

test('«la última vez» solo mira el mismo gimnasio', () => {
  load();
  const hoy1 = { id: 'n1', date: '2026-11-10', gym: 'g1', exercises: [] };
  const hoy2 = { id: 'n2', date: '2026-11-10', gym: 'g2', exercises: [] };
  assert.equal(D.lastPerformance('jalon', hoy1).sets[0].kg, 80);
  assert.equal(D.lastPerformance('jalon', hoy2).sets[0].kg, 85);
  // Un entreno sin gimnasio solo se compara con otros sin gimnasio
  assert.equal(D.lastPerformance('jalon', { id: 'n3', date: '2026-11-10', exercises: [] }).sets[0].kg, 70);
});

test('el historial se puede pedir por gimnasio, o entero', () => {
  load();
  assert.deepEqual(D.exerciseHistory('jalon', 'g1').map((h) => h.sets[0].kg), [80]);
  assert.deepEqual(D.exerciseHistory('jalon', 'g2').map((h) => h.sets[0].kg), [85]);
  assert.deepEqual(D.exerciseHistory('jalon', '').map((h) => h.sets[0].kg), [70]);
  assert.equal(D.exerciseHistory('jalon').length, 3);
});

test('gimnasios usados, del más reciente al más antiguo, y el gimnasio para un entreno nuevo', () => {
  load();
  assert.deepEqual(D.gymsUsed('jalon').map((g) => g.name), ['Sin gimnasio', 'Trabajo', 'Mandor']);
  assert.equal(D.currentGym(), 'g2'); // el último entreno con un gimnasio de la lista
  S.settings.gyms = [{ id: 'g1', name: 'Mandor' }];
  assert.equal(D.currentGym(), 'g1');
  assert.equal(D.gymName('g2'), 'Trabajo'); // quitado de la lista: el nombre que guardó su entreno
  S.settings.gyms = [];
  assert.equal(D.currentGym(), '');
});

test('el volumen por músculo no se separa por gimnasio', () => {
  load();
  const v = D.periodVolume('2026-11-01', '2026-11-07');
  assert.equal(v.sessions, 3);
});
