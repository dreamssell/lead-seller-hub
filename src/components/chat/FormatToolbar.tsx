import { Bold, Italic, Strikethrough, Code2, Smile } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type Fmt = 'bold' | 'italic' | 'strike' | 'mono';
const WRAP: Record<Fmt, string> = { bold: '*', italic: '_', strike: '~', mono: '`' };

const EMOJIS = ['👍','🙏','❤️','🔥','🎉','✅','😀','😂','😊','😍','🤔','😢','🙌','👏','💯','💪','✨','🚀','📞','📌','💬','📎','🟢','🔴'];

interface Props {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (v: string) => void;
  onAfterAction?: () => void;
}

export function FormatToolbar({ textareaRef, value, onChange, onAfterAction }: Props) {

  const wrap = (fmt: Fmt) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const s = ta.selectionStart ?? value.length;
    const e = ta.selectionEnd ?? value.length;
    const c = WRAP[fmt];
    const before = value.slice(0, s);
    const sel = value.slice(s, e) || (fmt === 'bold' ? 'negrito' : fmt === 'italic' ? 'itálico' : fmt === 'strike' ? 'tachado' : 'código');
    const after = value.slice(e);
    const next = `${before}${c}${sel}${c}${after}`;
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      const ns = before.length + c.length;
      ta.setSelectionRange(ns, ns + sel.length);
    });
  };

  const insertEmoji = (em: string) => {
    const ta = textareaRef.current;
    if (!ta) { onChange(value + em); return; }
    const s = ta.selectionStart ?? value.length;
    const next = value.slice(0, s) + em + value.slice(s);
    onChange(next);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + em.length, s + em.length); });
  };

  return (
    <div className="flex items-center gap-0.5 px-1">
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Negrito (Ctrl+B)" onClick={() => wrap('bold')}>
        <Bold className="w-3.5 h-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Itálico (Ctrl+I)" onClick={() => wrap('italic')}>
        <Italic className="w-3.5 h-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Tachado" onClick={() => wrap('strike')}>
        <Strikethrough className="w-3.5 h-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Monoespaçado" onClick={() => wrap('mono')}>
        <Code2 className="w-3.5 h-3.5" />
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Emoji">
            <Smile className="w-3.5 h-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          <div className="grid grid-cols-8 gap-1">
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => insertEmoji(e)} className="text-lg hover:bg-secondary rounded p-1">{e}</button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
