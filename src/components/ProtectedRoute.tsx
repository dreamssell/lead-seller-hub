import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, EXTERNAL_LOGIN_URL } from '@/contexts/AuthContext';
import { getPageKeyByPath, type SidebarPageKey } from '@/lib/navigation';

interface ProtectedRouteProps {
  children: React.ReactNode;
  pageKey?: SidebarPageKey;
}

export default function ProtectedRoute({ children, pageKey }: ProtectedRouteProps) {
  const { session, loading, accessLoading, canAccessPage } = useAuth();
  const location = useLocation();

  if (loading || accessLoading) {
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
    if (EXTERNAL_LOGIN_URL) {
      window.location.href = EXTERNAL_LOGIN_URL;
      return null;
    }
    return <Navigate to="/auth/callback" replace />;
  }

  const key = pageKey || getPageKeyByPath(location.pathname);
  if (!canAccessPage(key)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold text-foreground">Acesso restrito</h1>
          <p className="text-sm text-muted-foreground">
            Você não tem permissão para acessar esta página. Contate o administrador da sua conta.
          </p>
          <a href="/profile" className="inline-block text-sm text-primary hover:underline">Ir para o meu perfil</a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
