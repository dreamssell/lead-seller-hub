import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: 'Missing LOVABLE_API_KEY' }), { status: 500, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const messageId: string | undefined = body.message_id;
    const customerId: string | undefined = body.customer_id;
    const text: string = (body.content || '').toString().slice(0, 4000);
    if (!text.trim()) {
      return new Response(JSON.stringify({ error: 'empty content' }), { status: 400, headers: corsHeaders });
    }

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Lovable-API-Key': LOVABLE_API_KEY },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          {
            role: 'system',
            content:
              'Você classifica mensagens de clientes em PT-BR. Responda APENAS com JSON válido com as chaves: sentiment ("positivo"|"neutro"|"negativo"), sentiment_score (-1..1), intent (string curta), language (iso code), suggested_tags (array<string>, máximo 5, minúsculas), summary (máx 140 chars), followup_hours (int ou null — sugira intervalo para retomar contato se aplicável).',
          },
          { role: 'user', content: text },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiRes.ok) {
      const body = await aiRes.text().catch(() => '');
      return new Response(JSON.stringify({ error: `AI Gateway ${aiRes.status}`, body }), {
        status: aiRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await aiRes.json();
    const raw = data?.choices?.[0]?.message?.content || '{}';
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    if (messageId && customerId) {
      const { data: cust } = await supabase.from('customers').select('owner_id').eq('id', customerId).maybeSingle();
      await supabase.from('message_ai_analysis').upsert({
        message_id: messageId,
        customer_id: customerId,
        owner_id: (cust as any)?.owner_id || null,
        sentiment: parsed.sentiment || null,
        sentiment_score: typeof parsed.sentiment_score === 'number' ? parsed.sentiment_score : null,
        intent: parsed.intent || null,
        language: parsed.language || null,
        suggested_tags: Array.isArray(parsed.suggested_tags) ? parsed.suggested_tags.slice(0, 5) : [],
        summary: parsed.summary || null,
        raw: parsed,
      }, { onConflict: 'message_id' });
    }

    return new Response(JSON.stringify({ ok: true, analysis: parsed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'unknown' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
