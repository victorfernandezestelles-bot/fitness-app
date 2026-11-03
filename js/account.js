// Cuenta: tipo (desarrollador, entrenador, cliente, usuario libre o pendiente), activación con código,
// vínculo con un entrenador, solicitud para ser entrenador, modo solo lectura y borrado de la cuenta.
// Lo que decide quién puede qué está en el servidor (supabase/002 y 003); aquí solo se refleja.
import * as store from './store.js';
import { $, dateShort, esc } from './util.js';
import { GUARD, S, SAVED, saveSettings, wipeAll } from './state.js';
import { ACCESS, ACTIONS, FORMS, HOOKS, SHEETS, applyTheme, closeSheets, popSheet, pushSheet, render, renderSheets, toast } from './ui.js';
import { maybeOnboard } from './onboarding.js';
import { SYNC_HOOKS, currentUser, isLoggedIn, rpc, signOutLocal, statusText, syncConfigured, syncNow } from './sync.js';

export const ROLE_NAME = { dev: 'Desarrollador', trainer: 'Entrenador', client: 'Cliente', free: 'Usuario libre', pending: 'Pendiente de activar' };

let profile = null;      // el último perfil que dio el servidor (se guarda para poder abrir sin conexión)
let inbox = null;        // notas visibles y propuesta pendiente de su entrenador
let readOnlyChosen = false;
let gateEl = null;
let bannerEl = null;

export const myProfile = () => profile;
export const isDev = () => accessState() === 'active' && profile?.role === 'dev';

// guest: sin sesión · pending (también «sin entrenador») · blocked (por el equipo de la app) ·
// paused (por su entrenador) · active. Sin servidor configurado, o sin perfil todavía, la app sigue abierta.
export function accessState() {
  if (!syncConfigured()) return 'active';
  if (!isLoggedIn()) return 'guest';
  if (!profile) return 'active';
  if (profile.blocked) return 'blocked';
  if (profile.role === 'pending') return 'pending';
  if (profile.role === 'client') {
    const l = profile.link;
    if (!l || (l.unlink_at && Date.parse(l.unlink_at) <= Date.now())) return 'pending';
    if (l.status === 'blocked') return 'paused';
  }
  return 'active';
}

// Tiene pestaña Clientes: entrenadores y desarrolladores, y quien dejó de serlo mientras le quedan clientes
export const isCoach = () => accessState() === 'active'
  && (['trainer', 'dev'].includes(profile?.role) || (profile?.coaching?.clients || 0) > 0);

// 18/11/2026
export const dateNum = (s) => new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

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
  already_linked: 'Ya estás vinculado con ese entrenador.',
  link_refused: 'Ese entrenador no acepta tu solicitud.',
  no_link: 'No tienes ningún entrenador vinculado.',
  bad_state: 'Ya no está en ese estado. Actualiza la lista.',
  no_clients: 'No tienes clientes pendientes de desvincular.',
  bad_date: 'Elige una fecha posterior a hoy.',
  bad_goals: 'Revisa los objetivos: pon al menos uno, solo con números.',
  empty: 'Escribe algo antes de guardar.',
  violates_check: 'Algún dato no es válido (formato o tamaño).',
  bad_food: 'Revisa los valores: hace falta el valor energético y solo números.',
};
export function errorText(e) {
  if (e?.code === 'offline') return 'No hay conexión. Prueba de nuevo cuando la tengas.';
  const msg = String(e?.message || '').replace('violates check constraint', 'violates_check');
  const key = Object.keys(ERRORS).find((k) => msg.includes(k));
  return key ? ERRORS[key] : 'No se ha podido completar (' + (e?.message || 'error') + ').';
}

// Lo del perfil que se ve en las pestañas (Hoy, Ajustes, Clientes)
const shown = (p) => JSON.stringify(p ? [p.role, p.name, p.link, p.link_request, p.link_last, p.coaching, p.trainer_code, p.request, inbox] : null);

async function setProfile(p, was = shown(profile)) {
  const before = accessState();
  profile = p || null;
  try { if (profile) await store.put('sync:profile', profile); else await store.del('sync:profile'); } catch (e) { /* sin almacén */ }
  applyAccess();
  // Si la cuenta se acaba de activar (p. ej. el entrenador ha aceptado la solicitud), se abre la app
  if (profile && before !== 'active' && accessState() === 'active') { readOnlyChosen = false; applyAccess(); render(); maybeOnboard(); }
  else if (was !== shown(profile) && ['hoy', 'ajustes', 'clientes'].includes(S.ui.tab)) rerenderSoon();
}

