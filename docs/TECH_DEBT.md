# Deuda Técnica y Pendientes Arquitectónicos (OCR & Renderizado)

Este documento registra los desafíos y oportunidades de mejora identificados durante las pruebas de digitalización con OCR y renderizado interactivo en el lienzo (*Canvas*).

---

## 1. Primitiva `inline_choice` (Cloze / Selección Embebida en Prosa)

### Problema Actual
- En ejercicios basados en lectura continua o pasajes de prosa con múltiples puntos de elección (por ejemplo, párrafos donde cada oración ofrece opciones enfrentadas `"was / were"`, o selecciones múltiples marcadas con viñetas dentro del mismo texto continuo), la arquitectura actual se ve forzada a fragmentar el ejercicio en múltiples tarjetas independientes de `selection` (modo cuestionario/quiz).
- Esta descomposición provoca que oraciones o fragmentos de párrafos contextuales se repitan artificialmente en tarjetas separadas, generando duplicación textual y una experiencia visual fragmentada en lugar de un flujo de lectura continuo.

### Solución Pendiente
1. **Esquema Formal en `src/types/schema.ts`**:
   - Diseñar la primitiva formal `InlineChoiceBlockSchema` (o variante integrada en `InteractionBlockSchema`):
     - `text`: Cadena de texto continuo que contiene marcadores posicionales referenciados (por ejemplo, `{{choice_1}}`, `{{choice_2}}`).
     - `choices`: Diccionario o lista de opciones discretas asociadas a cada marcador:
       ```ts
       choices: Record<string, {
         options: SelectionOption[];
         expectedAnswerId?: string;
         mode?: 'dropdown' | 'inline_toggle';
       }>
       ```
2. **Componente de Renderizado (`InlineChoiceRenderer.tsx`)**:
   - Crear el renderizador en `src/components/renderers/InlineChoiceRenderer.tsx` capaz de procesar el texto continuo e incrustar selectores desplegables o píldoras de selección in-line en la posición exacta del marcador.
   - Eliminar por completo la duplicación textual en pantalla.
3. **Integración con Extracción IA (`digitizeBook.ts`)**:
   - Incorporar la taxonomía en `STRUCTURED_SLIDE_SCHEMA` y el prompt del extractor para detectar textos continuos con múltiples puntos de selección como `inline_choice`.

---

## 2. Completado y Normalización de Filas en Tablas Gramaticales

### Problema Actual
- En cuadros sintácticos o tablas de referencia gramatical que presentan columnas sin encabezado formal explícito (como columnas de complementos o predicados al final de una oración), algunas filas intermedias en la imagen original omiten celdas de forma asimétrica.
- Al digitalizar o renderizar la matriz tabular (`tableHeaders` y `tableRows`), ciertas filas resultan con menor cantidad de celdas que el total de columnas declaradas en los encabezados, lo que provoca desalineaciones visuales en el grid HTML/CSS o celdas huérfanas.

### Solución Pendiente
1. **Normalización de Matriz Tabular**:
   - En el procesamiento de datos (`slideRoleConverter.ts`, `digitizeBook.ts` o componentes `TableReferenceRenderer.tsx` / `InputFieldsRenderer.tsx`), implementar una utilidad de acolchado (*padding* / balanceo):
     ```ts
     const maxCols = Math.max(headers.length, ...rows.map(r => r.length));
     // Rellenar filas más cortas con celdas vacías neutras (isInput: false, text: '')
     ```
2. **Renderizado Robusto**:
   - Garantizar que cada fila mantenga exactamente el mismo número de columnas que la cabecera, aplicando `colSpan` apropiado o celdas inertes neutrales (`<td className="empty-cell" />`) para preservar la alineación sintáctica perfecta de cada columna.
