// Estado de la app, guardado en el teléfono y versión de los datos (migraciones).
import * as store from './store.js';
import { KEYS } from './nutrients.js';
import { today } from './util.js';
import { toast } from './ui.js';

export const MEALS = [
  ['desayuno', 'Desayuno'],
  ['comida', 'Comida'],
  ['merienda', 'Merienda'],
  ['cena', 'Cena'],
  ['otros', 'Entre horas'],
];
export const MEAL_NAME = Object.fromEntries(MEALS);

/* ---------- estado ---------- */

export const defaultSettings = () => ({
  goals: { kcal: null, p: null, c: null, f: null, steps: null },
  goalsTrain: { kcal: null, p: null, c: null, f: null },
  profile: { sex: null, birthYear: null, height: null, activity: 1.55 },
  rate: -0.5,
  theme: 'auto',
  lastBackup: null, rest: 120, restSound: true, restByEx: {}, exCfg: {},
  keepAwake: true, showRir: true, exNotes: {},
  favs: {}, onboarded: false, textSize: 'system', bigButtons: false,
});

export const S = {
  settings: defaultSettings(),
  foods: {},
  recipes: {},
  days: {},
  weights: {},
  exercises: {},
  routines: {},
  workouts: {},
  measures: {},
  activities: {},
  ui: { tab: 'hoy', date: today(), lib: 'recetas', libQ: '', range: 90, week: null, more: {}, wtab: 'fuerza' },
  sheets: [],
};

/* ---------- versión de los datos ---------- */

// Versión actual del formato de los datos guardados. Cada vez que cambie la forma de guardar algo,
// se sube este número y se añade su paso en MIGRATIONS.
export const SCHEMA = 3;
const COLLECTIONS = ['foods', 'recipes', 'days', 'weights', 'exercises', 'routines', 'workouts', 'measures', 'activities'];

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
let idSeq = 0;
const freshId = () => 'm' + Date.now().toString(36) + (idSeq++).toString(36);

export function mergeSettings(a) {
  const d = defaultSettings();
  a = obj(a);
  return {
    ...d, ...a,
    goals: { ...d.goals, ...obj(a.goals) },
    goalsTrain: { ...d.goalsTrain, ...obj(a.goalsTrain) },
    profile: { ...d.profile, ...obj(a.profile) },
    restByEx: { ...obj(a.restByEx) },
    exCfg: { ...obj(a.exCfg) },
  };
}

const fullNut = (n) => { const o = {}; for (const k of KEYS) o[k] = numOrNull(obj(n)[k]); return o; };

// Pasos de migración: MIGRATIONS[n] convierte datos de la versión n a la n+1
const MIGRATIONS = {
  // 1 → 2: se completan y ordenan los campos que versiones anteriores podían dejar a medias
  1: (d) => {
    for (const [date, day] of Object.entries(d.days)) {
      const entries = Array.isArray(day?.entries) ? day.entries : [];
      d.days[date] = {
        ...obj(day),
        entries: entries.filter(Boolean).map((e) => ({
          ...e,
          id: e.id || freshId(),
          meal: e.meal || 'comida',
          qty: numOrNull(e.qty) ?? 1,
          unit: e.unit || 'g',
          n: fullNut(e.n),
        })),
        steps: numOrNull(day?.steps),
      };
    }
    for (const [id, w] of Object.entries(d.workouts)) {
      d.workouts[id] = {
        ...obj(w),
        id: w?.id || id,
        name: w?.name || 'Entrenamiento',
        start: w?.start || null,
        end: w?.end ?? null,
        exercises: (Array.isArray(w?.exercises) ? w.exercises : []).map((we) => ({
          ...we,
          sets: (Array.isArray(we.sets) ? we.sets : []).map((st) => ({
            ...st, kg: numOrNull(st.kg), reps: numOrNull(st.reps), t: ['w', 'd', 'rp'].includes(st.t) ? st.t : 'n', done: !!st.done,
          })),
        })),
      };
    }
    for (const [id, f] of Object.entries(d.foods)) d.foods[id] = { ...obj(f), id: f?.id || id, per100: fullNut(f?.per100) };
    for (const [id, r] of Object.entries(d.routines)) {
      d.routines[id] = { ...obj(r), id: r?.id || id, items: (Array.isArray(r?.items) ? r.items : []).map((it) => ({ ...it, sets: Math.max(1, Math.round(it.sets || 1)) })) };
    }
    for (const [id, r] of Object.entries(d.recipes)) d.recipes[id] = { ...obj(r), id: r?.id || id, items: Array.isArray(r?.items) ? r.items : [] };
    return d;
  },
  // 2 → 3: nueva colección de cardio y actividades
  2: (d) => {
    d.activities = obj(d.activities);
    for (const [id, a] of Object.entries(d.activities)) d.activities[id] = { ...obj(a), id: a?.id || id };
    return d;
  },
};

