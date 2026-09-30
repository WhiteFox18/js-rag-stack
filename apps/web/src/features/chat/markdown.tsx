import { isValidElement } from 'react';
import type { ReactNode } from 'react';
import Markdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { MarkdownContentProps } from './chat.types';
import { CodeBlock } from './code-block';

const REMARK_PLUGINS = [remarkGfm];
const LANGUAGE_PATTERN = /language-([\w#+.-]+)/;

function createComponents(streaming: boolean): Components {
  return {
    pre({ children }) {
      if (
        isValidElement<{ className?: string; children?: ReactNode }>(children)
      ) {
        const lang =
          LANGUAGE_PATTERN.exec(children.props.className ?? '')?.[1] ?? null;
        const raw = children.props.children;
        const code = (typeof raw === 'string' ? raw : '').replace(/\n$/, '');
        return <CodeBlock code={code} lang={lang} streaming={streaming} />;
      }
      return <pre>{children}</pre>;
    },
    a({ href, children }) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },
    table({ children }) {
      return (
        <div className="markdown-table">
          <table>{children}</table>
        </div>
      );
    },
  };
}

const COMPONENTS = {
  idle: createComponents(false),
  streaming: createComponents(true),
};

export function MarkdownContent({
  content,
  streaming = false,
}: MarkdownContentProps) {
  return (
    <div className={streaming ? 'markdown markdown-streaming' : 'markdown'}>
      <Markdown
        remarkPlugins={REMARK_PLUGINS}
        components={streaming ? COMPONENTS.streaming : COMPONENTS.idle}
      >
        {content}
      </Markdown>
    </div>
  );
}
