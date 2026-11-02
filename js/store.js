// Almacenamiento en el propio dispositivo (IndexedDB), clave → valor.
const DB_NAME = 'fitness-app';
const STORE = 'kv';
let dbp = null;

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  return dbp;
}

function tx(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const st = t.objectStore(STORE);
    const out = fn(st);
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
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
export const clearAll = () => tx('readwrite', (st) => { st.clear(); });

export async function putMany(entries) {
  return tx('readwrite', (st) => { for (const [k, v] of entries) st.put(v, k); });
}

// Pide al sistema que no borre los datos aunque falte espacio
export async function askPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch (e) { /* sin soporte */ }
  return false;
}