// Ajustes y Clientes muestran datos del perfil: se repintan si no hay nada abierto ni se está escribiendo
let rerenderTimer = 0;
function rerenderSoon() {
  clearTimeout(rerenderTimer);
  rerenderTimer = setTimeout(() => {
    const typing = document.activeElement?.matches?.('input, textarea, select');
    if (!S.sheets.length && !typing) render();
  }, 50);
}

// Devuelve el error si no se ha podido consultar (sin conexión, servidor sin la fase 1…)
export async function refreshProfile() {
  if (!syncConfigured() || !isLoggedIn()) return null;
  try {
    const p = await rpc('my_profile');
    if (!p) return { message: 'no_profile' };
    // La bandeja va antes que el perfil para que la pantalla se pinte ya con ella
    const was = shown(profile);
    await refreshInbox(p);
    await setProfile(p, was);
    return null;
  } catch (e) {
    // Se sigue con el último perfil guardado
    return e;
  }
}

async function refreshInbox(p = profile) {
  let next = null;
  if (p?.link) {
    try { next = await rpc('client_inbox'); } catch (e) { next = inbox; } // sin la fase 4 en el servidor, o sin conexión
  }
  inbox = next;
  try { if (inbox) await store.put('sync:inbox', inbox); else await store.del('sync:inbox'); } catch (e) { /* sin almacén */ }
}

export const coachInbox = () => inbox;
const notesSeen = () => S.settings.coachSeen || '';
export const templatesSeen = () => S.settings.coachTplSeen || '';
export function markTemplatesSeen() {
  const last = (inbox?.templates || []).map((t) => t.at).sort().pop();
  if (last && last > templatesSeen() && GUARD.canWrite()) { S.settings.coachTplSeen = last; saveSettings(); }
}
const newTemplates = () => (inbox?.templates || []).filter((t) => t.at > templatesSeen());
const unreadNotes = () => (inbox?.notes || []).filter((n) => (n.updated_at || n.created_at) > notesSeen()).length;

// Aviso en Hoy: propuesta de objetivos pendiente o notas nuevas del entrenador
export function coachNotice() {
  if (!inbox || accessState() !== 'active' || !profile?.link) return '';
  const who = esc(profile.link.trainer_name || 'Tu entrenador');
  if (inbox.proposal) return `<div class="notice coach-notice"><p><b>${who}</b> te propone nuevos objetivos.</p><button type="button" class="btn small" data-act="acct-proposal">Ver propuesta</button></div>`;
  const n = unreadNotes();
  if (n) return `<div class="notice coach-notice"><p><b>${who}</b> te ha dejado ${n === 1 ? 'una nota nueva' : `${n} notas nuevas`}.</p><button type="button" class="btn small" data-act="acct-notes">Leer</button></div>`;
  const t = newTemplates();
  if (t.length) {
    const what = t.length > 1 ? `${t.length} plantillas` : t[0].kind === 'plan' ? `un plan del día («${esc(t[0].name)}»)` : `una receta («${esc(t[0].name)}»)`;
    return `<div class="notice coach-notice"><p><b>${who}</b> ha compartido contigo ${what}.</p><button type="button" class="btn small" data-act="acct-tpls">Ver</button></div>`;
  }
  return '';
}

SYNC_HOOKS.cycle.push(refreshProfile);
SYNC_HOOKS.auth.push(async (inSession) => {
  readOnlyChosen = false;
  if (inSession) await refreshProfile();
  else await setProfile(null);
  if (inSession && accessState() === 'active') maybeOnboard();
});
SAVED.push((key) => { if (key === '!wipe') { profile = null; inbox = null; readOnlyChosen = false; applyAccess(); } });

