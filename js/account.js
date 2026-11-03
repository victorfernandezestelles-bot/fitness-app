// Cuenta: tipo (desarrollador, entrenador, cliente, usuario libre o pendiente), activación con código,
// solicitud para ser entrenador, modo solo lectura y borrado de la cuenta.
// Lo que decide quién puede qué está en el servidor (supabase/002-cuentas.sql); aquí solo se refleja.
import * as store from './store.js';
import { $, dateShort, esc } from './util.js';
import { GUARD, S, SAVED, wipeAll } from './state.js';
import { ACCESS, ACTIONS, FORMS, HOOKS, SHEETS, applyTheme, closeSheets, popSheet, pushSheet, render, renderSheets, toast } from './ui.js';
import { maybeOnboard } from './onboarding.js';
import { SYNC_HOOKS, currentUser, isLoggedIn, rpc, signOutLocal, statusText, syncConfigured, syncNow } from './sync.js';

export const ROLE_NAME = { dev: 'Desarrollador', trainer: 'Entrenador', client: 'Cliente', free: 'Usuario libre', pending: 'Pendiente de activar' };

let profile = null;      // el último perfil que dio el servidor (se guarda para poder abrir sin conexión)
let readOnlyChosen = false;
let gateEl = null;
let bannerEl = null;

export const myProfile = () => profile;
export const isDev = () => accessState() === 'active' && profile?.role === 'dev';

// guest: sin sesión · pending · blocked · active. Sin servidor configurado, o sin perfil todavía, la app sigue abierta.
export function accessState() {
  if (!syncConfigured()) return 'active';
  if (!isLoggedIn()) return 'guest';
  if (!profile) return 'active';
  if (profile.blocked) return 'blocked';
  if (profile.role === 'pending') return 'pending';
  return 'active';
}

GUARD.canWrite = () => accessState() === 'active';
SYNC_HOOKS.canPush = () => accessState() === 'active';

/* ---------- servidor ---------- */

const ERRORS = {
  code_invalid: 'Ese código no existe o ya no es válido.',
  code_expired: 'Ese código ha caducado. Pide uno nuevo.',
  code_used: 'Ese código ya se ha usado.',
  already_active: 'Tu cuenta ya está activada.',
  blocked: 'Tu acceso está pausado.',
  request_pending: 'Ya tienes una solicitud pendiente de revisar.',
  already_trainer: 'Tu cuenta ya es de entrenador.',
  forbidden: 'No tienes permiso para hacer eso.',
  self: 'No puedes hacer eso con tu propia cuenta.',
  bad_amount: 'Revisa la cantidad de códigos y de usos.',
  already_resolved: 'Esa solicitud ya estaba resuelta.',
  not_found: 'No se ha encontrado.',
  no_profile: 'Tu cuenta aún no tiene perfil. Vuelve a intentarlo en un momento.',
};
export function errorText(e) {
  if (e?.code === 'offline') return 'No hay conexión. Prueba de nuevo cuando la tengas.';
  const key = Object.keys(ERRORS).find((k) => String(e?.message || '').includes(k));
  return key ? ERRORS[key] : 'No se ha podido completar (' + (e?.message || 'error') + ').';
}

async function setProfile(p) {
  profile = p || null;
  try { if (profile) await store.put('sync:profile', profile); else await store.del('sync:profile'); } catch (e) { /* sin almacén */ }
  applyAccess();
}

export async function refreshProfile() {
  if (!syncConfigured() || !isLoggedIn()) return;
  try {
    const p = await rpc('my_profile');
    if (p) await setProfile(p);
  } catch (e) {
    // Sin conexión o servidor sin la fase 1: se usa el último perfil guardado
  }
}

SYNC_HOOKS.cycle.push(refreshProfile);
SYNC_HOOKS.auth.push(async (inSession) => {
  readOnlyChosen = false;
  if (inSession) await refreshProfile();
  else await setProfile(null);
  if (inSession && accessState() === 'active') maybeOnboard();
});
SAVED.push((key) => { if (key === '!wipe') { profile = null; readOnlyChosen = false; applyAccess(); } });

