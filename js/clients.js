// Pestaña Clientes (entrenadores y desarrolladores): su código, las solicitudes y la lista de clientes
// con pausar, reanudar y desvincular. También la ve quien dejó de ser entrenador mientras le quedan clientes,
// con el aviso del plazo y la solicitud para ampliarlo. Las reglas están en supabase/003-entrenadores.sql.
import { $, dateShort, esc, iso, norm, plural, today } from './util.js';
import { S, SAVED } from './state.js';
import { ACTIONS, INPUTS, SHEETS, VIEWS, closeSheets, pushSheet, render, renderSheets, toast } from './ui.js';
import { SYNC_HOOKS, rpc } from './sync.js';
import { dateNum, errorText, myProfile, refreshProfile } from './account.js';
import { fichaAfter, fichaHTML, forgetFichas } from './ficha.js';
import { resetTemplates, setTemplateClients, viewPlantillas } from './plantillas.js';

const data = { list: null, error: '' };
let loading = false;
let failed = false;

async function load(force = false) {
  if (!force && (data.list || failed || loading)) return;
  loading = true;
  try {
    data.list = await rpc('trainer_clients');
    setTemplateClients(data.list);
    data.error = '';
    failed = false;
  } catch (e) {
    data.error = errorText(e);
    failed = true;
  }
  loading = false;
  if (S.ui.tab === 'clientes' && !S.sheets.length) render();
}

const find = (id) => (data.list || []).find((c) => c.link_id === Number(id));
const when = (iso) => (iso ? dateShort(iso.slice(0, 10)) : '–');
const label = (c) => esc(c.name || c.email || 'Sin nombre');
const isTrainer = () => ['trainer', 'dev'].includes(myProfile()?.role);
const FILTERS = [['active', 'Activos'], ['blocked', 'Pausados'], ['banned', 'Solicitudes bloqueadas']];
const inFilter = (c, f) => (f === 'banned' ? c.banned && c.status === 'rejected' : c.status === f);

function lastSeen(c) {
  if (!c.last_activity) return 'sin actividad';
  const days = Math.floor((Date.now() - Date.parse(c.last_activity)) / 864e5);
  return days < 1 ? 'activo hoy' : days === 1 ? 'activo ayer' : `activo hace ${plural(days, 'día', 'días')}`;
}

function codeCard(p) {
  if (!isTrainer() || !p?.trainer_code) return '';
  return `
  <section class="card coach-code">
    <div class="card-head"><h2>Tu código de entrenador</h2></div>
    <p class="coach-code-v">${esc(p.trainer_code)}</p>
    <div class="btn-row"><button type="button" class="btn small" data-act="cl-copy" data-v="${esc(p.trainer_code)}">Copiar</button></div>
    <p class="hint">Es el mismo para todos tus clientes. Lo escriben en la app (al activar la cuenta o en Ajustes › Cuenta) y su solicitud te llega aquí.</p>
  </section>`;
}

// Quien ya no es entrenador: plazo y ampliación
function offNotice(p) {
  const c = p?.coaching;
  if (isTrainer() || !c?.unlink_at) return '';
  const ext = c.extension;
  const extLine = !ext ? ''
    : ext.status === 'pending' ? `<p>Has pedido ampliar el plazo el ${when(ext.created_at)}: pendiente de revisar.</p>`
    : ext.status === 'approved' ? `<p>Se amplió el plazo${ext.until ? ` hasta el ${dateNum(ext.until)}` : ''}${ext.reply ? `: «${esc(ext.reply)}»` : '.'}</p>`
    : `<p>No se aprobó ampliar el plazo${ext.reply ? `: «${esc(ext.reply)}»` : '.'}</p>`;
  return `
  <div class="notice coach-off">
    <p>Tu cuenta ya no es de entrenador. ${c.clients === 1 ? 'Tu cliente quedará desvinculado' : 'Tus clientes quedarán desvinculados'} el día <b>${dateNum(c.unlink_at)}</b>.</p>
    ${extLine}
    ${ext?.status === 'pending' ? '' : '<button type="button" class="btn small" data-act="cl-extend">Solicitar ampliar plazo</button>'}
  </div>`;
}

