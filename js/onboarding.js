// Bienvenida: cuatro pantallas que se pueden saltar (objetivos, cuerpo, rutinas y copias)
import { TEMPLATES } from './templates.js';
import { $, esc, inputVal, num, today } from './util.js';
import { S, saveSettings, saveWeights } from './state.js';
import { ACTIVITY } from './derived.js';
import { ACTIONS, SHEETS, closeSheets, pushSheet, render, renderSheets } from './ui.js';
import { addTemplate, templateAdded } from './training.js';

const STEPS = ['Tus objetivos', 'Tu cuerpo', 'Tus rutinas', 'Tus datos'];

function stepGoals() {
  const g = S.settings.goals;
  const f = (id, label, v, unit, ph) => `<label class="field"><span>${label}</span><span class="input-unit"><input id="${id}" type="text" inputmode="decimal" value="${v == null ? '' : inputVal(v, 0)}" placeholder="${ph}"><em>${unit}</em></span></label>`;
  return `
    <p class="ob-lede">¿Cuánto quieres comer y moverte cada día? Lo verás en Hoy como lo que te queda.</p>
    <div class="form-grid">
      ${f('ob-kcal', 'Calorías', g.kcal, 'kcal', '2300')}
      ${f('ob-steps', 'Pasos', g.steps, 'pasos', '10000')}
      ${f('ob-p', 'Proteínas', g.p, 'g', '160')}
      ${f('ob-c', 'Hidratos', g.c, 'g', '230')}
      ${f('ob-f', 'Grasas', g.f, 'g', '70')}
    </div>
    <p class="hint">Si no lo sabes aún, sáltalo. Con tu peso y lo que comes, Progreso calcula tu gasto real y te propone un objetivo.</p>`;
}

function stepBody() {
  const pr = S.settings.profile;
  return `
    <p class="ob-lede">Sirve para estimar tu gasto calórico mientras la app no tenga datos suficientes.</p>
    <div class="field"><span>Sexo</span>
      <div class="chips">
        <button type="button" class="chip${pr.sex === 'h' ? ' on' : ''}" data-act="ob-sex" data-v="h" aria-pressed="${pr.sex === 'h'}">Hombre</button>
        <button type="button" class="chip${pr.sex === 'm' ? ' on' : ''}" data-act="ob-sex" data-v="m" aria-pressed="${pr.sex === 'm'}">Mujer</button>
      </div>
    </div>
    <div class="form-grid">
      <label class="field"><span>Año de nacimiento</span><input id="ob-year" type="text" inputmode="numeric" value="${pr.birthYear ?? ''}" placeholder="1995"></label>
      <label class="field"><span>Altura</span><span class="input-unit"><input id="ob-height" type="text" inputmode="decimal" value="${inputVal(pr.height, 1)}" placeholder="175"><em>cm</em></span></label>
      <label class="field"><span>Peso de hoy</span><span class="input-unit"><input id="ob-weight" type="text" inputmode="decimal" value="${inputVal(S.weights[today()], 2)}" placeholder="80"><em>kg</em></span></label>
    </div>
    <label class="field"><span>Actividad diaria</span>
      <select id="ob-activity">${ACTIVITY.map(([v, l]) => `<option value="${v}" ${Number(pr.activity) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </label>`;
}

function stepRoutines() {
  return `
    <p class="ob-lede">Empieza con una plantilla o crea las tuyas más tarde en Entreno › Rutinas. Las plantillas se pueden cambiar a tu gusto.</p>
    <ul class="list">${TEMPLATES.map((t) => {
      const added = templateAdded(t);
      return `<li class="tpl">
        <div><b>${esc(t.name)}</b><span class="row-sub">${esc(t.description)}</span></div>
        <button type="button" class="btn small${added ? ' ghost' : ''}" data-act="ob-tpl" data-id="${t.id}" ${added ? 'disabled' : ''}>${added ? 'Añadida ✓' : 'Añadir'}</button>
      </li>`;
    }).join('')}</ul>`;
}

function stepData() {
  return `
    <p class="ob-lede">Todo lo que apuntes se guarda <b>solo en este teléfono</b>. No hay cuenta ni servidor.</p>
    <ul class="ob-points">
      <li>Guarda una copia de vez en cuando en Ajustes › Tus datos (archivo .json). Si pasa una semana sin copia, la app te avisa.</li>
      <li>Guárdala en Archivos, en iCloud Drive o envíatela por correo: con ella recuperas todo si cambias de móvil.</li>
      <li>Abre la app siempre desde el icono de la pantalla de inicio: los datos de una pestaña de Safari son otros.</li>
    </ul>`;
}

SHEETS.onboarding = {
  title: (s) => STEPS[s.step],
  render: (s) => {
    const body = [stepGoals, stepBody, stepRoutines, stepData][s.step]();
    const last = s.step === STEPS.length - 1;
    return `
      <div class="ob-dots" aria-label="Paso ${s.step + 1} de ${STEPS.length}">${STEPS.map((_, i) => `<i class="${i === s.step ? 'on' : i < s.step ? 'done' : ''}"></i>`).join('')}</div>
      ${body}
      <div class="sheet-actions">
        ${last ? '' : '<button type="button" class="btn ghost" data-act="ob-skip">Saltar</button>'}
        <button type="button" class="btn primary" data-act="ob-next">${last ? 'Empezar' : 'Siguiente'}</button>
      </div>`;
  },
};

function saveStep(step) {
  const v = (id) => num($('#' + id)?.value);
  if (step === 0) {
    const g = S.settings.goals;
    for (const [k, id] of [['kcal', 'ob-kcal'], ['p', 'ob-p'], ['c', 'ob-c'], ['f', 'ob-f'], ['steps', 'ob-steps']]) {
      const x = v(id);
      if (x != null) g[k] = Math.round(x);
    }
    saveSettings();
  } else if (step === 1) {
    const pr = S.settings.profile;
    const y = v('ob-year');
    if (y != null && y > 1900 && y < 2100) pr.birthYear = Math.round(y);
    const h = v('ob-height');
    if (h != null && h > 100 && h < 250) pr.height = h;
    pr.activity = Number($('#ob-activity').value);
    saveSettings();
    const w = v('ob-weight');
    if (w != null && w >= 20 && w <= 400) { S.weights[today()] = w; saveWeights(); }
  }
}

function go(top, save) {
  if (save) saveStep(top.step);
  if (top.step >= STEPS.length - 1) { closeSheets(); render(); return; }
  top.step++;
  renderSheets();
}

Object.assign(ACTIONS, {
  'onboarding': () => { pushSheet({ type: 'onboarding', step: 0 }); },
  'ob-next': (el, top) => go(top, true),
  'ob-skip': (el, top) => go(top, false),
  'ob-sex': (el) => {
    S.settings.profile.sex = el.dataset.v;
    saveSettings();
    el.parentElement.querySelectorAll('.chip').forEach((c) => { const on = c === el; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on); });
  },
  'ob-tpl': (el) => {
    const t = TEMPLATES.find((x) => x.id === el.dataset.id);
    if (t) addTemplate(t);
    renderSheets();
  },
});

// Se enseña una vez a quien empieza sin datos; quien ya tiene datos no la ve
export function maybeOnboard() {
  if (S.settings.onboarded) return;
  const hasData = ['days', 'weights', 'workouts', 'foods', 'recipes', 'routines'].some((k) => Object.keys(S[k] || {}).length);
  S.settings.onboarded = true;
  saveSettings();
  if (!hasData) pushSheet({ type: 'onboarding', step: 0 });
}
