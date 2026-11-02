// Músculos y biblioteca de ejercicios.
// Cada serie cuenta 1 para los músculos principales y 0,5 para los secundarios.

export const MUSCLES = [
  { k: 'pecho', l: 'Pecho', g: 'Torso' },
  { k: 'dorsal', l: 'Dorsales', g: 'Torso' },
  { k: 'trapecio', l: 'Trapecio', g: 'Torso' },
  { k: 'lumbares', l: 'Lumbares', g: 'Torso' },
  { k: 'abdominales', l: 'Abdominales', g: 'Torso' },
  { k: 'delt-ant', l: 'Hombro anterior', g: 'Hombros' },
  { k: 'delt-lat', l: 'Hombro lateral', g: 'Hombros' },
  { k: 'delt-post', l: 'Hombro posterior', g: 'Hombros' },
  { k: 'biceps', l: 'Bíceps', g: 'Brazos' },
  { k: 'triceps', l: 'Tríceps', g: 'Brazos' },
  { k: 'antebrazo', l: 'Antebrazo', g: 'Brazos' },
  { k: 'cuadriceps', l: 'Cuádriceps', g: 'Piernas' },
  { k: 'isquios', l: 'Isquiotibiales', g: 'Piernas' },
  { k: 'gluteos', l: 'Glúteos', g: 'Piernas' },
  { k: 'aductores', l: 'Aductores', g: 'Piernas' },
  { k: 'gemelos', l: 'Gemelos', g: 'Piernas' },
];
export const MUSCLE_NAME = Object.fromEntries(MUSCLES.map((m) => [m.k, m.l]));