function requestRows(list) {
  if (!list.length) return '';
  return `
    <h3 class="list-title">Solicitudes (${list.length})</h3>
    <ul class="req-list">${list.map((c) => `<li class="req pending">
      <div class="req-head"><b>${label(c)}</b><span class="muted">${when(c.created_at)}</span></div>
      <p class="muted">${esc(c.email || '')}</p>
      ${isTrainer() ? `<div class="btn-row two">
        <button type="button" class="btn ghost" data-act="cl-reject" data-id="${c.link_id}">Rechazar</button>
        <button type="button" class="btn" data-act="cl-accept" data-id="${c.link_id}">Aceptar</button>
      </div>` : ''}
    </li>`).join('')}</ul>`;
}

function clientRows(shown, f) {
  if (!shown.length) {
    return `<p class="empty">${f === 'active' ? 'Aún no tienes clientes activos.' : f === 'blocked' ? 'No tienes clientes pausados.' : 'No has bloqueado ninguna solicitud.'}</p>`;
  }
  return `<ul class="list">${shown.map((c) => `<li><button type="button" class="row" data-act="cl-open" data-id="${c.link_id}">
      <span class="row-main">${label(c)}${c.status === 'blocked' ? ' <em class="tag tag-danger">pausado</em>' : ''}</span>
      <span class="row-sub">${f === 'banned' ? `${esc(c.email || '')} · bloqueada el ${when(c.created_at)}` : `${esc(c.email || '')} · desde el ${when(c.accepted_at)} · ${lastSeen(c)}`}</span>
    </button></li>`).join('')}</ul>`;
}

export function viewClients() {
  load();
  if (S.ui.client) {
    const c = find(S.ui.client);
    if (c && (c.status === 'active' || c.status === 'blocked')) return fichaHTML(c);
    if (data.list) S.ui.client = null;
    else return '<p class="muted">Cargando…</p>';
  }
  const p = myProfile();
  const list = data.list;
  let body;
  if (!list) {
    body = data.error ? '' : '<p class="muted">Cargando clientes…</p>';
  } else {
    const req = list.filter((c) => c.status === 'requested');
    const banned = list.filter((c) => inFilter(c, 'banned'));
    const f = S.ui.cfilter === 'banned' && !banned.length ? 'active' : S.ui.cfilter || 'active';
    const q = norm(S.ui.cq || '');
    const count = (k) => list.filter((c) => inFilter(c, k)).length;
    const shown = list.filter((c) => inFilter(c, f) && (!q || norm(`${c.name} ${c.email}`).includes(q)));
    const many = count('active') + count('blocked') > 8;
    body = `
      ${requestRows(req)}
      <h3 class="list-title">Clientes</h3>
      <div class="chips scroll" role="group" aria-label="Filtrar clientes">
        ${FILTERS.filter(([k]) => k !== 'banned' || banned.length).map(([k, l]) => `<button type="button" class="chip${f === k ? ' on' : ''}" data-act="cl-filter" data-v="${k}" aria-pressed="${f === k}">${l} <small>${count(k)}</small></button>`).join('')}
      </div>
      ${many ? `<input type="search" class="top-gap" placeholder="Buscar por nombre o correo" value="${esc(S.ui.cq || '')}" data-input="cl-q" aria-label="Buscar clientes">` : ''}
      <div id="cl-list">${clientRows(shown, f)}</div>`;
  }
  const ctab = isTrainer() ? S.ui.ctab || 'clientes' : 'clientes';
  const seg = isTrainer() ? `<div class="segmented" role="tablist">
    ${[['clientes', 'Clientes'], ['plantillas', 'Plantillas']].map(([k, l]) => `<button type="button" role="tab" aria-selected="${ctab === k}" data-act="cl-ctab" data-v="${k}">${l}</button>`).join('')}
  </div>` : '';
  if (ctab === 'plantillas') {
    return `<header class="page-head"><h1>Clientes</h1></header>${seg}${viewPlantillas()}`;
  }
  return `
  <header class="page-head"><h1>Clientes</h1></header>
  ${seg}
  ${offNotice(p)}
  ${data.error ? `<div class="notice"><p>${esc(data.error)}</p></div>` : ''}
  ${codeCard(p)}
  ${body}
  <button type="button" class="btn ghost wide top-gap" data-act="cl-reload" ${loading ? 'disabled' : ''}>Actualizar</button>`;
}

