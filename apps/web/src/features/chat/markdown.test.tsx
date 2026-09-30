import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { highlightCode } from './highlight';
import { MarkdownContent } from './markdown';

vi.mock('./highlight', () => ({ highlightCode: vi.fn() }));
const highlight = vi.mocked(highlightCode);

describe('MarkdownContent', () => {
  beforeEach(() => {
    highlight.mockReset();
    highlight.mockResolvedValue(null);
  });

  it('renders GitHub-flavored markdown', () => {
    const { container } = render(
      <MarkdownContent
        content={
          '**bold** and `inline`\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |'
        }
      />,
    );
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('inline').tagName).toBe('CODE');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(container.querySelector('.markdown-table > table')).not.toBeNull();
  });

  it('opens links in a new tab safely and drops javascript: URLs', () => {
    render(
      <MarkdownContent content="[docs](https://example.com) [bad](javascript:alert(1))" />,
    );
    const docs = screen.getByRole('link', { name: 'docs' });
    expect(docs).toHaveAttribute('target', '_blank');
    expect(docs).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('bad').closest('a')?.getAttribute('href')).toBe('');
  });

  it('never renders raw HTML', () => {
    const { container } = render(
      <MarkdownContent content={'<img src=x onerror="alert(1)"> <b>hi</b>'} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });

  it('renders fenced code with a language label and highlighted markup', async () => {
    highlight.mockResolvedValue(
      '<pre class="shiki"><code><span>const a = 1;</span></code></pre>',
    );
    const { container } = render(
      <MarkdownContent content={'```ts\nconst a = 1;\n```'} />,
    );
    expect(screen.getByText('ts')).toBeInTheDocument();
    await waitFor(() =>
      expect(container.querySelector('.shiki')).not.toBeNull(),
    );
    expect(highlight).toHaveBeenCalledWith({
      code: 'const a = 1;',
      lang: 'ts',
    });
    expect(container.querySelector('.code-block-body')).toHaveClass(
      'overflow-x-auto',
    );
  });

  it('keeps plain code when highlighting fails', async () => {
    const { container } = render(
      <MarkdownContent content={'```ts\nconst a = 1;\n```'} />,
    );
    await waitFor(() => expect(highlight).toHaveBeenCalled());
    expect(container.querySelector('pre code')).toHaveTextContent(
      'const a = 1;',
    );
  });

  it('treats an unclosed fence as code and skips highlighting while streaming', () => {
    const { container } = render(
      <MarkdownContent content={'Here:\n```py\nprint(1'} streaming />,
    );
    expect(container.querySelector('pre code')).toHaveTextContent('print(1');
    expect(container.firstElementChild).toHaveClass('markdown-streaming');
    expect(highlight).not.toHaveBeenCalled();
  });

  it('copies code block contents', async () => {
    const user = userEvent.setup();
    render(<MarkdownContent content={'```\nnpm test\n```'} />);
    await user.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(await navigator.clipboard.readText()).toBe('npm test');
  });
});
