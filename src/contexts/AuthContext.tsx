import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Session, User } from '@supabase/supabase-js';
import type { SidebarPageKey } from '@/lib/navigation';
import { logRouteTelemetry } from '@/lib/routeTelemetry';

type AccountAccess = {
  owner_id: string;
  sub_company_id: string | null;
  sub_company_name: string | null;
  allowed_pages: SidebarPageKey[];
  is_account_admin: boolean;
  blocked_pages: string[];
  status: string;
  allow_custom_logic: boolean;
  feature_landing_builder: boolean;
};

/**
 * Estado consolidado da autenticação, para consumidores exibirem UI
 * apropriada em cenários de lentidão/refresh silencioso.
 *  - unauthenticated: sem sessão
 *  - validating: primeira validação da sessão em andamento
 *  - valid: sessão validada e utilizável
 *  - expiring: token expira em <60s (renovação em background)
 *  - unavailable: revalidação falhou (rede/servidor); ainda temos sessão local
 */
export type AuthStatus = 'unauthenticated' | 'validating' | 'valid' | 'expiring' | 'unavailable';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  access: AccountAccess | null;
  accessLoading: boolean;
  sessionValidated: boolean;
  tenantResolved: boolean;
  authStatus: AuthStatus;
  reloadAccess: (opts?: { background?: boolean }) => Promise<void>;
  canAccessPage: (page: SidebarPageKey) => boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const EXTERNAL_LOGIN_URL = import.meta.env.VITE_EXTERNAL_LOGIN_URL || 'https://leadseller.com.br';

