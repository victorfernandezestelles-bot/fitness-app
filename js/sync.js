// Cuenta (correo y contraseña) y sincronización con Supabase.
// Cada dato se guarda en el servidor como una fila (un día, un entreno, un alimento, un peso…).
// Al sincronizar se bajan las filas que cambiaron en otros dispositivos y se suben las cambiadas aquí.
// Si la misma fila cambió en los dos sitios, gana la de este dispositivo, salvo en los días:
// ahí se juntan las comidas de los dos.
import * as store from './store.js';
import { SUPABASE_KEY, SUPABASE_URL } from './config.js';
import { $, cleanData, esc, isDate, parseAuthLink, plain, uid } from './util.js';
import { S, SAVED, SCHEMA, flushAll, mergeSettings, migrate, saveActivities, saveDay, saveExercises, saveFoods, saveMeasures, saveRecipes, saveRoutines, saveSettings, saveWeights, saveWorkout, wipeAll } from './state.js';
import { ACTIONS, FORMS, HOOKS, SHEETS, applyTheme, popSheet, pushSheet, render, renderSheets, toast } from './ui.js';
import { keepAwake } from './training.js';

export const syncConfigured = () => !!(SUPABASE_URL && SUPABASE_KEY);

// Ajustes propios de cada dispositivo, que no se sincronizan
const DEVICE_SETTINGS = ['theme', 'textSize', 'bigButtons', 'keepAwake', 'onboarded', 'lastBackup'];
const MAPS = ['foods', 'recipes', 'weights', 'exercises', 'routines', 'measures', 'activities'];
const SAVERS = {
  foods: () => saveFoods(), recipes: () => saveRecipes(), weights: () => saveWeights(), exercises: () => saveExercises(),
  routines: () => saveRoutines(), measures: () => saveMeasures(), activities: () => saveActivities(),
};

let auth = null;     // { access_token, refresh_token, expires_at, user: { id, email } }
let shadow = {};     // clave de fila → huella de lo último sincronizado
let lastPull = null; // marca de tiempo del servidor de lo último bajado
let running = false;
let again = false;
let timer = null;
export const syncState = { status: 'off', at: null, msg: '' };
// Enganches para la cuenta: al entrar o salir, al empezar cada sincronización, y si se puede subir
export const SYNC_HOOKS = { auth: [], cycle: [], canPush: () => true };
export const isLoggedIn = () => !!auth;
export const currentUser = () => auth?.user || null;
export const rpc = (name, args = {}) => apiRest('rpc/' + name, { method: 'POST', body: args });

/* ---------- utilidades ---------- */

