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

export const TEMPLATES = [
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
