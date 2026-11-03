export const APP_VERSION = '0.12.0';

/* ---------- utilidades ---------- */

export const $ = (s, el = document) => el.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

export const SVGNS = 'http://www.w3.org/2000/svg';
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
  const t = String(s ?? '');
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
export const csvNum = (n, d = 1) => (n == null ? '' : (Math.round(n * 10 ** d) / 10 ** d).toString().replace('.', ','));

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
