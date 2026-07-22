import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tag, Plus, Check, Trash2, Pencil, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useCanManageChatTags } from '@/hooks/useCanManageChatTags';


export interface ChatTag {
  id: string;
  name: string;
  color: string;
  owner_id: string;
}

interface Props {
  ownerId: string | null;
  selected: string[];
  onChange: (ids: string[]) => void;
}

const PALETTE = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899'];

export function TagPicker({ ownerId, selected, onChange }: Props) {
  const [tags, setTags] = useState<ChatTag[]>([]);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PALETTE[5]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { canManage } = useCanManageChatTags();

  const load = async () => {
    if (!ownerId) return;
    const { data } = await supabase.from('chat_tags').select('*').eq('owner_id', ownerId).order('name');
    setTags((data || []) as ChatTag[]);
  };

  useEffect(() => {
    load();
  }, [ownerId]);

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  const resetForm = () => {
    setName('');
    setColor(PALETTE[5]);
    setEditingId(null);
  };

  const save = async () => {
    if (!canManage) return toast.error('Você não tem permissão para gerenciar tags.');
    if (!name.trim() || !ownerId) return;
    if (editingId) {
      const { error } = await supabase
        .from('chat_tags')
        .update({ name: name.trim(), color })
        .eq('id', editingId);
      if (error) return toast.error('Erro ao atualizar tag');
      toast.success('Tag atualizada');
    } else {
      const { error } = await supabase.from('chat_tags').insert({ owner_id: ownerId, name: name.trim(), color });
      if (error) return toast.error('Erro ao criar tag');
      toast.success('Tag criada');
    }
    resetForm();
    load();
  };

  const startEdit = (t: ChatTag, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(t.id);
    setName(t.name);
    setColor(t.color);
  };

  const remove = async (t: ChatTag, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canManage) return;
    if (!confirm(`Excluir a tag "${t.name}"?`)) return;
    const { error } = await supabase.from('chat_tags').delete().eq('id', t.id);
    if (error) return toast.error('Erro ao excluir tag');
    onChange(selected.filter((x) => x !== t.id));
    if (editingId === t.id) resetForm();
    toast.success('Tag excluída');
    load();
  };

  const activeTags = tags.filter((t) => selected.includes(t.id));

  return (
    <Popover onOpenChange={(o) => { if (!o) resetForm(); }}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5">
          <Tag className="w-3 h-3" />
          {activeTags.length === 0 ? 'Tags' : `${activeTags.length} tag(s)`}
          {activeTags.slice(0, 3).map((t) => (
            <span key={t.id} className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
          ))}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3 space-y-2">
        <div className="max-h-48 overflow-auto space-y-1">
          {tags.length === 0 && <p className="text-[11px] text-muted-foreground italic">Nenhuma tag ainda.</p>}
          {tags.map((t) => (
            <div
              key={t.id}
              className="group w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary text-xs"
            >
              <button
                onClick={() => toggle(t.id)}
                className="flex-1 flex items-center gap-2 text-left min-w-0"
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                <span className="flex-1 truncate">{t.name}</span>
                {selected.includes(t.id) && <Check className="w-3 h-3 text-primary shrink-0" />}
              </button>
              {canManage && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => startEdit(t, e)}
                    className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground"
                    aria-label={`Editar tag ${t.name}`}
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => remove(t, e)}
                    className="p-1 rounded hover:bg-background text-muted-foreground hover:text-destructive"
                    aria-label={`Excluir tag ${t.name}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {canManage ? (
          <div className="border-t pt-2 space-y-2">
            <Input
              placeholder={editingId ? 'Editar tag' : 'Nova tag'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-7 text-xs"
            />
            <div className="flex items-center gap-1">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="w-5 h-5 rounded-full border-2"
                  style={{ backgroundColor: c, borderColor: c === color ? 'hsl(var(--foreground))' : 'transparent' }}
                  aria-label={`Cor ${c}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" className="flex-1 h-7 text-xs" onClick={save}>
                <Plus className="w-3 h-3 mr-1" /> {editingId ? 'Salvar' : 'Criar'}
              </Button>
              {editingId && (
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={resetForm}>
                  Cancelar
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="border-t pt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Lock className="w-3 h-3" />
            Apenas CEOs e gestores podem criar ou editar tags.
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

