// Returns whether the current authenticated user is the platform owner
// (has the global "admin" app role). Internal diagnostics, error logs and
// developer-only tools are gated behind this check so clients and
// sub-empresas never see backend instrumentation.
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function usePlatformOwner() {
  const { user, loading } = useAuth();
  const [isOwner, setIsOwner] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (loading) return;
    if (!user) { setIsOwner(false); return; }
    (async () => {
      const { data, error } = await supabase.rpc('has_role', {
        _user_id: user.id,
        _role: 'admin' as any,
      });
      if (cancelled) return;
      setIsOwner(!error && data === true);
    })();
    return () => { cancelled = true; };
  }, [user?.id, loading]);

  return { isOwner: isOwner === true, loading: isOwner === null };
}
