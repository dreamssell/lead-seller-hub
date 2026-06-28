import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tag, Plus, Check } from 'lucide-react';
import { toast } from 'sonner';

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

  const create = async () => {
    if (!name.trim() || !ownerId) return;
    const { error } = await supabase.from('chat_tags').insert({ owner_id: ownerId, name: name.trim(), color });
    if (error) return toast.error('Erro ao criar tag');
    setName('');
    load();
  };

  const activeTags = tags.filter((t) => selected.includes(t.id));

  return (
    <Popover>
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
            <button
              key={t.id}
              onClick={() => toggle(t.id)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary text-xs"
            >
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
              <span className="flex-1 text-left">{t.name}</span>
              {selected.includes(t.id) && <Check className="w-3 h-3 text-primary" />}
            </button>
          ))}
        </div>
        <div className="border-t pt-2 space-y-2">
          <Input
            placeholder="Nova tag"
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
                style={{ backgroundColor: c, borderColor: c === color ? '#000' : 'transparent' }}
              />
            ))}
          </div>
          <Button size="sm" className="w-full h-7 text-xs" onClick={create}>
            <Plus className="w-3 h-3 mr-1" /> Criar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
