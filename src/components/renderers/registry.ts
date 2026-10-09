import type { ComponentType } from 'react';
import { TableReferenceRenderer } from './TableReferenceRenderer';
import { StructuredReferenceRenderer } from './StructuredReferenceRenderer';
import { TextReferenceRenderer } from './TextReferenceRenderer';
import { MediaReferenceRenderer } from './MediaReferenceRenderer';
import { InputFieldsRenderer } from './InputFieldsRenderer';
import { SelectionRenderer } from './SelectionRenderer';
import { BucketsRenderer } from './BucketsRenderer';
import { SequenceRenderer } from './SequenceRenderer';
import { WritingRenderer } from './WritingRenderer';

export const REFERENCE_RENDERER_REGISTRY: Record<string, ComponentType<any>> = {
  table_reference: TableReferenceRenderer,
  reference_table: StructuredReferenceRenderer,
  text: TextReferenceRenderer,
  media: MediaReferenceRenderer,
};

export const INTERACTION_RENDERER_REGISTRY: Record<string, ComponentType<any>> = {
  input_fields: InputFieldsRenderer,
  selection: SelectionRenderer,
  buckets_matching: BucketsRenderer,
  sequence: SequenceRenderer,
  writing: WritingRenderer,
};

export function getReferenceRenderer(type: string): ComponentType<any> | null {
  return REFERENCE_RENDERER_REGISTRY[type] || null;
}

export function getInteractionRenderer(type: string): ComponentType<any> | null {
  return INTERACTION_RENDERER_REGISTRY[type] || null;
}
