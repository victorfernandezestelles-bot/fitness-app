import { EXERCISES_BY_ID, MUSCLES, MUSCLE_NAME, e1rm } from './exercises.js';
import { TEMPLATES } from './templates.js';
import { bodyPair, bodySVG, dominantView, musclesLabel } from './bodymap.js';
import { $, addDays, clockLabel, csvNum, csvText, dateShort, dayLabel, deliverFile, durLabel, esc, fmt, inputVal, niceStep, norm, num, parseISO, restLabel, today, uid } from './util.js';
import { S, saveExercises, saveRoutines, saveSettings, saveWorkout } from './state.js';
import { allExercises, emptySet, exCfg, exName, exerciseHistory, getEx, isEffective, lastPerformance, mondayOf, musclesText, nextInRotation, setText, suggestion, weekLevels, weekVolume, workoutDuration, workoutLevels, workoutStats, workoutVolume, workoutsSorted } from './derived.js';
import { ACTIONS, CHANGES, HOOKS, INPUTS, SHEETS, VIEWS, closeSheets, pageList, popSheet, popTo, pushSheet, render, renderSheets, replaceTop, toast, undoable } from './ui.js';
import { bar } from './food.js';
import { viewCardio } from './cardio.js';

setInterval(() => {
  document.querySelectorAll('.live-elapsed').forEach((el) => { el.textContent = clockLabel(Date.now() - Date.parse(el.dataset.start)); });
}, 1000);

export function newWorkout(fromRoutine) {
  const w = {
    id: uid(),
    date: today(),
    name: fromRoutine ? fromRoutine.name : 'Entrenamiento',
    routineId: fromRoutine?.id || null,
    start: new Date().toISOString(),
    end: null,
    exercises: [],
  };
  if (fromRoutine) {
    for (const it of fromRoutine.items) {
      const n = Math.max(1, it.sets || 3);
      w.exercises.push({ exId: it.exId, name: getEx(it.exId)?.name || '', sets: Array.from({ length: n }, emptySet) });
    }
  }
  S.workouts[w.id] = w;
  saveWorkout(w.id);
  return w;
}

