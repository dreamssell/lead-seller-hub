import { useEffect, useState } from 'react';
import { Plus, Trash2, GripVertical, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface Field {
  id: string;
  field_key: string;
  label: string;
  type: string;
  is_active: boolean;
  position: number;
}

const TYPES = [
  { value: 'text', label: 'Texto' },
  { value: 'number', label: 'Número' },
  { value: 'email', label: 'E-mail' },
  { value: 'phone', label: 'Telefone' },
  { value: 'date', label: 'Data' },
  { value: 'boolean', label: 'Sim/Não' },
];

const MAX_FIELDS = 20;

export default function CustomFieldsTab() {
  const [items, setItems] = useState<Field[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ label: '', type: 'text' });

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('custom_fields').select('*').eq('entity', 'lead').order('position');
    setItems((data as Field[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.label.trim()) { toast({ title: 'Informe o nome do campo', variant: 'destructive' }); return; }
    if (items.length >= MAX_FIELDS) { toast({ title: `Limite de ${MAX_FIELDS} campos atingido`, variant: 'destructive' }); return; }
    setCreating(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setCreating(false); return; }
    const nextNum = String(items.length + 1).padStart(2, '0');
    const field_key = `lead_field${nextNum}`;
    const { error } = await supabase.from('custom_fields').insert({
      entity: 'lead', field_key, label: form.label.trim(), type: form.type,
      position: items.length, is_active: true, created_by: user.id,
    });
    setCreating(false);
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    else { setForm({ label: '', type: 'text' }); toast({ title: 'Campo criado' }); load(); }
  };

  const toggle = async (f: Field) => {
    await supabase.from('custom_fields').update({ is_active: !f.is_active }).eq('id', f.id);
    load();
  };
  const remove = async (id: string) => {
    if (!confirm('Excluir este campo?')) return;
    await supabase.from('custom_fields').delete().eq('id', id);
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">Campos Personalizados</h2>
        <p className="text-xs text-muted-foreground">Configure campos extras para armazenar informações adicionais dos leads</p>
        <span className="inline-block mt-2 text-[11px] px-2 py-0.5 rounded-full bg-secondary text-foreground font-medium">{items.length}/{MAX_FIELDS} campos criados</span>
      </div>

      <div className="glass-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Plus className="w-4 h-4" />Adicionar Novo Campo</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Nome do Campo</Label>
            <Input placeholder="Ex: CPF, Preferência, Score" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </div>
          <div>
            <Label>Tipo</Label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>
        <Button onClick={create} disabled={creating || items.length >= MAX_FIELDS}>
          {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}Criar Campo
        </Button>
      </div>

      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Campos Configurados</h3>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhum campo configurado</p>
        ) : (
          <div className="space-y-2">
            {items.map((f) => (
              <div key={f.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">{f.label}</p>
                  <p className="text-[11px] text-muted-foreground">{f.field_key} · Tipo: {f.type}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${f.is_active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                  {f.is_active ? 'Ativo' : 'Inativo'}
                </span>
                <Button variant="outline" size="sm" onClick={() => toggle(f)}>{f.is_active ? 'Desativar' : 'Ativar'}</Button>
                <Button variant="ghost" size="sm" onClick={() => remove(f.id)} className="text-destructive"><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