// Convierte unos datos de cualquier versión anterior a la actual (no modifica el original)
export function migrate(data, fromVersion) {
  let d = structuredClone(data);
  d.settings = obj(d.settings);
  for (const c of COLLECTIONS) d[c] = obj(d[c]);
  for (let v = Math.max(1, fromVersion || 1); v < SCHEMA; v++) d = MIGRATIONS[v](d);
  d.settings = mergeSettings(d.settings);
  return d;
}

// Datos del almacén (clave → valor) a una «instantánea» con la misma forma que la copia .json
export function fromStore(all) {
  const d = { settings: all.settings, days: {}, workouts: {} };
  for (const c of ['foods', 'recipes', 'weights', 'exercises', 'routines', 'measures', 'activities']) d[c] = all[c] || {};
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith('day:')) d.days[k.slice(4)] = v;
    else if (k.startsWith('wk:')) d.workouts[k.slice(3)] = v;
  }
  return d;
}

export function toStoreEntries(d) {
  return [
    ['settings', d.settings],
    ['foods', d.foods], ['recipes', d.recipes], ['weights', d.weights],
    ['exercises', d.exercises], ['routines', d.routines], ['measures', d.measures], ['activities', d.activities],
    ...Object.entries(d.days).map(([k, v]) => ['day:' + k, v]),
    ...Object.entries(d.workouts).map(([k, v]) => ['wk:' + k, v]),
    ['meta', { schema: SCHEMA, migratedAt: new Date().toISOString() }],
  ];
}

export function snapshot() {
  const d = { settings: S.settings };
  for (const c of COLLECTIONS) d[c] = S[c];
  return d;
}

function applySnapshot(d) {
  S.settings = d.settings;
  for (const c of COLLECTIONS) S[c] = d[c];
}

/* ---------- guardado ---------- */

// Avisos tras cada guardado (la sincronización se apunta aquí)
export const SAVED = [];
// Con la cuenta pendiente o bloqueada no se guarda nada (solo lectura)
export const GUARD = { canWrite: () => true };
const pending = new Map();
export function persist(key, getter) {
  if (!GUARD.canWrite()) return;
  if (pending.has(key)) clearTimeout(pending.get(key).t);
  const t = setTimeout(() => flushKey(key), 250);
  pending.set(key, { t, getter });
}
function flushKey(key) {
  const p = pending.get(key);
  if (!p) return;
  pending.delete(key);
  const value = p.getter();
  const op = value == null ? store.del(key) : store.put(key, value);
  op.then(() => SAVED.forEach((fn) => fn(key)), () => toast('No se ha podido guardar. Comprueba el espacio del teléfono.'));
}
export function flushAll() { for (const key of [...pending.keys()]) { clearTimeout(pending.get(key).t); flushKey(key); } }
export function dropPending() { pending.forEach((p) => clearTimeout(p.t)); pending.clear(); }

export const saveSettings = () => persist('settings', () => S.settings);
export const saveFoods = () => persist('foods', () => S.foods);
export const saveRecipes = () => persist('recipes', () => S.recipes);
export const saveWeights = () => persist('weights', () => S.weights);
export const saveExercises = () => persist('exercises', () => S.exercises);
export const saveRoutines = () => persist('routines', () => S.routines);
export const saveMeasures = () => persist('measures', () => S.measures);
export const saveActivities = () => persist('activities', () => S.activities);
export const saveWorkout = (id) => persist('wk:' + id, () => S.workouts[id] || null);
export function saveDay(date) {
  persist('day:' + date, () => {
    const d = S.days[date];
    if (!d || (!d.entries.length && d.steps == null && d.sleep == null && !d.type)) { delete S.days[date]; return null; }
    return d;
  });
}

// Carga los datos del teléfono y, si son de una versión anterior, los convierte guardando antes una copia
export async function loadState() {
  const all = await store.loadAll();
  const hasData = Object.keys(all).some((k) => k !== 'meta');
  const version = all.meta?.schema ?? (hasData ? 1 : SCHEMA);
  let d = fromStore(all);
  if (version < SCHEMA) {
    await store.put('backup:v' + version, JSON.stringify({ app: 'fitness-app', schema: version, savedAt: new Date().toISOString(), ...d }));
    d = migrate(d, version);
    await store.putMany(toStoreEntries(d));
  } else {
    d = migrate(d, SCHEMA);
    if (!all.meta) await store.put('meta', { schema: SCHEMA, createdAt: new Date().toISOString() });
  }
  applySnapshot(d);
}

// Sustituye todos los datos por los de una copia (ya validada)
export async function replaceAll(data) {
  const d = migrate(data, data.schema || data.version || 1);
  dropPending();
  await store.clearAll('sync:'); // la sesión de la cuenta se mantiene
  await store.putMany(toStoreEntries(d));
  applySnapshot(d);
  SAVED.forEach((fn) => fn('*'));
}

export async function wipeAll() {
  dropPending();
  await store.clearAll();
  try { await store.photoClear(); } catch (e) { /* sin fotos */ }
  await store.put('meta', { schema: SCHEMA, createdAt: new Date().toISOString() });
  applySnapshot(migrate({}, SCHEMA));
  SAVED.forEach((fn) => fn('!wipe'));
}