export function viewEntreno() {
  if (!S.ui.week) S.ui.week = mondayOf(today());
  const monday = S.ui.week;
  const { vol, byMuscle, sessions, sets } = weekVolume(monday);
  const open = workoutsSorted().find((w) => !w.end);
  const max = Math.max(22, ...Object.values(vol)) * 1.05;
  const pct = (v) => `${((v / max) * 100).toFixed(1)}%`;
  const groups = [...new Set(MUSCLES.map((m) => m.g))];
  const thisWeek = monday === mondayOf(today());

  const rows = groups.map((g) => `
    <h3 class="vol-group">${g}</h3>
    ${MUSCLES.filter((m) => m.g === g).map((m) => {
      const v = vol[m.k];
      const detail = Object.entries(byMuscle[m.k]).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${esc(n)} ${fmt(c, 1)}`).join(' · ');
      return `<button type="button" class="vol-row${v ? '' : ' zero'}" data-act="vol-history" data-m="${m.k}" aria-label="${m.l}: ${fmt(v, 1)} series. Ver las últimas semanas" title="${detail}">
        <span class="vol-name">${m.l}</span>
        <span class="vol-bar" role="presentation"><span class="vol-zone" style="left:${pct(10)};width:${pct(10)}"></span><span class="vol-fill${v >= 10 ? ' in' : ''}" style="width:${pct(v)}"></span></span>
        <span class="vol-val">${fmt(v, 1)}</span>
      </button>`;
    }).join('')}`).join('');

  const recent = workoutsSorted();
  const wtab = S.ui.wtab === 'cardio' ? 'cardio' : 'fuerza';
  const head = `
  <header class="page-head">
    <h1>Entreno</h1>
  </header>
  <div class="segmented" role="tablist">
    <button type="button" role="tab" aria-selected="${wtab === 'fuerza'}" data-act="wtab" data-v="fuerza">Fuerza</button>
    <button type="button" role="tab" aria-selected="${wtab === 'cardio'}" data-act="wtab" data-v="cardio">Cardio y actividades</button>
  </div>`;
  if (wtab === 'cardio') return head + viewCardio();
  return `${head}

  ${open ? `<button type="button" class="live-card" data-act="open-workout" data-id="${open.id}">
      <span class="eyebrow">En curso</span>
      <b>${esc(open.name)}</b>
      <span class="muted"><span class="live-elapsed" data-start="${open.start}">${clockLabel(Date.now() - Date.parse(open.start))}</span> · ${open.exercises.length} ejercicios · ${workoutStats(open).sets} series hechas · toca para seguir</span>
    </button>` : `<button type="button" class="btn wide big" data-act="start-workout">Empezar entrenamiento${nextInRotation() ? ` · toca ${esc(nextInRotation().name)}` : ''}</button>`}

  <div class="btn-row two">
    <button type="button" class="btn ghost" data-act="open-routines">Rutinas</button>
    <button type="button" class="btn ghost" data-act="open-library">Ejercicios</button>
  </div>

  <section class="card">
    <div class="card-head">
      <h2>Series por músculo</h2>
      <div class="week-nav">
        <button type="button" class="icon-btn small" data-act="week-prev" aria-label="Semana anterior">‹</button>
        <span>${thisWeek ? 'Esta semana' : `${dateShort(monday)} – ${dateShort(addDays(monday, 6))}`}</span>
        <button type="button" class="icon-btn small" data-act="week-next" aria-label="Semana siguiente" ${thisWeek ? 'disabled' : ''}>›</button>
      </div>
    </div>
    <p class="muted small-text">${sessions} ${sessions === 1 ? 'entrenamiento' : 'entrenamientos'} · ${sets} series efectivas. Cada serie suma 1 al músculo principal y 0,5 a los secundarios.</p>
    ${sets ? `<div class="wk-map">${bodyPair(weekLevels(vol))}${mapLegend('week')}</div>` : ''}
    <div class="vol">${rows}</div>
    <p class="hint"><span class="zone-key"></span> Zona de 10 a 20 series semanales, el rango que se suele usar como referencia para ganar músculo. Toca un músculo para ver sus últimas 12 semanas.</p>
  </section>

  <section class="card">
    <div class="card-head">
      <h2>Últimos entrenamientos</h2>
      ${recent.length ? `<div class="segmented small" role="tablist" aria-label="Vista">
        <button type="button" role="tab" aria-selected="${S.ui.wview !== 'list'}" data-act="wview" data-v="grid">Mapa</button>
        <button type="button" role="tab" aria-selected="${S.ui.wview === 'list'}" data-act="wview" data-v="list">Lista</button>
      </div>` : ''}
    </div>
    ${recent.length ? (S.ui.wview === 'list' ? (() => {
      const pl = pageList('workouts', recent, 10, (w) => {
        const st = workoutStats(w);
        return `<li><button type="button" class="row" data-act="open-workout" data-id="${w.id}">
        <span class="row-main">${esc(w.name)}${w.end ? '' : ' <em class="tag">en curso</em>'}</span>
        <span class="row-sub">${dayLabel(w.date)}${workoutDuration(w) != null ? ` · ${durLabel(workoutDuration(w))}` : ''} · ${w.exercises.length} ejercicios · ${fmt(st.tonnage)} kg movidos</span>
        <span class="row-side">${st.sets} <small>series</small></span>
      </button></li>`;
      });
      return `<ul class="list">${pl.html}</ul>${pl.more}`;
    })() : (() => {
      const pl = pageList('workouts', recent, 12, (w) => {
        const lv = workoutLevels(w);
        const dur = workoutDuration(w);
        const dt = parseISO(w.date);
        return `<li><button type="button" class="wk-tile" data-act="open-workout" data-id="${w.id}" aria-label="${esc(w.name)}, ${dayLabel(w.date)}. ${esc(musclesLabel(lv))}">
          <span class="wk-tile-top"><b>${dt.getDate()}/${dt.getMonth() + 1}</b>${w.end ? '' : '<em class="tag">en curso</em>'}</span>
          <span class="wk-tile-name">${esc(w.name)}</span>
          ${bodySVG(dominantView(lv), lv)}
          <span class="wk-tile-foot">${dur != null ? durLabel(dur) : `${workoutStats(w).sets} series`}</span>
        </button></li>`;
      });
      return `<ul class="wk-grid">${pl.html}</ul>${pl.more}`;
    })()) : '<p class="empty">Aún no hay entrenamientos. Empieza uno vacío o crea una rutina con tus ejercicios habituales.</p>'}
  </section>`;
}

// Siguiente rutina de una rotación (A1, B1, A2…): avanza por sesiones hechas, no por días

/* Empezar: vacío o desde una rutina */
SHEETS.start = {
  title: () => 'Empezar entrenamiento',
  render: () => {
    const routines = Object.values(S.routines).sort((a, b) => (a.group || '').localeCompare(b.group || '') || (a.seq ?? 0) - (b.seq ?? 0) || a.name.localeCompare(b.name, 'es'));
    const next = nextInRotation();
    return `
      ${next ? `<button type="button" class="repeat-btn" data-act="start-routine" data-id="${next.id}">
          <b>Te toca: ${esc(next.name)}</b>
          <span>${next.items.length} ejercicios · ${next.items.reduce((a, it) => a + (it.sets || 0), 0)} series</span>
        </button>` : ''}
      <button type="button" class="btn ${next ? 'ghost ' : ''}wide top-gap" data-act="start-empty">Entrenamiento vacío</button>
      <h3 class="list-title">Desde una rutina</h3>
      ${routines.length ? `<ul class="list">${routines.map((r) => `<li><button type="button" class="row" data-act="start-routine" data-id="${r.id}">
        <span class="row-main">${esc(r.name)}</span>
        <span class="row-sub">${r.items.map((it) => esc(getEx(it.exId)?.name || '')).join(', ')}</span>
        <span class="row-side">${r.items.reduce((a, it) => a + (it.sets || 0), 0)} <small>series</small></span>
      </button></li>`).join('')}</ul>` : '<p class="empty">No tienes rutinas. Créalas en Entreno › Rutinas para empezar con los ejercicios ya puestos.</p>'}`;
  },
};

/* Sesión de entrenamiento */
SHEETS.workout = {
  title: (s) => (S.workouts[s.id]?.end ? 'Entrenamiento' : 'Entrenando'),
  render: (s) => {
    const w = S.workouts[s.id];
    if (!w) return '<p class="empty">Este entrenamiento ya no existe.</p>';
    const showRir = S.settings.showRir !== false;
    const ssLetters = supersetLetters(w);
    const exs = w.exercises.map((we, i) => {
      const ex = getEx(we.exId);
      const last = lastPerformance(we.exId, w);
      const cfg = exCfg(we.exId);
      const sug = suggestion(last, cfg);
      const fixedNote = S.settings.exNotes?.[we.exId];
      const ssTag = we.ss && ssLetters[we.ss] ? `<span class="ss-tag">Superserie ${ssLetters[we.ss]}</span>` : '';
      const ssCls = we.ss && ssLetters[we.ss] ? ` in-ss${w.exercises[i + 1]?.ss === we.ss ? ' ss-next' : ''}${w.exercises[i - 1]?.ss === we.ss ? ' ss-prev' : ''}` : '';
      const allDone = we.sets.length > 0 && we.sets.every((x) => x.done);
      const head = `
        <div class="wk-ex-head">
          <button type="button" class="wk-ex-name" data-act="ex-history" data-id="${esc(we.exId)}">${esc(exName(we))}</button>
          <button type="button" class="icon-btn small" data-act="wk-ex-menu" data-i="${i}" aria-label="Opciones de ${esc(exName(we))}">⋯</button>
        </div>`;
      // Vista compacta: los ejercicios terminados se pliegan
      if (allDone && !s.open?.[i]) {
        const work = we.sets.filter((x) => x.t !== 'w');
        return `<section class="wk-ex folded${ssCls}">${ssTag}${head}
          <button type="button" class="wk-fold" data-act="wk-ex-toggle" data-i="${i}">
            <span>✓ ${work.length} ${work.length === 1 ? 'serie' : 'series'} · ${work.map(setText).join(' · ')}</span><span class="wk-fold-more">Ver</span>
          </button>
        </section>`;
      }
      const active = we.sets.findIndex((x) => !x.done);
      let n = 0;
      const rows = we.sets.map((st, j) => {
        const warm = st.t === 'w';
        if (!warm) n++;
        let ph = !warm && last ? last.sets[n - 1] || last.sets[last.sets.length - 1] : null;
        if (ph && sug?.type === 'up') ph = { kg: sug.kg, reps: cfg.min };
        const row = `<tr class="${st.done ? 'done' : ''}${warm ? ' warm' : ''}${j === active ? ' active' : ''}">
          <td><button type="button" class="set-type" data-act="set-type" data-i="${i}" data-j="${j}" aria-label="Serie ${warm ? 'de calentamiento' : n}. Toca para cambiar el tipo">${warm ? 'C' : n}</button></td>
          <td><input type="text" inputmode="decimal" data-input="set-kg" data-i="${i}" data-j="${j}" value="${inputVal(st.kg, 2)}" placeholder="${ph ? inputVal(ph.kg, 2) : 'kg'}" aria-label="Kilos"></td>
          <td><input type="text" inputmode="numeric" data-input="set-reps" data-i="${i}" data-j="${j}" value="${st.reps ?? ''}" placeholder="${ph ? ph.reps ?? '' : 'reps'}" aria-label="Repeticiones"></td>
          ${showRir ? `<td class="rir"><input type="text" inputmode="numeric" data-input="set-rir" data-i="${i}" data-j="${j}" value="${st.rir ?? ''}" placeholder="–" aria-label="RIR, repeticiones en reserva"></td>` : ''}
          <td><button type="button" class="set-done" data-act="set-done" data-i="${i}" data-j="${j}" aria-pressed="${!!st.done}" aria-label="Serie hecha">✓</button></td>
          <td><button type="button" class="set-del" data-act="set-del" data-i="${i}" data-j="${j}" aria-label="Quitar serie">×</button></td>
        </tr>`;
        if (j !== active || w.end) return row;
        // Botones − / + en la serie que toca hacer
        return row + `<tr class="step-row"><td></td>
          <td><div class="stepper"><button type="button" data-act="step" data-i="${i}" data-j="${j}" data-f="kg" data-d="-1" aria-label="Quitar ${fmt(cfg.inc, 2)} kg">−</button><button type="button" data-act="step" data-i="${i}" data-j="${j}" data-f="kg" data-d="1" aria-label="Añadir ${fmt(cfg.inc, 2)} kg">+</button></div></td>
          <td><div class="stepper"><button type="button" data-act="step" data-i="${i}" data-j="${j}" data-f="reps" data-d="-1" aria-label="Una repetición menos">−</button><button type="button" data-act="step" data-i="${i}" data-j="${j}" data-f="reps" data-d="1" aria-label="Una repetición más">+</button></div></td>
          <td colspan="${showRir ? 3 : 2}"></td></tr>`;
      }).join('');
      return `
      <section class="wk-ex${ssCls}">${ssTag}${head}
        <p class="wk-muscles">${esc(musclesText(ex))}</p>
        ${fixedNote ? `<p class="wk-note"><b>Nota:</b> ${esc(fixedNote)}</p>` : ''}
        ${we.note ? `<p class="wk-note today"><b>Hoy:</b> ${esc(we.note)}</p>` : ''}
        ${last ? `<p class="wk-last">Última vez (${dateShort(last.date)}): ${last.sets.map(setText).join(' · ')}</p>` : ''}
        ${sug ? `<p class="wk-sug ${sug.type}">${sug.text}</p>` : ''}
        <button type="button" class="wk-cfg" data-act="ex-cfg" data-id="${esc(we.exId)}">Rango ${cfg.min}–${cfg.max} reps · sube de ${fmt(cfg.inc, 2)} en ${fmt(cfg.inc, 2)} kg</button>
        <table class="sets${showRir ? ' with-rir' : ''}">
          <thead><tr><th scope="col">Serie</th><th scope="col">Kg</th><th scope="col">Reps</th>${showRir ? '<th scope="col" title="Repeticiones en reserva">RIR</th>' : ''}<th scope="col"><span class="sr">Hecha</span></th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="wk-ex-foot">
          <button type="button" class="btn ghost small" data-act="set-add" data-i="${i}">+ Serie</button>
          ${allDone ? `<button type="button" class="btn ghost small" data-act="wk-ex-toggle" data-i="${i}">Plegar</button>` : ''}
        </div>
      </section>`;
    }).join('');
    const st = workoutStats(w);
    const dur = workoutDuration(w);
    return `
      <div class="wk-clock${w.end ? ' done' : ''}">
        <span class="eyebrow">${w.end ? 'Duración' : 'Tiempo entrenando'}</span>
        <b ${w.end ? '' : `class="live-elapsed" data-start="${w.start}"`}>${w.end ? (dur == null ? '–' : durLabel(dur)) : clockLabel(Date.now() - Date.parse(w.start))}</b>
      </div>
      ${st.sets ? (w.end ? `<div class="wk-map">${bodyPair(workoutLevels(w))}${mapLegend('session')}</div>` : `<details class="detail compact wk-map" ${s.mapOpen ? 'open' : ''} data-toggle="mapOpen"><summary>Músculos trabajados hasta ahora</summary>${bodyPair(workoutLevels(w))}${mapLegend('session')}</details>`) : ''}
      <div class="form-grid">
        <label class="field"><span>Nombre</span><input id="wk-name" type="text" value="${esc(w.name)}" data-input="wk-name" autocomplete="off"></label>
        <label class="field"><span>Fecha</span><input id="wk-date" type="date" value="${w.date}" max="${today()}" data-change="wk-date"></label>
      </div>
      ${exs || '<p class="empty">Añade el primer ejercicio. Si lo has hecho antes, verás lo que levantaste la última vez.</p>'}
      <button type="button" class="btn wide" data-act="wk-ex-add">+ Añadir ejercicio</button>
      <p class="hint">${st.sets} series efectivas · ${fmt(st.tonnage)} kg movidos. Toca el número de una serie para marcarla como calentamiento (C), que no cuenta para el volumen.${showRir ? ' RIR: repeticiones que te quedaban en reserva (0 = al fallo).' : ''}</p>
      <div class="sheet-actions">
        <button type="button" class="btn danger ghost" data-act="wk-del">Borrar</button>
        ${w.exercises.length && !w.routineId ? '<button type="button" class="btn ghost" data-act="wk-to-routine">Crear rutina</button>' : ''}
        <button type="button" class="btn primary" data-act="wk-finish">${w.end ? 'Hecho' : 'Terminar'}</button>
      </div>`;
  },
};

// Una superserie solo agrupa ejercicios seguidos: quien se queda suelto sale de ella
export function tidySupersets(w) {
  w.exercises.forEach((we, i) => {
    if (!we.ss) return;
    if (w.exercises[i - 1]?.ss !== we.ss && w.exercises[i + 1]?.ss !== we.ss) delete we.ss;
  });
}

// Leyenda del mapa: en un entreno, principal y secundario; en la semana, por número de series
export function mapLegend(kind) {
  const items = kind === 'week'
    ? [[1, '1–4 series'], [2, '5–9'], [3, '10 o más']]
    : [[3, 'Principal'], [1, 'Secundario']];
  return `<p class="bm-legend">${items.map(([l, t]) => `<span><i style="background:var(--map-${l})"></i>${t}</span>`).join('')}</p>`;
}

/* Resumen al terminar un entreno */
SHEETS['wk-summary'] = {
  title: () => 'Entreno terminado',
  render: (s) => {
    const w = S.workouts[s.id];
    if (!w) return '';
    const st = workoutStats(w);
    const d = workoutDuration(w);
    const { vol, prim } = workoutVolume(w);
    const list = Object.entries(vol).sort((a, b) => (prim.has(b[0]) - prim.has(a[0])) || b[1] - a[1]);
    return `
      <p class="sheet-sub"><b>${esc(w.name)}</b> · ${dayLabel(w.date)}</p>
      <div class="stats">
        <div><span class="stat-l">Duración</span><span class="stat-v">${d != null ? durLabel(d) : '–'}</span></div>
        <div><span class="stat-l">Series</span><span class="stat-v">${st.sets}</span></div>
        <div><span class="stat-l">Kg movidos</span><span class="stat-v">${fmt(st.tonnage)}</span></div>
      </div>
      ${bodyPair(workoutLevels(w), 'big')}
      ${mapLegend('session')}
      <h3 class="list-title">Series por músculo</h3>
      <div class="rep-muscles">${list.map(([m, v]) => `<span class="rep-m${prim.has(m) ? ' in' : ''}">${MUSCLE_NAME[m]} <b>${fmt(v, 1)}</b></span>`).join('')}</div>
      <div class="sheet-actions">
        <button type="button" class="btn ghost" data-act="wk-summary-open">Ver el entreno</button>
        <button type="button" class="btn primary" data-act="sheet-close">Hecho</button>
      </div>`;
  },
};

// Letra de cada superserie (A, B, C…) por orden de aparición
function supersetLetters(w) {
  const out = {};
  let k = 0;
  w.exercises.forEach((we, i) => {
    if (!we.ss || out[we.ss]) return;
    const partners = w.exercises.filter((x) => x.ss === we.ss).length;
    if (partners >= 2) out[we.ss] = String.fromCharCode(65 + k++);
  });
  return out;
}

/* Opciones de un ejercicio dentro de la sesión */
SHEETS['wk-ex-menu'] = {
  title: (s) => exName(S.workouts[s.wid].exercises[s.i]),
  render: (s) => {
    const w = S.workouts[s.wid];
    const we = w.exercises[s.i];
    const next = w.exercises[s.i + 1];
    const inSs = we.ss && w.exercises.filter((x) => x.ss === we.ss).length >= 2;
    return `
      <div class="menu-list">
        <button type="button" class="menu-item" data-act="wk-ex-move" data-d="-1" ${s.i === 0 ? 'disabled' : ''}>Subir</button>
        <button type="button" class="menu-item" data-act="wk-ex-move" data-d="1" ${s.i === w.exercises.length - 1 ? 'disabled' : ''}>Bajar</button>
        <button type="button" class="menu-item" data-act="wk-ex-replace">Sustituir por otro ejercicio…</button>
        ${next ? `<button type="button" class="menu-item" data-act="ss-join">${we.ss && next.ss === we.ss ? 'Ya está en superserie con el siguiente' : `Hacer superserie con «${esc(exName(next))}»`}</button>` : ''}
        ${inSs ? '<button type="button" class="menu-item" data-act="ss-split">Sacar de la superserie</button>' : ''}
        <button type="button" class="menu-item" data-act="ex-note-open">Notas…</button>
        <button type="button" class="menu-item danger" data-act="wk-ex-del">Quitar de la sesión</button>
      </div>
      <p class="hint">En una superserie haces una serie de cada ejercicio seguidas y el descanso empieza al terminar la del último.</p>`;
  },
};

/* Notas: la fija del ejercicio (sale siempre) y la de esta sesión */
SHEETS['ex-note'] = {
  title: () => 'Notas',
  render: (s) => {
    const we = S.workouts[s.wid].exercises[s.i];
    return `
      <p class="sheet-sub"><b>${esc(exName(we))}</b></p>
      <label class="field"><span>Nota fija del ejercicio</span><textarea id="note-fixed" rows="2" placeholder="p. ej. asiento en el 4, agarre neutro">${esc(S.settings.exNotes?.[we.exId] || '')}</textarea></label>
      <p class="hint">Sale cada vez que hagas este ejercicio.</p>
      <label class="field top-gap"><span>Nota de hoy</span><textarea id="note-today" rows="2" placeholder="p. ej. molestia en el codo">${esc(we.note || '')}</textarea></label>
      <div class="sheet-actions"><button type="button" class="btn primary" data-act="ex-note-save">Guardar</button></div>`;
  },
};

/* Selector de ejercicios */
SHEETS['ex-picker'] = {
  title: (s) => (s.mode === 'replace' ? 'Sustituir ejercicio' : s.mode === 'library' ? 'Ejercicios' : 'Añadir ejercicio'),
  render: (s) => `
    <div class="pick-tools">
      <input id="ex-q" type="search" placeholder="Buscar ejercicio" value="${esc(s.q || '')}" autocomplete="off" data-input="ex-q">
      <div class="chips scroll">
        <button type="button" class="chip${!s.muscle ? ' on' : ''}" data-act="ex-filter" data-m="">Todos</button>
        ${MUSCLES.map((m) => `<button type="button" class="chip${s.muscle === m.k ? ' on' : ''}" data-act="ex-filter" data-m="${m.k}">${m.l}</button>`).join('')}
      </div>
    </div>
    <div id="ex-list"></div>
    <button type="button" class="btn ghost wide" data-act="ex-new">Crear un ejercicio nuevo</button>`,
  mount: (s) => fillExList(s),
};

export function fillExList(s) {
  const el = $('#ex-list');
  if (!el) return;
  const words = norm(s.q || '').split(/\s+/).filter(Boolean);
  const list = allExercises().filter((e) => words.every((w) => norm(e.name).includes(w)) && (!s.muscle || e.primary.includes(s.muscle) || e.secondary.includes(s.muscle)));
  el.innerHTML = list.length ? `<ul class="list">${list.map((e) => `<li><button type="button" class="row" data-act="${s.mode === 'library' ? 'ex-history' : 'ex-pick'}" data-id="${esc(e.id)}">
      <span class="row-main">${esc(e.name)}${e.builtin === false || !EXERCISES_BY_ID[e.id] ? ' <em class="tag">propio</em>' : ''}</span>
      <span class="row-sub">${esc(musclesText(e))}</span>
    </button></li>`).join('')}</ul>` : '<p class="empty">Ningún ejercicio coincide. Puedes crearlo.</p>';
}

// Añade las rutinas de una plantilla (sin duplicar las que ya estén)
export function addTemplate(t) {
  for (const r of t.routines) {
    if (Object.values(S.routines).some((x) => x.group === t.id && x.seq === r.seq)) continue;
    const id = uid();
    S.routines[id] = { id, name: r.name, group: t.id, seq: r.seq, items: structuredClone(r.items) };
  }
  saveRoutines();
}
export const templateAdded = (t) => t.routines.every((r) => Object.values(S.routines).some((x) => x.group === t.id && x.seq === r.seq));

export function replaceExercise(target, idx, exId) {
  const w = S.workouts[target.id];
  const we = w.exercises[idx];
  const oldId = we.exId;
  if (oldId === exId) { popTo(target); return; }
  we.exId = exId;
  we.name = getEx(exId)?.name || '';
  saveWorkout(w.id);
  popTo(target);
  const r = w.routineId && S.routines[w.routineId];
  if (r && r.items.some((it) => it.exId === oldId)) {
    pushSheet({
      type: 'confirm',
      title: 'Cambiar también en la rutina',
      text: `Has cambiado «${getEx(oldId)?.name || 'el ejercicio'}» por «${we.name}» en esta sesión. ¿Lo cambio también en la rutina «${r.name}» para las próximas veces?`,
      ok: 'Cambiar en la rutina',
      onOk: () => {
        r.items.forEach((it) => { if (it.exId === oldId) it.exId = exId; });
        saveRoutines();
        toast(`Rutina «${r.name}» actualizada`);
      },
    });
  } else {
    toast(`Sustituido por ${we.name}`);
  }
}

export function addExerciseTo(target, exId) {
  if (target.type === 'workout') {
    const w = S.workouts[target.id];
    const last = lastPerformance(exId, w);
    const n = last ? last.sets.length : 3;
    w.exercises.push({ exId, name: getEx(exId)?.name || '', sets: Array.from({ length: n }, emptySet) });
    saveWorkout(w.id);
  } else if (target.type === 'routine') {
    target.draft.items.push({ exId, sets: 3 });
  }
  target._scroll = 1e6; // baja hasta el ejercicio añadido
  popTo(target);
}

/* Crear o editar un ejercicio y sus músculos */
SHEETS['ex-edit'] = {
  title: (s) => (s.isNew ? 'Nuevo ejercicio' : 'Músculos del ejercicio'),
  render: (s) => {
    const d = s.draft;
    const chips = (role) => MUSCLES.map((m) => {
      const on = d[role].includes(m.k);
      return `<button type="button" class="chip${on ? ' on' : ''}" data-act="ex-muscle" data-role="${role}" data-m="${m.k}" aria-pressed="${on}">${m.l}</button>`;
    }).join('');
    const isBuiltin = !!EXERCISES_BY_ID[d.id];
    return `
      <label class="field"><span>Nombre</span><input id="exf-name" type="text" value="${esc(d.name)}" placeholder="p. ej. Press inclinado en Smith" autocomplete="off" data-input="exf-name"></label>
      <div class="field"><span>Músculos principales <small>(cuentan 1 serie)</small></span><div class="chips">${chips('primary')}</div></div>
      <div class="field"><span>Músculos secundarios <small>(cuentan media serie)</small></span><div class="chips">${chips('secondary')}</div></div>
      <div class="sheet-actions">
        ${!s.isNew && !isBuiltin ? '<button type="button" class="btn danger ghost" data-act="ex-del">Borrar</button>' : ''}
        ${!s.isNew && isBuiltin && S.exercises[d.id] ? '<button type="button" class="btn ghost" data-act="ex-reset">Restablecer</button>' : ''}
        <button type="button" class="btn primary" data-act="ex-save">${s.then ? 'Guardar y añadir' : 'Guardar'}</button>
      </div>`;
  },
};

SHEETS['ex-cfg'] = {
  title: (s) => getEx(s.id)?.name || 'Ejercicio',
  render: (s) => {
    const c = exCfg(s.id);
    const custom = !!S.settings.exCfg?.[s.id];
    return `
      <p class="sheet-sub">Con este rango la app te dirá cuándo subir de peso: cuando hagas el máximo de repeticiones en todas las series, te propondrá sumar el incremento.</p>
      <div class="form-grid">
        <label class="field"><span>Mínimo de reps</span><input id="cfg-min" type="text" inputmode="numeric" value="${c.min}"></label>
        <label class="field"><span>Máximo de reps</span><input id="cfg-max" type="text" inputmode="numeric" value="${c.max}"></label>
      </div>
      <label class="field"><span>Subir de peso de</span><span class="input-unit"><input id="cfg-inc" type="text" inputmode="decimal" value="${inputVal(c.inc, 2)}"><em>kg</em></span></label>
      <p class="hint">Por defecto, 6–12 repeticiones en ejercicios compuestos y 10–20 en aislamientos. Con mancuernas se sube de 2 en 2 kg y con el resto de 2,5 en 2,5.</p>
      <div class="sheet-actions">
        ${custom ? '<button type="button" class="btn ghost" data-act="cfg-reset">Por defecto</button>' : ''}
        <button type="button" class="btn primary" data-act="cfg-save">Guardar</button>
      </div>`;
  },
};

/* Historial de un ejercicio */
SHEETS['ex-history'] = {
  title: (s) => getEx(s.id)?.name || 'Ejercicio',
  render: (s) => {
    const ex = getEx(s.id);
    const hist = exerciseHistory(s.id);
    let bestSet = null;
    let best = null;
    for (const h of hist) {
      for (const st of h.sets) {
        const v = e1rm(st.kg, st.reps);
        if (v != null && (best == null || v > best)) { best = v; bestSet = st; }
      }
    }
    return `
      <p class="sheet-sub">${esc(musclesText(ex))}</p>
      <div class="btn-row">
        <button type="button" class="btn ghost small" data-act="ex-edit" data-id="${esc(s.id)}">Editar músculos</button>
        <button type="button" class="btn ghost small" data-act="ex-cfg" data-id="${esc(s.id)}">Rango ${exCfg(s.id).min}–${exCfg(s.id).max} · +${fmt(exCfg(s.id).inc, 2)} kg</button>
      </div>
      <div class="stats top-gap">
        <div><span class="stat-l">1RM estimado</span><span class="stat-v">${fmt(best, 1)}<small> kg</small></span></div>
        <div><span class="stat-l">Mejor serie</span><span class="stat-v">${bestSet ? setText(bestSet) : '–'}</span></div>
        <div><span class="stat-l">Sesiones</span><span class="stat-v">${hist.length}</span></div>
      </div>
      <div class="chart" id="ex-chart"></div>
      ${hist.length ? (() => {
        const pl = pageList('hist-' + s.id, hist, 15, (h) => `<li class="row static hist">
          <span class="row-main">${dayLabel(h.date)}</span>
          <span class="row-sub">${h.sets.map(setText).join(' · ')}</span>
          <span class="row-side">${h.best ? fmt(h.best, 1) : '–'} <small>1RM est.</small></span>
        </li>`);
        return `<h3 class="list-title">Historial</h3><ul class="list">${pl.html}</ul>${pl.more}`;
      })() : '<p class="empty">Aún no has hecho este ejercicio.</p>'}
      <p class="hint">1RM estimado con la fórmula de Epley a partir de series de hasta 12 repeticiones.</p>`;
  },
  mount: (s) => drawExChart(s.id),
};

export function drawExChart(exId) {
  const host = $('#ex-chart');
  if (!host) return;
  const pts = exerciseHistory(exId).filter((h) => h.best != null).reverse();
  if (pts.length < 2) { host.innerHTML = ''; return; }
  const W = Math.max(280, host.clientWidth);
  const H = 170;
  const m = { l: 38, r: 12, t: 12, b: 24 };
  const t0 = parseISO(pts[0].date).getTime();
  const t1 = Math.max(parseISO(pts[pts.length - 1].date).getTime(), t0 + 864e5);
  const xs = (d) => m.l + ((parseISO(d).getTime() - t0) / (t1 - t0)) * (W - m.l - m.r);
  let lo = Math.min(...pts.map((p) => p.best));
  let hi = Math.max(...pts.map((p) => p.best));
  if (hi - lo < 5) { lo -= 2.5; hi += 2.5; }
  const step = niceStep(hi - lo, 4);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ys = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
  let g = '';
  for (let v = lo; v <= hi + 1e-9; v += step) {
    const y = ys(v).toFixed(1);
    g += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}"/><text class="axis" x="${m.l - 6}" y="${y}" dy="0.32em" text-anchor="end">${fmt(v)}</text>`;
  }
  g += `<text class="axis" x="${m.l}" y="${H - 6}">${dateShort(pts[0].date)}</text><text class="axis" x="${W - m.r}" y="${H - 6}" text-anchor="end">${dateShort(pts[pts.length - 1].date)}</text>`;
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${xs(p.date).toFixed(1)},${ys(p.best).toFixed(1)}`).join('');
  const dots = pts.map((p) => `<circle class="w-end" cx="${xs(p.date).toFixed(1)}" cy="${ys(p.best).toFixed(1)}" r="3.5"/>`).join('');
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Evolución del 1RM estimado">${g}<path class="w-avg" d="${path}"/>${dots}</svg>`;
}

