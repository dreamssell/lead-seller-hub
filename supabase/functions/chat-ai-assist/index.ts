// chat-ai-assist — suggest reply, summarize conversation, translate or improve a draft.
// Uses Lovable AI Gateway with google/gemini-3-flash-preview.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Mode = 'suggest' | 'summarize' | 'translate' | 'improve';

interface Body {
  mode: Mode;
  target_lang?: string;
  draft?: string;
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

function buildPrompt(b: Body): { system: string; user: string } {
  const lastTurn = (b.messages || []).slice(-15)
    .map(m => `${m.role === 'user' ? 'Cliente' : 'Atendente'}: ${m.content}`)
    .join('\n');
  switch (b.mode) {
    case 'summarize':
      return {
        system: 'Você resume conversas de atendimento ao cliente em português do Brasil de forma objetiva, com bullets curtos. Inclua: principais pontos, pendências, próximo passo sugerido. Máx 8 linhas.',
        user: `Resuma esta conversa:\n\n${lastTurn || '(vazio)'}`,
      };
    case 'translate':
      return {
        system: `Você é um tradutor profissional. Traduza para ${b.target_lang || 'pt-BR'} preservando tom e formatação WhatsApp (* _ ~ \`). Responda APENAS com a tradução.`,
        user: b.draft || '',
      };
    case 'improve':
      return {
        system: 'Você é um redator de atendimento. Reescreva o texto do atendente em português do Brasil, mantendo intenção, claro, cordial, sem emojis em excesso. Responda APENAS com o texto reescrito.',
        user: b.draft || '',
      };
    default: // suggest
      return {
        system: 'Você é um atendente sênior de vendas/SAC. Com base no histórico, escreva UMA resposta curta (1-3 frases), em português do Brasil, cordial e objetiva. Pode usar formatação WhatsApp (* _ ~). Responda APENAS com a mensagem a ser enviada, sem explicações.',
        user: `Histórico recente:\n${lastTurn || '(sem histórico)'}\n\nRascunho do atendente (pode estar vazio): ${b.draft || '(vazio)'}\n\nEscreva a melhor resposta agora.`,
      };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key) {
    return new Response(JSON.stringify({ error: 'Missing LOVABLE_API_KEY' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  let body: Body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }

  if (!body?.mode) {
    return new Response(JSON.stringify({ error: 'mode is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const { system, user } = buildPrompt(body);

  try {
    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Lovable-API-Key': key },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: body.mode === 'translate' ? 0.2 : 0.6,
        max_tokens: body.mode === 'summarize' ? 500 : 350,
      }),
    });

    if (r.status === 429) {
      return new Response(JSON.stringify({ error: 'rate_limit', message: '429 Rate limit' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (r.status === 402) {
      return new Response(JSON.stringify({ error: 'credits_exhausted', message: '402 Credits exhausted' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ error: 'upstream', message: `${r.status} ${t.slice(0, 200)}` }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const j = await r.json();
    const text = j?.choices?.[0]?.message?.content?.trim?.() || '';
    return new Response(JSON.stringify({ text, mode: body.mode }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'exception', message: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
