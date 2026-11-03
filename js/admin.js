// Pestaña Administración (solo cuentas de desarrollador): usuarios, códigos de activación y solicitudes.
// Todo pasa por funciones del servidor que comprueban que quien llama es desarrollador.
import { $, dateShort, esc, iso, norm, num, plural } from './util.js';
import { S } from './state.js';
import { ACTIONS, FORMS, INPUTS, SHEETS, VIEWS, closeSheets, pageList, pushSheet, render, renderSheets, toast } from './ui.js';
import { rpc } from './sync.js';
import { ROLE_NAME, errorText, myProfile } from './account.js';

const FILTERS = [
  ['all', 'Todos'], ['dev', 'Desarrolladores'], ['trainer', 'Entrenadores'], ['client', 'Clientes'],
  ['free', 'Usuarios libres'], ['pending', 'Pendientes'], ['blocked', 'Bloqueados'],
];
const data = { users: null, codes: null, requests: null, fresh: [], error: '' };
const failed = new Set();
let loading = false;

async function load(what, force = false) {
  if (!force && (data[what] || failed.has(what) || loading)) return;
  loading = true;
  try {
    data[what] = await rpc({ users: 'admin_users', codes: 'admin_codes', requests: 'admin_requests' }[what]);
    data.error = '';
    failed.delete(what);
  } catch (e) {
    data.error = errorText(e);
    failed.add(what);
  }
  loading = false;
  if (S.ui.tab === 'admin' && !S.sheets.length) render();
}

const tabOf = () => S.ui.atab || 'users';
const when = (iso) => (iso ? `${dateShort(iso.slice(0, 10))}` : '–');
const userLabel = (u) => esc(u.name || u.email || 'Sin nombre');
const matches = (u, f) => (f === 'all' ? true : f === 'blocked' ? u.blocked : u.role === f && !u.blocked);

function usersView() {
  const list = data.users;
  if (!list) return '<p class="muted">Cargando usuarios…</p>';
  const f = S.ui.afilter || 'all';
  const q = norm(S.ui.aq || '');
  const count = (k) => list.filter((u) => matches(u, k)).length;
  const shown = list.filter((u) => matches(u, f) && (!q || norm(`${u.name} ${u.email}`).includes(q)));
  return `
    <div class="chips scroll" role="group" aria-label="Filtrar usuarios">
      ${FILTERS.map(([k, l]) => `<button type="button" class="chip${f === k ? ' on' : ''}" data-act="adm-filter" data-v="${k}" aria-pressed="${f === k}">${l} <small>${count(k)}</small></button>`).join('')}
    </div>
    <input type="search" class="top-gap" placeholder="Buscar por nombre o correo" value="${esc(S.ui.aq || '')}" data-input="admin-q" aria-label="Buscar usuarios">
    <div id="adm-list">${userRows(shown)}</div>`;
}

function userRows(shown) {
  if (!shown.length) return '<p class="empty">Ningún usuario con este filtro.</p>';
  const pl = pageList('admin-users', shown, 30, (u) => `<li><button type="button" class="row" data-act="adm-user" data-id="${u.id}">
      <span class="row-main">${userLabel(u)}${u.blocked ? ' <em class="tag tag-danger">bloqueado</em>' : ''}</span>
      <span class="row-sub">${esc(u.email || '')} · ${ROLE_NAME[u.role] || u.role} · alta ${when(u.created_at)}${u.last_activity ? ` · activo ${when(u.last_activity)}` : ''}</span>
    </button></li>`);
  return `<ul class="list">${pl.html}</ul>${pl.more}`;
}

function codeStatus(c) {
  if (c.revoked) return ['Anulado', 'off'];
  if (c.uses_left < 1) return ['Usado', 'off'];
  if (Date.parse(c.expires_at) < Date.now()) return ['Caducado', 'off'];
  return [`Hasta el ${when(c.expires_at)}`, 'ok'];
}