/* Rutinas */
SHEETS.routines = {
  title: () => 'Rutinas',
  render: () => {
    const list = Object.values(S.routines).sort((a, b) => (a.group || '').localeCompare(b.group || '') || (a.seq ?? 0) - (b.seq ?? 0) || a.name.localeCompare(b.name, 'es'));
    const tpls = TEMPLATES.map((t) => {
      const added = Object.values(S.routines).some((r) => r.group === t.id);
      return `<div class="tpl">
        <div><b>${esc(t.name)}</b><p class="muted small-text">${esc(t.description)}</p></div>
        ${added ? '<span class="tag">añadida</span>' : `<button type="button" class="btn small" data-act="tpl-add" data-id="${t.id}">Añadir</button>`}
      </div>`;
    }).join('');
    return `
      <button type="button" class="btn wide" data-act="routine-new">Nueva rutina</button>
      <h3 class="list-title">Plantillas</h3>
      ${tpls}
      <h3 class="list-title">Tus rutinas</h3>
      ${list.length ? `<ul class="list top-gap">${list.map((r) => `<li><button type="button" class="row" data-act="routine-open" data-id="${r.id}">
        <span class="row-main">${esc(r.name)}</span>
        <span class="row-sub">${r.items.map((it) => esc(getEx(it.exId)?.name || '')).join(', ') || 'Sin ejercicios'}</span>
        <span class="row-side">${r.items.reduce((a, it) => a + (it.sets || 0), 0)} <small>series</small></span>
      </button></li>`).join('')}</ul>` : '<p class="empty">Una rutina es tu plantilla de un día de gimnasio, por ejemplo «Empuje» o «Pierna», con sus ejercicios y el número de series.</p>'}`;
  },
};

