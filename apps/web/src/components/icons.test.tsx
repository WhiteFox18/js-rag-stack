import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SendIcon, StopIcon } from './icons';

describe('icons', () => {
  it('renders decorative icons that inherit the text color', () => {
    const { container } = render(<SendIcon className="size-4" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg).toHaveClass('size-4');
  });

  it('lets callers override defaults', () => {
    const { container } = render(<StopIcon strokeWidth={3} />);
    expect(container.querySelector('svg')).toHaveAttribute('stroke-width', '3');
  });
});