function codesView() {
  const fresh = data.fresh.length ? `
    <div class="notice small">
      <p><b>${plural(data.fresh.length, 'código nuevo', 'códigos nuevos')}</b> (caducan en 7 días si no se usan):</p>
      <p class="code-list">${data.fresh.map((c) => esc(c.code)).join('<br>')}</p>
      <button type="button" class="btn small" data-act="adm-copy" data-v="${esc(data.fresh.map((c) => c.code).join('\n'))}">Copiar</button>
    </div>` : '';
  const list = data.codes;
  return `
    <form data-form="adm-codes" class="card adm-form">
      <div class="card-head"><h2>Generar códigos de activación</h2></div>
      <div class="form-grid">
        <label class="field"><span>Cuántos</span><input id="ac-n" type="text" inputmode="numeric" value="1"></label>
        <label class="field"><span>Usos de cada uno</span><input id="ac-uses" type="text" inputmode="numeric" value="1"></label>
      </div>
      <label class="field"><span>Nota (opcional)</span><input id="ac-note" type="text" maxlength="120" placeholder="p. ej. para Marta"></label>
      <button type="submit" class="btn wide">Generar</button>
    </form>
    ${fresh}
    <h3 class="list-title">Códigos</h3>
    ${!list ? '<p class="muted">Cargando códigos…</p>' : !list.length ? '<p class="empty">Aún no has generado ningún código.</p>' : `<ul class="list">${list.map((c) => {
      const [st, cls] = codeStatus(c);
      return `<li class="row static code-row">
        <span class="row-main"><code>${esc(c.code)}</code> <em class="tag ${cls === 'ok' ? '' : 'tag-off'}">${st}</em></span>
        <span class="row-sub">${c.max_uses - c.uses_left} de ${c.max_uses} ${c.max_uses === 1 ? 'uso' : 'usos'}${c.used_by ? ` · ${esc(c.used_by)}` : ''}${c.note ? ` · ${esc(c.note)}` : ''}</span>
        <span class="row-side">${cls === 'ok' ? `<button type="button" class="btn ghost small" data-act="adm-copy" data-v="${esc(c.code)}">Copiar</button> <button type="button" class="btn ghost small" data-act="adm-revoke" data-v="${esc(c.code)}">Anular</button>` : ''}</span>
      </li>`;
    }).join('')}</ul>`}`;
}

function requestsView() {
  const list = data.requests;
  if (!list) return '<p class="muted">Cargando solicitudes…</p>';
  if (!list.length) return '<p class="empty">No hay solicitudes para ser entrenador.</p>';
  const pend = list.filter((r) => r.status === 'pending');
  const done = list.filter((r) => r.status !== 'pending');
  const card = (r) => `<li class="req${r.status === 'pending' ? ' pending' : ''}">
    <div class="req-head"><b>${userLabel(r)}</b><span class="muted">${when(r.created_at)}</span></div>
    <p class="muted">${esc(r.email || '')} · ${ROLE_NAME[r.role] || r.role}</p>
    <p class="req-msg">${esc(r.message || '(sin mensaje)')}</p>
    ${r.status === 'pending'
      ? `<div class="btn-row two"><button type="button" class="btn ghost" data-act="adm-resolve" data-id="${r.id}" data-v="0">Rechazar</button><button type="button" class="btn" data-act="adm-resolve" data-id="${r.id}" data-v="1">Aprobar</button></div>`
      : `<p class="req-done">${r.status === 'approved' ? 'Aprobada' : 'Rechazada'} el ${when(r.resolved_at)}${r.reply ? ` · «${esc(r.reply)}»` : ''}</p>`}
  </li>`;
  return `
    ${pend.length ? `<h3 class="list-title">Pendientes (${pend.length})</h3><ul class="req-list">${pend.map(card).join('')}</ul>` : '<p class="empty">No hay solicitudes pendientes.</p>'}
    ${done.length ? `<h3 class="list-title">Resueltas</h3><ul class="req-list">${done.map(card).join('')}</ul>` : ''}`;
}

