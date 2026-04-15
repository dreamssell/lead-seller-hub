import { Navigate } from 'react-router-dom';
import { useAuth, EXTERNAL_LOGIN_URL } from '@/contexts/AuthContext';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
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
    // Se tiver URL externa configurada, redireciona para lá
    if (EXTERNAL_LOGIN_URL) {
      window.location.href = EXTERNAL_LOGIN_URL;
      return null;
    }
    // Senão, vai para a página de callback (fallback)
    return <Navigate to="/auth/callback" replace />;
  }

  return <>{children}</>;
}
