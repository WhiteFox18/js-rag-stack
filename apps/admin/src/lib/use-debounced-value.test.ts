import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedValue } from './use-debounced-value';

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('emits the latest value only after the delay', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue({ value, delayMs: 300 }),
      { initialProps: { value: 'a' } },
    );
    rerender({ value: 'ab' });
    rerender({ value: 'abc' });
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe('a');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('abc');
  });
});
