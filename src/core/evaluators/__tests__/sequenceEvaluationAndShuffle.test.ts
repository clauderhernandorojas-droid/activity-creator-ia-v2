import { describe, it, expect } from 'vitest';
import { shuffleSequenceItems } from '../../utils/sequenceShuffle';
import { evaluateSequence } from '../evaluateSequence';
import type { SequenceBlock, SequenceItem } from '../../../types/schema';

describe('Sequence/Ordering - Shuffle Invariants & Evaluation Integrity', () => {
  const sampleItems: SequenceItem[] = [
    { id: 'seq-1', text: 'Good morning, reception speaking.', correctOrder: 1, speaker: 'Receptionist' },
    { id: 'seq-2', text: 'Hello, I would like to book a room.', correctOrder: 2, speaker: 'Guest' },
    { id: 'seq-3', text: 'Certainly, for how many nights?', correctOrder: 3, speaker: 'Receptionist' },
    { id: 'seq-4', text: 'For two nights, please.', correctOrder: 4, speaker: 'Guest' },
  ];

  const sampleBlock: SequenceBlock = {
    id: 'block-sequence-1',
    type: 'sequence',
    instruction: 'Put the dialogue in the correct order:',
    items: sampleItems,
  };

  describe('shuffleSequenceItems', () => {
    it('no debe inicializar la lista en el orden exacto de solución', () => {
      const canonicalSolutionIds = ['seq-1', 'seq-2', 'seq-3', 'seq-4'];

      // Execute shuffle multiple times to test consistency and randomness
      for (let i = 0; i < 50; i++) {
        const shuffled = shuffleSequenceItems(sampleItems);

        // Invariant: Never exactly equal to solution order
        const isIdentical = shuffled.every((id, idx) => id === canonicalSolutionIds[idx]);
        expect(isIdentical).toBe(false);

        // Invariant: Contains all IDs and exact same length
        expect(shuffled).toHaveLength(sampleItems.length);
        expect(shuffled.slice().sort()).toEqual(canonicalSolutionIds.slice().sort());
      }
    });

    it('funciona de manera garantizada con 2 elementos intercambiándolos', () => {
      const twoItems: SequenceItem[] = [
        { id: 'item-a', text: 'First', correctOrder: 1 },
        { id: 'item-b', text: 'Second', correctOrder: 2 },
      ];

      for (let i = 0; i < 20; i++) {
        const shuffled = shuffleSequenceItems(twoItems);
        expect(shuffled).toEqual(['item-b', 'item-a']);
      }
    });

    it('maneja de forma segura casos borde de 0 o 1 elemento sin errores', () => {
      expect(shuffleSequenceItems([])).toEqual([]);

      const singleItem: SequenceItem[] = [{ id: 'only-1', text: 'Single line', correctOrder: 1 }];
      expect(shuffleSequenceItems(singleItem)).toEqual(['only-1']);
    });

    it('invariante de preservación del modelo canónico: no muta el array original ni correctOrder', () => {
      const originalClone = JSON.parse(JSON.stringify(sampleItems));

      shuffleSequenceItems(sampleItems);

      expect(sampleItems).toEqual(originalClone);
      expect(sampleItems.map((it) => it.correctOrder)).toEqual([1, 2, 3, 4]);
    });
  });

  describe('evaluateSequence', () => {
    it('evalúa con puntuación perfecta cuando el estudiante ordena correctamente según correctOrder', () => {
      const studentAnswers = {
        sequence_order: ['seq-1', 'seq-2', 'seq-3', 'seq-4'],
      };

      const result = evaluateSequence(sampleBlock, studentAnswers);

      expect(result.score).toBe(4);
      expect(result.maxScore).toBe(4);
      expect(result.details['pos-0']).toBe(true);
      expect(result.details['pos-1']).toBe(true);
      expect(result.details['pos-2']).toBe(true);
      expect(result.details['pos-3']).toBe(true);
    });

    it('evalúa correctamente posiciones parciales cuando el orden está alterado', () => {
      // Swapped pos 0 and pos 1, but pos 2 and pos 3 are right
      const studentAnswers = {
        sequence_order: ['seq-2', 'seq-1', 'seq-3', 'seq-4'],
      };

      const result = evaluateSequence(sampleBlock, studentAnswers);

      expect(result.score).toBe(2);
      expect(result.maxScore).toBe(4);
      expect(result.details['pos-0']).toBe(false);
      expect(result.details['pos-1']).toBe(false);
      expect(result.details['pos-2']).toBe(true);
      expect(result.details['pos-3']).toBe(true);
    });

    it('no otorga puntos automáticos ante respuestas vacías o no inicializadas', () => {
      const emptyAnswers = {};
      const result = evaluateSequence(sampleBlock, emptyAnswers);

      expect(result.score).toBe(0);
      expect(result.maxScore).toBe(4);
      expect(result.details['pos-0']).toBe(false);
      expect(result.details['pos-1']).toBe(false);
      expect(result.details['pos-2']).toBe(false);
      expect(result.details['pos-3']).toBe(false);
    });

    it('mantiene intacto el array canónico de items del modelo tras la evaluación', () => {
      const itemsBefore = JSON.parse(JSON.stringify(sampleBlock.items));

      evaluateSequence(sampleBlock, { sequence_order: ['seq-4', 'seq-3', 'seq-2', 'seq-1'] });

      expect(sampleBlock.items).toEqual(itemsBefore);
    });
  });
});
