// Mapa del cuerpo (frente y espalda, hombre y mujer) con los 17 músculos de la app.
// El cuerpo entero se pinta como una silueta y, encima, cada músculo con un color según cuánto se ha trabajado.
// Dibujo basado en «react-native-body-highlighter» (licencia MIT), adaptado: ver js/bodydata.js.
import { MUSCLE_NAME } from './exercises.js';
import { BODY } from './bodydata.js';

export const FRONT_MUSCLES = ['pecho', 'abdominales', 'delt-ant', 'biceps', 'antebrazo', 'cuadriceps', 'aductores'];
export const BACK_MUSCLES = ['dorsal', 'espalda-alta', 'trapecio', 'lumbares', 'delt-post', 'triceps', 'gluteos', 'isquios', 'gemelos'];

// Degradados de cada nivel (los colores salen de las variables del tema)
const GRAD = [0, 1, 2, 3].map((l) => `<radialGradient id="bmg${l}" cx=".4" cy=".32" r=".85"><stop offset="0" style="stop-color:var(--map-${l}-hi)"/><stop offset="1" style="stop-color:var(--map-${l})"/></radialGradient>`).join('');

const level = (levels, list) => Math.max(0, ...list.split(',').map((m) => levels[m] || 0));
const tf = (t) => (t ? ` transform="${t}"` : '');

// levels: { músculo: 0..3 }. view: 'front' | 'back'. model: 'hombre' | 'mujer'
export function bodySVG(view, levels = {}, label = '', model = 'hombre') {
  const fig = BODY[`${model === 'mujer' ? 'mujer' : 'hombre'}-${view === 'back' ? 'back' : 'front'}`];
  const key = (model === 'mujer' ? 'm' : 'h') + (view === 'back' ? 'b' : 'f');
  let under = '', over = '';
  fig.p.forEach((p, i) => {
    if (!p.o) under += `<path d="${p.d}"${tf(p.t)}/>`;
    if (p.delt) {
      // Hombro: la cabeza de dentro (anterior o posterior) y la lateral, cada una con su color
      const a = level(levels, p.delt), b = level(levels, 'delt-lat');
      over += `<g${tf(p.t)}><clipPath id="bmi${key}${i}"><path d="${p.ci}"/></clipPath><clipPath id="bmo${key}${i}"><path d="${p.co}"/></clipPath>`
        + `<path d="${p.d}" clip-path="url(#bmi${key}${i})" class="bm-${a}"/><path d="${p.d}" clip-path="url(#bmo${key}${i})" class="bm-${b}"/><path d="${p.cut}" class="bm-cut"/></g>`;
    } else if (p.m) {
      over += `<path d="${p.d}"${tf(p.t)} class="bm-${level(levels, p.m)}"/>`;
    }
  });
  const lines = fig.lines.map((d) => `<path d="${d}" class="bm-line"/>`).join('');
  return `<svg class="bodymap" viewBox="${fig.vb}" role="img" aria-label="${label}"><defs>${GRAD}</defs><g class="bm-under">${under}</g><g class="bm-over">${over}${lines}</g></svg>`;
}

// Qué cara del cuerpo se ha trabajado más (para las miniaturas)
export function dominantView(levels) {
  const sum = (list) => list.reduce((a, m) => a + (levels[m] || 0), 0);
  return sum(BACK_MUSCLES) > sum(FRONT_MUSCLES) ? 'back' : 'front';
}

export const musclesLabel = (levels) => {
  const list = Object.entries(levels).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([m]) => MUSCLE_NAME[m]);
  return list.length ? 'Músculos trabajados: ' + list.join(', ') : 'Ningún músculo trabajado';
};

// Frente y espalda, uno al lado del otro
export function bodyPair(levels, cls = '', model = 'hombre') {
  const label = musclesLabel(levels);
  return `<div class="bm-pair ${cls}">
    <figure>${bodySVG('front', levels, label + ' (frente)', model)}<figcaption>Frente</figcaption></figure>
    <figure>${bodySVG('back', levels, label + ' (espalda)', model)}<figcaption>Espalda</figcaption></figure>
  </div>`;
}
