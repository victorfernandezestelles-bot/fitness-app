// Definición de nutrientes, valores de referencia y alimentos básicos.

// Macros y nutrientes de la etiqueta europea (por 100 g)
export const MACROS = [
  { k: 'kcal', l: 'Valor energético', short: 'kcal', u: 'kcal', d: 0 },
  { k: 'p', l: 'Proteínas', short: 'Prot.', u: 'g', d: 1 },
  { k: 'c', l: 'Hidratos de carbono', short: 'Hidr.', u: 'g', d: 1 },
  { k: 'su', l: 'de los cuales azúcares', u: 'g', d: 1, sub: true },
  { k: 'f', l: 'Grasas', short: 'Grasa', u: 'g', d: 1 },
  { k: 'sf', l: 'de las cuales saturadas', u: 'g', d: 1, sub: true },
  { k: 'fi', l: 'Fibra alimentaria', u: 'g', d: 1 },
  { k: 'sal', l: 'Sal', u: 'g', d: 2 },
];

// Micronutrientes con su valor de referencia de nutrientes (VRN, Reglamento UE 1169/2011)
export const MICROS = [
  { k: 'ca', l: 'Calcio', u: 'mg', vrn: 800, d: 0 },
  { k: 'fe', l: 'Hierro', u: 'mg', vrn: 14, d: 1 },
  { k: 'mg', l: 'Magnesio', u: 'mg', vrn: 375, d: 0 },
  { k: 'k', l: 'Potasio', u: 'mg', vrn: 2000, d: 0 },
  { k: 'zn', l: 'Zinc', u: 'mg', vrn: 10, d: 1 },
  { k: 'va', l: 'Vitamina A', u: 'µg', vrn: 800, d: 0 },
  { k: 'vc', l: 'Vitamina C', u: 'mg', vrn: 80, d: 0 },
  { k: 'vd', l: 'Vitamina D', u: 'µg', vrn: 5, d: 1 },
  { k: 'b12', l: 'Vitamina B12', u: 'µg', vrn: 2.5, d: 1 },
];

export const ALL = [...MACROS, ...MICROS];
export const KEYS = ALL.map((n) => n.k);

// Energía según el reglamento europeo: 4 kcal/g proteína e hidratos, 9 grasa, 2 fibra
export function kcalFrom(n) {
  const p = n.p || 0, c = n.c || 0, f = n.f || 0, fi = n.fi || 0;
  return Math.round(4 * p + 4 * c + 9 * f + 2 * fi);
}

export function emptyNut() {
  const o = {};
  for (const k of KEYS) o[k] = null;
  return o;
}

// Nutrientes de "g" gramos de un alimento con valores por 100 g
export function scale(per100, g) {
  const o = {};
  for (const k of KEYS) {
    const v = per100 ? per100[k] : null;
    o[k] = v == null ? null : (v * g) / 100;
  }
  return o;
}

export function mult(n, f) {
  const o = {};
  for (const k of KEYS) o[k] = n[k] == null ? null : n[k] * f;
  return o;
}

// Suma una lista de nutrientes. "have" cuenta cuántos elementos traían cada valor,
// para saber si un total de micronutrientes está completo o es parcial.
export function sumNut(list) {
  const tot = {};
  const have = {};
  for (const k of KEYS) { tot[k] = 0; have[k] = 0; }
  for (const n of list) {
    for (const k of KEYS) {
      if (n && n[k] != null) { tot[k] += n[k]; have[k]++; }
    }
  }
  return { tot, have, count: list.length };
}

