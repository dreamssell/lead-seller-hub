import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

/**
 * Página de callback de autenticação.
 * A página de login externa redireciona para cá com os tokens:
 * /auth/callback?access_token=xxx&refresh_token=yyy
 *
 * Também suporta tokens no hash (#access_token=...&refresh_token=...)
 * que é o formato padrão do Supabase para OAuth implicit flow.
 */
export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  const log = (msg: string, data?: unknown) => {
    const line = data !== undefined ? `${msg} ${JSON.stringify(data)}` : msg;
    // eslint-disable-next-line no-console
    console.log(`[AuthCallback] ${line}`);
    setDebugLog((prev) => [...prev, `${new Date().toISOString()} ${line}`]);
  };

  useEffect(() => {
    const started = performance.now();
    log('start', {
      href: window.location.href,
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash ? '[present]' : '[empty]',
      referrer: document.referrer || null,
    });

    // Tokens podem vir na query string OU no hash (OAuth implicit)
    let accessToken = searchParams.get('access_token');
    let refreshToken = searchParams.get('refresh_token');
    let source: 'query' | 'hash' | 'none' = accessToken ? 'query' : 'none';

    if ((!accessToken || !refreshToken) && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      accessToken = accessToken || hashParams.get('access_token');
      refreshToken = refreshToken || hashParams.get('refresh_token');
      if (accessToken) source = 'hash';
      const hashError = hashParams.get('error') || hashParams.get('error_description');
      if (hashError) log('hash_error', { hashError });
    }

    log('token_source', { source, hasAccess: !!accessToken, hasRefresh: !!refreshToken });

    if (!accessToken || !refreshToken) {
      const qsError = searchParams.get('error') || searchParams.get('error_description');
      log('missing_tokens', { qsError });
      setError(
        qsError
          ? `Falha no login: ${qsError}`
          : 'Tokens de autenticação não encontrados. Faça login pela página de credenciamento.'
      );
      return;
    }

    const setSessionFromTokens = async () => {
      try {
        log('setSession:start');
        const { data, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken!,
          refresh_token: refreshToken!,
        });

        if (sessionError) {
          log('setSession:error', {
            name: sessionError.name,
            status: (sessionError as { status?: number }).status ?? null,
            message: sessionError.message,
          });
          setError(`Falha ao autenticar: ${sessionError.message}`);
          return;
        }

        log('setSession:ok', {
          userId: data.session?.user?.id ?? null,
          expiresAt: data.session?.expires_at ?? null,
          durationMs: Math.round(performance.now() - started),
        });

        // Redireciona para destino salvo (se houver) ou dashboard
        const next = searchParams.get('next') || sessionStorage.getItem('auth:next') || '/';
        sessionStorage.removeItem('auth:next');
        const target = next.startsWith('/') && !next.startsWith('//') ? next : '/';
        log('navigate', { target });
        navigate(target, { replace: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log('setSession:exception', { message });
        setError(`Erro inesperado ao autenticar: ${message}`);
      }
    };

    setSessionFromTokens();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-4 max-w-2xl w-full">
        {error ? (
          <div className="space-y-3">
            <div className="text-destructive text-lg font-medium">{error}</div>
            <p className="text-sm text-muted-foreground">
              Entre em contato com o administrador ou tente novamente.
            </p>
            {debugLog.length > 0 && (
              <details className="text-left mt-4">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Detalhes técnicos ({debugLog.length} eventos)
                </summary>
                <pre className="mt-2 p-3 rounded bg-muted text-[10px] overflow-auto max-h-64 text-left">
                  {debugLog.join('\n')}
                </pre>
              </details>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-muted-foreground">Autenticando...</span>
          </div>
        )}
      </div>
    </div>
  );
}