export async function initAccount() {
  if (!syncConfigured()) return;
  try { profile = (await store.get('sync:profile')) || null; } catch (e) { profile = null; }
  applyAccess();
  refreshProfile();
}

/* ---------- puerta de acceso y modo solo lectura ---------- */

function applyAccess() {
  const st = accessState();
  const closed = st !== 'active';
  ACCESS.readOnly = closed;
  document.body.classList.toggle('read-only', closed && readOnlyChosen);
  const adminTab = document.querySelector('.tab[data-tab="admin"]');
  if (adminTab) adminTab.hidden = !isDev();
  if (!isDev() && S.ui.tab === 'admin') { S.ui.tab = 'ajustes'; render(); }
  // Puerta
  if (!gateEl) {
    gateEl = document.createElement('div');
    gateEl.id = 'gate';
    document.body.appendChild(gateEl);
    bannerEl = document.createElement('div');
    bannerEl.id = 'ro-banner';
    document.body.appendChild(bannerEl);
  }
  gateEl.hidden = !closed || readOnlyChosen;
  if (!gateEl.hidden) gateEl.innerHTML = gateHTML(st);
  bannerEl.hidden = !(closed && readOnlyChosen);
  if (!bannerEl.hidden) bannerEl.innerHTML = `<span>Solo lectura · ${st === 'blocked' ? 'acceso pausado' : st === 'pending' ? 'cuenta sin activar' : 'sin sesión'}</span><button type="button" class="btn small" data-act="acct-gate">Opciones</button>`;
  document.body.classList.toggle('gated', !gateEl.hidden);
}

const hasLocalData = () => ['days', 'weights', 'workouts', 'foods', 'recipes', 'measures', 'activities'].some((k) => Object.keys(S[k] || {}).length);

function requestLine() {
  const r = profile?.request;
  if (!r) return '';
  if (r.status === 'pending') return `<p class="gate-note">Solicitud para ser entrenador enviada el ${dateShort(r.created_at.slice(0, 10))}: pendiente de revisar.</p>`;
  if (r.status === 'rejected') return `<p class="gate-note">Tu solicitud para ser entrenador no se ha aprobado${r.reply ? `: «${esc(r.reply)}»` : '.'}</p>`;
  return '';
}

function gateHTML(st) {
  const common = `
    <button type="button" class="btn ghost wide" data-act="acct-readonly">Ver mis datos (solo lectura)</button>
    <button type="button" class="btn ghost wide" data-act="export-json">Descargar mis datos (.json)</button>`;
  let body = '';
  if (st === 'guest') {
    body = `
      <h1>Fitness</h1>
      <p>Entra con tu cuenta para usar la app. Si es tu primera vez, créala con tu correo.</p>
      <button type="button" class="btn wide" data-act="sync-login">Entrar o crear cuenta</button>
      ${hasLocalData() ? `<p class="gate-note">Tienes datos guardados en este dispositivo. Al entrar se juntan con los de tu cuenta.</p>${common}` : ''}`;
  } else if (st === 'pending') {
    body = `
      <h1>Activa tu cuenta</h1>
      <p>Para usar la app necesitas un <b>código de activación</b>. Si te lo ha dado un entrenador o el equipo de la app, escríbelo aquí.</p>
      <form data-form="acct-code" class="gate-code" novalidate>
        <input id="acct-code-in" type="text" autocapitalize="characters" autocomplete="one-time-code" spellcheck="false" placeholder="FIT-XXXX-XXXX" aria-label="Código de activación">
        <button type="submit" class="btn">Activar</button>
      </form>
      ${requestLine()}
      ${profile?.request?.status === 'pending' ? '' : '<button type="button" class="btn ghost wide" data-act="acct-request">Soy entrenador: solicitar acceso</button>'}
      ${common}`;
  } else {
    body = `
      <h1>Acceso pausado</h1>
      <p>Tu acceso a la app está pausado. Tus datos siguen siendo tuyos: puedes verlos, descargarlos o borrar tu cuenta cuando quieras.</p>
      ${common}`;
  }
  return `<div class="gate-card">
    ${body}
    <div class="gate-foot">
      <span>${esc(currentUser()?.email || '')}</span>
      <span>
        ${isLoggedIn() ? '<button type="button" class="link" data-act="acct-refresh">Comprobar de nuevo</button> · <button type="button" class="link" data-act="sync-logout">Cerrar sesión</button> · <button type="button" class="link danger-link" data-act="acct-delete">Borrar mi cuenta</button>' : ''}
      </span>
    </div>
  </div>`;
}

