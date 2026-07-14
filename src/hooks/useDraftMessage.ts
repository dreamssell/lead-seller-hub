import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const KEY = (id: string) => `ls.chat.draft.${id}`;

/**
 * Auto-save composer text per conversation.
 * Primary storage: `chat_drafts` (survives device switch, per user + customer).
 * Fallback: localStorage (offline / sem sessão).
 */
export function useDraftMessage(conversationId: string | null) {
  const [text, setText] = useState('');
  const lastId = useRef<string | null>(null);
  const hydrated = useRef(false);

  // Load when conversation changes
  useEffect(() => {
    hydrated.current = false;
    if (!conversationId) {
      setText('');
      return;
    }
    lastId.current = conversationId;

    // Local fast-path
    let localVal = '';
    try { localVal = localStorage.getItem(KEY(conversationId)) || ''; } catch {}
    setText(localVal);

    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { hydrated.current = true; return; }
      const { data } = await supabase
        .from('chat_drafts')
        .select('content')
        .eq('customer_id', conversationId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled || lastId.current !== conversationId) return;
      const remote = (data?.content || '') as string;
      // Prefer remote if it exists (multi-device sync)
      if (remote && remote !== localVal) setText(remote);
      hydrated.current = true;
    })();

    return () => { cancelled = true; };
  }, [conversationId]);

  // Persist (debounced)
  useEffect(() => {
    if (!conversationId) return;
    const t = setTimeout(async () => {
      try {
        if (text) localStorage.setItem(KEY(conversationId), text);
        else localStorage.removeItem(KEY(conversationId));
      } catch {}
      if (!hydrated.current) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (text) {
        await supabase.from('chat_drafts').upsert(
          { customer_id: conversationId, user_id: user.id, content: text },
          { onConflict: 'customer_id,user_id' },
        );
      } else {
        await supabase.from('chat_drafts')
          .delete()
          .eq('customer_id', conversationId)
          .eq('user_id', user.id);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [text, conversationId]);

  const clear = () => {
    if (conversationId) {
      try { localStorage.removeItem(KEY(conversationId)); } catch {}
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return;
        supabase.from('chat_drafts')
          .delete()
          .eq('customer_id', conversationId)
          .eq('user_id', user.id);
      });
    }
    setText('');
  };

  return { text, setText, clear };
}