// Texto estable (claves ordenadas): el servidor no conserva el orden de las claves
function stable(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
}
function hash(v) {
  const s = stable(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + ':' + s.length.toString(36);
}

// Todos los datos como filas «clave → valor»
export function rowsOf(d = S) {
  const rows = {};
  const st = { ...d.settings };
  for (const k of DEVICE_SETTINGS) delete st[k];
  rows.settings = st;
  for (const [k, v] of Object.entries(d.days || {})) rows['day:' + k] = v;
  for (const [k, v] of Object.entries(d.workouts || {})) rows['wk:' + k] = v;
  for (const c of MAPS) for (const [k, v] of Object.entries(d[c] || {})) rows[`${c}/${k}`] = v;
  return rows;
}

// Una fila guardada por una versión anterior de la app se convierte al formato actual
function upgrade(key, value, v) {
  if (!v || v >= SCHEMA || value == null) return value;
  const part = {};
  let get;
  if (key === 'settings') { part.settings = value; get = (d) => d.settings; }
  else if (key.startsWith('day:')) { part.days = { [key.slice(4)]: value }; get = (d) => d.days[key.slice(4)]; }
  else if (key.startsWith('wk:')) { part.workouts = { [key.slice(3)]: value }; get = (d) => d.workouts[key.slice(3)]; }
  else { const [c, id] = splitKey(key); part[c] = { [id]: value }; get = (d) => d[c][id]; }
  return get(migrate(part, v));
}
const splitKey = (key) => { const i = key.indexOf('/'); return [key.slice(0, i), key.slice(i + 1)]; };

// Filas de otra cuenta (la ficha de un cliente) a la misma forma que S, sin tocar los datos propios
export function dataFromRows(list) {
  const d = { settings: {}, days: {}, workouts: {}, foods: {}, recipes: {}, weights: {}, exercises: {}, routines: {}, measures: {}, activities: {} };
  for (const r of list || []) {
    let value;
    if (typeof r?.key !== 'string' || r.key !== plain(r.key)) continue;
    try { value = cleanData(upgrade(r.key, r.value, r.v)); } catch (e) { continue; }
    if (value == null) continue;
    if (r.key === 'settings') d.settings = value;
    else if (r.key.startsWith('day:')) d.days[r.key.slice(4)] = value;
    else if (r.key.startsWith('wk:')) d.workouts[r.key.slice(3)] = value;
    else { const [c, id] = splitKey(r.key); if (d[c]) d[c][id] = value; }
  }
  d.settings = mergeSettings(d.settings);
  // Lo que no tiene una forma válida se descarta, para que la ficha no se rompa
  for (const [k, w] of Object.entries(d.workouts)) {
    if (!w || !isDate(w.date) || !Array.isArray(w.exercises)) { delete d.workouts[k]; continue; }
    w.exercises = w.exercises.filter((we) => we && typeof we.exId === 'string' && Array.isArray(we.sets));
    for (const we of w.exercises) we.sets = we.sets.filter((st) => st && typeof st === 'object');
  }
  for (const [k, a] of Object.entries(d.activities)) if (!a || !isDate(a.date)) delete d.activities[k];
  for (const [k, day] of Object.entries(d.days)) {
    if (!isDate(k) || !day || typeof day !== 'object' || Array.isArray(day)) { delete d.days[k]; continue; }
    day.entries = (Array.isArray(day.entries) ? day.entries : []).filter((e) => e && typeof e === 'object').map((e) => ({ ...e, n: e.n && typeof e.n === 'object' ? e.n : {} }));
  }
  for (const k of ['weights', 'measures']) for (const key of Object.keys(d[k])) if (!isDate(key)) delete d[k][key];
  return d;
}

// Un día cambiado en los dos dispositivos: se juntan las comidas de ambos
export function mergeDay(remote, local) {
  const ids = new Set((remote.entries || []).map((e) => e.id));
  return {
    ...local, ...remote,
    entries: [...(remote.entries || []), ...(local.entries || []).filter((e) => !ids.has(e.id))],
    steps: remote.steps ?? local.steps ?? null,
    ...((remote.sleep ?? local.sleep) != null ? { sleep: remote.sleep ?? local.sleep } : {}),
  };
}

// Aplica en este dispositivo una fila bajada del servidor (null = borrada)
function applyRow(key, value) {
  if (key === 'settings') {
    const keep = Object.fromEntries(DEVICE_SETTINGS.map((k) => [k, S.settings[k]]));
    S.settings = mergeSettings({ ...value, ...keep });
    saveSettings();
  } else if (key.startsWith('day:')) {
    const d = key.slice(4);
    if (value) S.days[d] = value; else delete S.days[d];
    saveDay(d);
  } else if (key.startsWith('wk:')) {
    const id = key.slice(3);
    if (value) S.workouts[id] = value; else delete S.workouts[id];
    saveWorkout(id);
  } else {
    const [c, id] = splitKey(key);
    if (!MAPS.includes(c)) return;
    if (value != null) S[c][id] = value; else delete S[c][id];
    SAVERS[c]();
  }
}

/* ---------- servidor ---------- */

class SyncError extends Error {
  constructor(msg, code, status) { super(msg); this.code = code; this.status = status; }
}

export async function apiCall(path, { method = 'GET', body, token, prefer } = {}) {
  const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (prefer) headers.Prefer = prefer;
  let res;
  try {
    res = await fetch(SUPABASE_URL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    throw new SyncError('Sin conexión', 'offline', 0);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
  if (!res.ok) {
    const code = data?.error_code || data?.code || data?.error || String(res.status);
    const msg = data?.msg || data?.error_description || data?.message || res.statusText;
    throw new SyncError(msg, String(code), res.status);
  }
  return data;
}

// Mensajes de error en castellano
function explain(e) {
  const c = (e.code || '') + ' ' + (e.message || '');
  if (e.code === 'offline') return 'No hay conexión. Prueba de nuevo cuando la tengas.';
  if (/invalid_credentials|invalid_grant|Invalid login/i.test(c)) return 'El correo o la contraseña no son correctos.';
  if (/user_already_exists|already registered/i.test(c)) return 'Ya hay una cuenta con ese correo. Pulsa «Entrar».';
  if (/weak_password|at least/i.test(c)) return 'La contraseña es demasiado corta: usa al menos 6 caracteres (mejor 8 o más, con letras y números).';
  if (/email_not_confirmed/i.test(c)) return 'Falta confirmar el correo. En Supabase, desactiva «Confirm email».';
  if (/validation_failed|invalid.*email|email_address_invalid/i.test(c)) return 'Ese correo no parece válido.';
  if (/same_password/i.test(c)) return 'La contraseña nueva tiene que ser distinta de la anterior.';
  if (/email_address_not_authorized/i.test(c)) return 'Ahora mismo la app no puede enviar correos a esa dirección. Pide ayuda a quien te dio acceso a la app.';
  if (/over_email_send_rate_limit/i.test(c)) return /after \d+ seconds?/i.test(c)
    ? 'Acabas de pedir un correo. Espera un minuto antes de pedir otro.'
    : 'Se han pedido demasiados correos hace poco. Espera un rato (puede ser hasta una hora) y vuelve a probar.';
  if (/over_.*rate_limit|rate limit|429/i.test(c)) return 'Demasiados intentos seguidos. Espera un minuto.';
  if (/signup_disabled/i.test(c)) return 'El servidor no admite cuentas nuevas ahora mismo.';
  if (/too_big/.test(c)) return 'Hay un dato demasiado grande para sincronizarlo.';
  if (/too_many/.test(c)) return 'Tu cuenta ha llegado al máximo de datos guardados.';
  return 'No se ha podido conectar con el servidor (' + (e.message || e.code) + ').';
}

async function saveAuth() {
  if (auth) await store.put('sync:auth', auth); else await store.del('sync:auth');
}
function setSession(s) {
  if (!s?.access_token) throw new SyncError('Sin sesión', 'no_session', 0);
  auth = {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600),
    user: { id: s.user?.id, email: s.user?.email },
  };
}

// La sesión ya no vale en el servidor: se olvida solo la sesión. Los datos y lo pendiente de subir se quedan,
// y al volver a entrar con la misma cuenta se sigue donde estaba.
async function endSession() {
  epoch++;
  auth = null;
  await store.del('sync:auth');
  setStatus('off');
  SYNC_HOOKS.auth.forEach((fn) => fn(false));
}

async function ensureToken(force = false) {
  if (!auth) throw new SyncError('Sin sesión', 'no_session', 401);
  if (!force && auth.expires_at * 1000 - 60000 > Date.now()) return auth.access_token;
  try {
    setSession(await apiCall('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: auth.refresh_token } }));
    await saveAuth();
  } catch (e) {
    if (e.code !== 'offline' && e.status >= 400 && e.status < 500) {
      await endSession();
      throw new SyncError('La sesión ha caducado. Vuelve a entrar.', 'expired', 401);
    }
    throw e;
  }
  return auth.access_token;
}

export async function apiRest(path, opts = {}) {
  try {
    return await apiCall('/rest/v1/' + path, { ...opts, token: await ensureToken() });
  } catch (e) {
    if (e.status !== 401) throw e;
    return apiCall('/rest/v1/' + path, { ...opts, token: await ensureToken(true) });
  }
}

async function pullSince(since) {
  const out = [];
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const q = 'kv?select=key,value,v,deleted,updated_at&order=updated_at.asc,key.asc'
      + (since ? '&updated_at=gt.' + encodeURIComponent(since) : '') + `&limit=${page}&offset=${offset}`;
    const rows = await apiRest(q);
    out.push(...rows);
    if (rows.length < page) return out;
  }
}

async function push(ops) {
  for (let i = 0; i < ops.length; i += 200) {
    await apiRest('kv?on_conflict=user_id,key', { method: 'POST', body: ops.slice(i, i + 200), prefer: 'resolution=merge-duplicates,return=minimal' });
  }
}

/* ---------- sincronizar ---------- */

function setStatus(status, msg = '') {
  syncState.status = status;
  syncState.msg = msg;
  if (status === 'ok') syncState.at = new Date().toISOString();
  const el = document.getElementById('sync-status');
  if (el) el.innerHTML = statusText();
}

export async function syncNow({ quiet = true } = {}) {
  if (!syncConfigured() || !auth) return;
  if (running) { again = true; return; }
  running = true;
  const mine = epoch;
  const stale = () => epoch !== mine || !auth;
  setStatus('syncing');
  let changed = 0, sent = 0, tooNew = false;
  try {
    for (const fn of SYNC_HOOKS.cycle) await fn();
    if (stale()) return;
    flushAll();
    const first = !lastPull;
    const since = lastPull ? new Date(Date.parse(lastPull) - 10000).toISOString() : null;
    const remote = await pullSince(since);
    if (stale()) return;
    const local = rowsOf();
    for (const r of remote) {
      if (!lastPull || r.updated_at > lastPull) lastPull = r.updated_at;
      if ((r.v || 1) > SCHEMA) { tooNew = true; continue; }
      const rv = r.deleted ? null : upgrade(r.key, r.value, r.v);
      const rh = rv == null ? null : hash(rv);
      const lv = local[r.key];
      const lh = lv === undefined ? null : hash(lv);
      const sh = shadow[r.key] ?? null;
      const setShadow = (h) => { if (h == null) delete shadow[r.key]; else shadow[r.key] = h; };
      if (rh === lh) { setShadow(rh); continue; }
      if (!first && rh === sh) continue; // el servidor no trae nada nuevo para esta fila: lo de aquí se sube
      const dirty = first ? lv !== undefined : lh !== sh;
      if (!dirty) {
        applyRow(r.key, rv); setShadow(rh); changed++;
      } else if (r.key.startsWith('day:') && rv && lv) {
        applyRow(r.key, mergeDay(rv, lv)); setShadow(rh); changed++;
      } else if (first && rv != null) {
        applyRow(r.key, rv); setShadow(rh); changed++;
      } else {
        setShadow(rh); // gana lo de este dispositivo: se sube ahora
      }
    }
    // Subir lo cambiado aquí (solo con la cuenta activa)
    const now = SYNC_HOOKS.canPush() ? rowsOf() : null;
    const ops = [];
    const hashes = {};
    for (const [key, value] of Object.entries(now || {})) {
      const h = hash(value);
      if (shadow[key] !== h) { ops.push({ user_id: auth.user.id, key, value, v: SCHEMA, deleted: false }); hashes[key] = h; }
    }
    for (const key of now ? Object.keys(shadow) : []) {
      if (!(key in now)) { ops.push({ user_id: auth.user.id, key, value: null, v: SCHEMA, deleted: true }); hashes[key] = null; }
    }
    if (ops.length) {
      await push(ops);
      if (stale()) return;
      for (const [k, h] of Object.entries(hashes)) { if (h == null) delete shadow[k]; else shadow[k] = h; }
      sent = ops.length;
    }
    // Aunque la cuenta esté vacía, la primera sincronización ya está hecha
    if (!lastPull) lastPull = '1970-01-01T00:00:10.000Z';
    if (stale()) return;
    await store.put('sync:shadow', shadow);
    await store.put('sync:last', lastPull);
    if (tooNew) setStatus('update', 'Otro dispositivo usa una versión más nueva de la app. Actualiza esta para sincronizar todo.');
    else setStatus('ok');
    for (const fn of [...afterSync]) { afterSync.delete(fn); try { fn(); } catch (e2) { console.error(e2); } }
    if (changed) refreshView();
    if (!quiet) toast(changed || sent ? `Sincronizado: ${changed} ${changed === 1 ? 'cambio recibido' : 'cambios recibidos'}, ${sent} ${sent === 1 ? 'enviado' : 'enviados'}` : 'Todo está al día');
  } catch (e) {
    if (e.code === 'expired') setStatus('error', e.message);
    else setStatus('error', e.code === 'offline' ? 'Sin conexión: se sincronizará cuando vuelva.' : explain(e));
    if (!quiet) toast(syncState.msg);
  } finally {
    running = false;
    if (again) { again = false; setTimeout(() => syncNow(), 300); }
  }
}

// Repinta con lo recibido sin cerrar lo que se esté haciendo
let renderLater = false;
function refreshView() {
  if (S.sheets.length) { renderLater = true; renderSheets(); } else render();
}
HOOKS.sheetChange.push((top) => { if (!top && renderLater) { renderLater = false; setTimeout(render, 0); } });

function schedule(ms = 3000) {
  if (!auth) return;
  clearTimeout(timer);
  timer = setTimeout(() => syncNow(), ms);
}

// Cuenta dueña de los datos que hay ahora en el teléfono
const OWNER = 'sync:owner';
export const currentUserId = () => auth?.user?.id || null;
// Cambia al cerrar o perder la sesión y al borrar los datos: una sincronización que empezó antes ya no aplica ni guarda nada
let epoch = 0;
// Espera a que termine la sincronización en marcha, si la hay
export async function waitIdle() {
  for (let i = 0; running && i < 600; i++) await new Promise((r) => setTimeout(r, 100));
}
// Lo que hay que hacer cuando termine bien la primera sincronización (por ejemplo, decidir si sale la bienvenida)
const afterSync = new Set();
export const hasSynced = () => !!lastPull;
export function whenSynced(fn) {
  if (!auth || lastPull) fn();
  else afterSync.add(fn);
}

// Cambios de este teléfono que aún no están en el servidor (aunque ahora no se puedan subir)
export function pendingCount() {
  if (!syncConfigured()) return 0;
  flushAll();
  const now = rowsOf();
  let n = 0;
  for (const [key, value] of Object.entries(now)) if (shadow[key] !== hash(value)) n++;
  for (const key of Object.keys(shadow)) if (!(key in now)) n++;
  return n;
}

export async function signOutLocal() {
  epoch++;
  auth = null;
  shadow = {};
  lastPull = null;
  await store.del('sync:auth');
  await store.del('sync:shadow');
  await store.del('sync:last');
  setStatus('off');
  SYNC_HOOKS.auth.forEach((fn) => fn(false));
}

export async function initSync() {
  if (!syncConfigured()) return;
  try {
    auth = (await store.get('sync:auth')) || null;
    shadow = (await store.get('sync:shadow')) || {};
    lastPull = (await store.get('sync:last')) || null;
  } catch (e) { auth = null; }
  if (!auth) return;
  // Versiones anteriores no apuntaban de quién son los datos: son de la cuenta con la sesión abierta
  try {
    if (!(await store.get(OWNER))) { await store.put(OWNER, auth.user.id); await claimPhotos(auth.user.id); }
  } catch (e) { /* sin almacén */ }
  setStatus('idle');
  syncNow();
}
// Cada minuto mientras la app está a la vista
setInterval(() => { if (auth && document.visibilityState === 'visible') syncNow(); }, 60000);

SAVED.push((key) => {
  if (key === '!wipe') { epoch++; auth = null; shadow = {}; lastPull = null; setStatus('off'); return; }
  if (!String(key).startsWith('sync:') && !String(key).startsWith('backup:') && key !== 'meta') schedule();
});
HOOKS.visible.push(() => schedule(500));
window.addEventListener('online', () => schedule(500));

/* ---------- interfaz ---------- */

export function statusText() {
  const s = syncState;
  if (s.status === 'syncing') return 'Sincronizando…';
  if (s.status === 'error' || s.status === 'update') return `<span class="sync-err">${esc(s.msg)}</span>`;
  if (s.at) return `Sincronizado a las ${new Date(s.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
  return 'Pendiente de sincronizar';
}

SHEETS.login = {
  title: () => 'Tu cuenta',
  render: (s) => `
    <p class="muted">Usa el mismo correo y contraseña en el iPhone y en el ordenador. Si es la primera vez, pulsa «Crear cuenta».</p>
    <form data-form="sync-login" class="top-gap" novalidate>
      <label class="field"><span>Correo</span><input id="lg-email" type="email" inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" value="${esc(s.email || '')}" required></label>
      <label class="field"><span>Tu nombre <small class="muted">(solo al crear la cuenta)</small></span><input id="lg-name" type="text" autocomplete="name" value="${esc(s.name || '')}" maxlength="60"></label>
      <label class="field"><span>Contraseña</span><input id="lg-pass" type="password" autocomplete="${s.mode === 'signup' ? 'new-password' : 'current-password'}" minlength="6" value="${esc(s.pw || '')}" required></label>
      ${s.error ? `<p class="sync-err" role="alert">${esc(s.error)}</p>` : ''}
      <p><button type="button" class="link tap-link" data-act="sync-forgot">He olvidado mi contraseña</button></p>
      <div class="sheet-actions">
        <button type="button" class="btn ghost" data-act="sync-signup" ${s.busy ? 'disabled' : ''}>Crear cuenta</button>
        <button type="submit" class="btn primary" ${s.busy ? 'disabled' : ''}>${s.busy ? 'Un momento…' : 'Entrar'}</button>
      </div>
    </form>
    <p class="hint">Al entrar se descargan los datos de tu cuenta. Si en este teléfono quedaban datos de otra cuenta, se borran del teléfono (no de esa cuenta) para que no se mezclen.</p>`,
};

/* ---------- he olvidado mi contraseña ---------- */

// Dirección a la que vuelve el enlace del correo (la de la app, sin «index.html»)
const appUrl = () => location.origin + location.pathname.replace(/index\.html$/, '');

SHEETS.forgot = {
  title: () => 'Recuperar la contraseña',
  render: (s) => s.sent ? `
    <p>Si hay una cuenta con <strong>${esc(s.email)}</strong>, te llegará un correo con un enlace en unos minutos. Mira también en «Correo no deseado».</p>
    <p class="top-gap">Abre el enlace y elige una contraseña nueva. Caduca en una hora y solo vale una vez.</p>
    <p class="hint">En el iPhone el enlace se abre en Safari: cambia allí la contraseña y después entra con ella en la app de la pantalla de inicio.</p>
    <div class="sheet-actions"><button type="button" class="btn primary" data-act="sheet-back-or-close">Entendido</button></div>` : `
    <p class="muted">Escribe el correo de tu cuenta y te enviaremos un enlace para elegir una contraseña nueva. Tus datos no se tocan.</p>
    <form data-form="sync-forgot" class="top-gap" novalidate>
      <label class="field"><span>Correo</span><input id="fg-email" type="email" inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" value="${esc(s.email || '')}" required></label>
      ${s.error ? `<p class="sync-err" role="alert">${esc(s.error)}</p>` : ''}
      <div class="sheet-actions">
        <button type="submit" class="btn primary" ${s.busy ? 'disabled' : ''}>${s.busy ? 'Enviando…' : 'Enviar enlace'}</button>
      </div>
    </form>`,
};

async function doForgot(top) {
  const email = ($('#fg-email')?.value || '').trim().toLowerCase();
  top.email = email;
  if (!/^\S+@\S+\.\S+$/.test(email)) { top.error = 'Ese correo no parece válido.'; renderSheets(); return; }
  top.error = '';
  top.busy = true;
  renderSheets();
  try {
    await apiCall('/auth/v1/recover?redirect_to=' + encodeURIComponent(appUrl()), { method: 'POST', body: { email } });
    top.sent = true;
  } catch (e) {
    top.error = explain(e);
  }
  top.busy = false;
  renderSheets();
}

// El enlace del correo vuelve a la app con una sesión de recuperación tras «#».
// Se lee y se quita de la dirección enseguida, para que no quede en el historial. No se guarda en ningún sitio.
// Con la plantilla de correo recomendada llega solo un código de un uso (token_hash), que se canjea al guardar.
// Con la plantilla de Supabase por defecto llega ya una sesión (access_token): se cierra si se abandona la hoja.
export function takeRecoveryLink() {
  const link = typeof location === 'undefined' ? null : parseAuthLink(location.hash);
  if (!link) return null;
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* sin historial */ }
  return link.rec;
}
const recSheets = new Set();
const dropRecovery = (token) => { if (token) apiCall('/auth/v1/logout?scope=local', { method: 'POST', token }).catch(() => {}); };
export function openRecovery(rec) {
  if (!rec) return;
  const sheet = { type: 'newpass', ...rec };
  recSheets.add(sheet);
  pushSheet(sheet);
}
// Hoja cerrada sin terminar: la sesión de recuperación que tuviera no se deja viva
HOOKS.sheetChange.push(() => {
  for (const sh of recSheets) if (!S.sheets.includes(sh)) { dropRecovery(sh.token); sh.token = null; recSheets.delete(sh); }
});

SHEETS.newpass = {
  title: (s) => (s.linkError ? 'Enlace caducado' : 'Contraseña nueva'),
  render: (s) => {
    if (s.linkError) return `
    <p>Este enlace ya no vale: ha caducado o ya se ha usado.</p>
    <p class="top-gap">Pide otro y ábrelo en cuanto te llegue.</p>
    <div class="sheet-actions"><button type="button" class="btn primary" data-act="sync-forgot">Pedir otro enlace</button></div>`;
    if (s.done) return `
    <p><strong>Contraseña cambiada.</strong> Ya puedes entrar con ella${s.email ? ` (${esc(s.email)})` : ''}.</p>
    <p class="hint">Si usas la app instalada en la pantalla de inicio del iPhone, ábrela y entra allí con la contraseña nueva. Por seguridad, en tus otros dispositivos te pedirá volver a entrar: no se pierde nada de lo que tengas en ellos.</p>
    <div class="sheet-actions">
      <button type="button" class="btn ghost" data-act="sheet-back-or-close">Cerrar</button>
      ${auth ? '' : '<button type="button" class="btn primary" data-act="sync-newpass-login">Entrar</button>'}
    </div>`;
    return `
    <p class="muted">Elige una contraseña nueva para tu cuenta. Al menos 6 caracteres (mejor 8 o más, con letras y números).</p>
    <form data-form="sync-newpass" class="top-gap" novalidate>
      <label class="field"><span>Contraseña nueva</span><input id="np-pass" type="password" autocomplete="new-password" minlength="6" required></label>
      <label class="field"><span>Repítela</span><input id="np-pass2" type="password" autocomplete="new-password" minlength="6" required></label>
      ${s.error ? `<p class="sync-err" role="alert">${esc(s.error)}</p>` : ''}
      <div class="sheet-actions">
        <button type="submit" class="btn primary" ${s.busy ? 'disabled' : ''}>${s.busy ? 'Guardando…' : 'Guardar contraseña'}</button>
      </div>
    </form>`;
  },
};

async function doNewPass(top) {
  const password = $('#np-pass')?.value || '';
  const again = $('#np-pass2')?.value || '';
  if (password.length < 6) { top.error = 'La contraseña tiene que tener al menos 6 caracteres.'; renderSheets(); return; }
  if (password !== again) { top.error = 'Las dos contraseñas no coinciden.'; renderSheets(); return; }
  top.error = '';
  top.busy = true;
  renderSheets();
  try {
    if (!top.token && top.hash) {
      // Se canjea el código del correo por una sesión de recuperación (solo vale una vez)
      const ses = await apiCall('/auth/v1/verify', { method: 'POST', body: { type: 'recovery', token_hash: top.hash } });
      top.hash = null;
      top.token = ses?.access_token || null;
    }
    const user = await apiCall('/auth/v1/user', { method: 'PUT', token: top.token, body: { password } });
    // La sesión de recuperación ya no hace falta: se cierra
    dropRecovery(top.token);
    top.token = null;
    top.email = user?.email || '';
    top.done = true;
    // Si este dispositivo tenía abierta esa misma cuenta, el servidor la ha cerrado: se olvida la sesión, no los datos
    if (auth && user?.id && auth.user.id === user.id) { await endSession(); render(); }
  } catch (e) {
    if (e.status === 401 || e.status === 403 || /otp_expired|bad_jwt|session_not_found|session_expired/i.test(e.code)) {
      dropRecovery(top.token); top.token = null; top.hash = null; top.linkError = e.code || 'expired';
    } else top.error = explain(e);
  }
  top.busy = false;
  renderSheets();
}

// Las fotos sin dueño (de versiones anteriores) pasan a ser de esta cuenta
async function claimPhotos(uid) {
  try {
    for (const x of await store.photoSets()) if (!x.owner) await store.photoPut('set:' + x.id, { ...x, owner: uid });
  } catch (e) { /* sin fotos */ }
}

// Cierra la sesión y borra los datos de este teléfono. Se quedan las fotos (cada una a nombre de su cuenta)
// y los ajustes de este dispositivo (tema, tamaño del texto, botones grandes y pantalla encendida)
async function logoutAndWipe({ lost = false } = {}) {
  const keep = Object.fromEntries(['theme', 'textSize', 'bigButtons', 'keepAwake'].filter((k) => S.settings[k] !== undefined).map((k) => [k, S.settings[k]]));
  const token = auth?.access_token;
  if (token) apiCall('/auth/v1/logout', { method: 'POST', token }).catch(() => {});
  await signOutLocal();
  await wipeAll({ photos: 'keep' });
  await store.del(OWNER);
  Object.assign(S.settings, keep);
  try { await store.put('settings', S.settings); } catch (e) { /* sin almacén */ }
  applyTheme();
  render();
  toast(lost ? 'Sesión cerrada.' : 'Sesión cerrada. Tus datos siguen en tu cuenta.');
}

async function doLogin(top, mode) {
  const email = $('#lg-email').value.trim().toLowerCase();
  const password = $('#lg-pass').value;
  top.email = email;
  top.name = ($('#lg-name')?.value || '').trim();
  top.pw = password; // solo mientras la hoja está abierta, para no tener que volver a escribirla
  top.mode = mode;
  if (!/^\S+@\S+\.\S+$/.test(email)) { top.error = 'Ese correo no parece válido.'; renderSheets(); return; }
  if (password.length < 6) { top.error = 'La contraseña tiene que tener al menos 6 caracteres.'; renderSheets(); return; }
  top.error = '';
  top.busy = true;
  renderSheets();
  try {
    const res = mode === 'signup'
      ? await apiCall('/auth/v1/signup', { method: 'POST', body: { email, password, data: { name: top.name || '' } } })
      : await apiCall('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
    if (mode === 'signup' && !res?.access_token) throw new SyncError('Falta confirmar', 'email_not_confirmed', 400);
    // Datos de otra cuenta, o de nadie conocido, se borran antes de entrar: nunca se mezclan ni se suben a esta.
    // Si es la misma cuenta (por ejemplo, tras caducar la sesión), sigue donde estaba y sube lo pendiente.
    const owner = await store.get(OWNER);
    const same = owner && owner === res.user?.id;
    const hasLocal = Object.keys(rowsOf()).length > 1;
    if (!same && (owner || hasLocal)) await wipeAll({ photos: 'keep' });
    shadow = (same && (await store.get('sync:shadow'))) || {};
    lastPull = (same && (await store.get('sync:last'))) || null;
    setSession(res);
    await saveAuth();
    await store.put(OWNER, auth.user.id);
    popSheet();
    for (const fn of SYNC_HOOKS.auth) await fn(true);
    render();
    toast(mode === 'signup' ? 'Cuenta creada' : 'Sesión iniciada');
    await syncNow({ quiet: false });
  } catch (e) {
    top.busy = false;
    top.error = explain(e);
    renderSheets();
  }
}

FORMS['sync-login'] = (form, top) => doLogin(top, 'login');
FORMS['sync-forgot'] = (form, top) => doForgot(top);
FORMS['sync-newpass'] = (form, top) => doNewPass(top);

Object.assign(ACTIONS, {
  'sync-login': () => pushSheet({ type: 'login', mode: 'login' }),
  'sync-forgot': (el, top) => pushSheet({ type: 'forgot', email: top?.type === 'login' ? ($('#lg-email')?.value || '').trim() : '' }),
  'sync-newpass-login': (el, top) => { const email = top?.email || ''; popSheet(); pushSheet({ type: 'login', mode: 'login', email }); },
  'sync-signup': (el, top) => doLogin(top, 'signup'),
  'sync-now': () => syncNow({ quiet: false }),
  'sync-logout': () => pushSheet({
    type: 'confirm', title: 'Cerrar sesión', ok: 'Cerrar sesión',
    text: 'Antes de salir se suben tus últimos cambios. Después, tus datos se borran de este teléfono: siguen en tu cuenta y vuelven cuando entres de nuevo. Tus fotos se quedan en el teléfono a tu nombre: otra cuenta no las verá.',
    onOk: async () => {
      const before = pendingCount();
      toast('Subiendo tus cambios…');
      await waitIdle();
      await syncNow();
      await waitIdle();
      const cambios = (k) => (k === 1 ? '1 cambio que todavía no está' : `${k} cambios que todavía no están`);
      if (!auth) {
        // La sesión ha caducado al intentar subir: no se borra nada
        if (before) {
          pushSheet({ type: 'confirm', title: 'Tu sesión ha caducado', ok: 'Volver a entrar',
            text: `Hay ${cambios(before)} en tu cuenta. No he borrado nada de este teléfono: vuelve a entrar con tu cuenta para subirlos, o guarda antes una copia en Ajustes › Tus datos.`,
            onOk: () => pushSheet({ type: 'login', mode: 'login' }) });
          return;
        }
        await logoutAndWipe();
        return;
      }
      const n = pendingCount();
      if (!n) { await logoutAndWipe(); return; }
      // Quedan cambios que solo están aquí: no se pierden sin avisar
      const inactive = !SYNC_HOOKS.canPush();
      pushSheet({
        type: 'confirm', title: 'Hay cambios sin subir', ok: 'Cerrar sesión y perderlos', danger: true,
        text: inactive
          ? `Hay ${cambios(n)} en tu cuenta y, como tu cuenta no está activa, no se pueden subir. Si cierras sesión se perderán. Antes, guarda una copia en Ajustes › Tus datos.`
          : `Hay ${cambios(n)} en tu cuenta (puede que no haya conexión). Si cierras sesión ahora, se perderán. Mejor espera a tener conexión y vuelve a intentarlo.`,
        onOk: () => logoutAndWipe({ lost: true }),
      });
    },
  }),
});
