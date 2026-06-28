import { useRef, useState, useEffect } from 'react';
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

export function MentionTextarea({ ownerId, value, onChange, placeholder, rows = 3, className }: Props) {
  const users = useMentionSuggestions(ownerId);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const m = value.match(/@([A-Za-z0-9_.\-]*)$/);
    if (m) {
      setFilter(m[1].toLowerCase());
      setOpen(true);
      if (taRef.current) {
        const r = taRef.current.getBoundingClientRect();
        setPos({ top: r.bottom + 4, left: r.left });
      }
    } else {
      setOpen(false);
    }
  }, [value]);

  const pick = (handle: string) => {
    onChange(value.replace(/@([A-Za-z0-9_.\-]*)$/, `@${handle} `));
    setOpen(false);
    taRef.current?.focus();
  };

  const filtered = users.filter((u) => u.handle.toLowerCase().includes(filter)).slice(0, 6);

  return (
    <div className="relative">
      <Textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={className}
      />
      {open && filtered.length > 0 && pos && (
        <div
          className="fixed z-50 w-60 rounded-md border bg-popover shadow-md p-1 text-sm"
          style={{ top: pos.top, left: pos.left }}
        >
          {filtered.map((u) => (
            <button
              key={u.user_id}
              onClick={() => pick(u.handle)}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-secondary flex flex-col"
            >
              <span className="text-xs font-medium">@{u.handle}</span>
              <span className="text-[10px] text-muted-foreground">{u.display_name || u.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