export function viewAdmin() {
  const t = tabOf();
  load(t);
  const nPend = (data.requests || []).filter((r) => r.status === 'pending').length;
  return `
  <header class="page-head"><h1>Administración</h1></header>
  <div class="segmented" role="tablist">
    ${[['users', 'Usuarios'], ['codes', 'Códigos'], ['requests', `Solicitudes${nPend ? ` (${nPend})` : ''}`]].map(([k, l]) => `<button type="button" role="tab" aria-selected="${t === k}" data-act="adm-tab" data-v="${k}">${l}</button>`).join('')}
  </div>
  ${data.error ? `<div class="notice"><p>${esc(data.error)}</p></div>` : ''}
  <div class="adm-body">${t === 'users' ? usersView() : t === 'codes' ? codesView() : requestsView()}</div>
  <button type="button" class="btn ghost wide top-gap" data-act="adm-reload" ${loading ? 'disabled' : ''}>Actualizar</button>`;
}

/* ---------- ficha de un usuario ---------- */

SHEETS['admin-user'] = {
  title: (s) => s.u.name || s.u.email || 'Usuario',
  render: (s) => {
    const u = s.u;
    const self = u.id === myProfile()?.id;
    return `
      <div class="rep">
        <div class="rep-line"><span class="rep-l">Correo</span><span class="rep-v small">${esc(u.email || '')}</span></div>
        <div class="rep-line"><span class="rep-l">Nombre</span><span class="rep-v small">${esc(u.name || '–')}</span></div>
        <div class="rep-line"><span class="rep-l">Tipo</span><span class="rep-v small">${ROLE_NAME[u.role] || u.role}</span></div>
        <div class="rep-line"><span class="rep-l">Estado</span><span class="rep-v small">${u.blocked ? 'Bloqueado' : u.role === 'pending' ? 'Sin activar' : 'Activo'}</span></div>
        <div class="rep-line"><span class="rep-l">Alta</span><span class="rep-v small">${when(u.created_at)}</span></div>
        <div class="rep-line"><span class="rep-l">Activado</span><span class="rep-v small">${when(u.activated_at)}${u.code_used ? ` · ${esc(u.code_used)}` : ''}</span></div>
        <div class="rep-line"><span class="rep-l">Última actividad</span><span class="rep-v small">${when(u.last_activity)}</span></div>
      </div>
      ${self ? '<p class="hint top-gap">Es tu cuenta: no puedes cambiar su tipo ni bloquearla.</p>' : `
      <div class="field top-gap"><span>Cambiar el tipo</span>
        <div class="chips">${['dev', 'trainer', 'free', 'pending'].map((r) => `<button type="button" class="chip${u.role === r ? ' on' : ''}" data-act="adm-role" data-v="${r}" aria-pressed="${u.role === r}">${ROLE_NAME[r]}</button>`).join('')}</div>
      </div>
      <p class="hint">Los clientes se asignan cuando se vinculan a un entrenador (fase 2). La cuenta solo la puede borrar el propio usuario.</p>
      <div class="sheet-actions"><button type="button" class="btn ${u.blocked ? '' : 'danger ghost'}" data-act="adm-block" data-v="${u.blocked ? 0 : 1}">${u.blocked ? 'Desbloquear acceso' : 'Bloquear acceso'}</button></div>`}`;
  },
};

