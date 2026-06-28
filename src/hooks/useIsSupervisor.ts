import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

type Level = 'agente' | 'supervisor' | 'coordenador' | 'diretor' | 'admin';

export function useIsSupervisor() {
  const [level, setLevel] = useState<Level>('agente');
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      setUserId(data.user.id);
      const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', data.user.id);
      if (roles?.some((r) => r.role === 'admin')) {
        setLevel('admin');
        return;
      }
      const { data: sigs } = await supabase
        .from('user_signature_roles')
        .select('role')
        .eq('user_id', data.user.id);
      const r = sigs?.map((s: any) => s.role) || [];
      if (r.includes('diretor')) setLevel('diretor');
      else if (r.includes('coordenador')) setLevel('coordenador');
      else if (r.includes('supervisor')) setLevel('supervisor');
    })();
  }, []);

  const isSupervisor = ['supervisor', 'coordenador', 'diretor', 'admin'].includes(level);
  return { isSupervisor, level, userId };
}
