import { MACROS, MICROS, sumNut } from './nutrients.js';
import { $, APP_VERSION, csvNum, csvText, dateLong, deliverFile, fmt, inputVal, num, plural, restLabel, today } from './util.js';
import { MEAL_NAME, S, SCHEMA, flushAll, replaceAll, saveSettings, snapshot, wipeAll } from './state.js';
import { ACTIVITY, dayOf, parseUnit, pluralEs } from './derived.js';
import { ACTIONS, CHANGES, FORMS, VIEWS, applyTheme, closeSheets, pushSheet, render, toast } from './ui.js';
import { exportCsvEntrenos } from './training.js';
import { exportCsvActividades } from './cardio.js';
import { exportPhotos, importPhotos } from './photos.js';
import { syncConfigured, syncState } from './sync.js';
import { accountCard } from './account.js';

/* ---------- vista: Ajustes ---------- */

export function viewAjustes() {
  const g = S.settings.goals;
  const gt = S.settings.goalsTrain;
  const pr = S.settings.profile;
  const field = (id, label, value, unit) => `
    <label class="field"><span>${label}</span>
      <span class="input-unit"><input id="${id}" type="text" inputmode="decimal" value="${value == null ? '' : inputVal(value, 0)}" placeholder="–"><em>${unit}</em></span>
    </label>`;
  const nDays = Object.keys(S.days).length;
  const nFoods = Object.keys(S.foods).length;
  const nRec = Object.keys(S.recipes).length;
  const nWk = Object.keys(S.workouts).length;
  const last = S.settings.lastBackup;
  return `
  <header class="page-head"><h1>Ajustes</h1></header>

  <nav class="chips scroll aj-nav" aria-label="Secciones de ajustes">
    ${[...(syncConfigured() ? [['cuenta', 'Cuenta']] : []), ['objetivos', 'Objetivos'], ['cuerpo', 'Tu cuerpo'], ['entreno', 'Entreno'], ['apariencia', 'Apariencia'], ['datos', 'Datos']].map(([k, l]) => `<button type="button" class="chip" data-act="aj-jump" data-k="${k}">${l}</button>`).join('')}
  </nav>

  ${accountCard()}

  <section class="card" id="aj-objetivos">
    <div class="card-head"><h2>Objetivos diarios</h2></div>
    <form data-form="goals" class="form-grid">
      ${field('g-kcal', 'Calorías', g.kcal, 'kcal')}
      ${field('g-p', 'Proteínas', g.p, 'g')}
      ${field('g-c', 'Hidratos', g.c, 'g')}
      ${field('g-f', 'Grasas', g.f, 'g')}
      ${field('g-steps', 'Pasos', g.steps, 'pasos')}
      <div class="full sub-head">
        <h3>Días de entreno <small>(opcional)</small></h3>
        <p class="hint">Si los rellenas, se usan los días en que registres un entrenamiento, y los de arriba el resto. Lo que dejes vacío toma el valor de arriba.</p>
      </div>
      ${field('gt-kcal', 'Calorías', gt.kcal, 'kcal')}
      ${field('gt-p', 'Proteínas', gt.p, 'g')}
      ${field('gt-c', 'Hidratos', gt.c, 'g')}
      ${field('gt-f', 'Grasas', gt.f, 'g')}
      <p class="hint full" id="goal-check"></p>
      <button class="btn full" type="submit">Guardar objetivos</button>
    </form>
  </section>


  <section class="card" id="aj-cuerpo">
    <div class="card-head"><h2>Tu cuerpo</h2></div>
    <p class="muted">Sirve para estimar tu gasto calórico mientras no haya datos suficientes y para el % de grasa a partir de las medidas.</p>
    <form data-form="profile">
      <div class="field top-gap"><span>Sexo</span>
        <div class="chips">
          <button type="button" class="chip${pr.sex === 'h' ? ' on' : ''}" data-act="sex" data-v="h" aria-pressed="${pr.sex === 'h'}">Hombre</button>
          <button type="button" class="chip${pr.sex === 'm' ? ' on' : ''}" data-act="sex" data-v="m" aria-pressed="${pr.sex === 'm'}">Mujer</button>
        </div>
      </div>
      <div class="form-grid">
        <label class="field"><span>Año de nacimiento</span><input id="pf-year" type="text" inputmode="numeric" value="${pr.birthYear ?? ''}" placeholder="2003"></label>
        <label class="field"><span>Altura</span><span class="input-unit"><input id="pf-height" type="text" inputmode="decimal" value="${inputVal(pr.height, 1)}" placeholder="180"><em>cm</em></span></label>
      </div>
      <label class="field"><span>Actividad diaria</span>
        <select id="pf-activity">${ACTIVITY.map(([v, l]) => `<option value="${v}" ${Number(pr.activity) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </label>
      <button class="btn wide" type="submit">Guardar</button>
    </form>
  </section>


  <section class="card" id="aj-entreno">
    <div class="card-head"><h2>Entreno</h2></div>
    <label class="check"><input type="checkbox" data-change="keep-awake" ${S.settings.keepAwake ? 'checked' : ''}> Mantener la pantalla encendida mientras entrenas</label>
    <label class="check"><input type="checkbox" data-change="show-rir" ${S.settings.showRir !== false ? 'checked' : ''}> Mostrar la columna RIR (repeticiones en reserva)</label>
    <h3 class="sub-h top-gap">Descanso entre series</h3>
    <p class="muted">El cronómetro arranca solo al marcar una serie como hecha. Si cambias el tiempo durante un ejercicio, la app lo recuerda para ese ejercicio.</p>
    <div class="field top-gap"><span>Por defecto</span>
      <div class="chips">${[60, 90, 120, 150, 180, 240].map((v) => `<button type="button" class="chip${S.settings.rest === v ? ' on' : ''}" data-act="rest-default" data-s="${v}" aria-pressed="${S.settings.rest === v}">${restLabel(v)}</button>`).join('')}</div>
    </div>
    <label class="check"><input type="checkbox" id="rest-sound" data-change="rest-sound" ${S.settings.restSound ? 'checked' : ''}> Avisar con sonido al terminar</label>
  </section>


  <section class="card" id="aj-apariencia">
    <div class="card-head"><h2>Apariencia</h2></div>
    <div class="chips" role="group" aria-label="Tema">
      ${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, l]) => `<button type="button" class="chip${(S.settings.theme || 'auto') === v ? ' on' : ''}" data-act="theme" data-v="${v}" aria-pressed="${(S.settings.theme || 'auto') === v}">${l}</button>`).join('')}
    </div>
    <p class="hint">Automático sigue el modo claro u oscuro del iPhone.</p>
    <h3 class="sub-h top-gap">Tamaño del texto</h3>
    <div class="chips" role="group" aria-label="Tamaño del texto">
      ${[['system', 'El del iPhone'], ['normal', 'Normal'], ['large', 'Grande']].map(([v, l]) => `<button type="button" class="chip${(S.settings.textSize || 'system') === v ? ' on' : ''}" data-act="text-size" data-v="${v}" aria-pressed="${(S.settings.textSize || 'system') === v}">${l}</button>`).join('')}
    </div>
    <p class="hint">«El del iPhone» sigue Ajustes › Pantalla y brillo › Tamaño del texto.</p>
    <label class="check"><input type="checkbox" data-change="big-buttons" ${S.settings.bigButtons ? 'checked' : ''}> Botones más grandes</label>
  </section>


  <section class="card" id="aj-datos">
    <div class="card-head"><h2>Tus datos</h2></div>
    <p class="muted">Se guardan solo en este teléfono: ${plural(nDays, 'día', 'días')} de diario, ${plural(nWk, 'entrenamiento', 'entrenamientos')}, ${plural(Object.keys(S.activities).length, 'actividad', 'actividades')}, ${plural(nFoods, 'alimento propio', 'alimentos propios')} y ${plural(nRec, 'receta', 'recetas')}.
      ${last ? `Última copia: ${dateLong(last.slice(0, 10))}.` : 'Aún no has guardado ninguna copia.'}</p>
    <div class="stack">
      <button type="button" class="btn" data-act="export-json">Guardar copia completa (.json)</button>
      <button type="button" class="btn ghost" data-act="export-csv-diario">Exportar comidas para Excel (.csv)</button>
      <button type="button" class="btn ghost" data-act="export-csv-resumen">Exportar resumen diario, peso y pasos (.csv)</button>
      <button type="button" class="btn ghost" data-act="export-csv-entrenos">Exportar entrenamientos de fuerza (.csv)</button>
      <button type="button" class="btn ghost" data-act="export-csv-actividades">Exportar cardio y actividades (.csv)</button>
      <button type="button" class="btn ghost" data-act="import">Restaurar una copia…</button>
    </div>
    <p class="hint">La copia completa sirve para restaurar todo si cambias de móvil o borras la app. Los .csv se abren en Excel.</p>
    <h3 class="sub-h top-gap">Fotos de progreso</h3>
    <p class="muted">Las fotos no van en la copia completa, para que esta siga siendo pequeña. Guárdalas aparte.</p>
    <div class="stack top-gap">
      <button type="button" class="btn ghost" data-act="export-photos">Guardar copia de las fotos (.json)</button>
      <button type="button" class="btn ghost" data-act="import-photos">Restaurar fotos…</button>
    </div>
  </section>

  <section class="card">
    <div class="card-head"><h2>Otros</h2></div>
    <button type="button" class="btn ghost wide" data-act="onboarding">Ver la bienvenida otra vez</button>
    <h3 class="sub-h top-gap">Zona peligrosa</h3>
    <button type="button" class="btn danger" data-act="wipe">Borrar todos los datos</button>
  </section>

  <p class="foot">Fitness ${APP_VERSION} · Datos de productos: <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a> (ODbL) · Dibujo del cuerpo basado en <a href="https://github.com/HichamELBSI/react-native-body-highlighter" target="_blank" rel="noopener">react-native-body-highlighter</a> (MIT)</p>`;
}

/* ---------- exportar e importar ---------- */

export async function exportJSON() {
  flushAll();
  const data = { app: 'fitness-app', schema: SCHEMA, exportedAt: new Date().toISOString(), ...snapshot() };
  const ok = await deliverFile(`fitness-copia-${today()}.json`, JSON.stringify(data), 'application/json');
  if (ok) {
    S.settings.lastBackup = new Date().toISOString();
    saveSettings();
    render();
    toast('Copia preparada');
  }
}

export async function exportCsvDiario() {
  const head = ['fecha', 'comida', 'alimento', 'cantidad', 'unidad', ...[...MACROS, ...MICROS].map((n) => `${n.l.replace(/^de (los|las) cuales /, '')} (${n.u})`)];
  const rows = [head.map(csvText).join(';')];
  for (const date of Object.keys(S.days).sort()) {
    for (const e of S.days[date].entries) {
      rows.push([date, MEAL_NAME[e.meal] || e.meal, e.name, csvNum(e.qty, 2), e.unit === 'rac' ? 'raciones' : e.unit === 'ud' ? 'a mano' : parseUnit(e.unit) ? `${pluralEs(parseUnit(e.unit).n, 2)} (${csvNum(parseUnit(e.unit).g, 0)} g)` : 'g',
        ...[...MACROS, ...MICROS].map((n) => csvNum(e.n[n.k], n.k === 'kcal' ? 0 : 2))].map(csvText).join(';'));
    }
  }
  await deliverFile(`fitness-comidas-${today()}.csv`, '﻿' + rows.join('\r\n'), 'text/csv');
}

export async function exportCsvResumen() {
  const dates = [...new Set([...Object.keys(S.days), ...Object.keys(S.weights)])].sort();
  const rows = [['fecha', 'kcal', 'proteinas (g)', 'hidratos (g)', 'grasas (g)', 'fibra (g)', 'sal (g)', 'pasos', 'peso (kg)'].join(';')];
  for (const d of dates) {
    const day = dayOf(d);
    const { tot } = sumNut(day.entries.map((e) => e.n));
    rows.push([d, csvNum(tot.kcal, 0), csvNum(tot.p), csvNum(tot.c), csvNum(tot.f), csvNum(tot.fi), csvNum(tot.sal, 2),
      day.steps ?? '', csvNum(S.weights[d], 2)].join(';'));
  }
  await deliverFile(`fitness-resumen-${today()}.csv`, '﻿' + rows.join('\r\n'), 'text/csv');
}

export async function importFile(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch (e) { toast('Ese archivo no es una copia válida.'); return; }
  if (!data || data.app !== 'fitness-app' || typeof data.days !== 'object') { toast('Ese archivo no es una copia de esta app.'); return; }
  if ((data.schema || 1) > SCHEMA) { toast('Esa copia es de una versión más nueva de la app. Actualiza la app y vuelve a intentarlo.'); return; }
  const nDays = Object.keys(data.days || {}).length;
  const nWk = Object.keys(data.workouts || {}).length;
  pushSheet({
    type: 'confirm',
    title: 'Restaurar copia',
    text: `La copia es del ${data.exportedAt ? dateLong(data.exportedAt.slice(0, 10)) : 'día desconocido'} y tiene ${plural(nDays, 'día', 'días')} de diario y ${plural(nWk, 'entrenamiento', 'entrenamientos')}. Sustituirá todos los datos que hay ahora en este teléfono${syncState.status !== 'off' ? ' y, como tienes la cuenta conectada, también en tus otros dispositivos' : ''}.`,
    ok: 'Restaurar',
    danger: true,
    onOk: async () => {
      try {
        await replaceAll(data);
      } catch (e) {
        toast('No se ha podido restaurar la copia. Tus datos actuales no se han tocado.');
        return;
      }
      applyTheme();
      closeSheets();
      render();
      toast('Copia restaurada');
    },
  });
}

/* ---------- acciones ---------- */

Object.assign(ACTIONS, {
  'export-json': async (el, top, act) => {
      exportJSON();
  },
  'export-csv-diario': async (el, top, act) => {
      exportCsvDiario();
  },
  'export-csv-resumen': async (el, top, act) => {
      exportCsvResumen();
  },
  'export-csv-entrenos': async () => {
      exportCsvEntrenos();
  },
  'theme': (el) => {
      S.settings.theme = el.dataset.v;
      saveSettings();
      applyTheme();
      el.parentElement.querySelectorAll('.chip').forEach((c) => { const on = c === el; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on); });
  },
  'export-csv-actividades': () => exportCsvActividades(),
  'export-photos': () => exportPhotos(),
  'import-photos': () => importPhotos(),
  'text-size': (el) => {
      S.settings.textSize = el.dataset.v;
      saveSettings();
      applyTheme();
      el.parentElement.querySelectorAll('.chip').forEach((c) => { const on = c === el; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on); });
  },
  'aj-jump': (el) => {
      const t = document.getElementById('aj-' + el.dataset.k);
      if (t) window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 12, behavior: 'smooth' });
  },
  'rest-default': async (el, top, act) => {
      S.settings.rest = Number(el.dataset.s);
      saveSettings();
      el.parentElement.querySelectorAll('.chip').forEach((c) => { const on = c === el; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on); });
      toast(`Descanso por defecto: ${restLabel(S.settings.rest)}`);
      return;
  },
  'sex': async (el, top, act) => {
      S.settings.profile.sex = el.dataset.v;
      saveSettings();
      el.parentElement.querySelectorAll('.chip').forEach((c) => { const on = c === el; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on); });
      return;
  },
  'import': async (el, top, act) => {
      $('#import-file').click();
  },
  'wipe': async (el, top, act) => {
      pushSheet({ type: 'confirm', title: 'Borrar todos los datos', text: 'Se borrarán el diario, el peso, los pasos, el sueño, los entrenamientos, el cardio, las medidas, las fotos, tus alimentos, recetas y rutinas de este teléfono. Si no tienes una copia, no se podrán recuperar. Si tienes la cuenta conectada, se cerrará la sesión aquí, pero los datos de tu cuenta no se borran.', ok: 'Borrar todo', danger: true,
        onOk: async () => {
          await wipeAll();
          applyTheme();
          render();
          toast('Datos borrados');
        } });
  },
});

/* ---------- formularios y cambios ---------- */

CHANGES['#import-file'] = (el) => {
  const f = el.files?.[0];
  el.value = '';
  if (f) importFile(f);
};
CHANGES['rest-sound'] = (el) => { S.settings.restSound = el.checked; saveSettings(); };
CHANGES['big-buttons'] = (el) => { S.settings.bigButtons = el.checked; saveSettings(); applyTheme(); };
CHANGES['keep-awake'] = (el) => { S.settings.keepAwake = el.checked; saveSettings(); };
CHANGES['show-rir'] = (el) => { S.settings.showRir = el.checked; saveSettings(); };

FORMS.goals = () => {
  const g = S.settings.goals;
  g.kcal = num($('#g-kcal').value);
  g.p = num($('#g-p').value);
  g.c = num($('#g-c').value);
  g.f = num($('#g-f').value);
  g.steps = num($('#g-steps').value);
  const gt = S.settings.goalsTrain;
  gt.kcal = num($('#gt-kcal').value);
  gt.p = num($('#gt-p').value);
  gt.c = num($('#gt-c').value);
  gt.f = num($('#gt-f').value);
  saveSettings();
  const fromMacros = (g.p || 0) * 4 + (g.c || 0) * 4 + (g.f || 0) * 9;
  toast('Objetivos guardados');
  const chk = $('#goal-check');
  if (chk && g.kcal && fromMacros) chk.textContent = `Tus macros suman ${fmt(fromMacros)} kcal${Math.abs(fromMacros - g.kcal) > 60 ? `, ${fromMacros > g.kcal ? 'más' : 'menos'} que tu objetivo de ${fmt(g.kcal)}` : ', en línea con tu objetivo'}.`;
};

FORMS.profile = () => {
  const pr = S.settings.profile;
  const y = num($('#pf-year').value);
  const h = num($('#pf-height').value);
  if (y != null && (y < 1900 || y > new Date().getFullYear() - 10)) { toast('Revisa el año de nacimiento.'); return; }
  if (h != null && (h < 100 || h > 250)) { toast('La altura va en centímetros, por ejemplo 180.'); return; }
  pr.birthYear = y;
  pr.height = h;
  pr.activity = Number($('#pf-activity').value) || 1.55;
  saveSettings();
  toast('Datos guardados');
};

VIEWS.ajustes = { html: viewAjustes };