/* ---------- tarjeta de cuenta en Ajustes ---------- */

export function accountCard() {
  if (!syncConfigured()) return '';
  if (!isLoggedIn()) {
    return `
  <section class="card" id="aj-cuenta">
    <div class="card-head"><h2>Cuenta</h2></div>
    <p class="muted">Entra con tu correo para usar la app y tener los mismos datos en el iPhone y en el ordenador.</p>
    <button type="button" class="btn wide top-gap" data-act="sync-login">Entrar o crear cuenta</button>
  </section>`;
  }
  const p = profile;
  const canAsk = p && !p.blocked && ['free', 'client', 'pending'].includes(p.role) && p.request?.status !== 'pending';
  return `
  <section class="card" id="aj-cuenta">
    <div class="card-head"><h2>Cuenta</h2>${p ? `<span class="role-tag role-${p.role}">${ROLE_NAME[p.role] || p.role}${p.blocked ? ' · bloqueada' : ''}</span>` : ''}</div>
    <p><b>${esc(currentUser()?.email || '')}</b></p>
    ${p ? `<form data-form="acct-name" class="acct-name">
      <label class="field"><span>Tu nombre</span><input id="acct-name-in" type="text" value="${esc(p.name || '')}" maxlength="60" autocomplete="name" placeholder="Cómo te verá tu entrenador"></label>
      <button type="submit" class="btn ghost small">Guardar</button>
    </form>` : ''}
    <p class="muted" id="sync-status">${statusText()}</p>
    <div class="btn-row two top-gap">
      <button type="button" class="btn ghost" data-act="sync-now">Sincronizar ahora</button>
      <button type="button" class="btn ghost" data-act="sync-logout">Cerrar sesión</button>
    </div>
    ${p?.request?.status === 'pending' ? `<p class="hint">Solicitud para ser entrenador enviada el ${dateShort(p.request.created_at.slice(0, 10))}: pendiente de revisar.</p>` : ''}
    ${p?.request?.status === 'rejected' && canAsk ? `<p class="hint">Tu última solicitud para ser entrenador no se aprobó${p.request.reply ? `: «${esc(p.request.reply)}»` : '.'}</p>` : ''}
    ${canAsk ? '<button type="button" class="btn ghost wide top-gap" data-act="acct-request">Soy entrenador: solicitar acceso</button>' : ''}
    <p class="hint">Se sincroniza todo menos las fotos y los ajustes de apariencia. Los datos se guardan en un servidor de la UE (Irlanda) y solo tu cuenta puede leerlos.</p>
    <button type="button" class="link danger-link top-gap" data-act="acct-delete">Borrar mi cuenta y mis datos</button>
  </section>`;
}

/* ---------- hojas ---------- */

SHEETS['trainer-request'] = {
  title: () => 'Solicitar acceso de entrenador',
  render: (s) => `
    <p class="muted">Revisamos cada solicitud a mano. Cuando se apruebe, tu cuenta tendrá la pestaña de entrenador para trabajar con tus clientes.</p>
    <label class="field top-gap"><span>Cuéntanos quién eres</span><textarea id="tr-msg" rows="5" maxlength="1000" placeholder="Dónde entrenas, cuántos clientes tienes, tu titulación…">${esc(s.msg || '')}</textarea></label>
    ${s.error ? `<p class="sync-err" role="alert">${esc(s.error)}</p>` : ''}
    <div class="sheet-actions"><button type="button" class="btn primary" data-act="acct-request-send" ${s.busy ? 'disabled' : ''}>${s.busy ? 'Enviando…' : 'Enviar solicitud'}</button></div>`,
};

