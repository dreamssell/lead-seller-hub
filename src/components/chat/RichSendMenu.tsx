import { useEffect, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, MapPin, Contact2, ListChecks, MousePointerClick, BarChart3, Package, FileSignature, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type RichPayload =
  | { type: 'location'; latitude: number; longitude: number; name?: string; address?: string }
  | { type: 'contact'; fullName: string; phone: string }
  | { type: 'poll'; name: string; values: string[]; selectableCount: number }
  | { type: 'list'; title: string; description: string; buttonText: string; rows: Array<{ title: string; description?: string; rowId: string }> }
  | { type: 'buttons'; title?: string; description: string; footer?: string; buttons: Array<{ id: string; text: string }> }
  | { type: 'product'; productId: string; name: string; price?: number; imageUrl?: string }
  | { type: 'signature'; documentId: string; url: string; title: string };

interface Props {
  ownerId?: string | null;
  customerId: string;
  onSend: (p: RichPayload) => void | Promise<void>;
}

type Sheet = null | 'location' | 'contact' | 'poll' | 'list' | 'buttons' | 'product' | 'signature';

export function RichSendMenu({ ownerId, customerId, onSend }: Props) {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);

  const choose = (s: Sheet) => { setOpen(false); setSheet(s); };

  const items: Array<{ key: Exclude<Sheet, null>; icon: any; label: string; hint: string }> = [
    { key: 'location', icon: MapPin, label: 'Localização', hint: 'Enviar coordenadas' },
    { key: 'contact', icon: Contact2, label: 'Contato (vCard)', hint: 'Compartilhar contato' },
    { key: 'poll', icon: BarChart3, label: 'Enquete', hint: 'Pergunta com opções' },
    { key: 'list', icon: ListChecks, label: 'Lista interativa', hint: 'Menu de opções' },
    { key: 'buttons', icon: MousePointerClick, label: 'Botões rápidos', hint: 'Até 3 botões' },
    { key: 'product', icon: Package, label: 'Catálogo / Produto', hint: 'Enviar item da loja' },
    { key: 'signature', icon: FileSignature, label: 'Anexar assinatura', hint: 'Documento Signatures' },
  ];

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-10 w-10 rounded-xl" title="Recursos avançados">
            <Plus className="w-4 h-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1">Recursos WhatsApp Business</p>
          {items.map(({ key, icon: Icon, label, hint }) => (
            <button
              key={key}
              onClick={() => choose(key)}
              className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-secondary text-left transition"
            >
              <div className="w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center"><Icon className="w-3.5 h-3.5" /></div>
              <div className="min-w-0">
                <p className="text-xs font-medium">{label}</p>
                <p className="text-[10px] text-muted-foreground">{hint}</p>
              </div>
            </button>
          ))}
        </PopoverContent>
      </Popover>

      <LocationDialog open={sheet === 'location'} onClose={() => setSheet(null)} onSend={onSend} />
      <ContactDialog open={sheet === 'contact'} onClose={() => setSheet(null)} onSend={onSend} />
      <PollDialog open={sheet === 'poll'} onClose={() => setSheet(null)} onSend={onSend} />
      <ListDialog open={sheet === 'list'} onClose={() => setSheet(null)} onSend={onSend} />
      <ButtonsDialog open={sheet === 'buttons'} onClose={() => setSheet(null)} onSend={onSend} />
      <ProductDialog open={sheet === 'product'} onClose={() => setSheet(null)} onSend={onSend} ownerId={ownerId} />
      <SignatureDialog open={sheet === 'signature'} onClose={() => setSheet(null)} onSend={onSend} customerId={customerId} />
    </>
  );
}

