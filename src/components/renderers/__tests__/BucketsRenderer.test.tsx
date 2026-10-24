import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { BucketsRenderer, matchesBucket } from '../BucketsRenderer';
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

  describe('Reconciliación Tolerante de IDs en BucketsRenderer (matchesBucket)', () => {
    it('compara tolerablemente identificadores con prefijos, sufijos y etiquetas de categoría', () => {
      // 1. Exact match
      expect(matchesBucket('bucket-A', { id: 'bucket-A', label: 'A phrases' })).toBe(true);

      // 2. Suffix match (id ends with -tid or _tid)
      expect(matchesBucket('A', { id: 'bucket-A', label: 'Phrases' })).toBe(true);
      expect(matchesBucket('A', { id: 'slot-A', label: 'Phrases' })).toBe(true);
      expect(matchesBucket('A', { id: 'bucket_a', label: 'Phrases' })).toBe(true);

      // 3. Label prefix match (label starts with tid, tid + ' ', or tid + ')')
      expect(matchesBucket('A', { id: 'bucket-1', label: 'A phrases to say you like something:' })).toBe(true);
      expect(matchesBucket('A', { id: 'bucket-1', label: 'A · Talking about work' })).toBe(true);
      expect(matchesBucket('A', { id: 'bucket-1', label: 'A) Likes' })).toBe(true);

      // 4. Non-matching tokens
      expect(matchesBucket('B', { id: 'bucket-A', label: 'A phrases' })).toBe(false);
      expect(matchesBucket(null, { id: 'bucket-A', label: 'A phrases' })).toBe(false);
    });

    it('renderiza la muestra y calcula el badge (assignedTokens.length) cuando token tiene correctBucketId "A" y bucket tiene id "bucket-1" y label "A phrases..."', () => {
      const tolerantBlock: BucketsMatchingBlock = {
        id: 'block-tolerant',
        type: 'buckets_matching',
        instruction: 'Categorize the phrases',
        buckets: [
          {
            id: 'bucket-1',
            label: 'A phrases to say you like something:',
          },
          {
            id: 'bucket-2',
            label: 'B phrases to say you do not like something:',
          },
        ],
        tokens: [
          {
            id: 'tok-ex-1',
            text: 'I really love it',
            correctBucketId: 'A', // token tiene 'A', bucket tiene 'bucket-1'
            isExample: true,
          },
          {
            id: 'tok-user-1',
            text: 'I hate it',
            correctBucketId: 'B',
            isExample: false,
          },
        ],
      };

      const html = renderToString(
        <BucketsRenderer
          block={tolerantBlock}
          studentAnswers={{ 'tok-user-1': 'bucket-2' }}
          evaluation={defaultEvaluation}
        />
      );

      // El token de ejemplo con correctBucketId 'A' debe renderizarse dentro de bucket-1
      expect(html).toContain('I really love it');
      expect(html).toContain('✓ Ejemplo');

      // El badge numérico del bucket-1 debe computar 1 (muestra de ejemplo reconciliada)
      expect(html).toContain('>1<');

      // El token del usuario ubicado en 'bucket-2' debe computar 1 en el badge del bucket-2
      expect(html).toContain('I hate it');
    });
  });
});
