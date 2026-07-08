import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Session, User } from '@supabase/supabase-js';
import type { SidebarPageKey } from '@/lib/navigation';

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

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  access: AccountAccess | null;
  accessLoading: boolean;
  /**
   * True once the current session has been revalidated against Supabase Auth
   * (getUser) AND the resulting user.id matches the local session. While false,
   * consumers MUST NOT render tenant-scoped data — the session might belong to
   * a different user or be stale/tampered with.
   */
  sessionValidated: boolean;
  /** Set once the tenant scope has been resolved (owner_id/sub_company_id known or explicitly none). */
  tenantResolved: boolean;
  canAccessPage: (page: SidebarPageKey) => boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// URL da página externa de login — ajuste conforme necessário
const EXTERNAL_LOGIN_URL = import.meta.env.VITE_EXTERNAL_LOGIN_URL || 'https://leadseller.com.br';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState<AccountAccess | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [sessionValidated, setSessionValidated] = useState(false);
  const [tenantResolved, setTenantResolved] = useState(false);

  useEffect(() => {
    // 1. Listener primeiro (evita race conditions)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      // Só invalidar sessão/tenant quando a identidade realmente mudou
      // (SIGNED_IN de outro usuário, SIGNED_OUT ou USER_UPDATED). Eventos
      // frequentes como TOKEN_REFRESHED e o disparo de INITIAL_SESSION ao
      // voltar de outra aba NÃO devem forçar o spinner "Verificando
      // autenticação..." nem recarregar o tenant.
      setSession((prev) => {
        const prevId = prev?.user?.id ?? null;
        const nextId = newSession?.user?.id ?? null;
        if (prevId !== nextId || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
          setSessionValidated(false);
          setTenantResolved(false);
        }
        return newSession;
      });
      setLoading(false);
    });

    // 2. Depois busca sessão atual
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // SECURITY: revalidate session against Supabase Auth on every change.
  // getUser() re-hits the auth server (not the local storage snapshot), so
  // it will reject tampered tokens or tokens that don't match the account
  // currently in localStorage. If the returned user.id differs from the
  // local session, we force sign-out to prevent cross-tenant leaks.
  useEffect(() => {
    let cancelled = false;
    if (!session?.user) {
      setSessionValidated(false);
      return;
    }
    const expected = session.user.id;
    (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (cancelled) return;
        if (error || !data?.user || data.user.id !== expected) {
          console.warn('[AuthContext] session revalidation failed — forcing sign out', {
            expected, received: data?.user?.id ?? null, error: error?.message,
          });
          setSessionValidated(false);
          await supabase.auth.signOut().catch(() => undefined);
          setSession(null);
          setAccess(null);
          setTenantResolved(false);
          return;
        }
        setSessionValidated(true);
      } catch (err) {
        if (cancelled) return;
        console.warn('[AuthContext] getUser threw during revalidation', err);
        setSessionValidated(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  const reloadAccess = async (opts?: { background?: boolean }) => {
    if (!session?.user) {
      setAccess(null);
      setAccessLoading(false);
      return;
    }
    // Refresh silencioso (visibilitychange/focus/online/realtime) não deve
    // acionar o spinner global de "Verificando autenticação..." — só o
    // primeiro carregamento (quando ainda não há tenant resolvido) mostra
    // loading. Isso evita que o app "recarregue" ao voltar de outra aba.
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
      safe(client.from?.('client_companies')?.select?.('id, owner_id, sub_company_id, status').eq('auth_user_id', uid).maybeSingle()),
    ]) as any;
    let row: AccountAccess | null = Array.isArray(data) ? data[0] : null;

    // Fallback: platform owner (admin app_role) — grants full access.
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

    // Fallback: user is the direct owner of a client_company — scope to own account.
    if (!row && ccRes?.data) {
      const cc = ccRes.data as { owner_id: string | null; sub_company_id: string | null; status: string | null };
      row = {
        owner_id: cc.owner_id || uid,
        sub_company_id: cc.sub_company_id,
        sub_company_name: null,
        allowed_pages: [],
        is_account_admin: true,
        blocked_pages: [],
        status: cc.status === 'blocked' ? 'blocked' : 'active',
        allow_custom_logic: true,
        feature_landing_builder: false,
      };
    }

    setAccess(row || null);
    setAccessLoading(false);
    setTenantResolved(true);
  };

  useEffect(() => {
    // Reset tenant resolution whenever the user changes so we never render a
    // new user with a previous user's scope.
    setTenantResolved(false);
    reloadAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  // Realtime: escuta alterações de blocked_pages filtradas por ID
  // (client_companies.auth_user_id = owner atual, sub_companies.id = sub atual,
  //  user_account_access.user_id = usuário atual). Isso garante update instantâneo
  // sem depender de refresh e reduz tráfego de eventos irrelevantes.
  const ownerId = access?.owner_id ?? session?.user?.id ?? null;
  const subId = access?.sub_company_id ?? null;
  useEffect(() => {
    if (!session?.user) return;
    const uid = session.user.id;
    const channel = supabase.channel(`access-watch:${uid}`);

    // client_companies: filtra pela empresa cujo login é o próprio usuário OU pelo owner_id conhecido
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
      // Após reconectar (SUBSCRIBED depois de perda), força re-sync para não ficar
      // com estado desatualizado caso eventos tenham sido perdidos offline.
      if (status === 'SUBSCRIBED') reloadAccess({ background: true });
    });

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, ownerId, subId]);

  // Re-sync ao voltar do background (visibilitychange) ou ao recuperar conexão (online).
  // Garante que blocked_pages reflita o banco mesmo se eventos realtime foram perdidos.
  useEffect(() => {
    if (!session?.user) return;
    const onVisible = () => { if (document.visibilityState === 'visible') reloadAccess({ background: true }); };
    const onOnline = () => reloadAccess({ background: true });
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  const canAccessPage = (page: SidebarPageKey) => {
    // SECURITY: default-deny when no access context is available (except profile).
    // Previously returned true, which exposed the full menu to users without
    // an account_access row (e.g. client-company logins provisioned before the
    // fallback existed).
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
    if (EXTERNAL_LOGIN_URL) {
      window.location.href = EXTERNAL_LOGIN_URL;
    }
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, access, accessLoading, sessionValidated, tenantResolved, canAccessPage, signOut }}>
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
