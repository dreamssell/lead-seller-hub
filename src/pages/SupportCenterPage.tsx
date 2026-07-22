import { useEffect, useMemo, useRef, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import {
  DEPARTMENT_META, PRIORITY_META, STATUS_META,
  MAX_IMAGES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, VIDEO_MIMES, IMAGE_MIMES,
  formatBytes, formatTicketNumber,
  type SupportDepartment, type SupportPriority,
} from '@/lib/supportHelpers';
import { LifeBuoy, Paperclip, Video as VideoIcon, Image as ImageIcon, X, Upload, ArrowRight } from 'lucide-react';

type Ticket = {
  id: string;
  number: number;
  title: string;
  status: keyof typeof STATUS_META;
  priority: SupportPriority;
  department: SupportDepartment;
  created_at: string;
  last_activity_at: string;
  user_id: string;
  author_name?: string | null;
};

type ListScope = 'mine' | 'team';

type QueuedFile = { file: File; kind: 'image' | 'video'; id: string };

type WhiteLabel = { primary_color: string | null; logo_light_url: string | null; logo_dark_url: string | null; brand_name: string | null };

export default function SupportCenterPage() {
  const { user, access } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [scope, setScope] = useState<ListScope>('mine');
  const [brand, setBrand] = useState<WhiteLabel | null>(null);

  // form state
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState<SupportDepartment>('ti');
  const [priority, setPriority] = useState<SupportPriority>('media');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // White label — aplica cor/logo da empresa dona quando o usuário é de sub-empresa
  useEffect(() => {
    if (!access?.sub_company_id || !access?.owner_id) { setBrand(null); return; }
    void (async () => {
      const { data } = await supabase
        .from('white_label_settings' as any)
        .select('primary_color, logo_light_url, logo_dark_url, brand_name')
        .eq('owner_id', access.owner_id).maybeSingle();
      setBrand(data as any);
    })();
  }, [access?.owner_id, access?.sub_company_id]);


  useEffect(() => {
    if (!user) return;
    let mounted = true;
    (async () => {
      setLoadingList(true);
      await refresh();
      if (mounted) setLoadingList(false);
    })();

    const ch = supabase
      .channel(`support-center-${user.id}`)
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'support_tickets' },
          () => { void refresh(); })
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, scope]);

  async function refresh() {
    let q = supabase
      .from('support_tickets' as any)
      .select('id, number, title, status, priority, department, created_at, last_activity_at, user_id')
      .order('last_activity_at', { ascending: false })
      .limit(50);
    if (scope === 'mine' && user) q = q.eq('user_id', user.id);
    const { data } = await q;
    const rows = (data as any[]) || [];
    // Resolve nomes dos autores (para a aba "Da equipe")
    const authorIds = Array.from(new Set(rows.map(r => r.user_id).filter(Boolean)));
    let nameById = new Map<string, string>();
    if (authorIds.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, display_name, email')
        .in('user_id', authorIds);
      (profs as any[] | null)?.forEach(p => nameById.set(p.user_id, p.display_name || p.email || 'Colega'));
    }
    setTickets(rows.map(r => ({ ...r, author_name: nameById.get(r.user_id) || null })));
  }

  function addFiles(list: FileList | File[]) {
    const arr = Array.from(list);
    const currentImages = files.filter(f => f.kind === 'image').length;
    const currentVideo = files.find(f => f.kind === 'video');
    const next: QueuedFile[] = [];
    let imageCount = currentImages;
    for (const f of arr) {
      if (VIDEO_MIMES.includes(f.type)) {
        if (currentVideo || next.some(n => n.kind === 'video')) {
          toast({ title: 'Apenas 1 vídeo por ticket', variant: 'destructive' }); continue;
        }
        if (f.size > MAX_VIDEO_BYTES) {
          toast({ title: `${f.name} excede 200MB`, variant: 'destructive' }); continue;
        }
        next.push({ file: f, kind: 'video', id: crypto.randomUUID() });
      } else if (IMAGE_MIMES.includes(f.type)) {
        if (imageCount >= MAX_IMAGES) {
          toast({ title: `Limite de ${MAX_IMAGES} imagens`, variant: 'destructive' }); break;
        }
        if (f.size > MAX_IMAGE_BYTES) {
          toast({ title: `${f.name} excede 10MB`, variant: 'destructive' }); continue;
        }
        imageCount++;
        next.push({ file: f, kind: 'image', id: crypto.randomUUID() });
      } else {
        toast({ title: `Formato não suportado: ${f.name}`, variant: 'destructive' });
      }
    }
    setFiles(prev => [...prev, ...next]);
  }

  function removeFile(id: string) { setFiles(prev => prev.filter(f => f.id !== id)); }

  const totalBytes = useMemo(() => files.reduce((a, f) => a + f.file.size, 0), [files]);

  async function submit() {
    if (!user || !access) return;
    if (title.trim().length < 3) return toast({ title: 'Descreva um assunto com pelo menos 3 letras', variant: 'destructive' });
    if (description.trim().length < 10) return toast({ title: 'Detalhe melhor a necessidade (pelo menos 10 letras)', variant: 'destructive' });

    setSubmitting(true);
    try {
      const { data: ticket, error } = await supabase
        .from('support_tickets' as any)
        .insert({
          owner_id: access.owner_id,
          sub_company_id: access.sub_company_id,
          user_id: user.id,
          department, priority,
          title: title.trim(),
          description: description.trim(),
          contact_phone: phone.trim() || null,
        })
        .select('id, number')
        .single();
      if (error) throw error;
      const ticketId = (ticket as any).id;

      // Upload files (com barra de progresso agregada)
      if (files.length) {
        setUploadPct(0);
        let uploaded = 0;
        for (const f of files) {
          const path = `${ticketId}/${crypto.randomUUID()}-${f.file.name.replace(/[^\w.\-]/g, '_')}`;
          const { error: upErr } = await supabase.storage
            .from('support-attachments')
            .upload(path, f.file, { contentType: f.file.type, upsert: false });
          if (upErr) {
            toast({ title: `Falha no upload de ${f.file.name}`, description: upErr.message, variant: 'destructive' });
            continue;
          }
          await supabase.from('support_ticket_attachments' as any).insert({
            ticket_id: ticketId,
            uploaded_by: user.id,
            storage_path: path,
            file_name: f.file.name,
            file_type: f.file.type,
            file_size: f.file.size,
          });
          uploaded += f.file.size;
          setUploadPct(Math.round((uploaded / Math.max(1, totalBytes)) * 100));
        }
      }

      // Dispara notificação WhatsApp (best-effort — não bloqueia a UX)
      supabase.functions.invoke('support-notify', {
        body: { ticket_id: ticketId, event: 'created' },
      }).catch(() => {/* silencioso */});

      toast({ title: `Ticket ${formatTicketNumber((ticket as any).number)} aberto`, description: 'Nossa equipe já foi notificada.' });
      navigate(`/suporte/${ticketId}`);
    } catch (e: any) {
      toast({ title: 'Erro ao abrir ticket', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
      setUploadPct(null);
    }
  }

  return (
    <AppLayout title="Central de Ajuda" subtitle="Estamos aqui para resolver — abra um ticket e acompanhe em tempo real">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* ============ Formulário ============ */}
        <motion.section
          className="glass-card p-5 sm:p-6 xl:col-span-2 space-y-5"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        >
          <header className="flex items-start gap-3">
            {brand?.logo_light_url ? (
              <img
                src={brand.logo_light_url}
                alt={brand.brand_name || 'Logo'}
                className="h-10 w-10 rounded-xl object-contain bg-white dark:bg-white/90 p-1 border border-border"
              />
            ) : (
              <div
                className="p-2.5 rounded-xl bg-primary/10 text-primary"
                style={brand?.primary_color ? { backgroundColor: `${brand.primary_color}1A`, color: brand.primary_color } : undefined}
              >
                <LifeBuoy className="w-5 h-5" />
              </div>
            )}
            <div>
              <h2 className="text-lg font-semibold">
                Olá, {user?.user_metadata?.display_name || user?.email?.split('@')[0]}! 👋
              </h2>
              <p className="text-sm text-muted-foreground">
                {brand?.brand_name
                  ? `Atendimento ${brand.brand_name} — detalhe sua necessidade para que resolvamos rapidamente.`
                  : 'Detalhe sua necessidade abaixo para que nossa equipe de especialistas resolva o mais rápido possível.'}
              </p>
            </div>
          </header>


          {/* Departamento */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Departamento</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(Object.keys(DEPARTMENT_META) as SupportDepartment[]).map((d) => {
                const meta = DEPARTMENT_META[d];
                const active = department === d;
                const Icon = meta.icon;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDepartment(d)}
                    className={`text-left p-3 rounded-xl border transition-all ${
                      active ? 'border-primary bg-primary/5 ring-2 ring-primary/30' : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4 text-primary" />
                      <span className="text-sm font-semibold">{meta.label}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-tight">{meta.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Prioridade */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Grau de urgência</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(PRIORITY_META) as SupportPriority[]).map((p) => {
                const meta = PRIORITY_META[p];
                const active = priority === p;
                return (
                  <button
                    key={p} type="button" onClick={() => setPriority(p)}
                    className={`p-2.5 rounded-xl border text-sm font-medium transition-all ${
                      active ? `border-transparent ${meta.badge} ring-2 ${meta.ring}` : 'border-border hover:border-primary/50'
                    }`}
                  >{meta.label}</button>
                );
              })}
            </div>
            {priority === 'critica' && (
              <p className="text-[11px] text-red-500">⚠️ Use "Crítica" apenas se o sistema estiver fora do ar.</p>
            )}
          </div>

          {/* Título + telefone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Assunto</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} maxLength={200} placeholder="Ex.: Erro na integração do WhatsApp" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">WhatsApp para retorno (opcional)</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+55 11 90000-0000" />
            </div>
          </div>

          {/* Descrição */}
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Descreva o problema</Label>
            <Textarea
              value={description} onChange={e => setDescription(e.target.value)}
              maxLength={20000} rows={8}
              placeholder="Conte com detalhes: o que aconteceu, quando, o que já tentou. Use listas e quebras de linha para organizar."
              className="font-mono text-sm"
            />
            <div className="text-[10px] text-right text-muted-foreground mt-1">{description.length}/20000</div>
          </div>

          {/* Upload */}
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Evidências</Label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
              onClick={() => inputRef.current?.click()}
              className={`mt-1 rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-all ${
                dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
              }`}
            >
              <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Arraste ou clique para anexar</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Vídeos: 1 arquivo (mp4/mov/webm) até 200MB · Imagens: até {MAX_IMAGES} (png/jpg/webp) de 10MB
              </p>
              <input
                ref={inputRef} type="file" multiple hidden
                accept={[...VIDEO_MIMES, ...IMAGE_MIMES].join(',')}
                onChange={(e) => e.target.files && addFiles(e.target.files)}
              />
            </div>

            {files.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50 text-xs">
                    {f.kind === 'video' ? <VideoIcon className="w-4 h-4 text-primary" /> : <ImageIcon className="w-4 h-4 text-primary" />}
                    <span className="flex-1 truncate">{f.file.name}</span>
                    <span className="text-muted-foreground">{formatBytes(f.file.size)}</span>
                    <button type="button" onClick={() => removeFile(f.id)} className="p-1 rounded hover:bg-destructive/10 text-destructive"><X className="w-3.5 h-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {uploadPct !== null && (
            <div className="space-y-1">
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${uploadPct}%` }} />
              </div>
              <p className="text-[11px] text-muted-foreground text-center">Enviando anexos… {uploadPct}%</p>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={submit} disabled={submitting} size="lg" className="gap-2">
              {submitting ? 'Enviando…' : 'Abrir ticket'} <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </motion.section>

        {/* ============ Meus tickets ============ */}
        <motion.aside
          className="glass-card p-4 sm:p-5 space-y-3 self-start"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        >
          <div className="flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Meus tickets recentes</h3>
          </div>
          {loadingList ? (
            <div className="space-y-2">{Array.from({length:3}).map((_,i)=>(<div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse"/>))}</div>
          ) : tickets.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Nenhum ticket ainda.</p>
          ) : (
            <ul className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
              {tickets.map((t) => {
                const st = STATUS_META[t.status];
                const pr = PRIORITY_META[t.priority];
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => navigate(`/suporte/${t.id}`)}
                      className="w-full text-left p-2.5 rounded-lg border border-border hover:border-primary/50 hover:bg-secondary/50 transition-all"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono text-muted-foreground">{formatTicketNumber(t.number)}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${pr.badge}`}>{pr.label}</span>
                      </div>
                      <p className="text-xs font-medium mt-1 line-clamp-2">{t.title}</p>
                      <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-muted-foreground">
                        <st.icon className={`w-3 h-3 ${st.color}`} />
                        <span>{st.label}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </motion.aside>
      </div>
    </AppLayout>
  );
}
