// Músculos y biblioteca de ejercicios.
// Cada serie cuenta 1 para los músculos principales y 0,5 para los secundarios.

export const MUSCLES = [
  { k: 'pecho', l: 'Pecho', g: 'Torso' },
  { k: 'dorsal', l: 'Dorsales', g: 'Torso' },
  { k: 'espalda-alta', l: 'Espalda alta', g: 'Torso' },
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
  ['press-inclinado-smith', 'Press inclinado en multipower', 'pecho', 'delt-ant triceps'],
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
  ['jalon-neutro', 'Jalón agarre neutro', 'dorsal', 'biceps espalda-alta'],
  ['remo-barra', 'Remo con barra', 'dorsal espalda-alta', 'trapecio delt-post biceps lumbares'],
  ['remo-mancuerna', 'Remo con mancuerna', 'dorsal', 'espalda-alta delt-post biceps'],
  ['remo-polea', 'Remo en polea baja', 'dorsal', 'espalda-alta delt-post biceps'],
  ['remo-unilateral-polea', 'Remo unilateral en polea', 'dorsal', 'espalda-alta biceps'],
  ['remo-abierto-polea', 'Remo abierto en polea (espalda alta)', 'espalda-alta', 'delt-post trapecio dorsal'],
  ['remo-maquina', 'Remo en máquina', 'dorsal espalda-alta', 'delt-post biceps'],
  ['remo-t', 'Remo en T', 'dorsal espalda-alta', 'trapecio delt-post biceps lumbares'],
  ['pullover-polea', 'Pullover en polea', 'dorsal', 'triceps'],
  ['peso-muerto', 'Peso muerto', 'isquios gluteos lumbares', 'cuadriceps trapecio dorsal antebrazo'],
  ['encogimientos', 'Encogimientos', 'trapecio', 'antebrazo'],
  ['encogimientos-inclinado', 'Encogimientos en banco inclinado', 'trapecio', 'espalda-alta'],
  ['rack-pull', 'Rack pull', 'trapecio lumbares gluteos', 'isquios espalda-alta antebrazo'],
  ['hiperextensiones', 'Hiperextensiones', 'lumbares', 'gluteos isquios'],
  // Hombros
  ['press-militar', 'Press militar con barra', 'delt-ant', 'triceps delt-lat'],
  ['press-hombro-manc', 'Press militar con mancuernas', 'delt-ant', 'triceps delt-lat'],
  ['press-militar-smith', 'Press militar en multipower', 'delt-ant', 'triceps delt-lat'],
  ['press-hombro-maquina', 'Press de hombro en máquina', 'delt-ant', 'triceps delt-lat'],
  ['elev-laterales', 'Elevaciones laterales', 'delt-lat', ''],
  ['elev-laterales-polea', 'Elevaciones laterales en polea', 'delt-lat', ''],
  ['elev-frontales', 'Elevaciones frontales', 'delt-ant', ''],
  ['pajaros', 'Pájaros (elevaciones posteriores)', 'delt-post', 'espalda-alta'],
  ['face-pull', 'Face pull', 'delt-post', 'espalda-alta trapecio'],
  ['contractora-inversa', 'Contractora inversa', 'delt-post', 'espalda-alta'],
  ['remo-menton', 'Remo al mentón', 'delt-lat', 'trapecio biceps'],
  // Brazos
  ['curl-barra', 'Curl con barra', 'biceps', 'antebrazo'],
  ['curl-mancuernas', 'Curl con mancuernas', 'biceps', 'antebrazo'],
  ['curl-martillo', 'Curl martillo', 'biceps antebrazo', ''],
  ['curl-martillo-cuerda', 'Curl martillo con cuerda', 'biceps antebrazo', ''],
  ['curl-bayesiano', 'Curl bayesiano en polea', 'biceps', ''],
  ['curl-predicador-barra', 'Curl predicador con barra', 'biceps', ''],
  ['curl-scott', 'Curl predicador con mancuerna', 'biceps', ''],
  ['curl-polea', 'Curl en polea', 'biceps', 'antebrazo'],
  ['curl-inclinado', 'Curl inclinado con mancuernas', 'biceps', ''],
  ['press-frances', 'Press francés', 'triceps', ''],
  ['triceps-polea', 'Extensión de tríceps en polea', 'triceps', ''],
  ['triceps-cuerda', 'Extensión de tríceps con cuerda', 'triceps', ''],
  ['katana', 'Extensión katana en polea', 'triceps', ''],
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
  ['extension-cuadriceps-uni', 'Extensión de cuádriceps unilateral', 'cuadriceps', ''],
  ['peso-muerto-rumano', 'Peso muerto rumano', 'isquios gluteos', 'lumbares'],
  ['curl-femoral-tumbado', 'Curl femoral tumbado', 'isquios', 'gemelos'],
  ['curl-femoral-sentado', 'Curl femoral sentado', 'isquios', ''],
  ['good-morning', 'Buenos días (good morning)', 'isquios lumbares', 'gluteos'],
  ['hip-thrust', 'Hip thrust', 'gluteos', 'isquios'],
  ['hip-thrust-maquina', 'Hip thrust en máquina', 'gluteos', 'isquios'],
  ['puente-gluteo', 'Puente de glúteo', 'gluteos', 'isquios'],
  ['patada-gluteo', 'Patada de glúteo en polea', 'gluteos', ''],
  ['abduccion', 'Abducción en máquina', 'gluteos', ''],
  ['aduccion', 'Aducción en máquina', 'aductores', ''],
  ['gemelos-pie', 'Elevación de gemelos de pie', 'gemelos', ''],
  ['gemelos-sentado', 'Elevación de gemelos sentado', 'gemelos', ''],
  ['gemelos-prensa', 'Gemelo en prensa', 'gemelos', ''],
  // Abdomen
  ['crunch', 'Crunch abdominal', 'abdominales', ''],
  ['crunch-polea', 'Crunch en polea', 'abdominales', ''],
  ['oblicuos-polea', 'Oblicuos en polea', 'abdominales', ''],
  ['elev-piernas', 'Elevaciones de piernas colgado', 'abdominales', ''],
  ['rueda', 'Rueda abdominal', 'abdominales', 'dorsal'],
  ['plancha', 'Plancha', 'abdominales', ''],
];

