import { useSearchParams } from 'react-router-dom';
import type { DateRangeValue } from '../components/range-filter';
import { toIsoEndExclusive, toIsoStart } from './format';

export function useListState() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const range: DateRangeValue = {
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
  };

  function update(
    changes: Record<string, string | number | undefined>,
    resetPage: boolean,
  ) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value === undefined || value === '') next.delete(key);
          else next.set(key, String(value));
        }
        if (resetPage) next.delete('page');
        return next;
      },
      { replace: true },
    );
  }

  return {
    page,
    range,
    rangeQuery: {
      from: toIsoStart(range.from),
      to: toIsoEndExclusive(range.to),
    },
    param: (key: string) => params.get(key) ?? '',
    setPage: (value: number) =>
      update({ page: value > 1 ? value : undefined }, false),
    setRange: (value: DateRangeValue) =>
      update({ from: value.from, to: value.to }, true),
    setParam: (key: string, value: string) => update({ [key]: value }, true),
  };
}
