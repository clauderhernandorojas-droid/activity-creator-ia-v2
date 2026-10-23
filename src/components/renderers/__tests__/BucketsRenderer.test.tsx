import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { BucketsRenderer } from '../BucketsRenderer';
import type { BucketsMatchingBlock } from '../../../types/schema';
import type { SessionEvaluation } from '../../../store/useSessionStore';

describe('BucketsRenderer - Fichas de Muestra (isExample: true)', () => {
  const sampleBlock: BucketsMatchingBlock = {
    id: 'block-1',
    type: 'buckets_matching',
    instruction: 'Classify the items',
    buckets: [
      {
        id: 'bucket-A',
        label: 'Category A',
        items: [
          {
            id: 'tok-example-1',
            text: 'Sample Example Card',
            isExample: true,
          },
        ],
      },
      {
        id: 'bucket-B',
        label: 'Category B',
        items: [],
      },
    ],
    tokens: [
      {
        id: 'tok-user-1',
        text: 'User Token 1',
        correctBucketId: 'bucket-A',
      },
      {
        id: 'tok-user-2',
        text: 'User Token 2',
        correctBucketId: 'bucket-B',
      },
    ],
  };

  const defaultEvaluation: SessionEvaluation = {
    isSubmitted: false,
    score: 0,
    maxScore: 2,
    details: {},
  };

  it('renderiza la ficha de ejemplo dentro del bucket desde el primer montaje con estado vacío de respuestas', () => {
    const html = renderToString(
      <BucketsRenderer
        block={sampleBlock}
        studentAnswers={{}}
        evaluation={defaultEvaluation}
      />
    );

    // Debe contener el texto del ejemplo
    expect(html).toContain('Sample Example Card');

    // Debe tener la etiqueta '✓ Ejemplo'
    expect(html).toContain('✓ Ejemplo');

    // El badge numérico del contenedor A debe mostrar 1 en lugar de 0
    expect(html).toContain('>1<');

    // El badge numérico del contenedor B debe mostrar 0
    expect(html).toContain('>0<');

    // No debe contener botón de remover '✕' para la ficha de ejemplo
    // Las fichas de usuario aún no están asignadas, por lo que no debe haber ningún botón '✕'
    expect(html).not.toContain('✕');
  });

  it('computa assignedTokens.length adecuadamente al sumar fichas de usuario y de ejemplo', () => {
    const html = renderToString(
      <BucketsRenderer
        block={sampleBlock}
        studentAnswers={{ 'tok-user-1': 'bucket-A' }}
        evaluation={defaultEvaluation}
      />
    );

    // Contenedor A ahora tiene 1 ejemplo + 1 ficha de usuario = 2
    expect(html).toContain('>2<');

    // La ficha de usuario asignada sí debe mostrar el botón '✕'
    expect(html).toContain('✕');
  });
});
