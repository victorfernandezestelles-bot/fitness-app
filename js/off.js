// Consulta a Open Food Facts (base de datos abierta de productos envasados).
import { kcalFrom } from './nutrients.js';

const FIELDS = 'code,product_name,product_name_es,generic_name_es,brands,nutriments,serving_quantity';

const round = (v, d = 1) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

function val(n, key, factor = 1) {
  const v = n[key + '_100g'];
  if (v == null || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x * factor : null;
}

function mapProduct(p) {
  const n = p.nutriments || {};
  let kcal = val(n, 'energy-kcal');
  if (kcal == null) {
    const kj = val(n, 'energy-kj') ?? val(n, 'energy');
    if (kj != null) kcal = kj / 4.184;
  }
  let sal = val(n, 'salt');
  if (sal == null) { const na = val(n, 'sodium'); if (na != null) sal = na * 2.5; }
  const per100 = {
    kcal: round(kcal, 0),
    p: round(val(n, 'proteins')),
    c: round(val(n, 'carbohydrates')),
    su: round(val(n, 'sugars')),
    f: round(val(n, 'fat')),
    sf: round(val(n, 'saturated-fat')),
    fi: round(val(n, 'fiber')),
    sal: round(sal, 2),
    // Open Food Facts guarda los minerales y vitaminas en gramos
    ca: round(val(n, 'calcium', 1000), 0),
    fe: round(val(n, 'iron', 1000), 1),
    mg: round(val(n, 'magnesium', 1000), 0),
    k: round(val(n, 'potassium', 1000), 0),
    zn: round(val(n, 'zinc', 1000), 1),
    va: round(val(n, 'vitamin-a', 1e6), 0),
    vc: round(val(n, 'vitamin-c', 1000), 0),
    vd: round(val(n, 'vitamin-d', 1e6), 1),
    b12: round(val(n, 'vitamin-b12', 1e6), 1),
  };
  if (per100.kcal == null && per100.p != null) per100.kcal = kcalFrom(per100);
  const hasNutrition = per100.kcal != null || per100.p != null;
  const serving = Number(p.serving_quantity);
  return {
    name: (p.product_name_es || p.product_name || p.generic_name_es || '').trim(),
    brand: (p.brands || '').split(',')[0].trim(),
    barcode: p.code || '',
    servingG: Number.isFinite(serving) && serving > 0 ? Math.round(serving) : null,
    per100,
    hasNutrition,
  };
}

function withTimeout(ms) {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

// Devuelve el producto o null si no existe. Lanza error si no hay conexión.
export async function offProduct(code) {
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`,
    { signal: withTimeout(12000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('http ' + r.status);
  const j = await r.json();
  if (!j.product || j.status === 0) return null;
  const m = mapProduct(j.product);
  if (!m.barcode) m.barcode = code;
  return m;
}

export async function offSearch(q) {
  const url = 'https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&action=process&json=1&page_size=24'
    + '&tagtype_0=countries&tag_contains_0=contains&tag_0=spain'
    + `&fields=${FIELDS}&search_terms=${encodeURIComponent(q)}`;
  const r = await fetch(url, { signal: withTimeout(15000) });
  if (!r.ok) throw new Error('http ' + r.status);
  const j = await r.json();
  return (j.products || []).map(mapProduct).filter((p) => p.name && p.hasNutrition);
}