// [id, nombre, principales, secundarios]
const E = [
  // Pecho
  ['press-banca', 'Press de banca con barra', 'pecho', 'triceps delt-ant'],
  ['press-inclinado-barra', 'Press inclinado con barra', 'pecho', 'delt-ant triceps'],
  ['press-mancuernas', 'Press de banca con mancuernas', 'pecho', 'triceps delt-ant'],
  ['press-inclinado-manc', 'Press inclinado con mancuernas', 'pecho', 'delt-ant triceps'],
  ['press-declinado', 'Press declinado', 'pecho', 'triceps'],
  ['press-pecho-maquina', 'Press de pecho en máquina', 'pecho', 'triceps delt-ant'],
  ['aperturas', 'Aperturas con mancuernas', 'pecho', 'delt-ant'],
  ['cruces-polea', 'Cruces en polea', 'pecho', 'delt-ant'],
  ['pec-deck', 'Contractora (pec deck)', 'pecho', ''],
  ['fondos', 'Fondos en paralelas', 'pecho triceps', 'delt-ant'],
  ['flexiones', 'Flexiones', 'pecho', 'triceps delt-ant abdominales'],
  // Espalda
  ['dominadas', 'Dominadas', 'dorsal', 'biceps delt-post antebrazo'],
  ['dominadas-supinas', 'Dominadas supinas', 'dorsal biceps', 'antebrazo'],
  ['jalon-pecho', 'Jalón al pecho', 'dorsal', 'biceps delt-post'],
  ['jalon-estrecho', 'Jalón agarre estrecho', 'dorsal', 'biceps'],
  ['remo-barra', 'Remo con barra', 'dorsal', 'trapecio delt-post biceps lumbares'],
  ['remo-mancuerna', 'Remo con mancuerna', 'dorsal', 'trapecio delt-post biceps'],
  ['remo-polea', 'Remo en polea baja', 'dorsal', 'trapecio delt-post biceps'],
  ['remo-maquina', 'Remo en máquina', 'dorsal', 'trapecio delt-post biceps'],
  ['remo-t', 'Remo en T', 'dorsal', 'trapecio delt-post biceps lumbares'],
  ['pullover-polea', 'Pullover en polea', 'dorsal', 'triceps'],
  ['peso-muerto', 'Peso muerto', 'isquios gluteos lumbares', 'cuadriceps trapecio dorsal antebrazo'],
  ['encogimientos', 'Encogimientos', 'trapecio', 'antebrazo'],
  ['hiperextensiones', 'Hiperextensiones', 'lumbares', 'gluteos isquios'],
  // Hombros
  ['press-militar', 'Press militar con barra', 'delt-ant', 'triceps delt-lat'],
  ['press-hombro-manc', 'Press de hombro con mancuernas', 'delt-ant', 'triceps delt-lat'],
  ['press-hombro-maquina', 'Press de hombro en máquina', 'delt-ant', 'triceps delt-lat'],
  ['elev-laterales', 'Elevaciones laterales', 'delt-lat', ''],
  ['elev-laterales-polea', 'Elevaciones laterales en polea', 'delt-lat', ''],
  ['elev-frontales', 'Elevaciones frontales', 'delt-ant', ''],
  ['pajaros', 'Pájaros (elevaciones posteriores)', 'delt-post', 'trapecio'],
  ['face-pull', 'Face pull', 'delt-post', 'trapecio'],
  ['contractora-inversa', 'Contractora inversa', 'delt-post', 'trapecio'],
  ['remo-menton', 'Remo al mentón', 'delt-lat', 'trapecio biceps'],
  // Brazos
  ['curl-barra', 'Curl con barra', 'biceps', 'antebrazo'],
  ['curl-mancuernas', 'Curl con mancuernas', 'biceps', 'antebrazo'],
  ['curl-martillo', 'Curl martillo', 'biceps antebrazo', ''],
  ['curl-scott', 'Curl en banco Scott', 'biceps', ''],
  ['curl-polea', 'Curl en polea', 'biceps', 'antebrazo'],
  ['curl-inclinado', 'Curl inclinado con mancuernas', 'biceps', ''],
  ['press-frances', 'Press francés', 'triceps', ''],
  ['triceps-polea', 'Extensión de tríceps en polea', 'triceps', ''],
  ['triceps-cabeza', 'Extensión de tríceps sobre la cabeza', 'triceps', ''],
  ['press-cerrado', 'Press de banca agarre cerrado', 'triceps', 'pecho delt-ant'],
  ['fondos-banco', 'Fondos en banco', 'triceps', 'pecho delt-ant'],
  ['curl-muneca', 'Curl de muñeca', 'antebrazo', ''],
  // Piernas
  ['sentadilla', 'Sentadilla con barra', 'cuadriceps gluteos', 'aductores lumbares'],
  ['sentadilla-frontal', 'Sentadilla frontal', 'cuadriceps', 'gluteos abdominales'],
  ['sentadilla-hack', 'Sentadilla hack', 'cuadriceps', 'gluteos'],
  ['sentadilla-goblet', 'Sentadilla goblet', 'cuadriceps', 'gluteos aductores'],
  ['prensa', 'Prensa de piernas', 'cuadriceps', 'gluteos aductores'],
  ['bulgara', 'Sentadilla búlgara', 'cuadriceps gluteos', 'aductores'],
  ['zancadas', 'Zancadas', 'cuadriceps gluteos', 'aductores isquios'],
  ['extension-cuadriceps', 'Extensión de cuádriceps', 'cuadriceps', ''],
  ['peso-muerto-rumano', 'Peso muerto rumano', 'isquios gluteos', 'lumbares'],
  ['curl-femoral-tumbado', 'Curl femoral tumbado', 'isquios', 'gemelos'],
  ['curl-femoral-sentado', 'Curl femoral sentado', 'isquios', ''],
  ['good-morning', 'Buenos días (good morning)', 'isquios lumbares', 'gluteos'],
  ['hip-thrust', 'Hip thrust', 'gluteos', 'isquios'],
  ['puente-gluteo', 'Puente de glúteo', 'gluteos', 'isquios'],
  ['patada-gluteo', 'Patada de glúteo en polea', 'gluteos', ''],
  ['abduccion', 'Abducción en máquina', 'gluteos', ''],
  ['aduccion', 'Aducción en máquina', 'aductores', ''],
  ['gemelos-pie', 'Elevación de gemelos de pie', 'gemelos', ''],
  ['gemelos-sentado', 'Elevación de gemelos sentado', 'gemelos', ''],
  // Abdomen
  ['crunch', 'Crunch abdominal', 'abdominales', ''],
  ['crunch-polea', 'Crunch en polea', 'abdominales', ''],
  ['elev-piernas', 'Elevaciones de piernas colgado', 'abdominales', ''],
  ['rueda', 'Rueda abdominal', 'abdominales', 'dorsal'],
  ['plancha', 'Plancha', 'abdominales', ''],
];

const split = (s) => (s ? s.split(' ') : []);
export const EXERCISES = E.map(([id, name, p, s]) => ({ id: 'x-' + id, name, primary: split(p), secondary: split(s), builtin: true }));
export const EXERCISES_BY_ID = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

// 1RM estimado (fórmula de Epley); poco fiable por encima de 12 repeticiones
export function e1rm(kg, reps) {
  if (!kg || !reps) return null;
  if (reps === 1) return kg;
  if (reps > 12) return null;
  return kg * (1 + reps / 30);
}
