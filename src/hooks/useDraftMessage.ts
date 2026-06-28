import { useEffect, useRef, useState } from 'react';

const KEY = (id: string) => `ls.chat.draft.${id}`;

/** Auto-save composer text per conversation in localStorage. */
export function useDraftMessage(conversationId: string | null) {
  const [text, setText] = useState('');
  const lastId = useRef<string | null>(null);

  // Load when conversation changes
  useEffect(() => {
    if (!conversationId) {
      setText('');
      return;
    }
    if (lastId.current === conversationId) return;
    lastId.current = conversationId;
    try {
      const v = localStorage.getItem(KEY(conversationId));
      setText(v || '');
    } catch {
      setText('');
    }
  }, [conversationId]);

  // Persist (debounced via micro-timeout)
  useEffect(() => {
    if (!conversationId) return;
    const t = setTimeout(() => {
      try {
        if (text) localStorage.setItem(KEY(conversationId), text);
        else localStorage.removeItem(KEY(conversationId));
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [text, conversationId]);

  const clear = () => {
    if (conversationId) {
      try { localStorage.removeItem(KEY(conversationId)); } catch {}
    }
    setText('');
  };

  return { text, setText, clear };
}