function Shell({ open, onClose, title, children, onSubmit, busy }: any) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">{children}</div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}><X className="w-4 h-4 mr-1" />Cancelar</Button>
          <Button onClick={onSubmit} disabled={busy}>{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Enviar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LocationDialog({ open, onClose, onSend }: any) {
  const [lat, setLat] = useState(''); const [lng, setLng] = useState('');
  const [name, setName] = useState(''); const [addr, setAddr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) { setLat(''); setLng(''); setName(''); setAddr(''); } }, [open]);
  const useMy = () => navigator.geolocation?.getCurrentPosition(
    p => { setLat(String(p.coords.latitude)); setLng(String(p.coords.longitude)); },
    () => toast.error('Não foi possível obter localização')
  );
  const submit = async () => {
    const la = parseFloat(lat), lo = parseFloat(lng);
    if (isNaN(la) || isNaN(lo)) return toast.error('Latitude/longitude inválidas');
    setBusy(true); try { await onSend({ type: 'location', latitude: la, longitude: lo, name, address: addr }); onClose(); } finally { setBusy(false); }
  };
  return (
    <Shell open={open} onClose={onClose} title="Enviar localização" onSubmit={submit} busy={busy}>
      <div className="grid grid-cols-2 gap-2">
        <div><Label className="text-xs">Latitude</Label><Input value={lat} onChange={e => setLat(e.target.value)} placeholder="-23.5505" /></div>
        <div><Label className="text-xs">Longitude</Label><Input value={lng} onChange={e => setLng(e.target.value)} placeholder="-46.6333" /></div>
      </div>
      <Button variant="outline" size="sm" onClick={useMy} className="w-full"><MapPin className="w-3.5 h-3.5 mr-1" />Usar minha localização</Button>
      <div><Label className="text-xs">Nome do local (opcional)</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
      <div><Label className="text-xs">Endereço (opcional)</Label><Input value={addr} onChange={e => setAddr(e.target.value)} /></div>
    </Shell>
  );
}

function ContactDialog({ open, onClose, onSend }: any) {
  const [n, setN] = useState(''); const [p, setP] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) { setN(''); setP(''); } }, [open]);
  const submit = async () => {
    if (!n.trim() || !p.trim()) return toast.error('Preencha nome e telefone');
    setBusy(true); try { await onSend({ type: 'contact', fullName: n.trim(), phone: p.trim() }); onClose(); } finally { setBusy(false); }
  };
  return (
    <Shell open={open} onClose={onClose} title="Compartilhar contato" onSubmit={submit} busy={busy}>
      <div><Label className="text-xs">Nome completo</Label><Input value={n} onChange={e => setN(e.target.value)} /></div>
      <div><Label className="text-xs">Telefone</Label><Input value={p} onChange={e => setP(e.target.value)} placeholder="5511999999999" /></div>
    </Shell>
  );
}

function PollDialog({ open, onClose, onSend }: any) {
  const [q, setQ] = useState(''); const [opts, setOpts] = useState<string[]>(['', '']); const [multi, setMulti] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) { setQ(''); setOpts(['', '']); setMulti(false); } }, [open]);
  const submit = async () => {
    const clean = opts.map(o => o.trim()).filter(Boolean);
    if (!q.trim() || clean.length < 2) return toast.error('Mínimo: pergunta + 2 opções');
    setBusy(true); try { await onSend({ type: 'poll', name: q.trim(), values: clean, selectableCount: multi ? clean.length : 1 }); onClose(); } finally { setBusy(false); }
  };
  return (
    <Shell open={open} onClose={onClose} title="Nova enquete" onSubmit={submit} busy={busy}>
      <div><Label className="text-xs">Pergunta</Label><Input value={q} onChange={e => setQ(e.target.value)} /></div>
      {opts.map((o, i) => (
        <div key={i} className="flex gap-1">
          <Input value={o} onChange={e => setOpts(p => p.map((x, j) => j === i ? e.target.value : x))} placeholder={`Opção ${i + 1}`} />
          {opts.length > 2 && <Button variant="ghost" size="icon" onClick={() => setOpts(p => p.filter((_, j) => j !== i))}><X className="w-3.5 h-3.5" /></Button>}
        </div>
      ))}
      {opts.length < 12 && <Button variant="outline" size="sm" onClick={() => setOpts(p => [...p, ''])}>+ Adicionar opção</Button>}
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={multi} onChange={e => setMulti(e.target.checked)} /> Permitir múltipla escolha</label>
    </Shell>
  );
}

