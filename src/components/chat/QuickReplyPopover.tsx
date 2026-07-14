import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Zap } from 'lucide-react';

interface QuickReply {
  id: string;
  shortcut: string;
  content: string;
  category: string | null;
}

interface Props {
  query: string;
  open: boolean;
  onPick: (text: string) => void;
  variables?: Record<string, string>;
  /**
   * External keyboard controller: parent (composer textarea) forwards ArrowUp/Down/Enter/Escape.
   * When set, the popover uses this counter to move selection and emits onPick on Enter.
   */
  externalKey?: { seq: number; key: 'up' | 'down' | 'enter' | null };
}

const applyVars = (tpl: string, vars: Record<string, string>) =>
  tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => vars[k] ?? `{{${k}}}`);

export function QuickReplyPopover({ query, open, onPick, variables = {}, externalKey }: Props) {
  const [items, setItems] = useState<QuickReply[]>([]);
  const [hover, setHover] = useState(0);

  useEffect(() => {
    if (!open) return;
    supabase.from('quick_replies').select('*').order('shortcut', { ascending: true })
      .then(({ data }) => setItems((data || []) as QuickReply[]));
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().replace(/^\//, '');
    return items.filter(i =>
      i.shortcut.toLowerCase().includes(q) || i.content.toLowerCase().includes(q)
    ).slice(0, 6);
  }, [items, query]);

  // Reset hover when list changes
  useEffect(() => { setHover(0); }, [query, open]);

  // React to external keyboard events
  useEffect(() => {
    if (!externalKey?.key || !open || filtered.length === 0) return;
    if (externalKey.key === 'down') setHover(h => (h + 1) % filtered.length);
    else if (externalKey.key === 'up') setHover(h => (h - 1 + filtered.length) % filtered.length);
    else if (externalKey.key === 'enter') {
      const pick = filtered[hover];
      if (pick) onPick(applyVars(pick.content, variables));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalKey?.seq]);

  if (!open) return null;
  const q = query.toLowerCase().replace(/^\//, '');

  return (
    <div className="absolute bottom-full left-3 mb-2 w-[420px] max-w-[92vw] rounded-xl border border-border bg-popover shadow-2xl overflow-hidden z-50">
      <div className="px-3 py-1.5 border-b border-border flex items-center gap-2">
        <Zap className="w-3 h-3 text-primary" />
        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Respostas rápidas</p>
        <span className="ml-auto text-[10px] text-muted-foreground">↑↓ navegar · Enter inserir · Esc fechar</span>
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
                onMouseDown={(e) => { e.preventDefault(); onPick(txt); }}
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
