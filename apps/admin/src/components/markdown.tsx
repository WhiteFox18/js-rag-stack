import Markdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const REMARK_PLUGINS = [remarkGfm];

const COMPONENTS: Components = {
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

export function MarkdownContent({
  content,
  className = '',
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={`markdown ${className}`.trim()}>
      <Markdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
        {content}
      </Markdown>
    </div>
  );
}
