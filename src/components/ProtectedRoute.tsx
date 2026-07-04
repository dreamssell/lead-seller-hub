import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, EXTERNAL_LOGIN_URL, buildExternalLoginUrl } from '@/contexts/AuthContext';
import { getPageKeyByPath, type SidebarPageKey } from '@/lib/navigation';
import { logRouteTelemetry } from '@/lib/routeTelemetry';
import { usePlatformOwner } from '@/hooks/usePlatformOwner';

interface ProtectedRouteProps {
  children: React.ReactNode;
  pageKey?: SidebarPageKey;
  /** Restrict access to the platform owner (global admin). */
  ownerOnly?: boolean;
}


function BlockedTelemetry({ pageKey, path }: { pageKey: string; path: string }) {
  useEffect(() => {
    void logRouteTelemetry({
      type: 'protected_route_blocked',
      message: `Acesso negado para ${pageKey} em ${path}`,
      metadata: { path, pageKey, reason: 'page_not_allowed' },
    });
  }, [pageKey, path]);
  return null;
}

export default function ProtectedRoute({ children, pageKey, ownerOnly }: ProtectedRouteProps) {
  const { session, loading, accessLoading, canAccessPage } = useAuth();
  const { isOwner, loading: ownerLoading } = usePlatformOwner();
  const location = useLocation();

  if (loading || accessLoading || (ownerOnly && ownerLoading)) {

    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">Verificando autenticação...</span>
        </div>
      </div>
    );
  }

  if (!session) {
    void logRouteTelemetry({
      type: 'protected_route_unauthenticated',
      message: `Sessão ausente ao acessar ${location.pathname}`,
      metadata: { path: location.pathname, redirect_to: EXTERNAL_LOGIN_URL || '/auth/callback' },
    });
    if (EXTERNAL_LOGIN_URL) {
      window.location.href = EXTERNAL_LOGIN_URL;
      return null;
    }
    return <Navigate to="/auth/callback" replace />;
  }

  const key = pageKey || getPageKeyByPath(location.pathname);
  const blocked = (ownerOnly && !isOwner) || !canAccessPage(key);
  if (blocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <BlockedTelemetry pageKey={String(key)} path={location.pathname} />
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold text-foreground">Acesso restrito</h1>
          <p className="text-sm text-muted-foreground">
            {ownerOnly && !isOwner
              ? 'Esta página é exclusiva do administrador da plataforma.'
              : 'Você não tem permissão para acessar esta página. Contate o administrador da sua conta.'}
          </p>
          <a href="/profile" className="inline-block text-sm text-primary hover:underline">Ir para o meu perfil</a>
        </div>
      </div>
    );
  }


  return <>{children}</>;
}
