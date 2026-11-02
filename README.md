# Fitness

App personal para el iPhone: comidas, macros y micronutrientes, recetas propias, peso, pasos y entrenamiento con recuento de series por músculo.

Funciona como una web instalable (PWA). Todos los datos se guardan **solo en el teléfono**; el código de este repositorio no contiene ningún dato personal.

## Instalarla en el iPhone

1. Abre en **Safari** la dirección de la app: `https://victorfernandezestelles-bot.github.io/fitness-app/`
2. Pulsa el botón **Compartir** (el cuadrado con la flecha) y elige **Añadir a pantalla de inicio**.
3. Abre siempre la app desde ese icono. Los datos de la app instalada y los de una pestaña de Safari son independientes.

## Qué hace ahora

- **Hoy**: calorías y macros del día frente a tus objetivos (distintos en días de entreno y de descanso si quieres), repetir comidas de ayer o copiar las de otro día, macros a mano para platos que no se pueden pesar, pasos y peso, cinco comidas (desayuno, comida, merienda, cena y entre horas) y la tabla nutricional completa con % del valor de referencia europeo.
- **Escáner de códigos de barras** con la cámara. Si el producto no está guardado, se busca en [Open Food Facts](https://world.openfoodfacts.org); si tampoco está ahí, se copian los datos de la etiqueta una vez y quedan guardados.
- **Recetas**: ingredientes con sus gramos, raciones y peso del plato cocinado, para apuntar por raciones o por gramos servidos.
- **Básicos**: unos 35 alimentos comunes con valores medios orientativos.
- **Entreno**: unos 70 ejercicios con sus músculos principales y secundarios, ejercicios propios, rutinas, registro de series (kg, repeticiones, calentamiento), lo que hiciste la última vez, sugerencias de progresión (doble progresión con rango e incremento por ejercicio), cronómetro de descanso que arranca al marcar una serie, botones − / + en la serie que toca, RIR opcional, notas fijas por ejercicio y notas de la sesión, superseries, cambiar el orden o sustituir un ejercicio (y, si quieres, también en la rutina), ejercicios terminados plegados, pantalla encendida mientras entrenas, historial con 1RM estimado y series semanales por músculo (1 por principal, 0,5 por secundario).
- **Progreso**: gráfica de peso con media de 7 días y medias semanales, gasto calórico real calculado con tus datos (o con fórmula mientras no haya suficientes) y calculadora de objetivo, medidas corporales con cintura/altura, hombros/cintura y % de grasa estimado, pasos de las últimas dos semanas y media de calorías.
- **Copias**: exporta todo a `.json` (para restaurar) o a `.csv` (para Excel, con separador `;` y coma decimal). La app avisa si pasa una semana sin copia.
- Funciona sin conexión una vez abierta por primera vez (salvo la búsqueda en Open Food Facts).

## Estructura

| Archivo | Para qué |
|---|---|
| `index.html` | Página principal |
| `css/styles.css` | Estilos (tema claro, oscuro y automático) |
| `fonts/` | Tipografías incluidas (Archivo y Atkinson Hyperlegible, licencia OFL) |
| `js/app.js` | Arranque y aviso de versión nueva |
| `js/ui.js` | Pestañas, hojas, avisos con «Deshacer» y registro de acciones |
| `js/state.js` | Datos, guardado en el teléfono y migraciones entre versiones |
| `js/derived.js` | Cálculos (volumen, progresión, gasto calórico, medidas…) |
| `js/food.js` | Hoy, alimentos, recetas y escáner |
| `js/training.js` | Entreno, rutinas, descanso y duración |
| `js/progress.js` | Peso, medidas, gasto y gráficas |
| `js/settings.js` | Ajustes, copias e importación |
| `js/util.js` | Utilidades comunes |
| `js/nutrients.js`, `js/exercises.js`, `js/templates.js` | Datos de referencia |
| `js/barcode.js` | Lector de códigos EAN-13 / EAN-8 sin librerías externas |
| `js/off.js` | Consulta a Open Food Facts |
| `js/store.js` | Almacén en el teléfono (IndexedDB) |
| `sw.js` | Uso sin conexión (red primero, caché si no hay conexión) |
| `version.json` | Versión publicada, para avisar de actualizaciones |
| `tests/` | Pruebas automáticas (`npm test`) |
| `tools/fix-imports.py` | Recalcula los `import` entre módulos |

## Datos y versiones

Los datos guardados llevan un número de versión. Si una actualización cambia su formato, la app guarda antes una copia interna y convierte los datos al formato nuevo. Las copias `.json` antiguas también se convierten al restaurarlas.

## Notas

- Los hidratos se cuentan **sin fibra**, como en las etiquetas europeas. La energía calculada usa 4 kcal/g de proteínas e hidratos, 9 de grasas y 2 de fibra.
- Los datos de productos de Open Food Facts están bajo licencia ODbL.
