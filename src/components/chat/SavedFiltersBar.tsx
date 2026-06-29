import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Star, Trash2, BookmarkPlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface SavedFilterValue {
  unanswered?: boolean;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  status?: string;
  channels?: string[];
  due_today?: boolean;
  assigned_to_me?: boolean;
  tag_ids?: string[];
}

interface SavedFilterRow {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  is_pinned: boolean;
  filters: SavedFilterValue;
}

interface Props {
  currentValue: SavedFilterValue;
  selectedId: string | null;
  onApply: (id: string | null, value: SavedFilterValue) => void;
}

export function SavedFiltersBar({ currentValue, selectedId, onApply }: Props) {
  const [items, setItems] = useState<SavedFilterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('saved_filters').select('*').order('is_pinned', { ascending: false }).order('created_at');
    setItems((data as any) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('saved_filters').insert({
      user_id: u.user!.id,
      name: name.trim(),
      filters: currentValue as any,
    });
    setSaving(false);
    if (error) toast.error('Erro ao salvar filtro');
    else { toast.success('Filtro salvo'); setName(''); setOpen(false); load(); }
  };

  const togglePin = async (it: SavedFilterRow) => {
    await supabase.from('saved_filters').update({ is_pinned: !it.is_pinned }).eq('id', it.id);
    load();
  };
  const remove = async (id: string) => {
    await supabase.from('saved_filters').delete().eq('id', id);
    if (selectedId === id) onApply(null, {});
    load();
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-border bg-secondary/30">
      <button
        onClick={() => onApply(null, {})}
        className={cn('px-2 py-1 rounded-full text-[10px] border transition',
          selectedId === null ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:bg-secondary')}
      >Todas</button>

      {loading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}

      {items.map(it => (
        <div key={it.id} className="group inline-flex">
          <button
            onClick={() => onApply(it.id, it.filters)}
            className={cn('pl-2 pr-1.5 py-1 rounded-l-full text-[10px] border-y border-l flex items-center gap-1 transition',
              selectedId === it.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:bg-secondary')}
          >
            {it.is_pinned && <Star className="w-2.5 h-2.5 fill-current" />} {it.name}
          </button>
          <div className="hidden group-hover:flex items-center gap-0.5 border-y border-r rounded-r-full bg-background px-1">
            <button onClick={() => togglePin(it)} title="Fixar" className="text-muted-foreground hover:text-amber-500"><Star className="w-2.5 h-2.5" /></button>
            <button onClick={() => remove(it.id)} title="Remover" className="text-muted-foreground hover:text-destructive"><Trash2 className="w-2.5 h-2.5" /></button>
          </div>
        </div>
      ))}

      <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1" onClick={() => setOpen(true)}>
        <BookmarkPlus className="w-3 h-3" /> Salvar atual
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Salvar filtro</DialogTitle></DialogHeader>
          <Input placeholder='ex: "minhas urgentes hoje"' value={name} onChange={(e) => setName(e.target.value)} />
          <p className="text-[10px] text-muted-foreground">
            Critérios atuais: {Object.keys(currentValue).length ? JSON.stringify(currentValue) : 'nenhum'}
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={!name.trim() || saving}>{saving && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
