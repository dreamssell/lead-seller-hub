import { useEffect, useState } from 'react';
import { Sparkles, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface AiSettings {
  id?: string;
  default_model: string;
  default_temperature: number;
  default_max_tokens: number;
  system_prompt: string;
}

const MODELS = [
  { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (raciocínio avançado)' },
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (equilibrado · padrão)' },
  { value: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (rápido e barato)' },
  { value: 'openai/gpt-5', label: 'GPT-5 (premium)' },
  { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini' },
  { value: 'openai/gpt-5-nano', label: 'GPT-5 Nano (mais rápido)' },
];

const empty: AiSettings = {
  default_model: 'google/gemini-2.5-flash',
  default_temperature: 0.7,
  default_max_tokens: 1024,
  system_prompt: 'Você é um assistente útil e profissional.',
};

export default function AiTab() {
  const [s, setS] = useState<AiSettings>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('ai_settings').select('*').order('created_at').limit(1).maybeSingle();
      if (data) setS(data as AiSettings);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const payload = { ...s, created_by: user.id };
    let res;
    if (s.id) res = await supabase.from('ai_settings').update(payload).eq('id', s.id);
    else {
      const { id, ...ins } = payload;
      res = await supabase.from('ai_settings').insert(ins).select().single();
      if (res.data) setS(res.data as AiSettings);
    }
    setSaving(false);
    if (res.error) toast({ title: 'Erro', description: res.error.message, variant: 'destructive' });
    else toast({ title: 'Configurações de IA salvas' });
  };

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 space-y-5">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2"><Sparkles className="w-5 h-5" />Configurações de IA</h3>
          <p className="text-xs text-muted-foreground mt-1">Defina o modelo padrão e parâmetros usados por agentes e automações da plataforma. Sem necessidade de API key — usamos o Lovable AI Gateway.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label>Modelo padrão</Label>
            <select value={s.default_model} onChange={(e) => setS({ ...s, default_model: e.target.value })} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" disabled={loading}>
              {MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Temperatura ({s.default_temperature.toFixed(2)})</Label>
            <Input type="number" step="0.1" min="0" max="2" value={s.default_temperature} onChange={(e) => setS({ ...s, default_temperature: parseFloat(e.target.value || '0') })} disabled={loading} />
            <p className="text-[11px] text-muted-foreground mt-1">0 = mais determinístico, 1 = mais criativo</p>
          </div>
          <div>
            <Label>Máximo de tokens</Label>
            <Input type="number" min="64" max="8192" value={s.default_max_tokens} onChange={(e) => setS({ ...s, default_max_tokens: parseInt(e.target.value || '0') })} disabled={loading} />
          </div>
          <div className="md:col-span-2">
            <Label>System Prompt padrão</Label>
            <Textarea rows={4} value={s.system_prompt} onChange={(e) => setS({ ...s, system_prompt: e.target.value })} disabled={loading} />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving || loading}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}
