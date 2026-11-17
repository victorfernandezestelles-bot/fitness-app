export const APP_VERSION = '0.23.0';

/* ---------- utilidades ---------- */

export const $ = (s, el = document) => el.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Quita los caracteres con los que un texto podría colarse como HTML (para identificadores, unidades y demás textos cortos)
export const plain = (s) => String(s ?? '').replace(/[<>"]/g, '');
// Limpia datos que no ha creado esta app en este momento (una copia restaurada, la ficha de un cliente, una plantilla
// del entrenador): solo los campos de texto libre conservan cualquier carácter, y esos siempre se pintan con esc()
const FREE_TEXT = new Set(['name', 'brand', 'note', 'notes']);
const FREE_MAPS = new Set(['exNotes']);
export function cleanData(v, key = '', free = false) {
  if (typeof v === 'string') return free || FREE_TEXT.has(key) ? v : plain(v);
  if (Array.isArray(v)) return v.map((x) => cleanData(x, key, free));
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) { if (k !== '__proto__') out[plain(k)] = cleanData(x, k, FREE_MAPS.has(key)); }
    return out;
  }
  return v;
}
export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const isImageData = (s) => typeof s === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(s);
export const num = (v) => {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
export const fmt = (n, d = 0) => (n == null || Number.isNaN(n) ? '–' : Number(n).toLocaleString('es-ES', { maximumFractionDigits: d }));
export const inputVal = (n, d = 2) => (n == null ? '' : String(Math.round(n * 10 ** d) / 10 ** d).replace('.', ','));
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Día local (AAAA-MM-DD) de una marca de tiempo del servidor, que viene en UTC: cortarla a 10 caracteres daría el día anterior de madrugada
export const localDay = (ts) => {
  if (isDate(ts)) return ts; // ya es un día
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? String(ts || '').slice(0, 10) : iso(d);
};
export const today = () => iso(new Date());
export const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const dateLong = (s) => new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(parseISO(s));
export const dateShort = (s) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(parseISO(s));
export function dayLabel(s) {
  const t = today();
  if (s === t) return 'Hoy';
  if (s === addDays(t, -1)) return 'Ayer';
  if (s === addDays(t, 1)) return 'Mañana';
  const l = dateLong(s);
  return l.charAt(0).toUpperCase() + l.slice(1);
}

export function niceStep(range, target) {
  const raw = range / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * pow;
}

/* Duración del entrenamiento */
export const clockLabel = (ms) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(sec).padStart(2, '0')}`;
};
export const durLabel = (ms) => {
  const min = Math.round(ms / 60000);
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min` : `${min} min`;
};
// Solo cuenta si se empezó y terminó el mismo día (los entrenos apuntados a posteriori no tienen duración real)

export const restLabel = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

export const csvText = (s) => {
  let t = String(s ?? '');
  if (/^[=+\-@\t\r]/.test(t) && !/^-?\d+([.,]\d+)?$/.test(t)) t = "'" + t; // que Excel no lo tome por una fórmula
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
// Día corto de una marca de tiempo del servidor, o «–» si no hay
export const dayOrDash = (ts) => (ts ? dateShort(localDay(ts)) : '–');
// Número con signo: +1,2 / −0,4 / ±0
export const signed = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '±') + fmt(Math.abs(v), d);
export const csvNum = (n, d = 1) => (n == null ? '' : (Math.round(n * 10 ** d) / 10 ** d).toString().replace('.', ','));

// .csv para Excel en español: con BOM (para los acentos) y saltos de línea de Windows
export const deliverCsv = (name, rows) => deliverFile(`${name}-${today()}.csv`, '\ufeff' + rows.join('\r\n'), 'text/csv');

export async function deliverFile(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const touch = window.matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare) {
    const file = new File([blob], filename, { type: mime });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return true;
      } catch (e) {
        if (e.name === 'AbortError') return false;
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
