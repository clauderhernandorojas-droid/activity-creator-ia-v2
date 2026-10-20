import { describe, it, expect } from 'vitest';
import {
  hasBlankToken,
  cleanBlankMarkers,
  splitSentenceAtBlank,
} from '../clozeTokenizer';

describe('Cloze Tokenizer - Contrato de Renderizado Inline y Delimitadores', () => {
  describe('Invariante de Tokens Delimitadores (hasBlankToken & BLANK_DELIMITER_REGEX)', () => {
    it('detecta marcadores de plantilla internos en todas sus variantes', () => {
      expect(hasBlankToken('She {{blank}} (live) here.')).toBe(true);
      expect(hasBlankToken('She {{ blank }} here.')).toBe(true);
      expect(hasBlankToken('She {{1}} here.')).toBe(true);
      expect(hasBlankToken('She {{gap}} here.')).toBe(true);
      expect(hasBlankToken('She [blank] here.')).toBe(true);
      expect(hasBlankToken('She [___] here.')).toBe(true);
      expect(hasBlankToken('She [....] here.')).toBe(true);
      expect(hasBlankToken('She ___ here.')).toBe(true);
      expect(hasBlankToken('She _______ here.')).toBe(true);
      expect(hasBlankToken('She ........ here.')).toBe(true);
      expect(hasBlankToken('She (blank) here.')).toBe(true);
      expect(hasBlankToken('She (___) here.')).toBe(true);
      expect(hasBlankToken('She [?] here.')).toBe(true);
      expect(hasBlankToken('She [ ? ] here.')).toBe(true);
    });

    it('no confunde pistas verbales legítimas entre paréntesis con delimitadores de hueco', () => {
      // (live), (be), (go), (see) son pistas de infinitivo, NO huecos
      expect(hasBlankToken('She lives here (since 2010).')).toBe(false);
      expect(hasBlankToken('What time is it? (answer in full)')).toBe(false);
      expect(hasBlankToken('Where do you go on vacation?')).toBe(false);
    });
  });

  describe('Flujo Inline de Segmentación (splitSentenceAtBlank)', () => {
    it('segmenta la oración por el token de reemplazo y omite completamente el marcador', () => {
      const result = splitSentenceAtBlank('She {{blank}} (live) here since 2010.');

      expect(result.hasBlank).toBe(true);
      expect(result.prefix).toBe('She ');
      expect(result.suffix).toBe(' (live) here since 2010.');

      // Invariante: Ningún marcador de plantilla interno visible
      expect(result.prefix).not.toContain('{{blank}}');
      expect(result.suffix).not.toContain('{{blank}}');
    });

    it('maneja oraciones con guiones bajos continuos (_______)', () => {
      const result = splitSentenceAtBlank('2. He _______ to London last year.');

      expect(result.hasBlank).toBe(true);
      expect(result.prefix).toBe('2. He ');
      expect(result.suffix).toBe(' to London last year.');
      expect(result.prefix).not.toContain('_');
      expect(result.suffix).not.toContain('_');
    });

    it('maneja oraciones con [blank]', () => {
      const result = splitSentenceAtBlank('They [blank] soccer on Saturdays.');

      expect(result.hasBlank).toBe(true);
      expect(result.prefix).toBe('They ');
      expect(result.suffix).toBe(' soccer on Saturdays.');
      expect(result.prefix).not.toContain('[blank]');
      expect(result.suffix).not.toContain('[blank]');
    });

    it('maneja oraciones donde el hueco está al inicio', () => {
      const result = splitSentenceAtBlank('_______ you like coffee?');

      expect(result.hasBlank).toBe(true);
      expect(result.prefix).toBe('');
      expect(result.suffix).toBe(' you like coffee?');
    });

    it('maneja oraciones donde el hueco está al final', () => {
      const result = splitSentenceAtBlank('The capital of France is _______.');

      expect(result.hasBlank).toBe(true);
      expect(result.prefix).toBe('The capital of France is ');
      expect(result.suffix).toBe('.');
    });

    it('retorna hasBlank false y texto íntegro en oraciones sin marcadores', () => {
      const result = splitSentenceAtBlank('What is your name?');

      expect(result.hasBlank).toBe(false);
      expect(result.prefix).toBe('What is your name?');
      expect(result.suffix).toBe('');
    });
  });

  describe('cleanBlankMarkers', () => {
    it('elimina cualquier residuo de plantilla interna', () => {
      expect(cleanBlankMarkers('Sentence with {{blank}} and [blank] and ___ inside.')).toBe(
        'Sentence with  and  and  inside.'
      );
    });
  });
});
