import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { logPageLoad } from '@/lib/perfTelemetry';

/**
 * Mede o tempo entre a mudança de rota e o próximo frame idle da página.
 * Uma amostra por navegação SPA. O DONO vê em /internal/telemetry (perf.page_load).
 */
export function usePagePerfTelemetry() {
  const location = useLocation();
  const lastPath = useRef<string | null>(null);
  const startRef = useRef<number>(typeof performance !== 'undefined' ? performance.now() : Date.now());

  useEffect(() => {
    // Novo path — inicia timer e agenda medição no idle após pintar.
    const path = location.pathname + location.search;
    if (lastPath.current === path) return;
    lastPath.current = path;
    startRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now();

    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      logPageLoad({
        pageKey: location.pathname,
        durationMs: now - startRef.current,
        navigationType: 'spa',
        metadata: { search: location.search || null },
      });
    };

    // Espera 2 rAF + idle para capturar tempo até "primeira interação".
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        const ric = (window as any).requestIdleCallback as
          | ((cb: () => void, opts?: { timeout: number }) => number)
          | undefined;
        if (ric) ric(measure, { timeout: 1500 });
        else setTimeout(measure, 150);
        // guarda p/ cleanup
        (measure as any)._raf2 = raf2;
      });
      (measure as any)._raf1 = raf1;
    });

    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search]);
}
