// Pruebas del lector de códigos de barras con imágenes sintéticas (barras, desenfoque y ruido)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeGray, checksumOk } from '../js/barcode.js';

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PAR = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

function checkDigit(d) {
  let s = 0;
  [...d].reverse().forEach((c, k) => { s += Number(c) * (k % 2 === 0 ? 3 : 1); });
  return String((10 - (s % 10)) % 10);
}
function ean13Bits(code12) {
  const code = code12 + checkDigit(code12);
  const p = PAR[Number(code[0])];
  let bits = '101';
  for (let i = 0; i < 6; i++) bits += (p[i] === 'L' ? L : G)[Number(code[i + 1])];
  bits += '01010';
  for (let i = 7; i < 13; i++) bits += R[Number(code[i])];
  return { code, bits: bits + '101' };
}

// Pinta el código en una imagen gris con desenfoque y ruido deterministas
function render(bits, module, { blur = 1, noise = 8, seed = 1 } = {}) {
  const w = Math.round(bits.length * module * 1.4) + 20;
  const h = 120;
  const x0 = (w - bits.length * module) / 2;
  const row = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let dark = 0;
    for (let sx = 0; sx < 4; sx++) { // supermuestreo para bordes suaves
      const i = Math.floor((x + sx / 4 - x0) / module);
      if (i >= 0 && i < bits.length && bits[i] === '1') dark++;
    }
    row[x] = 235 - (dark / 4) * 190;
  }
  const r = Math.max(1, Math.round(blur));
  const blurred = row.map((_, x) => {
    let s = 0, n = 0;
    for (let k = -r; k <= r; k++) { const v = row[Math.min(w - 1, Math.max(0, x + k))]; s += v; n++; }
    return s / n;
  });
  let st = seed;
  const rnd = () => { st = (st * 1103515245 + 12345) % 2147483648; return st / 2147483648 - 0.5; };
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = Math.max(0, Math.min(255, blurred[x] + rnd() * 2 * noise));
  return { g, w, h };
}

test('dígito de control EAN-13 y EAN-8', () => {
  assert.equal(checksumOk('8410000000017'), checkDigit('841000000001') === '7');
  assert.equal(checksumOk('4006381333931'), true);
  assert.equal(checksumOk('4006381333932'), false);
  assert.equal(checksumOk('96385074'), true);
});

test('lee códigos EAN-13 con distintos tamaños, desenfoque y ruido', () => {
  const codes = ['841000000001', '400638133393', '501234567890', '761234567890', '123456789012'];
  let ok = 0, wrong = 0, total = 0;
  codes.forEach((c, i) => {
    for (const module of [3, 4, 6]) {
      const { code, bits } = ean13Bits(c);
      const img = render(bits, module, { blur: 0.8 + (i % 3) * 0.4, noise: 6 + i * 2, seed: i * 7 + module });
      const got = decodeGray(img.g, img.w, img.h, { lines: 12, vertical: false });
      total++;
      if (got === code) ok++; else if (got) wrong++;
    }
  });
  assert.equal(wrong, 0, 'nunca debe dar un código equivocado');
  assert.ok(ok / total >= 0.9, `leídos ${ok} de ${total}`);
});

test('una imagen sin código no devuelve nada', () => {
  const w = 300, h = 100;
  const g = new Uint8Array(w * h).fill(200);
  assert.equal(decodeGray(g, w, h), null);
});
