import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderFormattedMarkdown } from '../markdownRenderer';

describe('renderFormattedMarkdown - Typographical & Safe HTML Rendering', () => {
  it('renders <u>...</u> tags as styled underline elements', () => {
    const html = renderToStaticMarkup(
      <div>{renderFormattedMarkdown('Choose the correct form of the <u>underlined</u> verb.')}</div>
    );
    expect(html).toContain('<u class="underline underline-offset-2 decoration-2 decoration-indigo-600 font-semibold">underlined</u>');
  });

  it('renders <b> and <strong> tags as bold elements', () => {
    const html = renderToStaticMarkup(
      <div>{renderFormattedMarkdown('Look at the <b>words in bold</b> and <strong>key concepts</strong>.')}</div>
    );
    expect(html).toContain('<strong class="font-bold text-slate-900">words in bold</strong>');
    expect(html).toContain('<strong class="font-bold text-slate-900">key concepts</strong>');
  });

  it('renders <em> and <i> tags as italic elements', () => {
    const html = renderToStaticMarkup(
      <div>{renderFormattedMarkdown('This is an <em>emphasized</em> phrase with <i>italics</i>.')}</div>
    );
    expect(html).toContain('<em class="italic text-slate-800">emphasized</em>');
    expect(html).toContain('<em class="italic text-slate-800">italics</em>');
  });

  it('renders markdown **bold** and *italic* alongside HTML tags', () => {
    const html = renderToStaticMarkup(
      <div>{renderFormattedMarkdown('1. She <u>did not</u> go to **school** yesterday.')}</div>
    );
    expect(html).toContain('>did not</u>');
    expect(html).toContain('>school</strong>');
  });

  it('renders position markers [ 1 ] as styled badges', () => {
    const html = renderToStaticMarkup(
      <div>{renderFormattedMarkdown('Read the text. [ 1 ] Then answer.')}</div>
    );
    expect(html).toContain('[ 1 ]');
  });
});
