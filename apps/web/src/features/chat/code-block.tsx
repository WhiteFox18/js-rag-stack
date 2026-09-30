import { useEffect, useState } from 'react';
import { CopyButton } from '../../components/copy-button';
import type { CodeBlockProps } from './chat.types';
import { highlightCode } from './highlight';

interface Highlighted {
  key: string;
  html: string;
}

export function CodeBlock({ code, lang, streaming }: CodeBlockProps) {
  const [highlighted, setHighlighted] = useState<Highlighted | null>(null);
  const key = `${lang ?? ''}\u0000${code}`;

  useEffect(() => {
    // Highlighting every streamed token is wasted work; wait for the final text.
    if (streaming || !lang) return;
    let cancelled = false;
    void highlightCode({ code, lang }).then((html) => {
      if (!cancelled && html) setHighlighted({ key, html });
    });
    return () => {
      cancelled = true;
    };
  }, [code, lang, key, streaming]);

  const html = highlighted?.key === key ? highlighted.html : null;

  return (
    <div className="my-4 overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border py-1 pr-1.5 pl-3 text-xs text-fg-muted">
        <span>{lang ?? 'text'}</span>
        <CopyButton text={code} label="Copy code" showLabel />
      </div>
      {html ? (
        <div
          className="code-block-body overflow-x-auto text-sm"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="code-block-body overflow-x-auto px-4 py-3 text-sm">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