function ListDialog({ open, onClose, onSend }: any) {
  const [t, setT] = useState(''); const [d, setD] = useState(''); const [btn, setBtn] = useState('Ver opções');
  const [rows, setRows] = useState([{ title: '', description: '' }]); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) { setT(''); setD(''); setBtn('Ver opções'); setRows([{ title: '', description: '' }]); } }, [open]);
  const submit = async () => {
    const clean = rows.filter(r => r.title.trim());
    if (!d.trim() || clean.length === 0) return toast.error('Descrição e ao menos 1 item');
    setBusy(true);
    try {
      await onSend({
        type: 'list', title: t.trim(), description: d.trim(), buttonText: btn.trim() || 'Ver',
        rows: clean.map((r, i) => ({ title: r.title.trim(), description: r.description.trim() || undefined, rowId: `opt_${i + 1}` })),
      });
      onClose();
    } finally { setBusy(false); }
  };
  return (
    <Shell open={open} onClose={onClose} title="Lista interativa" onSubmit={submit} busy={busy}>
      <div><Label className="text-xs">Título</Label><Input value={t} onChange={e => setT(e.target.value)} /></div>
      <div><Label className="text-xs">Descrição</Label><Textarea rows={2} value={d} onChange={e => setD(e.target.value)} /></div>
      <div><Label className="text-xs">Texto do botão</Label><Input value={btn} onChange={e => setBtn(e.target.value)} /></div>
      <div className="space-y-1.5">
        <Label className="text-xs">Opções</Label>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-2 gap-1">
            <Input placeholder="Título" value={r.title} onChange={e => setRows(p => p.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
            <div className="flex gap-1">
              <Input placeholder="Descrição (opc)" value={r.description} onChange={e => setRows(p => p.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
              {rows.length > 1 && <Button variant="ghost" size="icon" onClick={() => setRows(p => p.filter((_, j) => j !== i))}><X className="w-3.5 h-3.5" /></Button>}
            </div>
          </div>
        ))}
        {rows.length < 10 && <Button variant="outline" size="sm" onClick={() => setRows(p => [...p, { title: '', description: '' }])}>+ Adicionar opção</Button>}
      </div>
    </Shell>
  );
}

function ButtonsDialog({ open, onClose, onSend }: any) {
  const [t, setT] = useState(''); const [d, setD] = useState(''); const [f, setF] = useState('');
  const [btns, setBtns] = useState(['', '']); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) { setT(''); setD(''); setF(''); setBtns(['', '']); } }, [open]);
  const submit = async () => {
    const clean = btns.map(b => b.trim()).filter(Boolean);
    if (!d.trim() || clean.length === 0) return toast.error('Descrição e ao menos 1 botão');
    setBusy(true);
    try {
      await onSend({
        type: 'buttons', title: t.trim() || undefined, description: d.trim(), footer: f.trim() || undefined,
        buttons: clean.map((text, i) => ({ id: `btn_${i + 1}`, text })),
      });
      onClose();
    } finally { setBusy(false); }
  };
  return (
    <Shell open={open} onClose={onClose} title="Mensagem com botões" onSubmit={submit} busy={busy}>
      <div><Label className="text-xs">Título (opc)</Label><Input value={t} onChange={e => setT(e.target.value)} /></div>
      <div><Label className="text-xs">Descrição</Label><Textarea rows={2} value={d} onChange={e => setD(e.target.value)} /></div>
      <div><Label className="text-xs">Rodapé (opc)</Label><Input value={f} onChange={e => setF(e.target.value)} /></div>
      <div className="space-y-1.5">
        <Label className="text-xs">Botões (até 3)</Label>
        {btns.map((b, i) => (
          <div key={i} className="flex gap-1">
            <Input value={b} placeholder={`Botão ${i + 1}`} onChange={e => setBtns(p => p.map((x, j) => j === i ? e.target.value : x))} />
            {btns.length > 1 && <Button variant="ghost" size="icon" onClick={() => setBtns(p => p.filter((_, j) => j !== i))}><X className="w-3.5 h-3.5" /></Button>}
          </div>
        ))}
        {btns.length < 3 && <Button variant="outline" size="sm" onClick={() => setBtns(p => [...p, ''])}>+ Adicionar botão</Button>}
      </div>
    </Shell>
  );
}

