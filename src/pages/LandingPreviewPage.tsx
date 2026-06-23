// Blank fullscreen preview — used as "tela em branco" for layout review.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { LivePreview } from './LandingBuilderPage';

export default function LandingPreviewPage() {
  const { id } = useParams();
  const [page, setPage] = useState<any>(null);
  const [buttons, setButtons] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    const reload = async () => {
      const [p, b] = await Promise.all([
        supabase.from('landing_pages').select('*').eq('id', id).maybeSingle(),
        supabase.from('landing_buttons').select('*').eq('page_id', id).order('sort_order'),
      ]);
      setPage(p.data); setButtons((b.data as any) || []);
    };
    reload();
    const channel = supabase.channel(`landing-preview-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'landing_pages', filter: `id=eq.${id}` }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'landing_buttons' }, reload)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  if (!page) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando preview...</div>;
  return <LivePreview page={page} buttons={buttons} fullscreen />;
}
