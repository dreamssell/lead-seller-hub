import { useEffect } from 'react';

type Handlers = {
  onSend?: () => void;
  onSearch?: () => void;
  onHelp?: () => void;
  onEditLast?: () => void;
};

/** Global keyboard shortcuts for the chat surface. */
export function useChatShortcuts(active: boolean, handlers: Handlers) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const cmd = e.ctrlKey || e.metaKey;
      // Ctrl/Cmd + K -> focus search
      if (cmd && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        handlers.onSearch?.();
        return;
      }
      // Ctrl/Cmd + / -> shortcuts help
      if (cmd && e.key === '/') {
        e.preventDefault();
        handlers.onHelp?.();
        return;
      }
      // Ctrl/Cmd + Enter -> send
      if (cmd && e.key === 'Enter') {
        e.preventDefault();
        handlers.onSend?.();
      }
      // ArrowUp on empty composer -> edit last (caller decides)
      if (e.key === 'ArrowUp' && (e.target as HTMLElement)?.dataset?.composer === '1') {
        const v = (e.target as HTMLTextAreaElement | HTMLInputElement).value;
        if (!v) {
          e.preventDefault();
          handlers.onEditLast?.();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, handlers]);
}