export async function initAccount() {
  if (!syncConfigured()) return;
  try { profile = (await store.get('sync:profile')) || null; } catch (e) { profile = null; }
  try { inbox = (await store.get('sync:inbox')) || null; } catch (e) { inbox = null; }
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
  const coachTab = document.querySelector('.tab[data-tab="clientes"]');
  if (coachTab) coachTab.hidden = !isCoach();
  if ((!isDev() && S.ui.tab === 'admin') || (!isCoach() && S.ui.tab === 'clientes')) { S.ui.tab = 'ajustes'; render(); }
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
  const why = { blocked: 'acceso pausado', paused: 'pausado por tu entrenador', pending: profile?.role === 'client' ? 'sin entrenador' : 'cuenta sin activar', guest: 'sin sesión' }[st];
  if (!bannerEl.hidden) bannerEl.innerHTML = `<span>Solo lectura · ${why}</span><button type="button" class="btn small" data-act="acct-gate">Opciones</button>`;
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

// Formulario de código: sirve tanto para el código de un entrenador (ENT-…) como para uno de activación (FIT-…)
function codeForm(placeholder, label, button) {
  return `<form data-form="acct-code" class="gate-code" novalidate>
    <input type="text" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="${placeholder}" aria-label="${label}">
    <button type="submit" class="btn">${button}</button>
  </form>`;
}

const trainerName = (x) => `<b>${esc(x?.trainer_name || 'tu entrenador')}</b>`;

// Qué pasó con el último vínculo (para explicar por qué ya no hay entrenador)
function lastLinkLine() {
  const l = profile?.link_last;
  if (!l || profile?.link || profile?.link_request) return '';
  const t = trainerName(l);
  const d = l.ended_at ? dateNum(l.ended_at) : '';
  const txt = l.status === 'rejected'
    ? (l.ended_by === 'trainer_off' ? `${t} ya no es entrenador en la app: tu solicitud se ha anulado.` : `${t} no ha aceptado tu solicitud.`)
    : l.ended_by === 'trainer' ? `${t} te desvinculó el ${d}.`
    : l.ended_by === 'client' ? `Te desvinculaste de ${t} el ${d}.`
    : l.ended_by === 'expired' ? `Tu cuenta quedó desvinculada de ${t} el ${d}.`
    : '';
  return txt ? `<p class="gate-note">${txt}</p>` : '';
}

function linkRequestLine(cls) {
  const r = profile?.link_request;
  if (!r) return '';
  return `<div class="${cls}"><p>Has enviado una solicitud a ${trainerName(r)} el ${dateShort(r.created_at.slice(0, 10))}. ${profile.link ? 'Cuando la acepte, cambiarás de entrenador.' : 'Podrás usar la app cuando la acepte.'}</p>
    <button type="button" class="link" data-act="acct-link-cancel">Anular la solicitud</button></div>`;
}

// Aviso de desvinculación programada (el entrenador dejó de serlo)
export function linkNotice() {
  const l = profile?.link;
  if (!l?.unlink_at || accessState() !== 'active' || Date.parse(l.unlink_at) <= Date.now()) return '';
  return `<div class="notice small link-notice"><p>Tu cuenta quedará desvinculada de tu entrenador el día <b>${dateNum(l.unlink_at)}</b>.${profile.role === 'client' ? ' Después necesitarás el código de otro entrenador o un código de activación.' : ''}</p></div>`;
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
    const noTrainer = profile?.role === 'client' || profile?.link_last;
    body = `
      <h1>${noTrainer ? 'Sin entrenador' : 'Activa tu cuenta'}</h1>
      ${lastLinkLine()}
      ${profile?.link_request ? linkRequestLine('gate-wait') : `<p>Para usar la app necesitas el <b>código de tu entrenador</b> o un <b>código de activación</b> del equipo de la app.</p>`}
      ${codeForm('ENT-… o FIT-…', 'Código de tu entrenador o de activación', profile?.link_request ? 'Usar otro' : 'Continuar')}
      ${requestLine()}
      ${profile?.request?.status === 'pending' ? '' : '<button type="button" class="btn ghost wide" data-act="acct-request">Soy entrenador: solicitar acceso</button>'}
      ${common}`;
  } else if (st === 'paused') {
    body = `
      <h1>Acceso pausado</h1>
      <p>${trainerName(profile.link)} ha pausado tu acceso a la app. Tus datos siguen siendo tuyos: puedes verlos, descargarlos o borrar tu cuenta cuando quieras.</p>
      ${profile.link_request ? linkRequestLine('gate-wait') : '<p class="gate-note">Si quieres seguir con otro entrenador, escribe su código:</p>'}
      ${codeForm('ENT-XXXX-XXXX', 'Código de otro entrenador', profile.link_request ? 'Usar otro' : 'Continuar')}
      ${common}
      <button type="button" class="btn ghost wide" data-act="acct-unlink">Desvincularme de ${esc(profile.link?.trainer_name || 'mi entrenador')}</button>`;
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
    ${p && !p.blocked ? trainerSection(p) : ''}
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

function trainerSection(p) {
  const l = p.link;
  let html = '';
  if (l) {
    html += `<p>Tu entrenador: ${trainerName(l)}${l.since ? ` · desde el ${dateShort(l.since.slice(0, 10))}` : ''}</p>`;
    if (l.status === 'blocked') html += '<p class="hint">Ha pausado tu acceso como cliente.</p>';
    if (l.unlink_at) html += `<p class="hint warn-text">Tu cuenta quedará desvinculada de tu entrenador el día <b>${dateNum(l.unlink_at)}</b>.</p>`;
    if (inbox?.proposal) html += `<div class="gate-wait"><p>Te ha propuesto nuevos objetivos el ${dateShort(inbox.proposal.created_at.slice(0, 10))}.</p><button type="button" class="link" data-act="acct-proposal">Ver la propuesta</button></div>`;
    const nn = inbox?.notes?.length || 0;
    if (nn) html += `<button type="button" class="btn ghost small" data-act="acct-notes">Notas de tu entrenador (${nn})${unreadNotes() ? ' · nuevas' : ''}</button>`;
    const nt = inbox?.templates?.length || 0;
    if (nt) html += `<button type="button" class="btn ghost small" data-act="acct-tpls">Plantillas de tu entrenador (${nt})${newTemplates().length ? ' · nuevas' : ''}</button>`;
  } else {
    html += lastLinkLine().replace('gate-note', 'hint');
  }
  html += linkRequestLine('hint');
  if (!p.link_request) {
    html += `<p class="hint">${l ? 'Para cambiar de entrenador, escribe el código del nuevo:' : '¿Tienes entrenador? Escribe su código para vincularte:'}</p>
      ${codeForm('ENT-XXXX-XXXX', 'Código de tu entrenador', l ? 'Cambiar' : 'Vincular')}`;
  }
  if (l) html += '<button type="button" class="btn ghost small top-gap" data-act="acct-unlink">Desvincularme</button>';
  return `<div class="acct-link"><h3 class="sub-title">Entrenador</h3>${html}</div>`;
}

/* ---------- hojas ---------- */

SHEETS['coach-notes'] = {
  title: () => 'Notas de tu entrenador',
  render: () => {
    const list = inbox?.notes || [];
    return `
      <p class="muted">Lo que ${esc(profile?.link?.trainer_name || 'tu entrenador')} ha querido compartir contigo.</p>
      ${list.length ? `<ul class="fc-notes top-gap">${list.map((n) => `<li><div class="fc-note static">
        <span class="fc-note-top"><span class="muted">${dateShort(n.created_at.slice(0, 10))}${(n.updated_at || '').slice(0, 16) !== n.created_at.slice(0, 16) ? ' · editada' : ''}</span></span>
        <span class="fc-note-body">${esc(n.body)}</span>
      </div></li>`).join('')}</ul>` : '<p class="empty">No hay notas.</p>'}`;
  },
};

const GOAL_ROWS = [['kcal', 'Calorías', 'kcal'], ['p', 'Proteínas', 'g'], ['c', 'Hidratos', 'g'], ['f', 'Grasas', 'g'], ['steps', 'Pasos', '']];
const goalCell = (v, u) => (v == null ? '<span class="muted">–</span>' : `${Math.round(v).toLocaleString('es-ES')}${u ? ' ' + u : ''}`);

SHEETS['coach-proposal'] = {
  title: () => 'Propuesta de objetivos',
  render: (s) => {
    const pr = inbox?.proposal;
    if (!pr) return '<p class="empty">Ya no hay ninguna propuesta pendiente.</p>';
    const cur = S.settings.goals;
    const curT = S.settings.goalsTrain;
    const row = ([k, l, u], now, next) => `<tr${now !== next ? ' class="changed"' : ''}><th scope="row">${l}</th><td>${goalCell(now, u)}</td><td><b>${goalCell(next, u)}</b></td></tr>`;
    const gt = pr.goals_train;
    const canAnswer = accessState() === 'active';
    return `
      <p><b>${esc(profile?.link?.trainer_name || 'Tu entrenador')}</b> te propone estos objetivos el ${dateShort(pr.created_at.slice(0, 10))}.</p>
      ${pr.message ? `<p class="req-msg top-gap">${esc(pr.message)}</p>` : ''}
      <div class="table-wrap"><table class="nut-table prop-table">
        <thead><tr><th></th><th>Ahora</th><th>Propuesta</th></tr></thead>
        <tbody>${GOAL_ROWS.map((r) => row(r, cur[r[0]] ?? null, pr.goals?.[r[0]] ?? null)).join('')}</tbody>
      </table></div>
      ${gt || Object.values(curT || {}).some((v) => v != null) ? `<h3 class="list-title">Días de entreno</h3>
      <div class="table-wrap"><table class="nut-table prop-table">
        <tbody>${GOAL_ROWS.slice(0, 4).map((r) => row(r, curT?.[r[0]] ?? null, gt?.[r[0]] ?? null)).join('')}</tbody>
      </table></div>
      ${gt ? '' : '<p class="hint">Si aceptas, tendrás los mismos objetivos todos los días.</p>'}` : ''}
      ${canAnswer ? `
      <label class="field top-gap"><span>Respuesta (opcional)</span><textarea id="cp-reply" rows="2" maxlength="1000" placeholder="p. ej. Me cuesta llegar a tanta proteína">${esc(s.reply || '')}</textarea></label>
      ${s.error ? `<p class="sync-err" role="alert">${esc(s.error)}</p>` : ''}
      <div class="sheet-actions">
        <button type="button" class="btn ghost" data-act="acct-prop-answer" data-v="0" ${s.busy ? 'disabled' : ''}>Rechazar</button>
        <button type="button" class="btn primary" data-act="acct-prop-answer" data-v="1" ${s.busy ? 'disabled' : ''}>Aceptar</button>
      </div>` : '<p class="hint top-gap">Podrás responder cuando tu acceso a la app esté activo.</p>'}`;
  },
};

SHEETS['link-consent'] = {
  title: () => 'Vincular con tu entrenador',
  render: (s) => {
    const p = profile || {};
    return `
    <p>Vas a enviar una solicitud a <b>${esc(s.name)}</b>. Cuando la acepte:</p>
    <ul class="consent-list">
      <li>Verá tu nombre y tu correo.</li>
      <li>Podrá ver (sin cambiarlos) tu diario de comidas, tus entrenamientos, tu peso, tus medidas y tus objetivos.</li>
      <li>No verá tus fotos, salvo que tú decidas compartirlas.</li>
      <li>Podrá pausar tu acceso a la app o desvincularte. Tú puedes desvincularte cuando quieras.</li>
    </ul>
    ${p.role === 'free' ? '<p class="hint">Tu cuenta dejará de ser de usuario libre y pasará a depender de tu entrenador. Si más adelante os desvinculáis, necesitarás otro entrenador o un código de activación nuevo.</p>' : ''}
    ${p.link ? `<p class="hint">Cuando la acepte, dejarás de estar vinculado a ${esc(p.link.trainer_name || 'tu entrenador actual')}.</p>` : ''}
    ${p.link_request ? `<p class="hint">Se anulará tu solicitud a ${esc(p.link_request.trainer_name || 'otro entrenador')}.</p>` : ''}
    <label class="check top-gap"><input type="checkbox" id="lc-ok"> Entiendo y acepto compartir estos datos con ${esc(s.name)}</label>
    ${s.error ? `<p class="sync-err" role="alert">${esc(s.error)}</p>` : ''}
    <div class="sheet-actions"><button type="button" class="btn primary" data-act="acct-link-send" ${s.busy ? 'disabled' : ''}>${s.busy ? 'Enviando…' : 'Enviar solicitud'}</button></div>`;
  },
};


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

FORMS['acct-code'] = async (form) => {
  const code = form.querySelector('input').value.trim().toUpperCase().replace(/\s+/g, '');
  if (code.length < 6) { toast('Escribe el código completo.'); return; }
  if (code.startsWith('ENT')) {
    try {
      const t = await rpc('lookup_trainer', { p_code: code });
      pushSheet({ type: 'link-consent', code, name: t?.name || 'tu entrenador' });
    } catch (e) { toast(errorText(e)); }
    return;
  }
  if (profile && profile.role !== 'pending' && !(profile.role === 'client' && accessState() === 'pending')) {
    toast(accessState() === 'paused' ? 'Para usar un código de activación, primero desvincúlate de tu entrenador.' : 'Ese es un código de activación y tu cuenta ya está activa. Para vincularte, usa el código de tu entrenador (ENT-…).');
    return;
  }
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
    const err = await refreshProfile();
    if (err) { toast('No se ha podido comprobar: ' + errorText(err)); return; }
    toast(accessState() === 'active' ? 'Tu cuenta está activa' : `Sigue igual (${currentUser()?.email || ''}: ${ROLE_NAME[profile?.role] || 'sin perfil'})`);
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
  'acct-link-send': async (el, top) => {
    if (!$('#lc-ok')?.checked) { top.error = 'Marca la casilla para aceptar.'; renderSheets(); return; }
    top.busy = true; top.error = '';
    renderSheets();
    try {
      await setProfile(await rpc('link_request', { p_code: top.code }));
      closeSheets();
      render();
      toast('Solicitud enviada');
    } catch (e) {
      top.busy = false; top.error = errorText(e);
      renderSheets();
    }
  },
  'acct-link-cancel': () => pushSheet({
    type: 'confirm', title: 'Anular la solicitud', ok: 'Anular',
    text: `Se anulará tu solicitud a ${profile?.link_request?.trainer_name || 'tu entrenador'}.`,
    onOk: async () => {
      try { await setProfile(await rpc('link_cancel')); render(); toast('Solicitud anulada'); } catch (e) { toast(errorText(e)); }
    },
  }),
  'acct-notes': () => {
    pushSheet({ type: 'coach-notes' });
    const last = (inbox?.notes || []).map((n) => n.updated_at || n.created_at).sort().pop();
    if (last && last > notesSeen() && GUARD.canWrite()) { S.settings.coachSeen = last; saveSettings(); }
  },
  'acct-proposal': () => pushSheet({ type: 'coach-proposal' }),
  'acct-prop-answer': async (el, top) => {
    const pr = inbox?.proposal;
    if (!pr) return;
    const accept = el.dataset.v === '1';
    top.reply = $('#cp-reply')?.value || '';
    top.busy = true; top.error = '';
    renderSheets();
    try {
      await rpc('client_proposal_respond', { p_id: pr.id, p_accept: accept, p_reply: top.reply });
    } catch (e) {
      top.busy = false; top.error = errorText(e);
      renderSheets();
      return;
    }
    if (accept) {
      const g = pr.goals || {};
      const gt = pr.goals_train || {};
      S.settings.goals = { ...S.settings.goals, kcal: g.kcal ?? null, p: g.p ?? null, c: g.c ?? null, f: g.f ?? null, steps: g.steps ?? null };
      S.settings.goalsTrain = { kcal: gt.kcal ?? null, p: gt.p ?? null, c: gt.c ?? null, f: gt.f ?? null };
      saveSettings();
    }
    inbox = { ...inbox, proposal: null };
    closeSheets();
    render();
    toast(accept ? 'Objetivos actualizados' : 'Propuesta rechazada');
    refreshInbox();
  },
  'acct-unlink': () => pushSheet({
    type: 'confirm', title: 'Desvincularme', ok: 'Desvincularme', danger: true,
    text: `Dejarás de estar vinculado a ${profile?.link?.trainer_name || 'tu entrenador'} y ya no podrá ver tus datos.${profile?.role === 'client' ? ' Para seguir usando la app necesitarás el código de otro entrenador o un código de activación.' : ''}`,
    onOk: async () => {
      try { await setProfile(await rpc('client_unlink')); render(); toast('Te has desvinculado'); } catch (e) { toast(errorText(e)); }
    },
  }),
});

HOOKS.visible.push(() => { if (isLoggedIn()) refreshProfile(); });
