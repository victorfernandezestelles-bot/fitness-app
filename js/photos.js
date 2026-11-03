// Fotos de progreso privadas: se guardan solo en el teléfono, aparte de los datos y de su copia .json.
// Si hay entrenador, el usuario puede compartir sesiones concretas (supabase/007-fotos.sql): solo esas se suben.
import * as store from './store.js';
import { $, addDays, dateLong, dateShort, deliverFile, esc, fmt, parseISO, plural, today, uid } from './util.js';
import { S } from './state.js';
import { ACTIONS, CHANGES, SHEETS, popSheet, popTo, pushSheet, render, renderSheets, toast } from './ui.js';
import { rpc } from './sync.js';
import { accessState, errorText, myProfile } from './account.js';

export const POSES = [['frente', 'Frente'], ['lado', 'Lado'], ['espalda', 'Espalda']];
const POSE_NAME = Object.fromEntries(POSES);

let sets = null; // [{ id, date, poses: [...], thumbs: {pose: dataURL} }] ordenadas de la más antigua a la más reciente
const imgCache = new Map();

export async function loadPhotoSets(force = false) {
  if (sets && !force) return sets;
  try { sets = (await store.photoSets()).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)); } catch (e) { sets = []; }
  return sets;
}
async function photo(id, pose) {
  const k = `img:${id}:${pose}`;
  if (!imgCache.has(k)) imgCache.set(k, await store.photoGet(k));
  return imgCache.get(k);
}

// Reduce la foto para que ocupe poco: lado largo de 1280 px (y miniatura de 240 px), en JPEG
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagen')); };
    img.src = url;
  });
}
function resized(img, max, q) {
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}

/* ---------- tarjeta en Progreso ---------- */
export function photoCard() {
  return `
  <section class="card" id="photo-card">
    <div class="card-head"><h2>Fotos de progreso</h2><span class="muted">privadas</span></div>
    <div id="photo-card-body"><p class="muted">Cargando…</p></div>
  </section>`;
}

export async function fillPhotoCard() {
  const el = document.getElementById('photo-card-body');
  if (!el) return;
  const list = await loadPhotoSets();
  if (!document.body.contains(el)) return;
  const last = list[list.length - 1];
  el.innerHTML = `
    ${last ? `<p class="muted">${plural(list.length, 'sesión de fotos', 'sesiones de fotos')} · la última del ${dateShort(last.date)}</p>
      <div class="ph-row">${POSES.filter(([p]) => last.thumbs?.[p]).map(([p, l]) => `<figure><img src="${last.thumbs[p]}" alt="${l}, ${dateShort(last.date)}"><figcaption>${l}</figcaption></figure>`).join('')}</div>`
      : '<p class="muted">Frente, lado y espalda cada pocas semanas, con la misma luz y a la misma hora. Se guardan solo en este teléfono y no salen en la copia normal de tus datos.</p>'}
    <div class="btn-row${list.length ? ' two' : ''} top-gap">
      <button type="button" class="btn" data-act="ph-new">Añadir fotos</button>
      ${list.length ? '<button type="button" class="btn ghost" data-act="ph-list">Ver y comparar</button>' : ''}
    </div>`;
}

/* ---------- añadir ---------- */
SHEETS['photo-new'] = {
  title: () => 'Nuevas fotos',
  render: (s) => `
    <label class="field"><span>Fecha</span><input id="ph-date" type="date" value="${s.date}" max="${today()}" data-change="ph-date"></label>
    <div class="ph-slots">${POSES.map(([p, l]) => `
      <label class="ph-slot${s.picks[p] ? ' has' : ''}">
        ${s.picks[p] === 'busy' ? '<span class="muted">Preparando…</span>' : s.picks[p] ? `<img src="${s.picks[p].thumb}" alt="${l}">` : '<span class="ph-plus" aria-hidden="true">+</span>'}
        <span class="ph-pose">${l}</span>
        <input type="file" accept="image/*" data-change="ph-pick" data-pose="${p}" aria-label="Foto de ${l.toLowerCase()}">
      </label>`).join('')}</div>
    <p class="hint">Puedes hacer la foto en ese momento o elegirla de la galería. Se reducen para que ocupen poco.</p>
    <div class="sheet-actions"><button type="button" class="btn primary" data-act="ph-save">Guardar</button></div>`,
};

