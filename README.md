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
- **Entreno**: unos 70 ejercicios con sus músculos principales y secundarios, ejercicios propios, rutinas, registro de series (kg, repeticiones, calentamiento), lo que hiciste la última vez, sugerencias de progresión (doble progresión con rango e incremento por ejercicio), cronómetro de descanso que arranca al marcar una serie, historial con 1RM estimado y series semanales por músculo (1 por principal, 0,5 por secundario).
- **Progreso**: gráfica de peso con media de 7 días y medias semanales, gasto calórico real calculado con tus datos (o con fórmula mientras no haya suficientes) y calculadora de objetivo, medidas corporales con cintura/altura, hombros/cintura y % de grasa estimado, pasos de las últimas dos semanas y media de calorías.
- **Copias**: exporta todo a `.json` (para restaurar) o a `.csv` (para Excel, con separador `;` y coma decimal). La app avisa si pasa una semana sin copia.
- Funciona sin conexión una vez abierta por primera vez (salvo la búsqueda en Open Food Facts).

## Estructura

| Archivo | Para qué |
|---|---|
| `index.html` | Página principal |
| `css/styles.css` | Estilos |
| `js/app.js` | Pantallas y lógica |
| `js/nutrients.js` | Nutrientes, valores de referencia y alimentos básicos |
| `js/exercises.js` | Músculos y biblioteca de ejercicios |
| `js/barcode.js` | Lector de códigos EAN-13 / EAN-8 sin librerías externas |
| `js/off.js` | Consulta a Open Food Facts |
| `js/store.js` | Guardado en el teléfono (IndexedDB) |
| `sw.js` | Uso sin conexión |

## Notas

- Los hidratos se cuentan **sin fibra**, como en las etiquetas europeas. La energía calculada usa 4 kcal/g de proteínas e hidratos, 9 de grasas y 2 de fibra.
- Los datos de productos de Open Food Facts están bajo licencia ODbL.
