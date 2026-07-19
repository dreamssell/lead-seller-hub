import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { reportError } from '@/lib/errorReporter';
import { ErrorPage } from '@/components/ErrorPage';

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
        // SECURITY: extract sub (user id) from access_token so we can verify the
        // session Supabase gives us actually matches the token issued for this login.
        // Prevents a stale session (e.g. previous admin login in same browser) from
        // leaking through if setSession silently fails or returns cached state.
        let expectedUserId: string | null = null;
        try {
          const payload = JSON.parse(atob(accessToken!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
          expectedUserId = payload?.sub ?? null;
        } catch {
          log('token_decode_failed');
        }

        // Limpa somente o estado local (localStorage) sem chamar o endpoint
        // /logout — um signOut com escopo padrão/global revoga TODAS as sessões
        // do usuário no servidor, inclusive o token recém emitido que estamos
        // prestes a aplicar, causando "Auth session missing!" no setSession.
        log('signOut:local');
        try { await supabase.auth.signOut({ scope: 'local' } as any); } catch { /* ignore */ }

        log('setSession:start', { expectedUserId });
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
          reportError({
            message: `[AuthCallback] setSession falhou: ${sessionError.message}`,
            severity: 'error',
            source: 'manual',
            metadata: {
              stage: 'setSession',
              name: sessionError.name,
              status: (sessionError as { status?: number }).status ?? null,
              expectedUserId,
              debugLog,
            },
          });
          setError(sessionError.message);
          return;
        }

        const receivedUserId = data.session?.user?.id ?? null;
        if (expectedUserId && receivedUserId && receivedUserId !== expectedUserId) {
          log('session_user_mismatch', { expectedUserId, receivedUserId });
          reportError({
            message: '[AuthCallback] Mismatch entre usuário do token e sessão retornada',
            severity: 'fatal',
            source: 'manual',
            metadata: { expectedUserId, receivedUserId, debugLog },
          });
          await supabase.auth.signOut({ scope: 'local' } as any).catch(() => undefined);
          setError('session_user_mismatch');
          return;
        }

        log('setSession:ok', {
          userId: receivedUserId,
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
        reportError({
          message: `[AuthCallback] Exceção inesperada: ${message}`,
          stack: err instanceof Error ? err.stack : null,
          severity: 'fatal',
          source: 'manual',
          metadata: { debugLog },
        });
        setError(message);
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
