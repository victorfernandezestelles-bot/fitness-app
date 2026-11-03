// Cada acción, hoja, entrada, cambio, formulario y vista se registra con un nombre único en toda la app:
// si dos módulos usan el mismo, el que se carga después pisa al otro sin avisar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const dir = new URL('../js/', import.meta.url).pathname;
const KINDS = ['ACTIONS', 'SHEETS', 'INPUTS', 'CHANGES', 'FORMS', 'VIEWS'];

function names(src) {
  const out = [];
  for (const kind of KINDS) {
    for (const m of src.matchAll(new RegExp(`${kind}(?:\\['([^']+)'\\]|\\.([A-Za-z_]\\w*))\\s*=`, 'g'))) out.push(`${kind}:${m[1] || m[2]}`);
    for (const m of src.matchAll(new RegExp(`Object\\.assign\\(${kind},\\s*\\{`, 'g'))) {
      let i = m.index + m[0].length, depth = 1;
      const start = i;
      while (depth && i < src.length) { const c = src[i]; if ('{(['.includes(c)) depth++; else if ('})]'.includes(c)) depth--; i++; }
      for (const line of src.slice(start, i - 1).split('\n')) {
        const k = line.match(/^ {2}(?:'([^']+)'|([A-Za-z_]\w*))\s*:/);
        if (k) out.push(`${kind}:${k[1] || k[2]}`);
      }
    }
  }
  return out;
}

test('ningún nombre registrado se repite entre módulos', () => {
  const seen = new Map();
  const dups = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    for (const n of new Set(names(fs.readFileSync(path.join(dir, f), 'utf8')))) {
      if (seen.has(n) && seen.get(n) !== f) dups.push(`${n} en ${seen.get(n)} y ${f}`);
      seen.set(n, f);
    }
  }
  assert.deepEqual(dups, []);
  assert.ok(seen.size > 200);
});