CHANGES['ph-date'] = (el) => { const top = S.sheets[S.sheets.length - 1]; if (top?.type === 'photo-new') top.date = el.value || top.date; };
CHANGES['ph-pick'] = async (el) => {
  const top = S.sheets[S.sheets.length - 1];
  const file = el.files?.[0];
  if (!file || top?.type !== 'photo-new') return;
  const pose = el.dataset.pose;
  top.picks[pose] = 'busy';
  renderSheets();
  try {
    const img = await loadImage(file);
    top.picks[pose] = { full: resized(img, 1280, 0.82), thumb: resized(img, 240, 0.7) };
  } catch (e) {
    delete top.picks[pose];
    toast('No se ha podido leer esa imagen.');
  }
  renderSheets();
};

/* ---------- lista, una sesión y comparación ---------- */
SHEETS.photos = {
  title: () => 'Fotos de progreso',
  render: () => {
    const list = [...(sets || [])].reverse();
    return `
      ${list.length >= 2 ? '<button type="button" class="btn wide" data-act="ph-compare">Comparar dos fechas</button>' : ''}
      <ul class="list top-gap">${list.map((x) => `<li><button type="button" class="row ph-item" data-act="ph-open" data-id="${x.id}">
        <span class="row-main">${dateLong(x.date)}${x.shared ? ' <em class="tag">compartida</em>' : ''}</span>
        <span class="row-sub">${x.poses.map((p) => POSE_NAME[p]).join(', ')}</span>
        <span class="ph-mini">${x.poses.map((p) => `<img src="${x.thumbs[p]}" alt="">`).join('')}</span>
      </button></li>`).join('')}</ul>
      <p class="hint">Haz una copia de las fotos en Ajustes › Tus datos: van en un archivo aparte de la copia normal.</p>`;
  },
};

SHEETS['photo-set'] = {
  title: (s) => dateLong(s.set.date),
  render: (s) => `
    ${shareBox(s)}
    <div class="ph-full top-gap">${s.set.poses.map((p) => `<figure><img id="phf-${p}" src="${s.set.thumbs[p]}" alt="${POSE_NAME[p]}, ${dateShort(s.set.date)}"><figcaption>${POSE_NAME[p]}</figcaption></figure>`).join('')}</div>
    <div class="sheet-actions"><button type="button" class="btn danger ghost" data-act="ph-del">Borrar estas fotos</button></div>`,
  mount: async (s) => {
    for (const p of s.set.poses) {
      const src = await photo(s.set.id, p);
      const el = document.getElementById('phf-' + p);
      if (el && src) el.src = src;
    }
  },
};