SHEETS['admin-resolve'] = {
  title: (s) => (s.approve ? 'Aprobar solicitud' : 'Rechazar solicitud'),
  render: (s) => `
    <p>${s.approve ? 'La cuenta pasará a ser de <b>entrenador</b>.' : 'La cuenta seguirá como está.'} Puedes dejar un comentario, que verá el solicitante.</p>
    <label class="field top-gap"><span>Comentario (opcional)</span><textarea id="res-reply" rows="3" maxlength="1000"></textarea></label>
    <div class="sheet-actions"><button type="button" class="btn ${s.approve ? 'primary' : 'danger'}" data-act="adm-resolve-ok">${s.approve ? 'Aprobar' : 'Rechazar'}</button></div>`,
};

async function act(fn, ok) {
  try {
    await fn();
    if (ok) toast(ok);
    return true;
  } catch (e) {
    toast(errorText(e));
    return false;
  }
}

FORMS['adm-codes'] = async () => {
  const n = Math.round(num($('#ac-n').value) || 0);
  const uses = Math.round(num($('#ac-uses').value) || 0);
  await act(async () => {
    data.fresh = await rpc('admin_create_codes', { p_count: n, p_uses: uses, p_note: $('#ac-note').value });
    await load('codes', true);
  }, 'Códigos generados');
  render();
};

Object.assign(ACTIONS, {
  'adm-tab': (el) => { S.ui.atab = el.dataset.v; render(); },
  'adm-filter': (el) => { S.ui.afilter = el.dataset.v; S.ui.more = { ...(S.ui.more || {}), 'admin-users': 0 }; render(); },
  'adm-reload': async () => { await load(tabOf(), true); render(); },
  'adm-user': (el) => { const u = (data.users || []).find((x) => x.id === el.dataset.id); if (u) pushSheet({ type: 'admin-user', u }); },
  'adm-role': async (el, top) => {
    const role = el.dataset.v;
    if (role === top.u.role) return;
    if (await act(() => rpc('admin_set_role', { p_user: top.u.id, p_role: role }), `Ahora es ${ROLE_NAME[role].toLowerCase()}`)) {
      top.u = { ...top.u, role };
      await load('users', true);
      renderSheets();
    }
  },
  'adm-block': async (el, top) => {
    const blocked = el.dataset.v === '1';
    if (await act(() => rpc('admin_set_blocked', { p_user: top.u.id, p_blocked: blocked }), blocked ? 'Acceso bloqueado' : 'Acceso desbloqueado')) {
      top.u = { ...top.u, blocked };
      await load('users', true);
      renderSheets();
    }
  },
  'adm-copy': async (el) => {
    try { await navigator.clipboard.writeText(el.dataset.v); toast('Copiado'); } catch (e) { toast('No se ha podido copiar: mantén pulsado el código para copiarlo.'); }
  },
  'adm-revoke': (el) => pushSheet({
    type: 'confirm', title: 'Anular código', text: `El código ${el.dataset.v} dejará de servir para activar cuentas. Las cuentas que ya lo usaron siguen activas.`, ok: 'Anular', danger: true,
    onOk: async () => { await act(() => rpc('admin_revoke_code', { p_code: el.dataset.v }), 'Código anulado'); await load('codes', true); render(); },
  }),
  'adm-resolve': (el) => pushSheet({ type: 'admin-resolve', id: Number(el.dataset.id), approve: el.dataset.v === '1' }),
  'adm-resolve-ok': async (el, top) => {
    const ok = await act(() => rpc('admin_resolve_request', { p_id: top.id, p_approve: top.approve, p_reply: $('#res-reply').value }), top.approve ? 'Solicitud aprobada' : 'Solicitud rechazada');
    if (!ok) return;
    closeSheets();
    data.users = null;
    await load('requests', true);
    render();
  },
});

INPUTS['admin-q'] = (el) => {
  S.ui.aq = el.value;
  const list = data.users || [];
  const f = S.ui.afilter || 'all';
  const q = norm(el.value);
  const host = $('#adm-list');
  if (host) host.innerHTML = userRows(list.filter((u) => matches(u, f) && (!q || norm(`${u.name} ${u.email}`).includes(q))));
};

VIEWS.admin = { html: viewAdmin };
