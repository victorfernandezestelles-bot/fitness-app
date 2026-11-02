# Fitness

App personal para el iPhone: comidas, macros y micronutrientes, recetas propias, peso, pasos y entrenamiento con recuento de series por músculo.

Funciona como una web instalable (PWA). Todos los datos se guardan **solo en el teléfono**; el código de este repositorio no contiene ningún dato personal.

## Instalarla en el iPhone

1. Abre en **Safari** la dirección de la app: `https://victorfernandezestelles-bot.github.io/fitness-app/`
2. Pulsa el botón **Compartir** (el cuadrado con la flecha) y elige **Añadir a pantalla de inicio**.
3. Abre siempre la app desde ese icono. Los datos de la app instalada y los de una pestaña de Safari son independientes.

## Qué hace ahora

- **Bienvenida** la primera vez: objetivos, datos del cuerpo, plantillas de rutinas y cómo guardar copias. Se puede saltar y volver a ver desde Ajustes.
- **Hoy**: calorías y macros del día frente a tus objetivos (distintos en días de entreno y de descanso si quieres), repetir comidas de ayer o copiar las de otro día, macros a mano para platos que no se pueden pesar, pasos, peso y horas de sueño, cinco comidas (las vacías se recogen en una fila), botón flotante «+ Añadir» que elige la comida según la hora, calendario del mes con puntos de cumplimiento (calorías a ±10 %, pasos y entreno), favoritos encima de recientes y la tabla nutricional completa con % del valor de referencia europeo.
- **Escáner de códigos de barras** con la cámara. Si el producto no está guardado, se busca en [Open Food Facts](https://world.openfoodfacts.org); si tampoco está ahí, se copian los datos de la etiqueta una vez y quedan guardados.
- **Recetas**: ingredientes con sus gramos, raciones y peso del plato cocinado, para apuntar por raciones o por gramos servidos.
- **Básicos**: unos 35 alimentos comunes con valores medios orientativos.
- **Entreno**: unos 70 ejercicios con sus músculos principales y secundarios, ejercicios propios, rutinas, registro de series (kg, repeticiones, calentamiento), lo que hiciste la última vez, sugerencias de progresión (doble progresión con rango e incremento por ejercicio), cronómetro de descanso que arranca al marcar una serie, botones − / + en la serie que toca, RIR opcional, notas fijas por ejercicio y notas de la sesión, superseries, cambiar el orden o sustituir un ejercicio (y, si quieres, también en la rutina), ejercicios terminados plegados, pantalla encendida mientras entrenas, historial con 1RM estimado y series semanales por músculo (1 por principal, 0,5 por secundario).
- **Cardio y actividades** (pestaña aparte en Entreno): caminata larga, carrera, bici, elíptica, comba, baloncesto, natación, movilidad u otra, con duración, intensidad y, si quieres, distancia y calorías. No suman series por músculo, pero el día cuenta como entrenado.
- **Historial de series por músculo**: toca un músculo en Entreno para ver sus últimas 12 semanas con la zona de 10 a 20.
- **Progreso**: informe semanal de lunes a domingo (peso, calorías, pasos, sueño, entrenos, series por músculo y medidas) que se puede copiar como texto, gráfica de peso con media de 7 días y medias semanales, gasto calórico real calculado con tus datos (o con fórmula mientras no haya suficientes) y calculadora de objetivo, medidas corporales con cintura/altura, hombros/cintura y % de grasa estimado, pasos y sueño de las últimas dos semanas y media de calorías.
- **Ajustes** agrupados en objetivos, cuerpo, entreno, apariencia y datos. El texto sigue el tamaño del iPhone (o normal o grande) y hay opción de botones más grandes.
- **Fotos de progreso privadas**: frente, lado y espalda por fecha, guardadas solo en el teléfono, con comparación lado a lado. Tienen su propia copia (.json aparte), porque no van en la copia normal.
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
| `js/onboarding.js` | Bienvenida de la primera vez |
| `js/cardio.js` | Cardio y actividades |
| `js/report.js` | Informe semanal e historial de series por músculo |
| `js/photos.js` | Fotos de progreso y su copia aparte |
| `js/util.js` | Utilidades comunes |
| `js/nutrients.js`, `js/exercises.js`, `js/templates.js` | Datos de referencia |
| `js/barcode.js` | Lector de códigos EAN-13 / EAN-8 sin librerías externas |
| `js/off.js` | Consulta a Open Food Facts |
| `js/store.js` | Almacén en el teléfono (IndexedDB): datos y, aparte, fotos |
| `sw.js` | Uso sin conexión (red primero, caché si no hay conexión) |
| `version.json` | Versión publicada, para avisar de actualizaciones |
| `tests/` | Pruebas automáticas (`npm test`) |
| `tools/fix-imports.py` | Recalcula los `import` entre módulos |

## Datos y versiones

Los datos guardados llevan un número de versión (ahora la 3, que añade el cardio y las actividades). Si una actualización cambia su formato, la app guarda antes una copia interna y convierte los datos al formato nuevo. Las copias `.json` antiguas también se convierten al restaurarlas.

## Pendiente

- Antes de publicar la app para otras personas, quitar de `js/templates.js` la plantilla «Rutina A/B en 6 sesiones» (las rutinas ya guardadas en el teléfono no se pierden).
- Más adelante: app nativa para iOS y Android, cuentas y sincronización, sueño desde Salud o el reloj, y estimar platos del comedor a partir de una foto.

## Notas

- Los hidratos se cuentan **sin fibra**, como en las etiquetas europeas. La energía calculada usa 4 kcal/g de proteínas e hidratos, 9 de grasas y 2 de fibra.
- Los datos de productos de Open Food Facts están bajo licencia ODbL.
