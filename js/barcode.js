// Lector de códigos de barras EAN-13 / EAN-8 / UPC-A sin dependencias.
// Lee varias líneas horizontales y verticales de una imagen en escala de grises.

const L_PAT = [
  [3, 2, 1, 1], [2, 2, 2, 1], [2, 1, 2, 2], [1, 4, 1, 1], [1, 1, 3, 2],
  [1, 2, 3, 1], [1, 1, 1, 4], [1, 3, 1, 2], [1, 2, 1, 3], [3, 1, 1, 2],
];
const G_PAT = L_PAT.map((p) => [...p].reverse());
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
const MAX_DIST = 1.4;

// barsFirst: true si el primer elemento del dígito es barra (lado derecho), false si es espacio (lado izquierdo).
// Compensa que la tinta o el desenfoque engorden las barras y adelgacen los espacios.
function matchDigit(w, allowG, barsFirst) {
  const sum = w[0] + w[1] + w[2] + w[3];
  if (!sum) return null;
  const n = [w[0] * 7 / sum, w[1] * 7 / sum, w[2] * 7 / sum, w[3] * 7 / sum];
  const sign = barsFirst ? [1, -1, 1, -1] : [-1, 1, -1, 1];
  let best = null;
  let bestD = Infinity;
  const test = (pats, par) => {
    for (let d = 0; d < 10; d++) {
      const p = pats[d];
      const e = [n[0] - p[0], n[1] - p[1], n[2] - p[2], n[3] - p[3]];
      let b = (e[0] * sign[0] + e[1] * sign[1] + e[2] * sign[2] + e[3] * sign[3]) / 4;
      b = Math.max(-0.35, Math.min(0.35, b));
      const dist = Math.abs(e[0] - b * sign[0]) + Math.abs(e[1] - b * sign[1]) + Math.abs(e[2] - b * sign[2]) + Math.abs(e[3] - b * sign[3]);
      if (dist < bestD) { bestD = dist; best = { d, par }; }
    }
  };
  test(L_PAT, 'L');
  if (allowG) test(G_PAT, 'G');
  return bestD <= MAX_DIST ? best : null;
}

function guardOk(widths, m) {
  for (const w of widths) if (w < m * 0.4 || w > m * 2.2) return false;
  return true;
}

