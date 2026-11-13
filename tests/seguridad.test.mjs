// Datos que vienen de fuera (copias restauradas, ficha de un cliente, plantillas): no pueden colarse como HTML.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { cleanData, plain, esc, csvText, isDate, isImageData } = await import('../js/util.js');
const { qtyLabel, setText, setsText, unitCode } = await import('../js/derived.js');

const MALO = '<img src=x onerror="alert(1)">';

test('plain quita los caracteres de HTML y deja el resto', () => {
  assert.equal(plain(MALO), 'img src=x onerror=alert(1)');
  assert.equal(plain('huevo L'), 'huevo L');
});

test('cleanData limpia identificadores, unidades y claves, y respeta el texto libre', () => {
  const d = cleanData({
    foods: { ['a"b']: { id: 'a"b', name: 'Pan <integral> "bueno"', unitName: MALO, notes: '5 < 6' } },
    settings: { exNotes: { press: 'agarre "neutro" <ancho>' } },
    workouts: { w1: { exercises: [{ sets: [{ reps: MALO, kg: 20 }] }] } },
  });
  assert.deepEqual(Object.keys(d.foods), ['ab']);
  assert.equal(d.foods.ab.id, 'ab');
  assert.equal(d.foods.ab.name, 'Pan <integral> "bueno"');
  assert.equal(d.foods.ab.notes, '5 < 6');
  assert.equal(d.foods.ab.unitName, 'img src=x onerror=alert(1)');
  assert.equal(d.settings.exNotes.press, 'agarre "neutro" <ancho>');
  assert.equal(d.workouts.w1.exercises[0].sets[0].reps, 'img src=x onerror=alert(1)');
  assert.equal(d.workouts.w1.exercises[0].sets[0].kg, 20);
});

test('cleanData no cambia unos datos normales', () => {
  const d = { days: { '2026-11-01': { entries: [{ id: 'm1', type: 'food', ref: 'huevo-l', qty: 2, unit: 'u:60:huevo', n: { kcal: 180 } }], steps: 9000 } }, settings: { goals: { kcal: 2400 } } };
  assert.deepEqual(cleanData(d), d);
});

test('la etiqueta de cantidad con una unidad maliciosa queda inofensiva al escaparla', () => {
  const html = esc(qtyLabel(1, unitCode(50, MALO)));
  assert.ok(!html.includes('<'));
  assert.ok(!html.includes('"'));
});

test('las repeticiones que no son un número no se pintan tal cual', () => {
  assert.ok(!setText({ kg: 20, reps: MALO }).includes('<'));
  assert.ok(!setsText([{ kg: 60, reps: 10, t: 'n', done: true }, { kg: 60, reps: MALO, t: 'rp', done: true }]).includes('<'));
  assert.equal(setText({ kg: 62.5, reps: 8 }), '62,5×8');
});

test('validadores de fecha e imagen', () => {
  assert.ok(isDate('2026-11-13'));
  assert.ok(!isDate('2026-11-13" onload="x'));
  assert.ok(isImageData('data:image/jpeg;base64,AAAA=='));
  assert.ok(!isImageData('data:image/x" onerror="alert(1)'));
});

test('el .csv no deja que un texto se convierta en fórmula de Excel', () => {
  assert.equal(csvText('=1+1'), "'=1+1");
  assert.equal(csvText('Pollo'), 'Pollo');
});
