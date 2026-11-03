import { MUSCLE_NAME } from './exercises.js';

// Mapa del cuerpo (frente y espalda) con los 17 músculos de la app.
// Dibujo propio y simplificado: cada músculo es una pieza que se colorea según cuánto se ha trabajado.
// Las piezas se definen para el lado izquierdo del dibujo y se reflejan para el derecho.

// [músculo o null (parte sin músculo), trazado, ¿solo una vez (centro)?]
const FRONT = [
  [null, 'M100,12 C109,12 116,20 116,31 C116,43 109,52 100,52 C91,52 84,43 84,31 C84,20 91,12 100,12 Z', true],
  [null, 'M93,50 L107,50 L109,64 L91,64 Z', true],
  ['trapecio', 'M91,57 C86,62 78,66 70,68 L92,66 Z'],
  ['delt-lat', 'M68,68 C56,70 48,80 47,96 C47,104 49,110 52,114 C54,104 56,94 60,86 C62,78 65,72 68,68 Z'],
  ['delt-ant', 'M70,68 C64,74 60,84 58,96 C57,104 58,110 60,114 C66,112 70,106 73,98 C76,90 77,80 77,70 Z'],
  ['pecho', 'M79,70 C86,71 93,72 99,72 L99,114 C92,120 82,120 75,112 C74,100 76,84 79,70 Z'],
  ['biceps', 'M51,118 C47,132 46,146 48,160 L58,162 C62,150 64,134 64,118 C60,121 55,121 51,118 Z'],
  ['antebrazo', 'M47,166 C42,184 40,202 41,220 L50,222 C54,204 58,186 59,166 Z'],
  [null, 'M41,225 C38,233 38,243 42,249 C46,251 50,247 50,239 L50,227 Z'],
  ['abdominales', 'M74,116 C79,120 82,122 85,122 L84,184 C79,180 76,170 75,160 C73,146 73,130 74,116 Z'],
  ['abdominales', 'M87,122 C94,124 106,124 113,122 L115,184 C110,192 90,192 85,184 Z', true],
  [null, 'M78,188 C88,197 112,197 122,188 L130,218 L70,218 Z', true],
  ['cuadriceps', 'M71,222 C66,250 66,282 72,314 L88,314 C91,294 93,266 94,240 C94,232 92,226 88,222 Z'],
  ['aductores', 'M91,224 L99,228 L99,256 C98,274 96,288 93,300 C94,280 96,258 96,240 C96,232 94,227 91,224 Z'],
  [null, 'M72,318 C76,314 86,314 89,318 C90,324 86,328 80,328 C74,328 71,324 72,318 Z'],
  ['gemelos', 'M72,332 C68,354 69,378 74,404 L84,404 C88,378 90,354 87,332 Z'],
  [null, 'M73,408 L86,408 L88,420 C82,424 72,424 68,420 Z'],
];
const BACK = [
  [null, 'M100,12 C109,12 116,20 116,31 C116,43 109,52 100,52 C91,52 84,43 84,31 C84,20 91,12 100,12 Z', true],
  ['trapecio', 'M100,52 L91,57 C84,63 76,67 68,69 L86,80 L100,118 L114,80 L132,69 C124,67 116,63 109,57 Z', true],
  ['delt-lat', 'M68,68 C56,70 48,80 47,96 C47,104 49,110 52,114 C54,104 56,94 60,86 C62,78 65,72 68,68 Z'],
  ['delt-post', 'M70,70 C64,75 60,84 58,96 C57,104 58,110 60,114 C66,112 70,106 73,98 C76,90 77,82 76,74 Z'],
  ['espalda-alta', 'M79,76 L86,83 L98,118 C92,122 84,122 78,116 C75,104 75,88 79,76 Z'],
  ['dorsal', 'M76,119 C83,124 92,125 99,123 L99,150 C94,160 88,167 82,171 C76,160 73,146 73,133 C73,127 74,122 76,119 Z'],
  ['lumbares', 'M88,158 C94,154 106,154 112,158 L116,190 L84,190 Z', true],
  ['triceps', 'M51,118 C47,132 46,146 48,160 L58,162 C62,150 64,134 64,118 C60,121 55,121 51,118 Z'],
  ['antebrazo', 'M47,166 C42,184 40,202 41,220 L50,222 C54,204 58,186 59,166 Z'],
  [null, 'M41,225 C38,233 38,243 42,249 C46,251 50,247 50,239 L50,227 Z'],
  ['gluteos', 'M73,194 C70,212 74,232 86,238 C94,240 99,234 99,220 L99,194 Z'],
  ['isquios', 'M71,242 C67,268 68,294 74,316 L88,316 C92,294 95,268 97,244 C90,246 80,246 71,242 Z'],
  ['aductores', 'M96,246 L99,248 L99,292 C98,280 97,262 96,246 Z'],
  [null, 'M72,320 C76,317 86,317 89,320 C90,325 86,328 80,328 C74,328 71,325 72,320 Z'],
  ['gemelos', 'M71,331 C64,347 66,366 73,380 L87,380 C91,366 92,347 88,331 Z'],
  [null, 'M74,383 L86,383 L85,405 L76,405 Z'],
  [null, 'M73,408 L86,408 L88,420 C82,424 72,424 68,420 Z'],
];

export const FRONT_MUSCLES = ['pecho', 'abdominales', 'delt-ant', 'biceps', 'antebrazo', 'cuadriceps', 'aductores'];
export const BACK_MUSCLES = ['dorsal', 'espalda-alta', 'trapecio', 'lumbares', 'delt-post', 'triceps', 'gluteos', 'isquios', 'gemelos'];

// levels: { músculo: 0..3 }. view: 'front' | 'back'
export function bodySVG(view, levels = {}, label = '') {
  const parts = view === 'back' ? BACK : FRONT;
  const piece = ([m, d]) => `<path d="${d}" class="${m ? 'bm-m bm-' + (levels[m] || 0) : 'bm-x'}"${m ? ` data-m="${m}"` : ''}/>`;
  const left = parts.map(piece).join('');
  const right = parts.filter((p) => !p[2]).map(piece).join('');
  // Marcas del abdomen y de la columna, para que se lea mejor el dibujo
  const marks = view === 'back'
    ? '<path class="bm-line" d="M100,56 L100,190"/>'
    : '<path class="bm-line" d="M100,124 L100,188 M88,141 L112,141 M88,158 L112,158 M87,173 L113,173"/>';
  return `<svg class="bodymap" viewBox="36 8 128 420" role="img" aria-label="${label}"><g>${left}</g><g transform="translate(200,0) scale(-1,1)">${right}</g>${marks}</svg>`;
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
export function bodyPair(levels, cls = '') {
  const label = musclesLabel(levels);
  return `<div class="bm-pair ${cls}">
    <figure>${bodySVG('front', levels, label + ' (frente)')}<figcaption>Frente</figcaption></figure>
    <figure>${bodySVG('back', levels, label + ' (espalda)')}<figcaption>Espalda</figcaption></figure>
  </div>`;
}
