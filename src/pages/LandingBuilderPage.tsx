import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { Plus, Trash2, Save, ExternalLink, Eye, Copy, ArrowLeft, Sparkles, RefreshCw } from 'lucide-react';
import { TemplatePickerDialog } from '@/components/outros/TemplatePickerDialog';
import { QrCodeStudio } from '@/components/outros/QrCodeStudio';
import type { LandingTemplate } from '@/lib/landingTemplates';

type Page = any;
type Btn = {
  id: string; label: string; url: string; action_type: 'whatsapp' | 'site' | 'link' | 'form';
  bg_color: string; text_color: string; shape: 'rounded' | 'square' | 'pill'; size: string; sort_order: number;
};

const ACTION_LABEL: Record<string, string> = { whatsapp: 'WhatsApp', site: 'Site', link: 'Link', form: 'Formulário' };
const SHAPE_CLASS: Record<string, string> = { rounded: 'rounded-md', square: 'rounded-none', pill: 'rounded-full' };

export default function LandingBuilderPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [page, setPage] = useState<Page | null>(null);
  const [buttons, setButtons] = useState<Btn[]>([]);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [p, b, pl] = await Promise.all([
        supabase.from('landing_pages').select('*').eq('id', id).maybeSingle(),
        supabase.from('landing_buttons').select('*').eq('page_id', id).order('sort_order'),
        supabase.from('pipelines').select('id,name').order('name'),
      ]);
      setPage(p.data); setButtons((b.data as any) || []); setPipelines((pl.data as any) || []);
    })();
  }, [id]);

  const publicUrl = useMemo(() => page ? `${window.location.origin}/p/${page.slug}` : '', [page]);

  if (!page) return <AppLayout title="Editor de página"><p className="text-sm text-muted-foreground">Carregando...</p></AppLayout>;

  const update = (k: string, v: any) => setPage({ ...page, [k]: v });

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('landing_pages').update({
      title: page.title, headline: page.headline, subheadline: page.subheadline,
      page_bg_color: page.page_bg_color, text_color: page.text_color, align: page.align,
      tracking_label: page.tracking_label, status: page.status, slug: page.slug,
      pipeline_id: page.pipeline_id || null, auto_create_lead: page.auto_create_lead, form_mode: page.form_mode,
    }).eq('id', page.id);
    setSaving(false);
    if (error) return toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    toast({ title: 'Página salva' });
  };

  const addButton = async () => {
    const { data, error } = await supabase.from('landing_buttons').insert({
      page_id: page.id, label: 'Falar com atendente', url: 'https://wa.me/55', action_type: 'whatsapp',
      sort_order: buttons.length,
    } as any).select('*').maybeSingle();
    if (error) return toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    setButtons([...buttons, data as any]);
  };

  const updateBtn = async (b: Btn, patch: Partial<Btn>) => {
    setButtons(buttons.map(x => x.id === b.id ? { ...x, ...patch } as Btn : x));
    await supabase.from('landing_buttons').update(patch as any).eq('id', b.id);
  };

  const removeBtn = async (b: Btn) => {
    setButtons(buttons.filter(x => x.id !== b.id));
    await supabase.from('landing_buttons').delete().eq('id', b.id);
  };

  return (
    <AppLayout title="Editor de página de captura" subtitle={`/${page.slug}`}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => nav('/outros')}><ArrowLeft className="w-4 h-4 mr-1" />Voltar</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.open(`/outros/${page.id}/preview`, '_blank')}><Eye className="w-4 h-4 mr-1" />Pré-visualizar em branco</Button>
            <Button variant="outline" onClick={() => window.open(publicUrl, '_blank')}><ExternalLink className="w-4 h-4 mr-1" />Abrir página real</Button>
            <Button onClick={save} disabled={saving}><Save className="w-4 h-4 mr-1" />{saving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Editor */}
          <div className="space-y-4">
            <Tabs defaultValue="content">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="content">Conteúdo</TabsTrigger>
                <TabsTrigger value="style">Estilo</TabsTrigger>
                <TabsTrigger value="cta">CTAs</TabsTrigger>
                <TabsTrigger value="capture">Captura</TabsTrigger>
              </TabsList>

              <TabsContent value="content" className="space-y-3 mt-3">
                <Card><CardContent className="p-4 space-y-3">
                  <div><Label>Título interno</Label><Input value={page.title} onChange={e => update('title', e.target.value)} /></div>
                  <div><Label>Slug (URL)</Label><Input value={page.slug} onChange={e => update('slug', e.target.value.replace(/[^a-z0-9-]/g, '-').toLowerCase())} /></div>
                  <div><Label>Header — título grande</Label><Input value={page.headline || ''} onChange={e => update('headline', e.target.value)} placeholder="Ex.: Agende sua consulta agora" /></div>
                  <div><Label>Header — frase de apresentação</Label><Textarea value={page.subheadline || ''} onChange={e => update('subheadline', e.target.value)} rows={2} /></div>
                  <div><Label>Rótulo de rastreio</Label><Input value={page.tracking_label || ''} onChange={e => update('tracking_label', e.target.value)} placeholder="Ex.: Clínica Dentista 1" /></div>
                  <div className="flex items-center gap-2"><Switch checked={page.status === 'published'} onCheckedChange={v => update('status', v ? 'published' : 'draft')} /><Label>Publicada</Label></div>
                </CardContent></Card>
              </TabsContent>

              <TabsContent value="style" className="space-y-3 mt-3">
                <Card><CardContent className="p-4 space-y-3">
                  <div><Label>Cor de fundo</Label><div className="flex gap-2 items-center"><input type="color" value={page.page_bg_color} onChange={e => update('page_bg_color', e.target.value)} className="h-10 w-16 rounded cursor-pointer" /><Input value={page.page_bg_color} onChange={e => update('page_bg_color', e.target.value)} /></div></div>
                  <div><Label>Cor do texto</Label><div className="flex gap-2 items-center"><input type="color" value={page.text_color} onChange={e => update('text_color', e.target.value)} className="h-10 w-16 rounded cursor-pointer" /><Input value={page.text_color} onChange={e => update('text_color', e.target.value)} /></div></div>
                  <div><Label>Alinhamento do header</Label>
                    <Select value={page.align} onValueChange={v => update('align', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="left">Esquerda</SelectItem><SelectItem value="center">Centro</SelectItem><SelectItem value="right">Direita</SelectItem></SelectContent>
                    </Select>
                  </div>
                </CardContent></Card>
              </TabsContent>

              <TabsContent value="cta" className="space-y-3 mt-3">
                <Card>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <div><CardTitle className="text-sm">Botões / CTAs</CardTitle><CardDescription>Cada botão pode redirecionar para WhatsApp, site ou link.</CardDescription></div>
                    <Button size="sm" onClick={addButton}><Plus className="w-4 h-4 mr-1" />Adicionar</Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {buttons.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Nenhum botão. Adicione um CTA.</p>}
                    {buttons.map(b => (
                      <div key={b.id} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline">{ACTION_LABEL[b.action_type]}</Badge>
                          <Button size="icon" variant="ghost" onClick={() => removeBtn(b)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div><Label className="text-xs">Texto</Label><Input value={b.label} onChange={e => updateBtn(b, { label: e.target.value })} /></div>
                          <div><Label className="text-xs">Tipo</Label>
                            <Select value={b.action_type} onValueChange={v => updateBtn(b, { action_type: v as any })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                                <SelectItem value="site">Site</SelectItem>
                                <SelectItem value="link">Link externo</SelectItem>
                                <SelectItem value="form">Formulário</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div><Label className="text-xs">URL de redirecionamento</Label><Input value={b.url} onChange={e => updateBtn(b, { url: e.target.value })} placeholder={b.action_type === 'whatsapp' ? 'https://wa.me/5511999999999?text=Olá' : 'https://...'} /></div>
                        <div className="grid grid-cols-3 gap-2">
                          <div><Label className="text-xs">Cor de fundo</Label><input type="color" value={b.bg_color} onChange={e => updateBtn(b, { bg_color: e.target.value })} className="h-9 w-full rounded cursor-pointer" /></div>
                          <div><Label className="text-xs">Cor do texto</Label><input type="color" value={b.text_color} onChange={e => updateBtn(b, { text_color: e.target.value })} className="h-9 w-full rounded cursor-pointer" /></div>
                          <div><Label className="text-xs">Formato</Label>
                            <Select value={b.shape} onValueChange={v => updateBtn(b, { shape: v as any })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent><SelectItem value="rounded">Arredondado</SelectItem><SelectItem value="pill">Pílula</SelectItem><SelectItem value="square">Quadrado</SelectItem></SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="capture" className="space-y-3 mt-3">
                <Card><CardContent className="p-4 space-y-3">
                  <div>
                    <Label>Modo de captura</Label>
                    <Select value={page.form_mode} onValueChange={v => update('form_mode', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Apenas redirecionar (sem formulário)</SelectItem>
                        <SelectItem value="simple">Formulário simples (nome + telefone)</SelectItem>
                        <SelectItem value="full">Formulário completo (nome, telefone, email, mensagem)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">Em qualquer modo, todo clique é registrado com o rastreio "{page.tracking_label || page.slug}".</p>
                  </div>
                  <Separator />
                  <div className="flex items-center gap-2"><Switch checked={!!page.auto_create_lead} onCheckedChange={v => update('auto_create_lead', v)} /><Label>Criar lead automaticamente no CRM</Label></div>
                  <div>
                    <Label>Funil de destino</Label>
                    <Select value={page.pipeline_id || ''} onValueChange={v => update('pipeline_id', v || null)}>
                      <SelectTrigger><SelectValue placeholder="Selecione um funil" /></SelectTrigger>
                      <SelectContent>{pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </CardContent></Card>

                <Card><CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase mb-2 text-muted-foreground">Compartilhamento</p>
                  <div className="flex gap-3 items-start">
                    <div className="flex-1 space-y-2">
                      <div className="flex gap-2"><Input readOnly value={publicUrl} /><Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(publicUrl); toast({ title: 'Copiado' }); }}><Copy className="w-4 h-4" /></Button></div>
                      <p className="text-xs text-muted-foreground">Compartilhe o link ou o QR Code com parceiros e clientes. Crie quantos quiser nessa mesma página.</p>
                    </div>
                    <div className="bg-white p-2 rounded"><QRCodeCanvas value={publicUrl} size={96} /></div>
                  </div>
                </CardContent></Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Live preview */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Pré-visualização ao vivo</CardTitle></CardHeader>
            <CardContent className="p-0">
              <LivePreview page={page} buttons={buttons} />
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

export function LivePreview({ page, buttons, fullscreen }: { page: any; buttons: Btn[]; fullscreen?: boolean }) {
  const alignClass = page.align === 'left' ? 'text-left items-start' : page.align === 'right' ? 'text-right items-end' : 'text-center items-center';
  return (
    <div
      className={`flex flex-col justify-center ${alignClass} px-6 py-12 ${fullscreen ? 'min-h-screen' : 'min-h-[480px]'}`}
      style={{ background: page.page_bg_color, color: page.text_color }}
    >
      <div className="w-full max-w-md space-y-4">
        {page.headline && <h1 className="text-3xl font-bold leading-tight" style={{ color: page.text_color }}>{page.headline}</h1>}
        {page.subheadline && <p className="text-base opacity-90 whitespace-pre-line">{page.subheadline}</p>}
        <div className="space-y-2 pt-4">
          {buttons.map(b => (
            <button
              key={b.id}
              className={`w-full py-3 px-5 font-semibold transition-opacity hover:opacity-90 ${SHAPE_CLASS[b.shape]}`}
              style={{ background: b.bg_color, color: b.text_color }}
            >{b.label}</button>
          ))}
          {buttons.length === 0 && <p className="text-xs opacity-60">Adicione CTAs no editor para vê-los aqui.</p>}
        </div>
      </div>
    </div>
  );
}
