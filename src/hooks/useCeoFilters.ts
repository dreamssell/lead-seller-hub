import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CeoFilters, Period } from '@/components/ceo/CeoFilterBar';

const VALID_PERIODS: Period[] = ['7d', '30d', '90d', '12m', 'all'];

/**
 * URL-synced CEO filters so dashboard links can be shared.
 * Extras keep additional page-specific state (channel, source tab) in the URL too.
 */
export function useCeoFilters(defaults: Partial<CeoFilters> = {}, extras: Record<string, string> = {}) {
  const [params, setParams] = useSearchParams();

  const value: CeoFilters & Record<string, string> = useMemo(() => {
    const period = (params.get('period') as Period) || (defaults.period as Period) || '30d';
    return {
      period: VALID_PERIODS.includes(period) ? period : '30d',
      subCompanyId: params.get('sub') || defaults.subCompanyId || 'all',
      collaboratorId: params.get('user') || defaults.collaboratorId || 'all',
      ...Object.fromEntries(Object.keys(extras).map(k => [k, params.get(k) || extras[k]])),
    } as any;
  }, [params]);

  const setValue = useCallback((next: Partial<CeoFilters & Record<string, string>>) => {
    setParams(prev => {
      const p = new URLSearchParams(prev);
      const map: Record<string, string | undefined> = {
        period: next.period,
        sub: next.subCompanyId,
        user: next.collaboratorId,
      };
      for (const k of Object.keys(extras)) map[k] = (next as any)[k];
      Object.entries(map).forEach(([k, v]) => {
        if (v === undefined) return;
        if (!v || v === 'all') p.delete(k);
        else p.set(k, v);
      });
      return p;
    }, { replace: true });
  }, [setParams, extras]);

  const onChangeFilters = useCallback((v: CeoFilters) => setValue(v as any), [setValue]);

  return { filters: value, setFilters: onChangeFilters, setExtra: setValue };
}
