import { describe, it, expect } from 'vitest';
import {
  sanitizeEvaluationString,
  cleanBaseAnswer,
  validateFillInBlank,
} from '../fillBlankValidator';
import { evaluateInput } from '../evaluateInput';
import type { InputFieldsBlock } from '../../../types/schema';

describe('Sanitización Agnóstica de Caracteres Invisibles y Espaciado en el Calificador', () => {
  describe('1. sanitizeEvaluationString', () => {
    it('normaliza Unicode con NFKC y convierte a minúsculas', () => {
      const input = 'NO ONE';
      expect(sanitizeEvaluationString(input)).toBe('no one');
    });

    it('reemplaza espacio de no separación (non-breaking space \\u00A0) por espacio estándar', () => {
      const input = 'no\u00A0one';
      expect(sanitizeEvaluationString(input)).toBe('no one');
    });

    it('reemplaza espacio de ancho cero (zero-width space \\u200B) y BOM (\\uFEFF) por espacio estándar y colapsa', () => {
      const withZws = 'no\u200Bone';
      expect(sanitizeEvaluationString(withZws)).toBe('no one');

      const withBom = '\uFEFFno one\uFEFF';
      expect(sanitizeEvaluationString(withBom)).toBe('no one');
    });

    it('reemplaza todos los caracteres de espacio invisibles y especiales definidos en la especificación', () => {
      // \\u00A0, \\u1680, \\u180E, \\u2000-\\u200B, \\u202F, \\u205F, \\u3000, \\uFEFF
      const specialSpaces = [
        '\u00A0', // No-break space
        '\u1680', // Ogham space mark
        '\u180E', // Mongolian vowel separator
        '\u2000', // En quad
        '\u2001', // Em quad
        '\u2002', // En space
        '\u2003', // Em space
        '\u2004', // Three-per-em space
        '\u2005', // Four-per-em space
        '\u2006', // Six-per-em space
        '\u2007', // Figure space
        '\u2008', // Punctuation space
        '\u2009', // Thin space
        '\u200A', // Hair space
        '\u200B', // Zero width space
        '\u202F', // Narrow no-break space
        '\u205F', // Medium mathematical space
        '\u3000', // Ideographic space
        '\uFEFF', // Zero width no-break space
      ];

      for (const spaceChar of specialSpaces) {
        const text = `no${spaceChar}one`;
        expect(
          sanitizeEvaluationString(text),
          `Fallo al sanitizar espacio especial U+${spaceChar.charCodeAt(0).toString(16).toUpperCase()}`
        ).toBe('no one');
      }
    });

    it('colapsa secuencias de múltiples espacios contiguos y tabulaciones a un solo espacio', () => {
      const text = '   no    \t   one   ';
      expect(sanitizeEvaluationString(text)).toBe('no one');
    });
  });

  describe('2. cleanBaseAnswer', () => {
    it('sanitiza caracteres invisibles y limpia comillas o signos de puntuación periféricos', () => {
      const text = ' "no\u00A0one." ';
      expect(cleanBaseAnswer(text)).toBe('no one');
    });
  });

  describe('3. validateFillInBlank: Caso de Uso Real "no one" vs "no\\u00A0one"', () => {
    it('califica CORRECTO cuando el estudiante ingresa "no one" y la clave contiene "no\\u00A0one"', () => {
      const studentInput = 'no one';
      const acceptedAnswers = ['no\u00A0one'];
      const expectedAnswer = 'no\u00A0one';

      const result = validateFillInBlank(studentInput, acceptedAnswers, expectedAnswer);
      expect(result.isCorrect).toBe(true);
      expect(result.status).toBe('correct');
      // Preserva la respuesta visual canónica original sin alterar
      expect(result.expectedAnswer).toBe('no\u00A0one');
    });

    it('califica CORRECTO cuando el estudiante ingresa "no\\u00A0one" y la clave contiene "no one"', () => {
      const studentInput = 'no\u00A0one';
      const acceptedAnswers = ['no one'];
      const expectedAnswer = 'no one';

      const result = validateFillInBlank(studentInput, acceptedAnswers, expectedAnswer);
      expect(result.isCorrect).toBe(true);
      expect(result.status).toBe('correct');
    });

    it('califica CORRECTO con caracteres de ancho cero (zero-width spaces) en el input del alumno o la clave', () => {
      const studentInput = 'no\u200Bone';
      const acceptedAnswers = ['no one'];

      const result = validateFillInBlank(studentInput, acceptedAnswers);
      expect(result.isCorrect).toBe(true);
      expect(result.status).toBe('correct');
    });

    it('califica CORRECTO ante múltiples espacios contiguos y mayúsculas/minúsculas', () => {
      const studentInput = '  No   One  ';
      const acceptedAnswers = ['no one'];

      const result = validateFillInBlank(studentInput, acceptedAnswers);
      expect(result.isCorrect).toBe(true);
      expect(result.status).toBe('correct');
    });
  });

  describe('4. evaluateInput integración completa en layout list y table', () => {
    it('evalúa correctamente en modo list con caracteres no imprimibles', () => {
      const block: InputFieldsBlock = {
        type: 'input_fields',
        id: 'int-1',
        instruction: 'Complete the sentences:',
        layoutMode: 'list',
        listItems: [
          {
            id: 'item-1',
            prompt: '1. There was {{blank}} in the room.',
            expectedAnswer: 'no\u00A0one',
            acceptedAnswers: ['no\u00A0one', 'nobody'],
          },
        ],
        tableHeaders: [],
        tableRows: [],
        paragraphTemplate: '',
        paragraphInputs: {},
      };

      const studentAnswers = {
        'item-1': 'no one',
      };

      const evaluation = evaluateInput(block, studentAnswers);
      expect(evaluation.score).toBe(1);
      expect(evaluation.maxScore).toBe(1);
      expect(evaluation.details['item-1']).toBe(true);
      expect(evaluation.itemFeedback?.['item-1'].status).toBe('correct');
    });

    it('evalúa correctamente en modo table con caracteres no imprimibles', () => {
      const block: InputFieldsBlock = {
        type: 'input_fields',
        id: 'int-2',
        instruction: 'Complete the table:',
        layoutMode: 'table',
        listItems: [],
        tableHeaders: ['Subject', 'Answer'],
        tableRows: [
          [
            { text: 'Result', isInput: false, acceptedAnswers: [], isExample: false },
            {
              text: '',
              isInput: true,
              inputId: 'cell-0-1',
              expectedAnswer: 'no one',
              acceptedAnswers: ['no one'],
              isExample: false,
            },
          ],
        ],
        paragraphTemplate: '',
        paragraphInputs: {},
      };

      const studentAnswers = {
        'cell-0-1': 'no\u00A0one',
      };

      const evaluation = evaluateInput(block, studentAnswers);
      expect(evaluation.score).toBe(1);
      expect(evaluation.maxScore).toBe(1);
      expect(evaluation.details['cell-0-1']).toBe(true);
    });
  });
});