SHEETS['delete-account'] = {
  title: () => 'Borrar mi cuenta',
  render: (s) => `
    <p>Se borrarán <b>tu cuenta y todos tus datos</b>: los del servidor y los de este dispositivo (diario, entrenos, medidas, fotos…). No se puede deshacer.</p>
    <p class="muted">Si quieres conservar algo, descarga antes una copia.</p>
    <button type="button" class="btn ghost wide top-gap" data-act="export-json">Descargar mis datos (.json)</button>
    <form data-form="acct-delete" class="top-gap" novalidate>
      <label class="field"><span>Escribe BORRAR para confirmar</span><input id="del-confirm" type="text" autocapitalize="characters" autocomplete="off" spellcheck="false"></label>
      ${s.error ? `<p class="sync-err" role="alert">${esc(s.error)}</p>` : ''}
      <div class="sheet-actions"><button type="submit" class="btn danger" ${s.busy ? 'disabled' : ''}>${s.busy ? 'Borrando…' : 'Borrar mi cuenta para siempre'}</button></div>
    </form>`,
};

/* ---------- acciones ---------- */

FORMS['acct-code'] = async () => {
  const input = $('#acct-code-in');
  const code = input.value.trim().toUpperCase();
  if (code.length < 6) { toast('Escribe el código completo.'); return; }
  try {
    await setProfile(await rpc('redeem_code', { p_code: code }));
    toast('¡Cuenta activada!');
    render();
    maybeOnboard();
    syncNow();
  } catch (e) {
    toast(errorText(e));
  }
};

FORMS['acct-name'] = async () => {
  const name = $('#acct-name-in').value.trim();
  try {
    await setProfile(await rpc('set_my_name', { p_name: name }));
    toast('Nombre guardado');
  } catch (e) { toast(errorText(e)); }
};

FORMS['acct-delete'] = async (form, top) => {
  if ($('#del-confirm').value.trim().toUpperCase() !== 'BORRAR') { top.error = 'Escribe BORRAR para confirmar.'; renderSheets(); return; }
  top.busy = true; top.error = '';
  renderSheets();
  try {
    await rpc('delete_my_account');
  } catch (e) {
    top.busy = false; top.error = errorText(e);
    renderSheets();
    return;
  }
  await signOutLocal();
  await wipeAll();
  closeSheets();
  applyTheme();
  render();
  toast('Cuenta borrada');
};

Object.assign(ACTIONS, {
  'acct-readonly': () => { readOnlyChosen = true; applyAccess(); render(); },
  'acct-gate': () => { readOnlyChosen = false; applyAccess(); },
  'acct-refresh': async () => {
    await refreshProfile();
    toast(accessState() === 'active' ? 'Tu cuenta está activa' : 'Sigue igual');
    if (accessState() === 'active') { render(); maybeOnboard(); }
  },
  'acct-request': () => pushSheet({ type: 'trainer-request' }),
  'acct-request-send': async (el, top) => {
    top.msg = $('#tr-msg').value;
    if (top.msg.trim().length < 10) { top.error = 'Cuéntanos un poco más (al menos una frase).'; renderSheets(); return; }
    top.busy = true; top.error = '';
    renderSheets();
    try {
      await setProfile(await rpc('request_trainer', { p_message: top.msg }));
      popSheet();
      render();
      toast('Solicitud enviada');
    } catch (e) {
      top.busy = false; top.error = errorText(e);
      renderSheets();
    }
  },
  'acct-delete': () => pushSheet({ type: 'delete-account' }),
});

HOOKS.visible.push(() => { if (isLoggedIn()) refreshProfile(); });
