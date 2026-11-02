// Plantillas de rutinas que se pueden añadir con un toque desde Entreno › Rutinas.
// Cada elemento: [id del ejercicio sin el prefijo "x-", número de series]

const A1 = [
  ['press-inclinado-manc', 2], ['press-hombro-manc', 2], ['press-pecho-maquina', 2], ['elev-laterales-polea', 3],
  ['curl-predicador-barra', 2], ['curl-bayesiano', 2], ['extension-cuadriceps-uni', 2], ['aduccion', 2],
  ['crunch-polea', 2], ['oblicuos-polea', 2],
];
const B1 = [
  ['peso-muerto-rumano', 2], ['remo-abierto-polea', 2], ['remo-unilateral-polea', 2], ['jalon-neutro', 3],
  ['encogimientos-inclinado', 2], ['katana', 2], ['triceps-cuerda', 2], ['curl-femoral-sentado', 2], ['gemelos-prensa', 2],
];
const A2 = [
  ['press-inclinado-smith', 2], ['press-militar-smith', 2], ['pec-deck', 2], ['elev-laterales-polea', 3],
  ['curl-scott', 2], ['curl-bayesiano', 2], ['curl-martillo-cuerda', 2], ['extension-cuadriceps-uni', 2], ['aduccion', 2],
  ['crunch-polea', 2], ['oblicuos-polea', 2],
];
const B2 = [
  ['katana', 2], ['triceps-cuerda', 2], ['remo-unilateral-polea', 2], ['remo-abierto-polea', 3], ['jalon-neutro', 2],
  ['face-pull', 2], ['hip-thrust-maquina', 2], ['curl-femoral-sentado', 2], ['gemelos-prensa', 2],
];

const tpl = (id, name, description, routines) => ({
  id, name, description, generic: true,
  routines: routines.map(([rname, items], seq) => ({ name: rname, seq, items: items.map(([x, sets]) => ({ exId: 'x-' + x, sets })) })),
});

// Plantillas genéricas, para cualquier persona
const GENERIC = [
  tpl('fullbody', 'Cuerpo completo (3 días)', 'Dos sesiones que se alternan, para 2 o 3 días por semana.', [
    ['Cuerpo completo A', [['sentadilla', 3], ['press-banca', 3], ['remo-barra', 3], ['press-hombro-manc', 2], ['curl-femoral-tumbado', 2], ['curl-mancuernas', 2], ['crunch-polea', 2]]],
    ['Cuerpo completo B', [['peso-muerto-rumano', 3], ['press-inclinado-manc', 3], ['jalon-pecho', 3], ['prensa', 2], ['elev-laterales', 3], ['triceps-cuerda', 2], ['gemelos-pie', 2]]],
  ]),
  tpl('torso-pierna', 'Torso / pierna (4 días)', 'Torso A, pierna A, torso B y pierna B, en rotación.', [
    ['Torso A', [['press-banca', 3], ['remo-barra', 3], ['press-hombro-manc', 2], ['jalon-pecho', 3], ['elev-laterales', 3], ['curl-mancuernas', 2], ['triceps-polea', 2]]],
    ['Pierna A', [['sentadilla', 3], ['peso-muerto-rumano', 3], ['extension-cuadriceps', 2], ['curl-femoral-sentado', 2], ['gemelos-pie', 3], ['crunch-polea', 2]]],
    ['Torso B', [['press-inclinado-manc', 3], ['jalon-neutro', 3], ['remo-polea', 3], ['press-pecho-maquina', 2], ['face-pull', 2], ['curl-martillo', 2], ['press-frances', 2]]],
    ['Pierna B', [['prensa', 3], ['hip-thrust', 3], ['bulgara', 2], ['curl-femoral-tumbado', 2], ['gemelos-sentado', 3], ['elev-piernas', 2]]],
  ]),
  tpl('ppl', 'Empuje / tirón / pierna (3 o 6 días)', 'Empuje, tirón y pierna, en rotación.', [
    ['Empuje', [['press-banca', 3], ['press-inclinado-manc', 3], ['press-militar', 2], ['elev-laterales', 3], ['triceps-cuerda', 2], ['triceps-cabeza', 2]]],
    ['Tirón', [['dominadas', 3], ['remo-barra', 3], ['remo-polea', 2], ['face-pull', 2], ['curl-barra', 2], ['curl-martillo', 2]]],
    ['Pierna', [['sentadilla', 3], ['peso-muerto-rumano', 3], ['prensa', 2], ['curl-femoral-sentado', 2], ['gemelos-pie', 3], ['crunch-polea', 2]]],
  ]),
];

// TODO antes de publicar la app: quitar la plantilla «ab6» (es la rutina personal de Víctor);
// sus rutinas seguirán en su cuenta porque ya están guardadas como rutinas propias.
export const TEMPLATES = [
  ...GENERIC,
  {
    id: 'ab6',
    name: 'Rutina A/B en 6 sesiones',
    description: 'A1, B1, A2, B2, A3 y B3, en rotación. A3 repite A1 y B3 repite B1.',
    routines: [['A1', A1], ['B1', B1], ['A2', A2], ['B2', B2], ['A3', A1], ['B3', B1]].map(([name, items], seq) => ({
      name,
      seq,
      items: items.map(([id, sets]) => ({ exId: 'x-' + id, sets })),
    })),
  },
];