function ProductDialog({ open, onClose, onSend, ownerId }: any) {
  const [products, setProducts] = useState<any[]>([]); const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<any>(null); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return; setLoading(true); setSel(null);
    supabase.from('products').select('id,name,price,description').eq('is_active', true).order('name').limit(100)
      .then(({ data }) => { setProducts((data as any) || []); setLoading(false); });
  }, [open, ownerId]);
  const submit = async () => {
    if (!sel) return toast.error('Selecione um produto');
    setBusy(true); try { await onSend({ type: 'product', productId: sel.id, name: sel.name, price: sel.price }); onClose(); } finally { setBusy(false); }
  };
  return (
    <Shell open={open} onClose={onClose} title="Enviar produto do catálogo" onSubmit={submit} busy={busy}>
      {loading ? <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin" /></div> :
        products.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">Nenhum produto cadastrado.</p> :
          <div className="max-h-64 overflow-y-auto space-y-1">
            {products.map(p => (
              <button key={p.id} onClick={() => setSel(p)}
                className={`w-full flex items-center gap-2 p-2 rounded border text-left ${sel?.id === p.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-secondary/50'}`}>
                <Package className="w-5 h-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{p.name}</p>
                  {p.price != null && <p className="text-[10px] text-muted-foreground">R$ {Number(p.price).toFixed(2)}</p>}
                </div>
              </button>
            ))}
          </div>}
    </Shell>
  );
}

function SignatureDialog({ open, onClose, onSend, customerId }: any) {
  const [docs, setDocs] = useState<any[]>([]); const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<any>(null); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return; setLoading(true); setSel(null);
    supabase.from('signature_documents').select('id,description,status,signed_file_path,original_file_path,lead_id').eq('lead_id', customerId)
      .order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => { setDocs((data as any) || []); setLoading(false); });
  }, [open, customerId]);
  const submit = async () => {
    if (!sel) return toast.error('Selecione um documento');
    const path = sel.signed_file_path || sel.original_file_path;
    if (!path) return toast.error('Documento sem arquivo disponível');
    const { data: pub } = supabase.storage.from('signatures').getPublicUrl(path);
    const url = pub?.publicUrl;
    if (!url) return toast.error('Não foi possível gerar a URL do documento');
    setBusy(true);
    try { await onSend({ type: 'signature', documentId: sel.id, url, title: sel.description || 'Documento de assinatura' }); onClose(); }
    finally { setBusy(false); }
  };
  return (
    <Shell open={open} onClose={onClose} title="Anexar documento de assinatura" onSubmit={submit} busy={busy}>
      {loading ? <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin" /></div> :
        docs.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">Nenhum documento de assinatura deste cliente.</p> :
          <div className="max-h-64 overflow-y-auto space-y-1">
            {docs.map(d => (
              <button key={d.id} onClick={() => setSel(d)}
                className={`w-full flex items-center gap-2 p-2 rounded border text-left ${sel?.id === d.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-secondary/50'}`}>
                <FileSignature className="w-4 h-4 text-emerald-500" />
                <div className="flex-1 min-w-0"><p className="text-xs font-medium truncate">{d.description || 'Sem título'}</p><p className="text-[10px] text-muted-foreground">{d.status}</p></div>
              </button>
            ))}
          </div>}
    </Shell>
  );
}
