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

  useEffect(() => {
    // 1. Listener primeiro (evita race conditions)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
    });

    // 2. Depois busca sessão atual
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const reloadAccess = async () => {
    if (!session?.user) {
      setAccess(null);
      setAccessLoading(false);
      return;
    }
    setAccessLoading(true);
    const uid = session.user.id;
    const [{ data }, roleRes, ccRes] = await Promise.all([
      (supabase as any).rpc('get_my_account_access'),
      (supabase as any).rpc('has_role', { _user_id: uid, _role: 'admin' as any }),
      (supabase as any)
        .from('client_companies')
        .select('id, owner_id, sub_company_id, status')
        .eq('auth_user_id', uid)
        .maybeSingle(),
    ]);
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
  };

  useEffect(() => {
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
      () => reloadAccess(),
    );

    if (subId) {
      channel.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sub_companies', filter: `id=eq.${subId}` },
        () => reloadAccess(),
      );
    }

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'user_account_access', filter: `user_id=eq.${uid}` },
      () => reloadAccess(),
    );

    channel.subscribe((status) => {
      // Após reconectar (SUBSCRIBED depois de perda), força re-sync para não ficar
      // com estado desatualizado caso eventos tenham sido perdidos offline.
      if (status === 'SUBSCRIBED') reloadAccess();
    });

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, ownerId, subId]);

  // Re-sync ao voltar do background (visibilitychange) ou ao recuperar conexão (online).
  // Garante que blocked_pages reflita o banco mesmo se eventos realtime foram perdidos.
  useEffect(() => {
    if (!session?.user) return;
    const onVisible = () => { if (document.visibilityState === 'visible') reloadAccess(); };
    const onOnline = () => reloadAccess();
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
    if (!access) return true;
    if (access.status === 'blocked') return page === 'profile';
    if (access.blocked_pages?.includes(page)) return false;
    // Feature flag: módulo "Outros" só aparece se a sub-empresa contratou
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
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, access, accessLoading, canAccessPage, signOut }}>
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