// Debounce entre refreshes disparados por visibilitychange/online. Evita
// avalanche de chamadas quando o usuário troca de aba várias vezes seguidas.
const VISIBILITY_REFRESH_DEBOUNCE_MS = 5000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState<AccountAccess | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [sessionValidated, setSessionValidated] = useState(false);
  const [tenantResolved, setTenantResolved] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('unauthenticated');

  const lastVisibilityRefreshRef = useRef(0);
  const lastKnownUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession((prev) => {
        const prevId = prev?.user?.id ?? null;
        const nextId = newSession?.user?.id ?? null;
        const identityChanged = prevId !== nextId;
        const shouldReset = identityChanged || event === 'SIGNED_OUT' || event === 'USER_UPDATED';

        if (shouldReset) {
          setSessionValidated(false);
          setTenantResolved(false);
          void logRouteTelemetry({
            type: 'auth_reset',
            message: `Reset de auth: event=${event} prev=${prevId ?? 'none'} next=${nextId ?? 'none'}`,
            metadata: { event, prev_user_id: prevId, next_user_id: nextId },
          });
        }
        return newSession;
      });
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Revalida sessão contra Supabase Auth quando a identidade muda.
  useEffect(() => {
    let cancelled = false;
    const currentId = session?.user?.id ?? null;

    if (!session?.user) {
      setSessionValidated(false);
      setAuthStatus('unauthenticated');
      lastKnownUserIdRef.current = null;
      return;
    }

    // Se a identidade não mudou e já foi validada, não repete a chamada.
    if (currentId === lastKnownUserIdRef.current && sessionValidated) {
      return;
    }

    setAuthStatus('validating');
    const expected = session.user.id;
    (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (cancelled) return;
        if (error || !data?.user || data.user.id !== expected) {
          console.warn('[AuthContext] session revalidation failed', {
            expected, received: data?.user?.id ?? null, error: error?.message,
          });
          void logRouteTelemetry({
            type: 'auth_revalidation_failed',
            message: `Revalidação falhou: ${error?.message ?? 'user mismatch'}`,
            metadata: { expected_user_id: expected, received_user_id: data?.user?.id ?? null, error: error?.message ?? null },
          });
          if (error && !data?.user) {
            // rede/servidor indisponível — mantém sessão local mas sinaliza
            setAuthStatus('unavailable');
            return;
          }
          setSessionValidated(false);
          await supabase.auth.signOut().catch(() => undefined);
          setSession(null);
          setAccess(null);
          setTenantResolved(false);
          setAuthStatus('unauthenticated');
          return;
        }
        setSessionValidated(true);
        lastKnownUserIdRef.current = expected;
        setAuthStatus('valid');
      } catch (err) {
        if (cancelled) return;
        console.warn('[AuthContext] getUser threw during revalidation', err);
        void logRouteTelemetry({
          type: 'auth_revalidation_failed',
          message: `getUser lançou exceção: ${(err as Error)?.message ?? 'unknown'}`,
          metadata: { expected_user_id: expected },
        });
        setAuthStatus('unavailable');
      }
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id, sessionValidated]);

  // Monitora expiração do token para expor status 'expiring' sem forçar reload.
  useEffect(() => {
    if (!session?.expires_at) return;
    const check = () => {
      const secondsLeft = (session.expires_at ?? 0) - Math.floor(Date.now() / 1000);
      if (secondsLeft <= 0) {
        setAuthStatus('unavailable');
      } else if (secondsLeft < 60 && authStatus === 'valid') {
        setAuthStatus('expiring');
      }
    };
    check();
    const id = window.setInterval(check, 15000);
    return () => window.clearInterval(id);
  }, [session?.expires_at, authStatus]);

  const reloadAccess = async (opts?: { background?: boolean }) => {
    if (!session?.user) {
      setAccess(null);
      setAccessLoading(false);
      return;
    }
    if (!opts?.background) setAccessLoading(true);

    const uid = session.user.id;
    const client = supabase as any;
    const safe = async <T,>(p: Promise<T> | undefined | null): Promise<T | { data: null } | { data: null; error: unknown }> => {
      if (!p || typeof (p as any).then !== 'function') return { data: null } as any;
      try { return await p; } catch { return { data: null } as any; }
    };
    const [{ data }, roleRes, ccRes] = await Promise.all([
      safe(client.rpc?.('get_my_account_access')),
      safe(client.rpc?.('has_role', { _user_id: uid, _role: 'admin' })),
      safe(client.from?.('client_companies')?.select?.('id, owner_id, auth_user_id, sub_company_id, status').eq('auth_user_id', uid).maybeSingle()),
    ]) as any;
    let row: AccountAccess | null = Array.isArray(data) ? data[0] : null;

    if (ccRes?.data) {
      const cc = ccRes.data as { owner_id: string | null; auth_user_id: string | null; sub_company_id: string | null; status: string | null };
      const companyOwnerId = cc.owner_id || uid;
      if (!row || row.owner_id === uid || row.owner_id !== companyOwnerId) {
        row = {
          owner_id: companyOwnerId,
          sub_company_id: cc.sub_company_id,
          sub_company_name: null,
          allowed_pages: row?.owner_id === companyOwnerId ? row.allowed_pages : [],
          is_account_admin: row?.owner_id === companyOwnerId ? row.is_account_admin : true,
          blocked_pages: row?.owner_id === companyOwnerId ? row.blocked_pages : [],
          status: cc.status === 'blocked' ? 'blocked' : 'active',
          allow_custom_logic: row?.owner_id === companyOwnerId ? row.allow_custom_logic : true,
          feature_landing_builder: row?.owner_id === companyOwnerId ? row.feature_landing_builder : false,
        };
      }
    }

    if (!row && roleRes?.data === true) {
      row = {
        owner_id: uid,
        sub_company_id: null,
        sub_company_name: null,
        allowed_pages: [],
        is_account_admin: true,
        blocked_pages: [],
        status: 'active',
        allow_custom_logic: true,
        feature_landing_builder: true,
      };
    }

    setAccess(row || null);
    setAccessLoading(false);
    setTenantResolved(true);
  };

  // Recarrega tenant SOMENTE quando a identidade muda de fato.
  useEffect(() => {
    const uid = session?.user?.id ?? null;
    if (uid && uid === access?.owner_id && tenantResolved) {
      // mesma identidade já resolvida — não recarrega
      return;
    }
    setTenantResolved(false);
    reloadAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  const ownerId = access?.owner_id ?? session?.user?.id ?? null;
  const subId = access?.sub_company_id ?? null;
  useEffect(() => {
    if (!session?.user) return;
    const uid = session.user.id;
    const channel = supabase.channel(`access-watch:${uid}`);

    channel.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'client_companies', filter: `auth_user_id=eq.${ownerId ?? uid}` },
      () => reloadAccess({ background: true }),
    );

    if (subId) {
      channel.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sub_companies', filter: `id=eq.${subId}` },
        () => reloadAccess({ background: true }),
      );
    }

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'user_account_access', filter: `user_id=eq.${uid}` },
      () => reloadAccess({ background: true }),
    );

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') reloadAccess({ background: true });
    });

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, ownerId, subId]);

  // Re-sync APENAS em visibilitychange, com debounce. Removemos focus/online
  // duplicados para evitar cascatas de requisições redundantes quando o
  // usuário volta de outra aba.
  useEffect(() => {
    if (!session?.user) return;
    const maybeRefresh = (reason: string) => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (reason !== 'online') {
        if (now - lastVisibilityRefreshRef.current < VISIBILITY_REFRESH_DEBOUNCE_MS) return;
        lastVisibilityRefreshRef.current = now;
      }
      void logRouteTelemetry({
        type: 'auth_visibility_refresh',
        message: `Refresh silencioso disparado por ${reason}`,
        metadata: { reason },
      });
      reloadAccess({ background: true });
    };
    const onVisible = () => maybeRefresh('visibilitychange');
    const onOnline = () => maybeRefresh('online');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  const canAccessPage = (page: SidebarPageKey) => {
    if (!access) return page === 'profile';
    if (access.status === 'blocked') return page === 'profile';
    if (access.blocked_pages?.includes(page)) return false;
    if (page === 'outros' && access.sub_company_id && !access.feature_landing_builder) return false;
    if (access.is_account_admin || access.allowed_pages.length === 0) return true;
    return access.allowed_pages.includes(page) || page === 'profile';
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setAccess(null);
    setAuthStatus('unauthenticated');
    if (EXTERNAL_LOGIN_URL) {
      window.location.href = EXTERNAL_LOGIN_URL;
    }
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, access, accessLoading, sessionValidated, tenantResolved, authStatus, reloadAccess, canAccessPage, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}

export { EXTERNAL_LOGIN_URL };