// Ejercicios compuestos: rango por defecto de 6 a 12 repeticiones; el resto, de 10 a 20
const COMPOUND = new Set(('press-banca press-inclinado-barra press-mancuernas press-inclinado-manc press-inclinado-smith press-declinado '
  + 'press-pecho-maquina fondos flexiones dominadas dominadas-supinas jalon-pecho jalon-estrecho jalon-neutro remo-barra '
  + 'remo-mancuerna remo-polea remo-unilateral-polea remo-abierto-polea remo-maquina remo-t peso-muerto rack-pull press-militar '
  + 'press-hombro-manc press-militar-smith press-hombro-maquina press-cerrado sentadilla sentadilla-frontal sentadilla-hack '
  + 'sentadilla-goblet prensa bulgara zancadas peso-muerto-rumano good-morning hip-thrust hip-thrust-maquina').split(' '));

// Trabajo de agarre: el antebrazo suma 0,25 por serie en jalones y remos (sostiene la carga, pero
// trabaja bastante menos que en un curl). Donde ya cuenta como principal o secundario no se añade.
const GRIP = new Set(('jalon-pecho jalon-estrecho jalon-neutro remo-barra remo-mancuerna remo-polea remo-unilateral-polea '
  + 'remo-abierto-polea remo-maquina remo-t').split(' '));
export const GRIP_FACTOR = 0.25;

const split = (s) => (s ? s.split(' ') : []);
export const EXERCISES = E.map(([id, name, p, s]) => ({
  id: 'x-' + id, name, primary: split(p), secondary: split(s), grip: GRIP.has(id) ? ['antebrazo'] : [], builtin: true, compound: COMPOUND.has(id),
}));
export const EXERCISES_BY_ID = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

// Rango de repeticiones e incremento de carga por defecto
export function defaultCfg(ex) {
  const compound = ex ? (ex.compound ?? ex.secondary.length >= 2) : true;
  const dumbbell = ex && /mancuerna/i.test(ex.name);
  return { min: compound ? 6 : 10, max: compound ? 12 : 20, inc: dumbbell ? 2 : 2.5 };
}

// 1RM estimado (fórmula de Epley); poco fiable por encima de 12 repeticiones
export function e1rm(kg, reps) {
  if (!kg || !reps) return null;
  if (reps === 1) return kg;
  if (reps > 12) return null;
  return kg * (1 + reps / 30);
}
