// Cuenta (correo y contraseña) y sincronización con Supabase.
// Cada dato se guarda en el servidor como una fila (un día, un entreno, un alimento, un peso…).
// Al sincronizar se bajan las filas que cambiaron en otros dispositivos y se suben las cambiadas aquí.
// Si la misma fila cambió en los dos sitios, gana la de este dispositivo, salvo en los días:
// ahí se juntan las comidas de los dos.
import * as store from './store.js';
import { SUPABASE_KEY, SUPABASE_URL } from './config.js';
import { $, esc } from './util.js';
import { S, SAVED, SCHEMA, flushAll, mergeSettings, migrate, saveActivities, saveDay, saveExercises, saveFoods, saveMeasures, saveRecipes, saveRoutines, saveSettings, saveWeights, saveWorkout } from './state.js';
import { ACTIONS, FORMS, HOOKS, SHEETS, popSheet, pushSheet, render, renderSheets, toast } from './ui.js';
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

async function call(path, { method = 'GET', body, token, prefer } = {}) {
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
  if (/weak_password|at least/i.test(c)) return 'La contraseña es demasiado débil. Usa al menos 8 caracteres, con letras y números.';
  if (/email_not_confirmed/i.test(c)) return 'Falta confirmar el correo. En Supabase, desactiva «Confirm email».';
  if (/validation_failed|invalid.*email|email_address_invalid/i.test(c)) return 'Ese correo no parece válido.';
  if (/over_.*rate_limit|rate limit|429/i.test(c)) return 'Demasiados intentos seguidos. Espera un minuto.';
  if (/signup_disabled/i.test(c)) return 'El servidor no admite cuentas nuevas ahora mismo.';
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

async function ensureToken(force = false) {
  if (!auth) throw new SyncError('Sin sesión', 'no_session', 401);
  if (!force && auth.expires_at * 1000 - 60000 > Date.now()) return auth.access_token;
  try {
    setSession(await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: auth.refresh_token } }));
    await saveAuth();
  } catch (e) {
    if (e.code !== 'offline' && e.status >= 400 && e.status < 500) {
      await signOutLocal();
      throw new SyncError('La sesión ha caducado. Vuelve a entrar.', 'expired', 401);
    }
    throw e;
  }
  return auth.access_token;
}

async function rest(path, opts = {}) {
  try {
    return await call('/rest/v1/' + path, { ...opts, token: await ensureToken() });
  } catch (e) {
    if (e.status !== 401) throw e;
    return call('/rest/v1/' + path, { ...opts, token: await ensureToken(true) });
  }
}

async function pullSince(since) {
  const out = [];
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const q = 'kv?select=key,value,v,deleted,updated_at&order=updated_at.asc,key.asc'
      + (since ? '&updated_at=gt.' + encodeURIComponent(since) : '') + `&limit=${page}&offset=${offset}`;
    const rows = await rest(q);
    out.push(...rows);
    if (rows.length < page) return out;
  }
}