export function checksumOk(code) {
  if (!/^\d+$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop();
  let sum = 0;
  // Pesos 3,1,3,1... empezando por el dígito más a la derecha (sin contar el control)
  for (let i = digits.length - 1, k = 0; i >= 0; i--, k++) sum += digits[i] * (k % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === check;
}

function decodeEAN13(seg) {
  const total = seg.reduce((a, b) => a + b, 0);
  const m = total / 95;
  if (!guardOk(seg.slice(0, 3), m) || !guardOk(seg.slice(27, 32), m) || !guardOk(seg.slice(56, 59), m)) return null;
  let parity = '';
  let left = '';
  for (let k = 0; k < 6; k++) {
    const r = matchDigit(seg.slice(3 + 4 * k, 7 + 4 * k), true, false);
    if (!r) return null;
    parity += r.par;
    left += r.d;
  }
  let right = '';
  for (let k = 0; k < 6; k++) {
    const r = matchDigit(seg.slice(32 + 4 * k, 36 + 4 * k), false, true);
    if (!r) return null;
    right += r.d;
  }
  const first = PARITY.indexOf(parity);
  if (first < 0) return null;
  const code = first + left + right;
  return checksumOk(code) ? code : null;
}

function decodeEAN8(seg) {
  const total = seg.reduce((a, b) => a + b, 0);
  const m = total / 67;
  if (!guardOk(seg.slice(0, 3), m) || !guardOk(seg.slice(19, 24), m) || !guardOk(seg.slice(40, 43), m)) return null;
  let code = '';
  for (let k = 0; k < 4; k++) {
    const r = matchDigit(seg.slice(3 + 4 * k, 7 + 4 * k), false, false);
    if (!r) return null;
    code += r.d;
  }
  for (let k = 0; k < 4; k++) {
    const r = matchDigit(seg.slice(24 + 4 * k, 28 + 4 * k), false, true);
    if (!r) return null;
    code += r.d;
  }
  return checksumOk(code) ? code : null;
}

// Convierte una línea de grises en anchos de tramos alternos (claro/oscuro),
// con precisión de subpíxel (interpolando dónde cruza el umbral).
function lineToRuns(gray) {
  const n = gray.length;
  // Suavizado ligero para quitar ruido
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = gray[i > 0 ? i - 1 : 0], b = gray[i], c = gray[i < n - 1 ? i + 1 : n - 1];
    s[i] = (a + 2 * b + c) / 4;
  }
  let gmin = 255, gmax = 0;
  for (let i = 0; i < n; i++) { if (s[i] < gmin) gmin = s[i]; if (s[i] > gmax) gmax = s[i]; }
  const runs = [];
  const colors = [];
  if (gmax - gmin < 30) return { runs, colors };
  // Picos y valles con histéresis: aguanta barras finas emborronadas que no llegan al umbral global
  const delta = Math.max(14, (gmax - gmin) * 0.16);
  const ext = []; // [indice, valor, esMaximo]
  // Dirección inicial: la primera variación mayor que delta dice si empezamos en claro o en oscuro
  let hiV = s[0], hiI = 0, loV = s[0], loI = 0, start = n;
  let lookMax = true, ei = 0, ev = s[0];
  for (let i = 1; i < n; i++) {
    const v = s[i];
    if (v > hiV) { hiV = v; hiI = i; }
    if (v < loV) { loV = v; loI = i; }
    if (hiV - v > delta && hiI < i) { ext.push([hiI, hiV, true]); lookMax = false; ev = v; ei = i; start = i + 1; break; }
    if (v - loV > delta && loI < i) { ext.push([loI, loV, false]); lookMax = true; ev = v; ei = i; start = i + 1; break; }
  }
  for (let i = start; i < n; i++) {
    const v = s[i];
    if (lookMax) {
      if (v > ev) { ev = v; ei = i; } else if (ev - v > delta) { ext.push([ei, ev, true]); lookMax = false; ev = v; ei = i; }
    } else {
      if (v < ev) { ev = v; ei = i; } else if (v - ev > delta) { ext.push([ei, ev, false]); lookMax = true; ev = v; ei = i; }
    }
  }
  ext.push([ei, ev, lookMax]);
  if (ext.length < 3) return { runs, colors };
  // Un borde entre cada par de extremos consecutivos
  let lastEdge = 0;
  for (let k = 0; k < ext.length - 1; k++) {
    const [ia, va, aMax] = ext[k];
    const [ib, vb] = ext[k + 1];
    // Borde en el punto de máxima pendiente (insensible al desenfoque), con ajuste subpíxel
    let edge = (ia + ib) / 2;
    let gBest = -1, gi = ia;
    for (let i = ia; i < ib; i++) {
      const g = Math.abs(s[i + 1] - s[i]);
      if (g > gBest) { gBest = g; gi = i; }
    }
    if (gBest > 0) {
      const gm = gi > ia ? Math.abs(s[gi] - s[gi - 1]) : gBest;
      const gp = gi + 1 < ib ? Math.abs(s[gi + 2] - s[gi + 1]) : gBest;
      const den = gm - 2 * gBest + gp;
      const off = den < 0 ? 0.5 * (gm - gp) / den : 0;
      edge = gi + 0.5 + Math.max(-0.5, Math.min(0.5, off));
    }
    runs.push(edge - lastEdge);
    colors.push(aMax ? 0 : 1); // antes del borde: claro si venimos de un máximo
    lastEdge = edge;
  }
  runs.push(n - lastEdge);
  colors.push(ext[ext.length - 1][2] ? 0 : 1);
  return { runs, colors };
}

function decodeRuns(runs, colors) {
  const tryAt = (i, len, fn) => {
    if (i + len > runs.length) return null;
    const seg = runs.slice(i, i + len);
    const m = seg.reduce((a, b) => a + b, 0) / (len === 59 ? 95 : 67);
    // Zona en blanco antes y después del código
    const before = i > 0 ? runs[i - 1] : m * 6;
    const after = i + len < runs.length ? runs[i + len] : m * 6;
    if (before < m * 1.8 || after < m * 1.8) return null;
    return fn(seg) || fn([...seg].reverse());
  };
  for (let i = 0; i < runs.length; i++) {
    if (colors[i] !== 1) continue;
    const a = tryAt(i, 59, decodeEAN13);
    if (a) return a;
    const b = tryAt(i, 43, decodeEAN8);
    if (b) return b;
  }
  return null;
}

export function decodeLine(gray) {
  const { runs, colors } = lineToRuns(gray);
  if (runs.length < 43) return null;
  return decodeRuns(runs, colors);
}

// gray: Uint8Array w*h. Devuelve el código que más líneas coinciden en leer (mínimo 2) o null.
export function decodeGray(gray, w, h, opts = {}) {
  const votes = new Map();
  const lines = opts.lines || 14;
  const vote = (code) => {
    if (!code) return;
    votes.set(code, (votes.get(code) || 0) + 1);
  };
  const row = new Uint8Array(w);
  for (let k = 0; k < lines; k++) {
    const y = Math.round(h * (0.2 + 0.6 * (k / (lines - 1))));
    row.set(gray.subarray(y * w, y * w + w));
    vote(decodeLine(row));
  }
  if (opts.vertical !== false) {
    const col = new Uint8Array(h);
    for (let k = 0; k < lines; k++) {
      const x = Math.round(w * (0.2 + 0.6 * (k / (lines - 1))));
      for (let y = 0; y < h; y++) col[y] = gray[y * w + x];
      vote(decodeLine(col));
    }
  }
  let best = null, bestN = 0;
  for (const [code, n] of votes) if (n > bestN) { best = code; bestN = n; }
  return bestN >= (opts.minVotes || 2) ? best : null;
}

export function imageDataToGray(img) {
  const { data, width, height } = img;
  const g = new Uint8Array(width * height);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) {
    g[j] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
  }
  return g;
}