SHEETS.routine = {
  title: (s) => (s.isNew ? 'Nueva rutina' : 'Rutina'),
  render: (s) => {
    const d = s.draft;
    return `
      <label class="field"><span>Nombre</span><input id="rt-name" type="text" value="${esc(d.name)}" placeholder="p. ej. Empuje" autocomplete="off" data-input="rt-name"></label>
      <h3 class="list-title">Ejercicios</h3>
      <ul class="ingredients routine-items">${d.items.map((it, i) => `<li>
        <span class="ing-name">${esc(getEx(it.exId)?.name || 'Ejercicio borrado')}</span>
        <label class="unit-after"><input type="text" inputmode="numeric" value="${it.sets}" data-input="rt-sets" data-idx="${i}" aria-label="Series de ${esc(getEx(it.exId)?.name || '')}"><span>series</span></label>
        <button type="button" class="icon-btn small" data-act="rt-del-item" data-idx="${i}" aria-label="Quitar">×</button>
      </li>`).join('')}</ul>
      ${d.items.length ? '' : '<p class="empty">Añade los ejercicios en el orden en que los haces.</p>'}
      <button type="button" class="btn ghost wide" data-act="rt-add">+ Añadir ejercicio</button>
      <div class="sheet-actions">
        ${s.isNew ? '' : '<button type="button" class="btn danger ghost" data-act="rt-delete">Borrar</button>'}
        ${s.isNew ? '' : '<button type="button" class="btn ghost" data-act="rt-start">Empezar</button>'}
        <button type="button" class="btn primary" data-act="rt-save">Guardar</button>
      </div>`;
  },
};