SHEETS['photo-compare'] = {
  title: () => 'Comparar',
  render: (s) => {
    const opts = (sel) => [...sets].reverse().filter((x) => x.poses.includes(s.pose)).map((x) => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${dateShort(x.date)}</option>`).join('');
    const a = sets.find((x) => x.id === s.a);
    const b = sets.find((x) => x.id === s.b);
    const days = a && b ? Math.round((parseISO(b.date) - parseISO(a.date)) / 86400000) : null;
    return `
      <div class="chips" role="group" aria-label="Pose">${POSES.map(([p, l]) => `<button type="button" class="chip${s.pose === p ? ' on' : ''}" data-act="ph-pose" data-v="${p}" aria-pressed="${s.pose === p}">${l}</button>`).join('')}</div>
      <div class="ph-compare top-gap">
        ${[['a', a], ['b', b]].map(([k, x]) => `<figure>
          <select data-change="ph-which" data-k="${k}" aria-label="Fecha de la foto ${k === 'a' ? 'de la izquierda' : 'de la derecha'}">${opts(s[k])}</select>
          ${x && x.poses.includes(s.pose) ? `<img id="phc-${k}" src="${x.thumbs[s.pose]}" alt="${POSE_NAME[s.pose]}, ${dateShort(x.date)}">` : '<p class="muted">Sin foto de esta pose.</p>'}
        </figure>`).join('')}
      </div>
      ${s.a && s.a === s.b ? '<p class="hint">Solo hay una sesión con esta pose. Añade otra para comparar.</p>' : days != null ? `<p class="hint">${days >= 0 ? plural(days, 'día', 'días') + ' entre una y otra' : ''}${weightNear(a.date) && weightNear(b.date) ? ` · peso ${fmt(weightNear(a.date), 1)} → ${fmt(weightNear(b.date), 1)} kg` : ''}</p>` : ''}`;
  },
  mount: async (s) => {
    for (const k of ['a', 'b']) {
      const x = sets.find((y) => y.id === s[k]);
      if (!x || !x.poses.includes(s.pose)) continue;
      const src = await photo(x.id, s.pose);
      const el = document.getElementById('phc-' + k);
      if (el && src) el.src = src;
    }
  },
};

/* ---------- compartir con el entrenador ---------- */
const coach = () => myProfile()?.link;
const canShare = () => accessState() === 'active' && coach()?.status === 'active';

function shareBox(s) {
  const who = esc(coach()?.trainer_name || 'tu entrenador');
  if (s.busy) return `<p class="muted">${s.busy}</p>`;
  if (s.set.shared) {
    return `<div class="gate-wait"><p>Compartidas con <b>${who}</b>. Solo las ve tu entrenador mientras sigáis vinculados.</p>
      <button type="button" class="link" data-act="ph-unshare">Dejar de compartir</button></div>`;
  }
  if (!canShare()) return '';
  return `<button type="button" class="btn ghost wide" data-act="ph-share">Compartir con ${who}</button>
    <p class="hint">Se suben solo las fotos de esta sesión. Puedes dejar de compartirlas cuando quieras, y se borran del servidor si os desvinculáis.</p>`;
}

async function saveSet(set) {
  try { await store.photoPut('set:' + set.id, { id: set.id, date: set.date, poses: set.poses, thumbs: set.thumbs, at: set.at || null, shared: !!set.shared }); } catch (e) { /* sin almacén */ }
}

// El servidor manda: si el vínculo terminó, ya no hay nada compartido
async function syncShared() {
  if (!sets?.length) return;
  try {
    // Sin entrenador no queda nada compartido: el servidor las borra al terminar el vínculo
    const ids = new Set(coach() ? await rpc('client_photo_shared') : []);
    for (const x of sets) {
      if (!!x.shared !== ids.has(x.id)) { x.shared = ids.has(x.id); await saveSet(x); }
    }
  } catch (e) { /* sin conexión o sin la fase 6 en el servidor */ }
}

// Peso apuntado ese día o el más cercano dentro de 3 días
function weightNear(date) {
  for (let i = 0; i <= 3; i++) {
    for (const d of [addDays(date, -i), addDays(date, i)]) if (S.weights[d] != null) return S.weights[d];
  }
  return null;
}

// Para comparar: la más antigua y la más reciente que tengan esa pose
function pickPair(pose) {
  const withPose = sets.filter((x) => x.poses.includes(pose));
  return { a: withPose[0]?.id, b: withPose[withPose.length - 1]?.id };
}

CHANGES['ph-which'] = (el) => {
  const top = S.sheets[S.sheets.length - 1];
  if (top?.type !== 'photo-compare') return;
  top[el.dataset.k] = el.value;
  renderSheets();
};

Object.assign(ACTIONS, {
  'ph-new': () => pushSheet({ type: 'photo-new', date: today(), picks: {} }),
  'ph-save': async (el, top) => {
    const poses = POSES.map(([p]) => p).filter((p) => top.picks[p] && top.picks[p] !== 'busy');
    if (!poses.length) { toast('Añade al menos una foto.'); return; }
    const id = uid();
    const set = { id, date: top.date, poses, thumbs: Object.fromEntries(poses.map((p) => [p, top.picks[p].thumb])), at: new Date().toISOString() };
    try {
      for (const p of poses) await store.photoPut(`img:${id}:${p}`, top.picks[p].full);
      await store.photoPut('set:' + id, set);
    } catch (e) {
      toast('No hay espacio para guardar las fotos.');
      return;
    }
    await loadPhotoSets(true);
    popSheet();
    fillPhotoCard();
    toast(plural(poses.length, 'foto guardada', 'fotos guardadas'));
  },
  'ph-list': async () => { await loadPhotoSets(); pushSheet({ type: 'photos' }); await syncShared(); renderSheets(); },
  'ph-share': async (el, top) => {
    const set = top.set;
    top.busy = 'Subiendo las fotos…';
    renderSheets();
    try {
      for (const p of set.poses) {
        await rpc('client_photo_share', { p_set: set.id, p_date: set.date, p_pose: p, p_thumb: set.thumbs[p], p_image: await photo(set.id, p) });
      }
      set.shared = true;
      await saveSet(set);
      toast(`Compartidas con ${coach()?.trainer_name || 'tu entrenador'}`);
    } catch (e) {
      try { await rpc('client_photo_unshare', { p_set: set.id }); } catch (e2) { /* nada */ }
      toast(errorText(e));
    }
    top.busy = '';
    renderSheets();
  },
  'ph-unshare': async (el, top) => {
    try {
      await rpc('client_photo_unshare', { p_set: top.set.id });
      top.set.shared = false;
      await saveSet(top.set);
      renderSheets();
      toast('Ya no se comparten');
    } catch (e) { toast(errorText(e)); }
  },
  'ph-open': (el) => { const set = sets.find((x) => x.id === el.dataset.id); if (set) pushSheet({ type: 'photo-set', set }); },
  'ph-del': (el, top) => {
    const set = top.set;
    pushSheet({
      type: 'confirm', title: 'Borrar fotos', text: `Se borrarán las fotos del ${dateLong(set.date)}${set.shared ? ', también las que compartiste con tu entrenador' : ''}. Si no tienes una copia de las fotos, no se podrán recuperar.`, ok: 'Borrar', danger: true,
      onOk: async () => {
        if (set.shared) { try { await rpc('client_photo_unshare', { p_set: set.id }); } catch (e) { toast('No se han podido borrar del servidor: ' + errorText(e)); return; } }
        await store.photoDel(['set:' + set.id, ...set.poses.map((p) => `img:${set.id}:${p}`)]);
        set.poses.forEach((p) => imgCache.delete(`img:${set.id}:${p}`));
        await loadPhotoSets(true);
        const list = S.sheets.find((x) => x.type === 'photos');
        if (list) popTo(list); else popSheet();
        fillPhotoCard();
        toast('Fotos borradas');
      },
    });
  },
  'ph-compare': () => {
    const pose = 'frente';
    pushSheet({ type: 'photo-compare', pose, ...pickPair(pose) });
  },
  'ph-pose': (el, top) => { top.pose = el.dataset.v; Object.assign(top, pickPair(top.pose)); renderSheets(); },
});

/* ---------- copia de las fotos (archivo aparte) ---------- */
export async function exportPhotos() {
  const list = await loadPhotoSets(true);
  if (!list.length) { toast('No hay fotos guardadas.'); return; }
  const out = [];
  for (const x of list) {
    const images = {};
    for (const p of x.poses) images[p] = await store.photoGet(`img:${x.id}:${p}`);
    out.push({ ...x, images });
  }
  const json = JSON.stringify({ app: 'fitness-app-fotos', version: 1, exportedAt: new Date().toISOString(), sets: out });
  await deliverFile(`fitness-fotos-${today()}.json`, json, 'application/json');
}

export function importPhotos() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.json,application/json';
  inp.addEventListener('change', async () => {
    const file = inp.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'fitness-app-fotos' || !Array.isArray(data.sets)) throw new Error('formato');
      let n = 0;
      for (const x of data.sets) {
        if (!x?.id || !x.date || !x.images) continue;
        const poses = POSES.map(([p]) => p).filter((p) => typeof x.images[p] === 'string' && x.images[p].startsWith('data:image/'));
        if (!poses.length) continue;
        for (const p of poses) await store.photoPut(`img:${x.id}:${p}`, x.images[p]);
        await store.photoPut('set:' + x.id, { id: x.id, date: x.date, poses, thumbs: x.thumbs || {}, at: x.at || null });
        n++;
      }
      await loadPhotoSets(true);
      fillPhotoCard();
      toast(n ? `${plural(n, 'sesión de fotos restaurada', 'sesiones de fotos restauradas')}` : 'El archivo no tenía fotos.');
    } catch (e) {
      toast('Ese archivo no es una copia de fotos de esta app.');
    }
  });
  inp.click();
}
