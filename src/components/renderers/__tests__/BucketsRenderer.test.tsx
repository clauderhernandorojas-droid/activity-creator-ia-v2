import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { BucketsRenderer } from '../BucketsRenderer';
import type { BucketsMatchingBlock } from '../../../types/schema';
import type { SessionEvaluation } from '../../../store/useSessionStore';

describe('BucketsRenderer - Fichas de Muestra (Single Source of Truth en block.tokens)', () => {
  const sampleBlock: BucketsMatchingBlock = {
    id: 'block-1',
    type: 'buckets_matching',
    instruction: 'Classify the items',
    buckets: [
      {
        id: 'bucket-A',
        label: 'Category A',
      },
      {
        id: 'bucket-B',
        label: 'Category B',
      },
    ],
    tokens: [
      {
        id: 'token-example-1',
        text: 'Sample Example Card',
        correctBucketId: 'bucket-A',
        isExample: true,
      },
      {
        id: 'tok-user-1',
        text: 'User Token 1',
        correctBucketId: 'bucket-A',
        isExample: false,
      },
      {
        id: 'tok-user-2',
        text: 'User Token 2',
        correctBucketId: 'bucket-B',
        isExample: false,
      },
    ],
  };

  const defaultEvaluation: SessionEvaluation = {
    isSubmitted: false,
    score: 0,
    maxScore: 3,
    details: {},
  };

  it('renderiza la ficha de ejemplo dentro del bucket desde block.tokens desde el primer montaje con estado vacío de respuestas', () => {
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

    // La bandeja de fichas por ubicar no debe incluir el ejemplo (debe listar exactamente 2 fichas de usuario)
    expect(html).toMatch(/Fichas por ubicar \(<!-- -->2<!-- -->\):/);
  });

  it('computa bucketTokens.length adecuadamente al sumar fichas de usuario y de ejemplo', () => {
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

    // Fichas por ubicar se decrementa a 1
    expect(html).toMatch(/Fichas por ubicar \(<!-- -->1<!-- -->\):/);
  });
});
