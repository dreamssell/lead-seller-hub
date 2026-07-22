import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
  editing?: {
    id: string;
    title: string;
    redirect_url: string | null;
    tracking_label: string | null;
    pipeline_id: string | null;
    status: 'draft' | 'published';
  } | null;
};

function normalizeWhatsapp(raw: string): string {
  const v = raw.trim();
  if (!v) return v;
  if (/^https?:\/\//i.test(v)) return v;
  // "5511999999999" → "https://wa.me/5511999999999"
  const digits = v.replace(/\D/g, '');
  if (digits.length >= 10) return `https://wa.me/${digits}`;
  return v;
}

export function NewLinkDialog({ open, onOpenChange, onCreated, editing }: Props) {
  const { access } = useAuth();
  const [title, setTitle] = useState('');
  const [redirect, setRedirect] = useState('');
  const [tracking, setTracking] = useState('');
  const [pipelineId, setPipelineId] = useState<string>('');
  const [status, setStatus] = useState<'draft' | 'published'>('published');
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      let q = supabase.from('pipelines').select('id,name,sub_company_id,owner_id').eq('is_active', true);
      if (access?.owner_id) q = q.eq('owner_id', access.owner_id);
      if (access?.sub_company_id) q = q.eq('sub_company_id', access.sub_company_id);
      const { data } = await q.order('name');
      setPipelines((data as any) || []);
    })();
    if (editing) {
      setTitle(editing.title || '');
      setRedirect(editing.redirect_url || '');
      setTracking(editing.tracking_label || '');
      setPipelineId(editing.pipeline_id || '');
      setStatus(editing.status);
    } else {
      setTitle(''); setRedirect(''); setTracking(''); setPipelineId(''); setStatus('published');
    }
  }, [open, editing, access?.owner_id, access?.sub_company_id]);

  const submit = async () => {
    if (!title.trim() || !redirect.trim()) {
      toast({ title: 'Preencha o título e o destino do WhatsApp', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const finalRedirect = normalizeWhatsapp(redirect);
    try {
      if (editing) {
        const { error } = await supabase.from('landing_pages').update({
          title,
          redirect_url: finalRedirect,
          tracking_label: tracking || null,
          pipeline_id: pipelineId || null,
          status,
        } as any).eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Link atualizado' });
      } else {
        if (!access?.owner_id) { toast({ title: 'Conta não detectada', variant: 'destructive' }); setSaving(false); return; }
        const slug = `l-${Math.random().toString(36).slice(2, 9)}`;
        const userId = (await supabase.auth.getUser()).data.user?.id;
        const { error } = await supabase.from('landing_pages').insert({
          owner_id: access.owner_id,
          sub_company_id: access.sub_company_id,
          slug,
          title,
          page_type: 'link',
          redirect_url: finalRedirect,
          tracking_label: tracking || null,
          pipeline_id: pipelineId || null,
          status,
          created_by: userId,
          auto_create_lead: false,
          form_mode: 'none',
        } as any);
        if (error) throw error;
        toast({ title: 'Link criado', description: 'Já pode ser compartilhado.' });
      }
      onOpenChange(false);
      onCreated?.();
    } catch (e: any) {
      toast({ title: 'Erro ao salvar', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar link' : 'Novo link de WhatsApp'}</DialogTitle>
          <DialogDescription>
            Um link curto que redireciona direto para o WhatsApp e mede visualizações, cliques e leads como uma página publicada.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Título / identificação</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex.: Campanha Instagram - Setembro" />
          </div>
          <div>
            <Label>Destino (WhatsApp)</Label>
            <Input value={redirect} onChange={e => setRedirect(e.target.value)}
              placeholder="https://wa.me/5511999999999?text=Olá" />
            <p className="text-[11px] text-muted-foreground mt-1">
              Pode colar só o número (ex.: <code>5511999999999</code>) — geramos o link do WhatsApp automaticamente.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Rótulo de rastreio (opcional)</Label>
              <Input value={tracking} onChange={e => setTracking(e.target.value)} placeholder="utm/campanha" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v: any) => setStatus(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="published">Publicado</SelectItem>
                  <SelectItem value="draft">Rascunho</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Funil ativo</Label>
            <Select value={pipelineId || 'none'} onValueChange={(v) => setPipelineId(v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Nenhum funil" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum funil</SelectItem>
                {pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">Você pode alterar o funil a qualquer momento.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {editing ? 'Salvar' : 'Criar link'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