export function saveRoutineDraft(s) {
  const d = s.draft;
  d.name = $('#rt-name').value.trim();
  if (!d.name) { toast('Ponle un nombre a la rutina.'); return false; }
  if (!d.items.length) { toast('Añade al menos un ejercicio.'); return false; }
  d.items.forEach((it) => { it.sets = Math.max(1, Math.round(it.sets || 1)); });
  S.routines[d.id] = structuredClone(d);
  saveRoutines();
  return true;
}

export function openWorkout(id) {
  pushSheet({ type: 'workout', id });
}

export async function exportCsvEntrenos() {
  const rows = [['fecha', 'entrenamiento', 'ejercicio', 'serie', 'tipo', 'kg', 'repeticiones', 'RIR', '1RM estimado (kg)', 'músculos principales', 'superserie', 'nota de la sesión'].join(';')];
  for (const w of [...workoutsSorted()].reverse()) {
    for (const we of w.exercises) {
      const ex = getEx(we.exId);
      let n = 0;
      for (const st of we.sets) {
        if (!isEffective(st) && st.t !== 'w') continue;
        const warm = st.t === 'w';
        if (!warm) n++;
        rows.push([w.date, w.name, exName(we), warm ? '' : n, warm ? 'calentamiento' : 'efectiva', csvNum(st.kg, 2), st.reps ?? '', st.rir ?? '',
          csvNum(warm ? null : e1rm(st.kg, st.reps), 1), (ex?.primary || []).map((m) => MUSCLE_NAME[m]).join(', '), we.ss ? 'sí' : '', we.note || ''].map(csvText).join(';'));
      }
    }
  }
  await deliverFile(`fitness-entrenos-${today()}.csv`, '﻿' + rows.join('\r\n'), 'text/csv');
}

