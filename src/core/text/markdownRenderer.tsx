import React from 'react';

/**
 * Parses and renders basic inline Markdown (bold, italic, code) and safe HTML formatting tags
 * (<u>, <b>, <strong>, <em>, <i>) into styled React elements.
 * Correctly preserves underlines, bolding, and markers like `**Important:**` or `<u>word</u>`.
 */
export function renderFormattedMarkdown(text: string): React.ReactNode {
  if (!text) return null;

  // Split by safe HTML tags (<u>, <b>, <strong>, <em>, <i>), markdown bold (**text** or __text__),
  // inline code (`code`), italic (*text*), or canonical position markers ([ 1 ], [ 2 ], etc.)
  const tokens = text.split(/(<u\b[^>]*>[\s\S]*?<\/u>|<b\b[^>]*>[\s\S]*?<\/b>|<strong\b[^>]*>[\s\S]*?<\/strong>|<em\b[^>]*>[\s\S]*?<\/em>|<i\b[^>]*>[\s\S]*?<\/i>|\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\*[^*\n]+\*|\[\s*\d{1,2}\s*\])/gi);

  return tokens.map((token, idx) => {
    if (!token) return null;

    // Canonical position markers: [ 1 ], [ 2 ], etc.
    const posMatch = token.match(/^\[\s*(\d{1,2})\s*\]$/);
    if (posMatch) {
      return (
        <span
          key={idx}
          className="inline-flex items-center justify-center px-2 py-0.5 mx-1 font-bold text-xs bg-indigo-100 text-indigo-700 rounded-md border border-indigo-200/90 shadow-2xs select-all align-middle"
        >
          [ {posMatch[1]} ]
        </span>
      );
    }

    // HTML Underline (<u>...</u>)
    const uMatch = token.match(/^<u\b[^>]*>([\s\S]*?)<\/u>$/i);
    if (uMatch) {
      return (
        <u key={idx} className="underline underline-offset-2 decoration-2 decoration-indigo-600 font-semibold">
          {renderFormattedMarkdown(uMatch[1])}
        </u>
      );
    }

    // HTML Bold (<b>...</b> or <strong>...</strong>)
    const bMatch = token.match(/^<(?:b|strong)\b[^>]*>([\s\S]*?)<\/(?:b|strong)>$/i);
    if (bMatch) {
      return (
        <strong key={idx} className="font-bold text-slate-900">
          {renderFormattedMarkdown(bMatch[1])}
        </strong>
      );
    }

    // HTML Italic (<em>...</em> or <i>...</i>)
    const iMatch = token.match(/^<(?:em|i)\b[^>]*>([\s\S]*?)<\/(?:em|i)>$/i);
    if (iMatch) {
      return (
        <em key={idx} className="italic text-slate-800">
          {renderFormattedMarkdown(iMatch[1])}
        </em>
      );
    }

    // Bold (**...** or __...__)
    if (
      (token.startsWith('**') && token.endsWith('**') && token.length >= 4) ||
      (token.startsWith('__') && token.endsWith('__') && token.length >= 4)
    ) {
      const cleanContent = token.slice(2, -2);
      return (
        <strong key={idx} className="font-bold text-slate-900">
          {cleanContent}
        </strong>
      );
    }

    // Inline Code (`...`)
    if (token.startsWith('`') && token.endsWith('`') && token.length >= 2) {
      const cleanContent = token.slice(1, -1);
      return (
        <code key={idx} className="bg-slate-100 text-slate-800 px-1 py-0.5 rounded text-[0.9em] font-mono">
          {cleanContent}
        </code>
      );
    }

    // Italic (*...*)
    if (token.startsWith('*') && token.endsWith('*') && token.length >= 2) {
      const cleanContent = token.slice(1, -1);
      return (
        <em key={idx} className="italic text-slate-800">
          {cleanContent}
        </em>
      );
    }

    return <React.Fragment key={idx}>{token}</React.Fragment>;
  });
}