/* ---------- hojas ---------- */

SHEETS['client'] = {
  title: (s) => s.c.name || s.c.email || 'Cliente',
  render: (s) => {
    const c = s.c;
    if (c.status === 'rejected') {
      return `
        <p>Bloqueaste la solicitud de <b>${label(c)}</b> (${esc(c.email || '')}): no puede volver a enviarte otra.</p>
        <div class="sheet-actions"><button type="button" class="btn" data-act="cl-unban">Desbloquear</button></div>`;
    }
    return `
      <div class="rep">
        <div class="rep-line"><span class="rep-l">Correo</span><span class="rep-v small">${esc(c.email || '')}</span></div>
        <div class="rep-line"><span class="rep-l">Estado</span><span class="rep-v small">${c.status === 'blocked' ? `Pausado desde el ${when(c.blocked_at)}` : 'Activo'}</span></div>
        <div class="rep-line"><span class="rep-l">Cliente desde</span><span class="rep-v small">${when(c.accepted_at)}</span></div>
        <div class="rep-line"><span class="rep-l">Última actividad</span><span class="rep-v small">${when(c.last_activity)}</span></div>
        ${c.unlink_at ? `<div class="rep-line"><span class="rep-l">Se desvincula</span><span class="rep-v small">${dateNum(c.unlink_at)}</span></div>` : ''}
      </div>
      ${isTrainer() ? `<p class="hint">${c.status === 'blocked' ? 'Mientras esté pausado, puede ver y descargar sus datos, pero no usar la app.' : 'Si lo pausas, podrá ver y descargar sus datos, pero no usar la app hasta que lo reanudes.'}</p>` : ''}
      <div class="sheet-actions">
        <button type="button" class="btn ghost danger" data-act="cl-unlink">Desvincular</button>
        ${isTrainer() ? `<button type="button" class="btn ${c.status === 'blocked' ? 'primary' : 'ghost'}" data-act="cl-block" data-v="${c.status === 'blocked' ? 0 : 1}">${c.status === 'blocked' ? 'Reanudar acceso' : 'Pausar acceso'}</button>` : ''}
      </div>`;
  },
};

SHEETS['client-reject'] = {
  title: () => 'Rechazar solicitud',
  render: (s) => `
    <p>La solicitud de <b>${label(s.c)}</b> se rechazará. Su cuenta seguirá como está.</p>
    <label class="check top-gap"><input type="checkbox" id="cl-ban"> No dejar que vuelva a enviarme solicitudes</label>
    <div class="sheet-actions"><button type="button" class="btn danger" data-act="cl-reject-ok">Rechazar</button></div>`,
};

SHEETS['coach-extend'] = {
  title: () => 'Ampliar plazo',
  render: (s) => `
    <p class="muted">Explica cuánto tiempo más necesitas y por qué. El equipo de la app revisará la solicitud y, si la aprueba, fijará la nueva fecha.</p>
    <label class="field top-gap"><span>Mensaje</span><textarea id="ext-msg" rows="4" maxlength="1000" placeholder="p. ej. Necesito un mes más para pasar a mis clientes a otro entrenador.">${esc(s.msg || '')}</textarea></label>
    ${s.error ? `<p class="sync-err" role="alert">${esc(s.error)}</p>` : ''}
    <div class="sheet-actions"><button type="button" class="btn primary" data-act="cl-extend-send" ${s.busy ? 'disabled' : ''}>${s.busy ? 'Enviando…' : 'Enviar solicitud'}</button></div>`,
};

/* ---------- acciones ---------- */

async function act(fn, ok) {
  try {
    await fn();
    if (ok) toast(ok);
    await load(true);
    refreshProfile();
    return true;
  } catch (e) {
    toast(errorText(e));
    return false;
  }
}

