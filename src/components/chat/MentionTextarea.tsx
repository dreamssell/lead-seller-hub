import { useRef, useState, useEffect, KeyboardEvent } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { useMentionSuggestions } from '@/hooks/useMentionSuggestions';

interface Props {
  ownerId: string | null;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}

const MENTION_RE = /@([\p{L}0-9_.\-]*)$/u;

export function MentionTextarea({ ownerId, value, onChange, placeholder, rows = 3, className }: Props) {
  const users = useMentionSuggestions(ownerId);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const recalcPos = () => {
    if (!taRef.current) return;
    const r = taRef.current.getBoundingClientRect();
    const menuMaxHeight = 240;
    const spaceBelow = window.innerHeight - r.bottom;
    const above = spaceBelow < menuMaxHeight + 8 && r.top > menuMaxHeight;
    setPos({
      top: above ? Math.max(8, r.top - menuMaxHeight - 4) : r.bottom + 4,
      left: r.left,
      width: Math.min(320, Math.max(220, r.width)),
      above,
    });
  };

  useEffect(() => {
    const m = value.match(MENTION_RE);
    if (m) {
      setFilter(m[1].toLowerCase());
      setActiveIndex(0);
      setOpen(true);
      recalcPos();
    } else {
      setOpen(false);
    }
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => recalcPos();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const q = norm(filter);
  const filtered = users
    .filter((u) => !q || norm(u.handle).includes(q) || norm(u.display_name || '').includes(q) || norm(u.email).includes(q))
    .slice(0, 8);

  const pick = (handle: string) => {
    onChange(value.replace(MENTION_RE, `@${handle} `));
    setOpen(false);
    taRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || filtered.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => (i + 1) % filtered.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(filtered[activeIndex].handle); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  };

  return (
    <div className="relative">
      <Textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={className}
      />
      {open && pos && (
        <div
          role="listbox"
          className="fixed z-[60] rounded-md border bg-popover shadow-lg p-1 text-sm max-h-60 overflow-auto"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          {filtered.length === 0 ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              {users.length === 0
                ? 'Carregando membros da equipe…'
                : 'Nenhum membro encontrado'}
            </div>
          ) : (
            filtered.map((u, idx) => (
              <button
                key={u.user_id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(u.handle); }}
                onMouseEnter={() => setActiveIndex(idx)}
                className={`w-full text-left px-2 py-1.5 rounded flex flex-col ${idx === activeIndex ? 'bg-secondary' : 'hover:bg-secondary/60'}`}
                role="option"
                aria-selected={idx === activeIndex}
              >
                <span className="text-xs font-medium">@{u.handle}</span>
                <span className="text-[10px] text-muted-foreground truncate">
                  {u.display_name || u.email}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
