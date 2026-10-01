import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeTotals } from '../test/fixtures';
import { Pagination } from './pagination';
import { RangeFilter } from './range-filter';
import { UsageTotalsCards } from './usage-totals';

describe('shared components', () => {
  it('paginates and disables edges', async () => {
    const onPage = vi.fn();
    render(<Pagination page={1} pageSize={25} total={60} onPage={onPage} />);
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPage).toHaveBeenCalledWith(2);
  });

  it('shows Page 1 of 1 for empty results', () => {
    render(<Pagination page={1} pageSize={25} total={0} onPage={vi.fn()} />);
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('reports date range changes', async () => {
    const onChange = vi.fn();
    render(<RangeFilter value={{ from: '', to: '' }} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('From'), '2026-09-01');
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-09-01', to: '' });
  });

  it('renders usage totals', () => {
    render(<UsageTotalsCards usage={makeTotals({ inputTokens: 1200 })} />);
    expect(screen.getByText('Input tokens').nextSibling).toHaveTextContent(
      '1,200',
    );
  });
});
