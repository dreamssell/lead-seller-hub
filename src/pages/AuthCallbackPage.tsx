import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

/**
 * Página de callback de autenticação.
 * A página de login externa redireciona para cá com os tokens:
 * /auth/callback?access_token=xxx&refresh_token=yyy
 */
export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const accessToken = searchParams.get('access_token');
    const refreshToken = searchParams.get('refresh_token');

    if (!accessToken || !refreshToken) {
      setError('Tokens de autenticação não encontrados. Faça login pela página de credenciamento.');
      return;
    }

    const setSessionFromTokens = async () => {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (sessionError) {
        console.error('Erro ao definir sessão:', sessionError);
        setError('Falha ao autenticar. Tente novamente.');
        return;
      }

      // Sessão válida, redireciona para o dashboard
      navigate('/', { replace: true });
    };

    setSessionFromTokens();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        {error ? (
          <div className="space-y-3">
            <div className="text-destructive text-lg font-medium">{error}</div>
            <p className="text-sm text-muted-foreground">
              Entre em contato com o administrador ou tente novamente.
            </p>
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