/* ---------- cronómetro de descanso ---------- */

let rest = null; // { end, total, exId, name, timer, finished }
let audioCtx = null;
let wakeLock = null;

export function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { audioCtx = null; }
}

export function beep() {
  if (!S.settings.restSound || !audioCtx) return;
  try {
    const t0 = audioCtx.currentTime;
    [0, 0.22, 0.44].forEach((d, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = i === 2 ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.18);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0 + d);
      o.stop(t0 + d + 0.2);
    });
  } catch (e) { /* sin audio */ }
}

export async function keepAwake(on) {
  try {
    if (on && !wakeLock && navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) { wakeLock = null; }
}

export function restEl() {
  let el = $('#rest-timer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'rest-timer';
    el.setAttribute('role', 'timer');
    el.hidden = true;
    document.body.appendChild(el);
  }
  return el;
}

export function startRest(exId, name) {
  unlockAudio();
  const total = S.settings.restByEx?.[exId] || S.settings.rest || 120;
  if (rest?.timer) clearInterval(rest.timer);
  rest = { end: Date.now() + total * 1000, total, exId, name, finished: false, timer: null };
  rest.timer = setInterval(tickRest, 250);
  saveRestState();
  updateWake();
  drawRest();
}

export function adjustRest(delta) {
  if (!rest) return;
  rest.end += delta * 1000;
  rest.total = Math.max(15, rest.total + delta);
  // Recuerda el nuevo tiempo para este ejercicio
  S.settings.restByEx = { ...(S.settings.restByEx || {}), [rest.exId]: rest.total };
  saveSettings();
  if (rest.end <= Date.now()) rest.end = Date.now() + 1000;
  rest.finished = false;
  saveRestState();
  drawRest();
}

export function stopRest() {
  if (rest?.timer) clearInterval(rest.timer);
  rest = null;
  saveRestState();
  restEl().hidden = true;
  document.body.classList.remove('resting');
  updateWake();
}

export function tickRest() {
  if (!rest) return;
  const left = (rest.end - Date.now()) / 1000;
  if (left <= 0 && !rest.finished) {
    rest.finished = true;
    beep();
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    setTimeout(() => { if (rest?.finished) stopRest(); }, 6000);
  }
  drawRest();
}

export function drawRest() {
  const el = restEl();
  if (!rest) { el.hidden = true; return; }
  const left = Math.max(0, Math.ceil((rest.end - Date.now()) / 1000));
  const pct = Math.min(100, (1 - left / rest.total) * 100);
  const html = rest.finished
    ? `<div class="rest-main"><span class="rest-label">Descanso terminado</span><span class="rest-time">¡Siguiente serie!</span></div>
       <button type="button" class="rest-btn" data-act="rest-skip">Cerrar</button>`
    : `<div class="rest-main"><span class="rest-label">Descanso · ${esc(rest.name)}</span><span class="rest-time">${restLabel(left)}</span></div>
       <button type="button" class="rest-btn" data-act="rest-add" data-d="-15" aria-label="Quitar 15 segundos">−15</button>
       <button type="button" class="rest-btn" data-act="rest-add" data-d="15" aria-label="Añadir 15 segundos">+15</button>
       <button type="button" class="rest-btn" data-act="rest-skip">Saltar</button>`;
  if (el.dataset.html !== html) { el.innerHTML = html + '<span class="rest-progress"></span>'; el.dataset.html = html; }
  el.querySelector('.rest-progress').style.width = `${pct}%`;
  el.classList.toggle('finished', rest.finished);
  el.hidden = false;
  document.body.classList.add('resting');
}

// El descanso se guarda para seguir contando aunque se cierre la app
export function saveRestState() {
  try {
    if (rest) localStorage.setItem('rest', JSON.stringify({ end: rest.end, total: rest.total, exId: rest.exId, name: rest.name }));
    else localStorage.removeItem('rest');
  } catch (e) { /* sin almacenamiento */ }
}
export function restoreRest() {
  try {
    const r = JSON.parse(localStorage.getItem('rest') || 'null');
    if (!r || Date.now() - r.end > 60000) { localStorage.removeItem('rest'); return; }
    rest = { ...r, finished: r.end <= Date.now(), timer: null };
    rest.timer = setInterval(tickRest, 250);
    if (rest.finished) setTimeout(() => { if (rest?.finished) stopRest(); }, 6000);
    drawRest();
  } catch (e) { /* nada que restaurar */ }
}

HOOKS.visible.push(() => { if (rest) tickRest(); updateWake(); });

/* ---------- acciones ---------- */

Object.assign(ACTIONS, {
  'start-workout': async (el, top, act) => {
      pushSheet({ type: 'start' });
  },
  'start-empty': async (el, top, act) => {
 const w = newWorkout(null); replaceTop({ type: 'workout', id: w.id }); render(); return;
  },
  'start-routine': async (el, top, act) => {
      const r = S.routines[el.dataset.id];
      if (!r) return;
      const w = newWorkout(r);
      replaceTop({ type: 'workout', id: w.id });
      render();
      return;
  },
  'open-workout': async (el, top, act) => {
      openWorkout(el.dataset.id);
  },
  'open-routines': async (el, top, act) => {
      pushSheet({ type: 'routines' });
  },
  'open-library': async (el, top, act) => {
      pushSheet({ type: 'ex-picker', mode: 'library', q: '', muscle: '' });
  },
  'week-prev': async (el, top, act) => {
      S.ui.week = addDays(S.ui.week, -7); render();
  },
  'week-next': async (el, top, act) => {
      S.ui.week = addDays(S.ui.week, 7); render();
  },
  'set-add': async (el, top, act) => {
      const w = S.workouts[top.id];
      const we = w.exercises[Number(el.dataset.i)];
      const prev = we.sets[we.sets.length - 1];
      we.sets.push({ kg: prev ? prev.kg : null, reps: prev ? prev.reps : null, t: 'n', done: false });
      saveWorkout(w.id);
      renderSheets();
      return;
  },
  'wk-ex-del': async (el, top) => {
      const fromMenu = top.type === 'wk-ex-menu';
      const w = S.workouts[fromMenu ? top.wid : top.id];
      const i = fromMenu ? top.i : Number(el.dataset.i);
      if (fromMenu) popTo(top.parent);
      const old = w.exercises[i];
      undoable(`${exName(old)} quitado`,
        () => { w.exercises.splice(i, 1); saveWorkout(w.id); renderSheets(); },
        () => { w.exercises.splice(i, 0, old); saveWorkout(w.id); renderSheets(); });
  },
  'wk-to-routine': async (el, top, act) => {
      const w = S.workouts[top.id];
      const items = w.exercises.map((we) => ({ exId: we.exId, sets: Math.max(1, we.sets.filter((x) => x.t !== 'w').length) }));
      pushSheet({ type: 'routine', isNew: true, draft: { id: uid(), name: w.name === 'Entrenamiento' ? '' : w.name, items } });
      return;
  },
  'rest-add': async (el, top, act) => {
      adjustRest(Number(el.dataset.d));
  },
  'rest-skip': async (el, top, act) => {
      stopRest();
  },
  'wk-ex-add': async (el, top, act) => {
      pushSheet({ type: 'ex-picker', mode: 'workout', target: top, q: '', muscle: '' });
  },
  'wk-finish': async (el, top, act) => {
      const w = S.workouts[top.id];
      if (!w) { closeSheets(); return; }
      // Limpia series vacías y ejercicios sin series
      w.exercises.forEach((we) => { we.sets = we.sets.filter((st) => st.done || st.kg != null || st.reps != null); });
      w.exercises = w.exercises.filter((we) => we.sets.length);
      const wasOpen = !w.end;
      if (wasOpen) w.end = new Date().toISOString();
      saveWorkout(w.id);
      if (wasOpen && w.exercises.length) { stopRest(); replaceTop({ type: 'wk-summary', id: w.id }); render(); return; }
      closeSheets();
      if (wasOpen) toast('Entrenamiento guardado');
      return;
  },
  'wk-del': async (el, top) => {
      const id = top.id;
      const old = S.workouts[id];
      closeSheets();
      if (!old) return;
      undoable('Entrenamiento borrado',
        () => { delete S.workouts[id]; saveWorkout(id); render(); },
        () => { S.workouts[id] = old; saveWorkout(id); render(); });
  },
  'ex-cfg': async (el, top, act) => {
      pushSheet({ type: 'ex-cfg', id: el.dataset.id });
  },
  'cfg-save': async (el, top, act) => {
      const min = Math.round(num($('#cfg-min').value) || 0);
      const max = Math.round(num($('#cfg-max').value) || 0);
      const inc = num($('#cfg-inc').value);
      if (!min || !max || min > max) { toast('El mínimo tiene que ser menor o igual que el máximo.'); return; }
      if (!inc || inc <= 0) { toast('Pon un incremento de peso mayor que cero.'); return; }
      S.settings.exCfg = { ...(S.settings.exCfg || {}), [top.id]: { min, max, inc } };
      saveSettings();
      popSheet();
      toast('Rango guardado');
      return;
  },
  'cfg-reset': async (el, top, act) => {
 const c = { ...(S.settings.exCfg || {}) }; delete c[top.id]; S.settings.exCfg = c; saveSettings(); popSheet(); return;
  },
  'ex-filter': async (el, top, act) => {
      top.muscle = el.dataset.m; renderSheets();
  },
  'ex-pick': async (el, top) => {
      if (top.mode === 'replace') replaceExercise(top.target, top.idx, el.dataset.id);
      else addExerciseTo(top.target, el.dataset.id);
  },
  'ex-new': async (el, top, act) => {
      pushSheet({ type: 'ex-edit', isNew: true, draft: { id: 'u-' + uid(), name: top.q || '', primary: top.muscle ? [top.muscle] : [], secondary: [] }, then: top.target || null });
  },
  'ex-history': async (el, top, act) => {
      pushSheet({ type: 'ex-history', id: el.dataset.id });
  },
  'ex-edit': async (el, top, act) => {
      const ex = getEx(el.dataset.id);
      if (ex) pushSheet({ type: 'ex-edit', isNew: false, draft: structuredClone(ex) });
      return;
  },
  'ex-muscle': async (el, top, act) => {
      const d = top.draft;
      const role = el.dataset.role, other = role === 'primary' ? 'secondary' : 'primary';
      const m = el.dataset.m;
      if (d[role].includes(m)) d[role] = d[role].filter((x) => x !== m);
      else { d[role].push(m); d[other] = d[other].filter((x) => x !== m); }
      renderSheets();
      return;
  },
  'ex-save': async (el, top, act) => {
      const d = top.draft;
      d.name = $('#exf-name').value.trim();
      if (!d.name) { toast('Ponle un nombre al ejercicio.'); return; }
      if (!d.primary.length) { toast('Elige al menos un músculo principal.'); return; }
      S.exercises[d.id] = { id: d.id, name: d.name, primary: d.primary, secondary: d.secondary, builtin: !!EXERCISES_BY_ID[d.id] };
      saveExercises();
      toast('Ejercicio guardado');
      if (top.then) addExerciseTo(top.then, d.id);
      else popSheet();
      return;
  },
  'ex-reset': async (el, top, act) => {
      delete S.exercises[top.draft.id]; saveExercises(); popSheet(); toast('Músculos restablecidos');
  },
  'ex-del': async (el, top) => {
      const id = top.draft.id;
      const old = S.exercises[id];
      closeSheets();
      if (!old) return;
      undoable(`«${old.name}» borrado`,
        () => { delete S.exercises[id]; saveExercises(); render(); },
        () => { S.exercises[id] = old; saveExercises(); render(); });
  },
  'tpl-add': async (el) => {
      const t = TEMPLATES.find((x) => x.id === el.dataset.id);
      if (!t) return;
      addTemplate(t);
      renderSheets();
      toast(`${t.routines.length} rutinas añadidas`);
  },
  'routine-new': async (el, top, act) => {
      pushSheet({ type: 'routine', isNew: true, draft: { id: uid(), name: '', items: [] } });
  },
  'routine-open': async (el, top, act) => {
 const r = S.routines[el.dataset.id]; if (r) pushSheet({ type: 'routine', isNew: false, draft: structuredClone(r) }); return;
  },
  'rt-add': async (el, top, act) => {
      pushSheet({ type: 'ex-picker', mode: 'routine', target: top, q: '', muscle: '' });
  },
  'rt-del-item': async (el, top, act) => {
      top.draft.items.splice(Number(el.dataset.idx), 1); renderSheets();
  },
  'rt-save': async (el, top, act) => {
      if (saveRoutineDraft(top)) { popSheet(); toast('Rutina guardada'); }
  },
  'rt-start': async (el, top, act) => {
      if (!saveRoutineDraft(top)) return;
      const w = newWorkout(S.routines[top.draft.id]);
      S.sheets = [];
      S.ui.tab = 'entreno';
      pushSheet({ type: 'workout', id: w.id });
      render();
      return;
  },
  'rt-delete': async (el, top) => {
      const id = top.draft.id;
      const old = S.routines[id];
      if (!old) { popSheet(); return; }
      popSheet();
      undoable(`Rutina «${old.name}» borrada`,
        () => { delete S.routines[id]; saveRoutines(); renderSheets(); },
        () => { S.routines[id] = old; saveRoutines(); renderSheets(); });
  },
});

const multi_set_type = async (el, top, act) => {
      const w = S.workouts[top.id];
      const i = Number(el.dataset.i), j = Number(el.dataset.j);
      const we = w?.exercises[i];
      if (!we) return;
      const st = we.sets[j];
      if (act === 'set-type') st.t = st.t === 'w' ? 'n' : 'w';
      else if (act === 'set-del') we.sets.splice(j, 1);
      else {
        st.done = !st.done;
        // Al marcarla hecha sin datos, copia lo de la última vez
        if (st.done) {
          const kgIn = $(`[data-input="set-kg"][data-i="${i}"][data-j="${j}"]`);
          const repIn = $(`[data-input="set-reps"][data-i="${i}"][data-j="${j}"]`);
          if (st.kg == null && kgIn) st.kg = num(kgIn.placeholder);
          if (st.reps == null && repIn) { const r = num(repIn.placeholder); st.reps = r == null ? null : Math.round(r); }
          const nextEx = w.exercises[i + 1];
          if (we.ss && nextEx && nextEx.ss === we.ss) toast(`Superserie: ahora ${exName(nextEx)}`);
          else startRest(we.exId, exName(we));
        }
      }
      saveWorkout(w.id);
      renderSheets();
      return;
};
ACTIONS['set-type'] = multi_set_type;
ACTIONS['set-done'] = multi_set_type;
ACTIONS['set-del'] = multi_set_type;

Object.assign(ACTIONS, {
  'wview': (el) => { S.ui.wview = el.dataset.v; render(); },
  'wk-summary-open': (el, top) => replaceTop({ type: 'workout', id: top.id }),
  // Botones − / +: kilos según el incremento del ejercicio y repeticiones de 1 en 1
  'step': (el, top) => {
    const w = S.workouts[top.id];
    const i = Number(el.dataset.i), j = Number(el.dataset.j);
    const we = w?.exercises[i];
    const st = we?.sets[j];
    if (!st) return;
    const f = el.dataset.f;
    const d = Number(el.dataset.d);
    const input = $(`[data-input="set-${f}"][data-i="${i}"][data-j="${j}"]`);
    const base = st[f] ?? num(input?.placeholder) ?? 0;
    if (f === 'kg') st.kg = Math.max(0, Math.round((base + d * exCfg(we.exId).inc) * 100) / 100);
    else st.reps = Math.max(0, Math.round(base + d));
    if (input) input.value = f === 'kg' ? inputVal(st.kg, 2) : String(st.reps);
    saveWorkout(w.id);
  },
  'wk-ex-toggle': (el, top) => {
    const i = Number(el.dataset.i);
    top.open = { ...(top.open || {}), [i]: !top.open?.[i] };
    renderSheets();
  },
  'wk-ex-menu': (el, top) => pushSheet({ type: 'wk-ex-menu', wid: top.id, i: Number(el.dataset.i), parent: top }),
  'wk-ex-move': (el, top) => {
    const w = S.workouts[top.wid];
    const i = top.i, j = i + Number(el.dataset.d);
    if (j < 0 || j >= w.exercises.length) return;
    [w.exercises[i], w.exercises[j]] = [w.exercises[j], w.exercises[i]];
    tidySupersets(w);
    saveWorkout(w.id);
    top.parent.open = {};
    popTo(top.parent);
  },
  'wk-ex-replace': (el, top) => pushSheet({ type: 'ex-picker', mode: 'replace', target: top.parent, idx: top.i, q: '', muscle: getEx(S.workouts[top.wid].exercises[top.i].exId)?.primary[0] || '' }),
  'ss-join': (el, top) => {
    const w = S.workouts[top.wid];
    const we = w.exercises[top.i];
    const next = w.exercises[top.i + 1];
    if (!next) return;
    const id = we.ss || next.ss || uid();
    we.ss = id;
    next.ss = id;
    saveWorkout(w.id);
    popTo(top.parent);
    toast('Superserie creada');
  },
  'ss-split': (el, top) => {
    const w = S.workouts[top.wid];
    delete w.exercises[top.i].ss;
    tidySupersets(w);
    saveWorkout(w.id);
    popTo(top.parent);
  },
  'ex-note-open': (el, top) => pushSheet({ type: 'ex-note', wid: top.wid, i: top.i, parent: top.parent }),
  'ex-note-save': (el, top) => {
    const w = S.workouts[top.wid];
    const we = w.exercises[top.i];
    const fixed = $('#note-fixed').value.trim();
    const today_ = $('#note-today').value.trim();
    const notes = { ...(S.settings.exNotes || {}) };
    if (fixed) notes[we.exId] = fixed; else delete notes[we.exId];
    S.settings.exNotes = notes;
    saveSettings();
    if (today_) we.note = today_; else delete we.note;
    saveWorkout(w.id);
    popTo(top.parent);
  },
});

// Pantalla encendida: durante el descanso siempre, y durante todo el entreno si se activa en Ajustes
export function updateWake() {
  const top = S.sheets[S.sheets.length - 1];
  const training = S.settings.keepAwake && top?.type === 'workout' && !S.workouts[top.id]?.end;
  keepAwake(!!(rest && !rest.finished) || !!training);
}
HOOKS.sheetChange.push(() => updateWake());

/* ---------- registro de vista y escritura ---------- */

VIEWS.entreno = { html: viewEntreno };

Object.assign(INPUTS, {
  'set-kg': (el, top) => setField(el, top, 'kg'),
  'set-reps': (el, top) => setField(el, top, 'reps'),
  'set-rir': (el, top) => setField(el, top, 'rir'),
  'wk-name': (el, top) => { const w = S.workouts[top.id]; if (w) { w.name = el.value; saveWorkout(w.id); } },
  'ex-q': (el, top) => { top.q = el.value; fillExList(top); },
  'exf-name': (el, top) => { top.draft.name = el.value; },
  'rt-name': (el, top) => { top.draft.name = el.value; },
  'rt-sets': (el, top) => { top.draft.items[Number(el.dataset.idx)].sets = num(el.value) || 1; },
});

function setField(el, top, field) {
  const w = S.workouts[top.id];
  const st = w?.exercises[Number(el.dataset.i)]?.sets[Number(el.dataset.j)];
  if (!st) return;
  const v = num(el.value);
  st[field] = field === 'kg' ? v : (v == null ? null : Math.max(0, Math.round(v)));
  saveWorkout(w.id);
}

CHANGES['wk-date'] = (el, top) => {
  const w = S.workouts[top?.id];
  if (w && el.value) { w.date = el.value; saveWorkout(w.id); renderSheets(); }
};

// Recuerda si un desplegable de una hoja está abierto, para que no se cierre al repintar
document.addEventListener('toggle', (e) => {
  const k = e.target?.dataset?.toggle;
  const top = S.sheets[S.sheets.length - 1];
  if (k && top) top[k] = e.target.open;
}, true);
