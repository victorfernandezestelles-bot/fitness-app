"""Recalcula las líneas `import` de los módulos de la app según lo que usa cada uno.

Uso: python3 tools/fix-imports.py
Cada módulo exporta sus declaraciones de nivel superior; este script añade a cada uno
los imports de los nombres que usa y que están definidos en otro módulo. Respeta las capas
para evitar ciclos en la carga: util < state < derived < ui < secciones < app.
"""
import re, os, collections

JS = os.path.join(os.path.dirname(__file__), '..', 'js')
APP_MODULES = ['util', 'state', 'derived', 'ui', 'food', 'training', 'progress', 'settings', 'app']
LIBS = ['nutrients', 'off', 'barcode', 'exercises', 'templates']
LAYER = {'util': 0, 'state': 1, 'derived': 2, 'ui': 3, 'food': 4, 'training': 4, 'progress': 4, 'settings': 4, 'app': 5}
decl = re.compile(r'^export (?:async function|function|const|let|class) ([A-Za-z_$][\w$]*)', re.M)

def strip(code):
    code = re.sub(r'/\*.*?\*/', '', code, flags=re.S)
    code = re.sub(r'//[^\n]*', '', code)
    # los textos no se quitan: dentro de las plantillas `${...}` hay código
    return code

src = {m: open(os.path.join(JS, m + '.js')).read() for m in APP_MODULES + LIBS}
defined = {}
for m, code in src.items():
    for name in decl.findall(code):
        if name in defined and defined[name] != m:
            raise SystemExit(f'{name} definido en {defined[name]} y {m}')
        defined[name] = m

for m in APP_MODULES:
    code = src[m]
    lines = code.split('\n')
    lead = []
    while lines and lines[0].startswith('//'):
        lead.append(lines.pop(0))
    side = list(dict.fromkeys(ln for ln in lines if re.match(r"^import '\./[^']+';$", ln)))
    side_comments = []
    body = '\n'.join(ln for ln in lines if not re.match(r'^import .*;$', ln))
    body = re.sub(r'^// Cada sección registra[^\n]*\n', '', body, flags=re.M)
    scan = strip(body)
    tokens = set(re.findall(r'(?:(?<=\.\.\.)|(?<![.\w$]))([A-Za-z_$][\w$]*)(?![\w$])', scan))  # incluye «...nombre»
    own = set(decl.findall(body))
    imports = collections.defaultdict(set)
    for t in tokens - own:
        s = defined.get(t)
        if not s or s == m:
            continue
        if s in LIBS:
            imports[s].add(t)
            continue
        if LAYER[s] > LAYER[m] and not (m == 'state' and s == 'ui'):
            continue  # nunca importar de una capa superior (salvo avisos desde state)
        imports[s].add(t)
    hdr = []
    if re.search(r'\bstore\.', scan):
        hdr.append("import * as store from './store.js';")
    for s in LIBS + APP_MODULES:
        if imports.get(s):
            hdr.append(f"import {{ {', '.join(sorted(imports[s]))} }} from './{s}.js';")
    if side:
        hdr.append('// Cada sección registra sus vistas, hojas y acciones al cargarse')
        hdr += side
    out = '\n'.join(lead + hdr) + ('\n\n' if hdr or lead else '') + body.lstrip('\n')
    open(os.path.join(JS, m + '.js'), 'w').write(out)
print('imports actualizados')