Object.assign(ACTIONS, {
  'cl-reload': async () => { failed = false; await load(true); await refreshProfile(); render(); },
  'cl-filter': (el) => { S.ui.cfilter = el.dataset.v; render(); },
  'cl-copy': async (el) => {
    try { await navigator.clipboard.writeText(el.dataset.v); toast('Código copiado'); } catch (e) { toast('No se ha podido copiar: mantén pulsado el código para copiarlo.'); }
  },
  'cl-open': (el) => {
    const c = find(el.dataset.id);
    if (!c) return;
    if (c.status === 'active' || c.status === 'blocked') {
      Object.assign(S.ui, { client: c.link_id, ftab: 'resumen', fdate: today() });
      render();
      window.scrollTo(0, 0);
    } else pushSheet({ type: 'client', c });
  },
  'cl-ctab': (el) => { S.ui.ctab = el.dataset.v; render(); },
  'cl-back': () => { S.ui.client = null; render(); window.scrollTo(0, 0); },
  'cl-manage': () => { const c = find(S.ui.client); if (c) pushSheet({ type: 'client', c }); },
  'cl-accept': async (el) => {
    const c = find(el.dataset.id);
    await act(() => rpc('trainer_respond', { p_link: c.link_id, p_action: 'accept' }), `${c.name || c.email} ya es tu cliente`);
    render();
  },
  'cl-reject': (el) => { const c = find(el.dataset.id); if (c) pushSheet({ type: 'client-reject', c }); },
  'cl-reject-ok': async (el, top) => {
    const ban = $('#cl-ban')?.checked;
    if (await act(() => rpc('trainer_respond', { p_link: top.c.link_id, p_action: ban ? 'block' : 'reject' }), ban ? 'Solicitud rechazada y bloqueada' : 'Solicitud rechazada')) {
      closeSheets();
      render();
    }
  },
  'cl-block': async (el, top) => {
    const blocked = el.dataset.v === '1';
    if (await act(() => rpc('trainer_set_blocked', { p_link: top.c.link_id, p_blocked: blocked }), blocked ? 'Acceso pausado' : 'Acceso reanudado')) {
      top.c = find(top.c.link_id) || top.c;
      renderSheets();
    }
  },
  'cl-unban': async (el, top) => {
    if (await act(() => rpc('trainer_set_blocked', { p_link: top.c.link_id, p_blocked: false }), 'Desbloqueada: puede volver a enviarte una solicitud')) {
      closeSheets();
      render();
    }
  },
  'cl-unlink': (el, top) => {
    const c = top.c;
    pushSheet({
      type: 'confirm', title: 'Desvincular cliente', ok: 'Desvincular', danger: true,
      text: `${c.name || c.email} dejará de ser tu cliente y ya no verás sus datos. Si su cuenta depende de ti, necesitará otro entrenador o un código de activación para seguir usando la app.`,
      onOk: async () => {
        if (await act(() => rpc('trainer_unlink', { p_link: c.link_id }), 'Cliente desvinculado')) { closeSheets(); S.ui.client = null; render(); }
      },
    });
  },
  'cl-extend': () => pushSheet({ type: 'coach-extend' }),
  'cl-extend-send': async (el, top) => {
    top.msg = $('#ext-msg').value;
    if (top.msg.trim().length < 10) { top.error = 'Cuéntanos un poco más (al menos una frase).'; renderSheets(); return; }
    top.busy = true; top.error = '';
    renderSheets();
    try {
      await rpc('request_extension', { p_message: top.msg });
      await refreshProfile();
      closeSheets();
      render();
      toast('Solicitud enviada');
    } catch (e) {
      top.busy = false; top.error = errorText(e);
      renderSheets();
    }
  },
});

INPUTS['cl-q'] = (el) => {
  S.ui.cq = el.value;
  const f = S.ui.cfilter || 'active';
  const q = norm(el.value);
  const host = $('#cl-list');
  if (host) host.innerHTML = clientRows((data.list || []).filter((c) => inFilter(c, f) && (!q || norm(`${c.name} ${c.email}`).includes(q))), f);
};

// Al cambiar de cuenta o borrar los datos, se olvida la lista
function resetClients() { data.list = null; data.error = ''; failed = false; S.ui.client = null; forgetFichas(); resetTemplates(); }
SYNC_HOOKS.auth.push(resetClients);
SAVED.push((key) => { if (key === '!wipe') resetClients(); });

VIEWS.clientes = { html: viewClients, after: () => { if (S.ui.client) fichaAfter(); } };