async function push(ops) {
  for (let i = 0; i < ops.length; i += 200) {
    await rest('kv?on_conflict=user_id,key', { method: 'POST', body: ops.slice(i, i + 200), prefer: 'resolution=merge-duplicates,return=minimal' });
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
  setStatus('syncing');
  let changed = 0, sent = 0, tooNew = false;
  try {
    flushAll();
    const first = !lastPull;
    const since = lastPull ? new Date(Date.parse(lastPull) - 10000).toISOString() : null;
    const remote = await pullSince(since);
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
    // Subir lo cambiado aquí
    const now = rowsOf();
    const ops = [];
    const hashes = {};
    for (const [key, value] of Object.entries(now)) {
      const h = hash(value);
      if (shadow[key] !== h) { ops.push({ user_id: auth.user.id, key, value, v: SCHEMA, deleted: false }); hashes[key] = h; }
    }
    for (const key of Object.keys(shadow)) {
      if (!(key in now)) { ops.push({ user_id: auth.user.id, key, value: null, v: SCHEMA, deleted: true }); hashes[key] = null; }
    }
    if (ops.length) {
      await push(ops);
      for (const [k, h] of Object.entries(hashes)) { if (h == null) delete shadow[k]; else shadow[k] = h; }
      sent = ops.length;
    }
    // Aunque la cuenta esté vacía, la primera sincronización ya está hecha
    if (!lastPull) lastPull = '1970-01-01T00:00:10.000Z';
    await store.put('sync:shadow', shadow);
    await store.put('sync:last', lastPull);
    if (tooNew) setStatus('update', 'Otro dispositivo usa una versión más nueva de la app. Actualiza esta para sincronizar todo.');
    else setStatus('ok');
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

async function signOutLocal() {
  auth = null;
  shadow = {};
  lastPull = null;
  await store.del('sync:auth');
  await store.del('sync:shadow');
  await store.del('sync:last');
  setStatus('off');
}

export async function initSync() {
  if (!syncConfigured()) return;
  try {
    auth = (await store.get('sync:auth')) || null;
    shadow = (await store.get('sync:shadow')) || {};
    lastPull = (await store.get('sync:last')) || null;
  } catch (e) { auth = null; }
  if (!auth) return;
  setStatus('idle');
  syncNow();
}
// Cada minuto mientras la app está a la vista
setInterval(() => { if (auth && document.visibilityState === 'visible') syncNow(); }, 60000);

SAVED.push((key) => {
  if (key === '!wipe') { auth = null; shadow = {}; lastPull = null; setStatus('off'); return; }
  if (!String(key).startsWith('sync:') && !String(key).startsWith('backup:') && key !== 'meta') schedule();
});
HOOKS.visible.push(() => schedule(500));
window.addEventListener('online', () => schedule(500));

/* ---------- interfaz ---------- */

function statusText() {
  const s = syncState;
  if (s.status === 'syncing') return 'Sincronizando…';
  if (s.status === 'error' || s.status === 'update') return `<span class="sync-err">${esc(s.msg)}</span>`;
  if (s.at) return `Sincronizado a las ${new Date(s.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
  return 'Pendiente de sincronizar';
}

export function syncCard() {
  if (!syncConfigured()) return '';
  if (!auth) {
    return `
  <section class="card" id="aj-cuenta">
    <div class="card-head"><h2>Cuenta</h2></div>
    <p class="muted">Entra con tu correo para tener los mismos datos en el iPhone y en el ordenador. Lo que apuntes en uno aparece en el otro.</p>
    <button type="button" class="btn wide top-gap" data-act="sync-login">Entrar o crear cuenta</button>
  </section>`;
  }
  return `
  <section class="card" id="aj-cuenta">
    <div class="card-head"><h2>Cuenta</h2></div>
    <p><b>${esc(auth.user.email || '')}</b></p>
    <p class="muted" id="sync-status">${statusText()}</p>
    <div class="btn-row two top-gap">
      <button type="button" class="btn ghost" data-act="sync-now">Sincronizar ahora</button>
      <button type="button" class="btn ghost" data-act="sync-logout">Cerrar sesión</button>
    </div>
    <p class="hint">Se sincroniza todo menos las fotos y los ajustes de apariencia, que son de cada dispositivo. Los datos se guardan en un servidor de la UE (Irlanda) y solo tu cuenta puede leerlos.</p>
  </section>`;
}

SHEETS.login = {
  title: () => 'Tu cuenta',
  render: (s) => `
    <p class="muted">Usa el mismo correo y contraseña en el iPhone y en el ordenador. Si es la primera vez, pulsa «Crear cuenta».</p>
    <form data-form="sync-login" class="top-gap" novalidate>
      <label class="field"><span>Correo</span><input id="lg-email" type="email" inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" value="${esc(s.email || '')}" required></label>
      <label class="field"><span>Contraseña</span><input id="lg-pass" type="password" autocomplete="${s.mode === 'signup' ? 'new-password' : 'current-password'}" minlength="6" value="${esc(s.pw || '')}" required></label>
      ${s.error ? `<p class="sync-err" role="alert">${esc(s.error)}</p>` : ''}
      <div class="sheet-actions">
        <button type="button" class="btn ghost" data-act="sync-signup" ${s.busy ? 'disabled' : ''}>Crear cuenta</button>
        <button type="submit" class="btn primary" ${s.busy ? 'disabled' : ''}>${s.busy ? 'Un momento…' : 'Entrar'}</button>
      </div>
    </form>
    <p class="hint">Al entrar, lo que tengas en este dispositivo se junta con lo que ya haya en tu cuenta. Nada se borra.</p>`,
};

async function doLogin(top, mode) {
  const email = $('#lg-email').value.trim().toLowerCase();
  const password = $('#lg-pass').value;
  top.email = email;
  top.pw = password; // solo mientras la hoja está abierta, para no tener que volver a escribirla
  top.mode = mode;
  if (!/^\S+@\S+\.\S+$/.test(email)) { top.error = 'Ese correo no parece válido.'; renderSheets(); return; }
  if (password.length < 6) { top.error = 'La contraseña tiene que tener al menos 6 caracteres.'; renderSheets(); return; }
  top.error = '';
  top.busy = true;
  renderSheets();
  try {
    const res = mode === 'signup'
      ? await call('/auth/v1/signup', { method: 'POST', body: { email, password } })
      : await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
    if (mode === 'signup' && !res?.access_token) throw new SyncError('Falta confirmar', 'email_not_confirmed', 400);
    shadow = {};
    lastPull = null;
    setSession(res);
    await saveAuth();
    popSheet();
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

Object.assign(ACTIONS, {
  'sync-login': () => pushSheet({ type: 'login', mode: 'login' }),
  'sync-signup': (el, top) => doLogin(top, 'signup'),
  'sync-now': () => syncNow({ quiet: false }),
  'sync-logout': () => pushSheet({
    type: 'confirm', title: 'Cerrar sesión', ok: 'Cerrar sesión',
    text: 'Los datos se quedan en este dispositivo y en tu cuenta, pero dejarán de sincronizarse aquí hasta que vuelvas a entrar.',
    onOk: async () => {
      await syncNow();
      const token = auth?.access_token;
      if (token) call('/auth/v1/logout', { method: 'POST', token }).catch(() => {});
      await signOutLocal();
      render();
      toast('Sesión cerrada');
    },
  }),
});
