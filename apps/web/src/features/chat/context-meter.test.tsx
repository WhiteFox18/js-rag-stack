import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ContextMeter, formatTokenCount } from './context-meter';

describe('ContextMeter', () => {
  it('formats token counts compactly', () => {
    expect(formatTokenCount(950)).toBe('950');
    expect(formatTokenCount(6100)).toBe('6.1k');
    expect(formatTokenCount(8192)).toBe('8.2k');
    expect(formatTokenCount(32000)).toBe('32k');
  });

  it('shows used / max with an accessible description', () => {
    render(<ContextMeter usedTokens={6100} maxTokens={8192} />);
    expect(screen.getByText('6.1k / 8.2k tokens')).toBeInTheDocument();
    expect(
      screen.getByText('Context: 6100 of 8192 tokens used'),
    ).toBeInTheDocument();
  });

  it('shows a dash before the first reply and nothing without a max', () => {
    const { rerender, container } = render(
      <ContextMeter usedTokens={null} maxTokens={8192} />,
    );
    expect(screen.getByText('— / 8.2k tokens')).toBeInTheDocument();
    rerender(<ContextMeter usedTokens={null} maxTokens={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('turns amber at the summarization threshold', () => {
    const { container, rerender } = render(
      <ContextMeter usedTokens={1000} maxTokens={8192} />,
    );
    expect(container.querySelector('[data-level="ok"]')).not.toBeNull();
    rerender(<ContextMeter usedTokens={6200} maxTokens={8192} />);
    expect(container.querySelector('[data-level="warn"]')).not.toBeNull();
  });
});
