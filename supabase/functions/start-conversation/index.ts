// Backend validator + creator for new WhatsApp conversations.
// Enforces phone normalization even if the frontend is bypassed.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// --- Phone validation (mirror of src/lib/phoneValidation.ts) ---
const VALID_BR_DDDS = new Set([
  '11','12','13','14','15','16','17','18','19','21','22','24','27','28',
  '31','32','33','34','35','37','38','41','42','43','44','45','46','47','48','49',
  '51','53','54','55','61','62','63','64','65','66','67','68','69',
  '71','73','74','75','77','79','81','82','83','84','85','86','87','88','89',
  '91','92','93','94','95','96','97','98','99',
]);

const KNOWN_CC = new Set(['1','7','20','27','30','31','32','33','34','36','39','40','41','43','44','45','46','47','48','49','51','52','53','54','55','56','57','58','60','61','62','63','64','65','66','81','82','84','86','90','91','92','93','94','95','98','212','213','216','218','220','221','234','235','244','351','352','353','354','355','356','357','358','359','370','371','372','373','374','375','376','377','378','380','381','382','385','386','387','389','420','421','423','500','501','502','503','504','505','506','507','508','509','590','591','592','593','594','595','596','597','598','599','670','673','674','675','676','677','678','679','680','852','853','855','856','880','886','960','961','962','963','964','965','966','967','968','970','971','972','973','974','975','976','977','992','993','994','995']);

function validatePhone(raw: string) {
  const cleaned = String(raw || '').replace(/[^\d+]/g, '');
  if (!cleaned) return { ok: false, code: 'empty', message: 'Informe um número.' };
  if (/[^\d+]/.test(cleaned)) return { ok: false, code: 'invalid_chars', message: 'Caracteres inválidos.' };
  const hasPlus = cleaned.startsWith('+');
  let digits = cleaned.replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return { ok: false, code: 'empty', message: 'Informe um número.' };
  if (!hasPlus && (digits.length === 10 || digits.length === 11)) digits = '55' + digits;
  if (digits.length < 8) return { ok: false, code: 'too_short', message: 'Número muito curto.' };
  if (digits.length > 15) return { ok: false, code: 'too_long', message: 'Número acima de 15 dígitos (E.164).' };
  let cc = '';
  for (const len of [3, 2, 1]) {
    const c = digits.slice(0, len);
    if (KNOWN_CC.has(c)) { cc = c; break; }
  }
  if (!cc) return { ok: false, code: 'missing_ddi', message: 'DDI não reconhecido.' };
  const rest = digits.slice(cc.length);
  if (cc === '55') {
    if (rest.length < 10 || rest.length > 11) return { ok: false, code: 'invalid_br_length', message: 'BR deve ter DDD + 8 ou 9 dígitos.' };
    const ddd = rest.slice(0, 2);
    if (!VALID_BR_DDDS.has(ddd)) return { ok: false, code: 'invalid_ddd', message: `DDD "${ddd}" inválido.` };
    const local = rest.slice(2);
    if (local.length === 9 && !local.startsWith('9')) return { ok: false, code: 'invalid_br_mobile', message: 'Celular BR deve iniciar com 9.' };
  } else if (rest.length < 6) {
    return { ok: false, code: 'too_short', message: 'Número local muito curto.' };
  }
  return { ok: true, e164: digits, cc };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const started = Date.now();
  const logCtx: Record<string, unknown> = {};

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthenticated' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return json({ error: 'unauthenticated' }, 401);
    logCtx.user_id = userId;

    const body = await req.json().catch(() => ({}));
    const { phone_raw, name, connection_id, first_message } = body ?? {};
    logCtx.phone_raw = phone_raw;
    logCtx.connection_id = connection_id;

    if (!connection_id) return json({ error: 'connection_id obrigatório', code: 'missing_connection' }, 400);

    const v = validatePhone(String(phone_raw ?? ''));
    logCtx.phone_normalized = v.ok ? v.e164 : null;
    logCtx.validation_code = v.ok ? 'ok' : (v as any).code;

    if (!v.ok) {
      console.warn('[start-conversation] rejected', JSON.stringify({ ...logCtx, reason: (v as any).message }));
      return json({ error: (v as any).message, code: (v as any).code }, 422);
    }

    const { data: conn, error: connErr } = await supabase
      .from('whatsapp_connections')
      .select('id, owner_id, sub_company_id, provider, phone_number, status')
      .eq('id', connection_id)
      .maybeSingle();
    if (connErr || !conn) return json({ error: 'Conexão não encontrada', code: 'connection_not_found' }, 404);

    const ownerId = conn.owner_id || userId;
    logCtx.owner_id = ownerId;
    logCtx.sub_company_id = conn.sub_company_id;

    // Reject sending to self
    if (conn.phone_number && conn.phone_number === v.e164) {
      console.warn('[start-conversation] self-send blocked', JSON.stringify(logCtx));
      return json({ error: 'Não é permitido iniciar conversa com o próprio número da conexão.', code: 'self_send' }, 422);
    }

    // Find or create customer
    const { data: existing } = await supabase
      .from('customers')
      .select('id, name')
      .eq('owner_id', ownerId)
      .eq('phone', v.e164)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let customerId = existing?.id as string | undefined;
    let created = false;
    if (!customerId) {
      const { data: ins, error: insErr } = await supabase
        .from('customers')
        .insert({
          name: (name && String(name).trim()) || `Contato ${v.e164!.slice(-4)}`,
          phone: v.e164,
          channel: 'whatsapp',
          owner_id: ownerId,
          sub_company_id: conn.sub_company_id ?? null,
          origin_connection_id: conn.id,
          created_by: userId,
        })
        .select('id')
        .single();
      if (insErr) {
        console.error('[start-conversation] insert failed', JSON.stringify({ ...logCtx, err: insErr.message }));
        return json({ error: insErr.message, code: 'insert_failed' }, 500);
      }
      customerId = ins.id;
      created = true;
    } else if (name && String(name).trim() && existing?.name !== String(name).trim()) {
      await supabase.from('customers').update({ name: String(name).trim() }).eq('id', customerId);
    }

    logCtx.customer_id = customerId;
    logCtx.created = created;
    logCtx.duration_ms = Date.now() - started;
    console.log('[start-conversation] ok', JSON.stringify(logCtx));

    return json({
      ok: true,
      customer_id: customerId,
      phone_e164: v.e164,
      created,
      first_message: first_message ?? null,
    });
  } catch (e: any) {
    console.error('[start-conversation] fatal', JSON.stringify({ ...logCtx, err: e?.message }));
    return json({ error: e?.message || 'unknown', code: 'fatal' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
