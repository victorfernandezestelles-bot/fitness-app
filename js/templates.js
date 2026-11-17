// Plantillas de rutinas que se pueden añadir con un toque desde Entreno › Rutinas.
// Cada elemento: [id del ejercicio sin el prefijo "x-", número de series]

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

export const TEMPLATES = GENERIC;
