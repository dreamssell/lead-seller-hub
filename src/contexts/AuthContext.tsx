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

/**
 * Monta a URL da página externa de login incluindo o `redirect_to` para o
 * `/auth/callback` deste hub. Sem isso a página externa (hospedada em outro
 * domínio) devolve o usuário para o próprio domínio dela e cai em 404.
 */
export function buildExternalLoginUrl(extraParams?: Record<string, string>): string {
  if (!EXTERNAL_LOGIN_URL) return '';
  try {
    const url = new URL(EXTERNAL_LOGIN_URL);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    if (origin) {
      const callback = `${origin}/auth/callback`;
      url.searchParams.set('redirect_to', callback);
      url.searchParams.set('return_to', callback);
      url.searchParams.set('continue', callback);
    }
    if (extraParams) {
      for (const [k, v] of Object.entries(extraParams)) {
        if (v) url.searchParams.set(k, v);
      }
    }
    return url.toString();
  } catch {
    return EXTERNAL_LOGIN_URL;
  }
}

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
    const { data } = await (supabase as any).rpc('get_my_account_access');
    const row = Array.isArray(data) ? data[0] : null;
    setAccess(row || null);
    setAccessLoading(false);
  };

  useEffect(() => {
    reloadAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  // Realtime: refresh quando sub_companies (blocked_pages) ou user_account_access mudar
  useEffect(() => {
    if (!session?.user) return;
    const channel = supabase
      .channel('access-watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sub_companies' }, () => reloadAccess())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_account_access' }, () => reloadAccess())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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
      window.location.href = buildExternalLoginUrl();
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
