import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Zap } from 'lucide-react';

interface QuickReply {
  id: string;
  shortcut: string;
  content: string;
  category: string | null;
}

interface Props {
  query: string; // text after the slash, eg "boas"
  open: boolean;
  onPick: (text: string) => void;
  variables?: Record<string, string>;
}

const applyVars = (tpl: string, vars: Record<string, string>) =>
  tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => vars[k] ?? `{{${k}}}`);

export function QuickReplyPopover({ query, open, onPick, variables = {} }: Props) {
  const [items, setItems] = useState<QuickReply[]>([]);
  const [hover, setHover] = useState(0);

  useEffect(() => {
    if (!open) return;
    supabase.from('quick_replies').select('*').order('shortcut', { ascending: true })
      .then(({ data }) => setItems((data || []) as QuickReply[]));
  }, [open]);

  if (!open) return null;
  const q = query.toLowerCase().replace(/^\//, '');
  const filtered = items.filter(i =>
    i.shortcut.toLowerCase().includes(q) || i.content.toLowerCase().includes(q)
  ).slice(0, 6);

  return (
    <div className="absolute bottom-full left-3 mb-2 w-[420px] max-w-[92vw] rounded-xl border border-border bg-popover shadow-2xl overflow-hidden z-50">
      <div className="px-3 py-1.5 border-b border-border flex items-center gap-2">
        <Zap className="w-3 h-3 text-primary" />
        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Respostas rápidas</p>
        <span className="ml-auto text-[10px] text-muted-foreground">Enter para inserir</span>
      </div>
      {filtered.length === 0 ? (
        <p className="p-4 text-xs text-muted-foreground text-center italic">Nenhuma resposta encontrada para "{q}"</p>
      ) : (
        <ul className="max-h-[260px] overflow-y-auto">
          {filtered.map((r, i) => {
            const txt = applyVars(r.content, variables);
            return (
              <li
                key={r.id}
                onMouseEnter={() => setHover(i)}
                onClick={() => onPick(txt)}
                className={`px-3 py-2 cursor-pointer ${i === hover ? 'bg-secondary' : ''}`}
              >
                <p className="text-[10px] font-mono font-bold text-primary">{r.shortcut}</p>
                <p className="text-xs text-foreground line-clamp-2">{txt}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
