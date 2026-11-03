// Almacenamiento en el propio dispositivo (IndexedDB), clave → valor.
const DB_NAME = 'fitness-app';
const STORE = 'kv';
const PHOTOS = 'photos'; // fotos de progreso, aparte de los datos (no van en la copia .json)
let dbp = null;

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 2);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains(PHOTOS)) db.createObjectStore(PHOTOS);
      };
      r.onsuccess = () => {
        // Si otra pestaña abre una versión más nueva, se cierra esta conexión para no bloquearla
        r.result.onversionchange = () => { r.result.close(); dbp = null; };
        resolve(r.result);
      };
      r.onerror = () => reject(r.error);
    });
  }
  return dbp;
}

function tx(mode, fn, name = STORE) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(name, mode);
    const st = t.objectStore(name);
    const out = fn(st);
    t.oncomplete = () => resolve(typeof IDBRequest !== 'undefined' && out instanceof IDBRequest ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export async function loadAll() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const out = {};
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (c) { out[c.key] = c.value; c.continue(); } else resolve(out);
    };
    req.onerror = () => reject(req.error);
  });
}

export const put = (key, value) => tx('readwrite', (st) => { st.put(value, key); });
export const del = (key) => tx('readwrite', (st) => { st.delete(key); });
export const get = (key) => tx('readonly', (st) => st.get(key));
// Borra todo; con «keep», se conservan las claves que empiezan por ese prefijo (p. ej. la sesión de la cuenta)
export function clearAll(keep) {
  if (!keep) return tx('readwrite', (st) => { st.clear(); });
  return tx('readwrite', (st) => {
    const req = st.openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return;
      if (!String(c.key).startsWith(keep)) c.delete();
      c.continue();
    };
  });
}

export async function putMany(entries) {
  return tx('readwrite', (st) => { for (const [k, v] of entries) st.put(v, k); });
}

/* ---------- fotos ---------- */
// Claves: «set:<id>» → { id, date, poses: [...], thumbs: {pose: dataURL} }; «img:<id>:<pose>» → dataURL
export const photoPut = (key, value) => tx('readwrite', (st) => { st.put(value, key); }, PHOTOS);
export const photoGet = (key) => tx('readonly', (st) => st.get(key), PHOTOS);
export const photoDel = (keys) => tx('readwrite', (st) => { for (const k of keys) st.delete(k); }, PHOTOS);
export const photoClear = () => tx('readwrite', (st) => { st.clear(); }, PHOTOS);
export const photoSets = () => tx('readonly', (st) => st.getAll(IDBKeyRange.bound('set:', 'set:\uffff')), PHOTOS);

// Pide al sistema que no borre los datos aunque falte espacio
export async function askPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch (e) { /* sin soporte */ }
  return false;
}