// Alimentos básicos con valores medios orientativos por 100 g.
// Hidratos sin fibra (criterio de etiqueta europea). null = dato no disponible.
// [id, nombre, p, c, azúcares, grasa, saturadas, fibra, sal, Ca, Fe, Mg, K, Zn, VitA, VitC, VitD, B12, ración g]
const B = [
  ['pasta', 'Pasta seca', 12.5, 72, 3, 1.5, 0.3, 3, 0.01, 21, 1.3, 53, 223, 1.4, 0, 0, 0, 0, 80],
  ['arroz', 'Arroz blanco (crudo)', 7, 79, 0.1, 0.6, 0.2, 1.3, 0, 10, 0.8, 25, 115, 1.1, 0, 0, 0, 0, 80],
  ['arroz-int', 'Arroz integral (crudo)', 7.5, 72, 0.7, 2.7, 0.5, 3.5, 0, 23, 1.5, 143, 223, 2, 0, 0, 0, 0, 80],
  ['pan', 'Pan de barra', 8.5, 52, 2, 1.5, 0.3, 3, 1.2, 20, 1.2, 25, 120, 0.8, 0, 0, 0, 0, 60],
  ['avena', 'Copos de avena', 13, 58, 1, 6.5, 1.1, 10, 0, 52, 4.3, 138, 362, 3.6, 0, 0, 0, 0, 50],
  ['patata', 'Patata (cruda)', 2, 15.5, 0.8, 0.1, 0, 2.2, 0, 12, 0.8, 23, 425, 0.3, 0, 19.7, 0, 0, null],
  ['lentejas', 'Lentejas (secas)', 24.6, 52, 2, 1.1, 0.2, 10.7, 0, 35, 6.5, 47, 677, 3.3, 2, 4.5, 0, 0, 70],
  ['garbanzos', 'Garbanzos cocidos (bote, escurridos)', 7, 14, 0.5, 2.5, 0.3, 5.5, 0.6, 40, 1.4, 25, 170, 1, 1, 0, 0, 0, null],
  ['pollo', 'Pechuga de pollo (cruda)', 23, 0, 0, 2, 0.5, 0, 0.15, 5, 0.4, 28, 370, 0.7, 9, 0, 0.1, 0.2, null],
  ['ternera-picada', 'Carne picada de ternera (cruda, ~15 % grasa)', 18.6, 0, 0, 15, 5.9, 0, 0.17, 18, 2.1, 18, 290, 4.6, 0, 0, 0.1, 2.4, null],
  ['lomo-cerdo', 'Lomo de cerdo (crudo)', 21, 0, 0, 6, 2, 0, 0.13, 6, 0.8, 25, 360, 1.9, 2, 0, 0.5, 0.6, null],
  ['huevo', 'Huevo entero', 12.6, 0.7, 0.4, 9.5, 3.1, 0, 0.36, 56, 1.75, 12, 138, 1.3, 160, 0, 2, 0.9, 55],
  // Por tallas (Reglamento CE 589/2008, peso con cáscara): M 53-63 g, L 63-73 g, XL desde 73 g.
  // La parte comestible es ~89 %; por 100 g son iguales, cambia el peso de cada huevo.
  ['huevo-m', 'Huevo talla M', 12.6, 0.7, 0.4, 9.5, 3.1, 0, 0.36, 56, 1.75, 12, 138, 1.3, 160, 0, 2, 0.9, 52],
  ['huevo-l', 'Huevo talla L', 12.6, 0.7, 0.4, 9.5, 3.1, 0, 0.36, 56, 1.75, 12, 138, 1.3, 160, 0, 2, 0.9, 60],
  ['huevo-xl', 'Huevo talla XL', 12.6, 0.7, 0.4, 9.5, 3.1, 0, 0.36, 56, 1.75, 12, 138, 1.3, 160, 0, 2, 0.9, 68],
  ['huevo-campero', 'Huevo campero (talla L)', 12.6, 0.7, 0.4, 9.5, 3.1, 0, 0.36, 56, 1.75, 12, 138, 1.3, 160, 0, 2, 0.9, 60],
  ['clara', 'Clara de huevo', 10.9, 0.7, 0.7, 0.2, 0, 0, 0.42, 7, 0.1, 11, 163, 0, 0, 0, 0, 0.1, 33],
  ['salmon', 'Salmón (crudo)', 20, 0, 0, 13, 3.1, 0, 0.15, 9, 0.3, 27, 363, 0.4, 58, 0, 11, 3.2, null],
  ['atun', 'Atún al natural (lata, escurrido)', 23, 0, 0, 1, 0.3, 0, 0.8, 10, 1, 25, 230, 0.6, 6, 0, 1.7, 2.5, 56],
  ['merluza', 'Merluza (cruda)', 17, 0, 0, 1.8, 0.3, 0, 0.2, 20, 0.5, 25, 300, 0.4, 10, 0, 0, 1, null],
  ['leche-semi', 'Leche semidesnatada', 3.3, 4.8, 4.8, 1.6, 1, 0, 0.13, 120, 0.05, 11, 150, 0.4, 20, 1, 0, 0.4, 250],
  ['leche-entera', 'Leche entera', 3.2, 4.7, 4.7, 3.6, 2.3, 0, 0.13, 115, 0.03, 11, 150, 0.4, 45, 1, 0.1, 0.4, 250],
  ['yogur', 'Yogur natural', 3.5, 4.7, 4.7, 3.3, 2.1, 0, 0.12, 121, 0.05, 12, 155, 0.6, 27, 0.5, 0.1, 0.4, 125],
  ['queso-batido', 'Queso fresco batido 0 %', 8, 3.5, 3.5, 0.2, 0.1, 0, 0.1, 120, 0.1, 10, 140, 0.5, 0, 0, 0, 0.5, 125],
  ['queso-semi', 'Queso semicurado', 25, 0.5, 0.5, 28, 18, 0, 1.5, 750, 0.3, 30, 90, 3, 300, 0, 0.3, 1.5, 30],
  ['aove', 'Aceite de oliva virgen extra', 0, 0, 0, 100, 14, 0, 0, 1, 0.6, 0, 1, 0, 0, 0, 0, 0, 10],
  ['tomate', 'Tomate', 0.9, 2.7, 2.6, 0.2, 0, 1.2, 0.01, 10, 0.3, 11, 237, 0.2, 42, 13.7, 0, 0, 120],
  ['tomate-trit', 'Tomate triturado (bote)', 1.4, 4.5, 4, 0.2, 0.03, 1.5, 0.2, 30, 1, 18, 290, 0.3, 30, 9, 0, 0, null],
  ['cebolla', 'Cebolla', 1.1, 7.6, 4.2, 0.1, 0, 1.7, 0.01, 23, 0.2, 10, 146, 0.2, 0, 7.4, 0, 0, 110],
  ['brocoli', 'Brócoli', 2.8, 4.4, 1.7, 0.4, 0.1, 2.6, 0.08, 47, 0.7, 21, 316, 0.4, 31, 89, 0, 0, null],
  ['lechuga', 'Lechuga', 1.4, 1.5, 0.8, 0.2, 0, 1.3, 0.07, 36, 0.9, 13, 194, 0.2, 300, 9, 0, 0, null],
  ['platano', 'Plátano', 1.1, 20, 12.2, 0.3, 0.1, 2.6, 0, 5, 0.3, 27, 358, 0.2, 3, 8.7, 0, 0, 120],
  ['manzana', 'Manzana', 0.3, 11.4, 10.4, 0.2, 0, 2.4, 0, 6, 0.1, 5, 107, 0, 3, 4.6, 0, 0, 180],
  ['naranja', 'Naranja', 0.9, 9.4, 9.4, 0.1, 0, 2.4, 0, 40, 0.1, 10, 181, 0.1, 11, 53, 0, 0, 200],
  ['aguacate', 'Aguacate', 2, 1.8, 0.7, 14.7, 2.1, 6.7, 0.02, 12, 0.55, 29, 485, 0.6, 7, 10, 0, 0, null],
  ['almendras', 'Almendras', 21, 9.9, 4.4, 50, 3.8, 12.5, 0, 269, 3.7, 270, 733, 3.1, 0, 0, 0, 0, 30],
  ['nueces', 'Nueces', 15, 7, 2.6, 65, 6.1, 6.7, 0, 98, 2.9, 158, 441, 3.1, 1, 1.3, 0, 0, 30],
  ['crema-cacahuete', 'Crema de cacahuete (100 %)', 25, 14, 4, 50, 8, 6, 0, 45, 1.9, 170, 650, 2.7, 0, 0, 0, 0, 15],
  ['whey', 'Proteína whey (valor medio)', 78, 7, 5, 6, 3, 0, 0.5, null, null, null, null, null, null, null, null, null, 30],
];

const MICRO_KEYS = ['ca', 'fe', 'mg', 'k', 'zn', 'va', 'vc', 'vd', 'b12'];

// Básicos que se apuntan por unidades: [nombre de la unidad, gramos comestibles de una]
const UNITS = {
  huevo: ['huevo', 55], 'huevo-m': ['huevo', 52], 'huevo-l': ['huevo', 60], 'huevo-xl': ['huevo', 68], 'huevo-campero': ['huevo', 60],
};

export const BASICS = B.map((r) => {
  const [id, name, p, c, su, f, sf, fi, sal, ...rest] = r;
  const per100 = { p, c, su, f, sf, fi, sal };
  MICRO_KEYS.forEach((k, i) => { per100[k] = rest[i]; });
  per100.kcal = kcalFrom(per100);
  const u = UNITS[id];
  return { id: 'b-' + id, name, per100, servingG: rest[9] ?? null, source: 'basico', ...(u ? { unitName: u[0], unitG: u[1] } : {}) };
});

export const BASICS_BY_ID = Object.fromEntries(BASICS.map((b) => [b.id, b]));
