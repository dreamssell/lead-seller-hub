// Histórico de Atendimento — narrativa em pt-BR:
// - Quem abriu/iniciou o atendimento (origem do lead)
// - Cada transferência de atendimento entre usuários / fila
// - Cada ligação (WhatsApp/Wavoip) com duração e status em português
// - Atribuições a funis / mudanças de etapa
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Loader2, UserPlus, UserCheck, ArrowRight, Phone, Workflow, Layers,
} from 'lucide-react';
import { formatDuration } from '@/lib/callHistory';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props { customerId: string }

const fmtDT = (iso: string) => {
  try { return format(new Date(iso), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR }); }
  catch { return iso; }
};

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  wavoip: 'Wavoip',
  sip: 'SIP',
  voip: 'VoIP',
  telefone: 'Telefone',
  phone: 'Telefone',
};

const CALL_STATUS_LABEL: Record<string, string> = {
  answered: 'atendida',
  completed: 'concluída',
  ended: 'finalizada',
  end: 'finalizada',
  hangup: 'finalizada',
  terminated: 'finalizada',
  finished: 'finalizada',
  missed: 'perdida',
  failed: 'falhou',
  error: 'falhou',
  rejected: 'rejeitada',
  busy: 'ocupada',
  no_answer: 'sem resposta',
  noanswer: 'sem resposta',
  cancelled: 'cancelada',
  canceled: 'cancelada',
  ongoing: 'em andamento',
  ringing: 'chamando',
  ring: 'chamando',
  initiated: 'iniciada',
  invite: 'iniciada',
  dialing: 'discando',
};

const CALL_DIRECTION_LABEL: Record<string, string> = {
  inbound: 'recebida',
  in: 'recebida',
  outbound: 'efetuada',
  out: 'efetuada',
  incoming: 'recebida',
  outgoing: 'efetuada',
};

const SOURCE_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  website: 'Site',
  landing: 'Landing Page',
  manual: 'Cadastro manual',
  import: 'Importação',
  api: 'API',
  webhook: 'Webhook',
  facebook: 'Facebook',
  instagram: 'Instagram',
  form: 'Formulário',
};

const ptChannel = (c?: string | null) => (c ? CHANNEL_LABEL[c.toLowerCase()] || c : '');
const ptCallStatus = (s?: string | null) => (s ? CALL_STATUS_LABEL[s.toLowerCase()] || s : '');
const ptDirection = (d?: string | null) => (d ? CALL_DIRECTION_LABEL[d.toLowerCase()] || d : '');
const ptSource = (s?: string | null) => (s ? SOURCE_LABEL[s.toLowerCase()] || s : '');

interface Entry {
  key: string;
  when: string;
  icon: React.ReactNode;
  text: React.ReactNode;
}

export function CustomerServiceHistory({ customerId }: Props) {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      const [{ data: cust }, leadsRes] = await Promise.all([
        (supabase as any).from('customers')
          .select('name,created_at,created_by,source,channel')
          .eq('id', customerId).maybeSingle(),
        supabase.from('leads').select('id,name,source,channel,created_at,pipeline_id,created_by')
          .eq('customer_id', customerId),
      ]);

      const leads = leadsRes.data || [];
      const leadIds = leads.map((l: any) => l.id);
      const pipelineIds = Array.from(new Set(leads.map((l: any) => l.pipeline_id).filter(Boolean)));

      const [assignHist, legacyAssigns, calls, leadEvents, pipelines] = await Promise.all([
        (supabase as any).from('customer_assignments_history')
          .select('id,event_type,source,channel,user_id,notes,created_at')
          .eq('customer_id', customerId).order('created_at', { ascending: true }),
        supabase.from('conversation_assignments')
          .select('id,from_user_id,to_user_id,reason,created_at')
          .eq('customer_id', customerId).order('created_at', { ascending: true }).limit(100),
        (supabase as any).from('call_history')
          .select('id,direction,status,duration_seconds,started_at,phone_number,channel,connection_label,user_id')
          .eq('customer_id', customerId).order('started_at', { ascending: true }).limit(50),
        leadIds.length
          ? supabase.from('lead_events')
              .select('id,lead_id,type,from_stage_name,to_stage_name,channel,source,created_at,user_id')
              .in('lead_id', leadIds).order('created_at', { ascending: true })
          : Promise.resolve({ data: [] } as any),
        pipelineIds.length
          ? supabase.from('pipelines').select('id,name').in('id', pipelineIds as string[])
          : Promise.resolve({ data: [] } as any),
      ]);

      const pipelineName: Record<string, string> = {};
      (pipelines.data || []).forEach((p: any) => { pipelineName[p.id] = p.name; });

      // coletar usuários para nomes
      const uids = new Set<string>();
      if (cust?.created_by) uids.add(cust.created_by);
      (assignHist.data || []).forEach((r: any) => r.user_id && uids.add(r.user_id));
      (legacyAssigns.data || []).forEach((r: any) => {
        r.from_user_id && uids.add(r.from_user_id);
        r.to_user_id && uids.add(r.to_user_id);
      });
      (calls.data || []).forEach((r: any) => r.user_id && uids.add(r.user_id));
      (leadEvents.data || []).forEach((r: any) => r.user_id && uids.add(r.user_id));
      leads.forEach((l: any) => l.created_by && uids.add(l.created_by));

      const names: Record<string, string> = {};
      if (uids.size) {
        const { data: p } = await supabase.from('profiles')
          .select('user_id,display_name,email').in('user_id', Array.from(uids));
        (p || []).forEach((x: any) => {
          names[x.user_id] = x.display_name || (x.email ? x.email.split('@')[0] : 'usuário');
        });
      }
      const who = (id?: string | null) => (id ? (names[id] || 'usuário') : 'origem externa');

      const arr: Entry[] = [];

      // Origem do atendimento
      if (cust) {
        const opener = who(cust.created_by);
        const via = ptChannel(cust.channel) || ptSource(cust.source) || 'contato direto';
        arr.push({
          key: 'origin',
          when: cust.created_at,
          icon: <UserPlus className="w-3.5 h-3.5 text-primary" />,
          text: (
            <p className="text-xs leading-relaxed">
              <span className="font-semibold">{opener}</span> iniciou o atendimento via{' '}
              <span className="font-medium">{via}</span>{cust.source && cust.channel && cust.source !== cust.channel ? ` (origem: ${ptSource(cust.source)})` : ''} em{' '}
              <span className="text-muted-foreground">{fmtDT(cust.created_at)}</span>.
            </p>
          ),
        });
      }

      // Leads criados (atribuição inicial ao funil)
      leads.forEach((l: any) => {
        const funil = l.pipeline_id ? (pipelineName[l.pipeline_id] || 'funil') : null;
        if (!funil) return;
        arr.push({
          key: `lead-${l.id}`,
          when: l.created_at,
          icon: <Workflow className="w-3.5 h-3.5 text-fuchsia-500" />,
          text: (
            <p className="text-xs leading-relaxed">
              <span className="font-semibold">{who(l.created_by)}</span> atribuiu ao funil de{' '}
              <span className="font-medium">{funil}</span>.
            </p>
          ),
        });
      });

      // Mudanças de etapa
      (leadEvents.data || []).forEach((e: any) => {
        if (e.type !== 'stage_changed') return;
        arr.push({
          key: `ev-${e.id}`,
          when: e.created_at,
          icon: <Workflow className="w-3.5 h-3.5 text-blue-500" />,
          text: (
            <p className="text-xs leading-relaxed">
              <span className="font-semibold">{who(e.user_id)}</span> moveu a etapa de{' '}
              <span className="font-medium">{e.from_stage_name || '—'}</span> para{' '}
              <span className="font-medium">{e.to_stage_name || '—'}</span>.
            </p>
          ),
        });
      });

      // Histórico canônico de atendimento
      const eventPhrase: Record<string, (u: string) => React.ReactNode> = {
        created: (u) => <><span className="font-semibold">{u}</span> registrou o cliente.</>,
        claimed: (u) => <><span className="font-semibold">{u}</span> assumiu o atendimento.</>,
        released: (u) => <><span className="font-semibold">{u}</span> liberou o atendimento.</>,
        reassigned: (u) => <><span className="font-semibold">{u}</span> reatribuiu o atendimento.</>,
        source_tagged: (u) => <><span className="font-semibold">{u}</span> atualizou a origem.</>,
      };
      (assignHist.data || []).forEach((r: any) => {
        const fn = eventPhrase[r.event_type] || ((u: string) => <><span className="font-semibold">{u}</span> {r.event_type}</>);
        arr.push({
          key: `ah-${r.id}`,
          when: r.created_at,
          icon: <UserCheck className="w-3.5 h-3.5 text-emerald-500" />,
          text: (
            <p className="text-xs leading-relaxed">
              {fn(who(r.user_id))}
              {(r.channel || r.source) && (
                <span className="text-muted-foreground">
                  {' '}({[ptChannel(r.channel), ptSource(r.source)].filter(Boolean).join(' · ')})
                </span>
              )}
              {r.notes && <span className="block text-[11px] text-muted-foreground mt-0.5">{r.notes}</span>}
            </p>
          ),
        });
      });

      // Transferências entre usuários / fila
      (legacyAssigns.data || []).forEach((r: any) => {
        arr.push({
          key: `la-${r.id}`,
          when: r.created_at,
          icon: <ArrowRight className="w-3.5 h-3.5 text-violet-500" />,
          text: (
            <p className="text-xs leading-relaxed">
              <span className="font-semibold">{who(r.from_user_id)}</span> transferiu o atendimento para{' '}
              <span className="font-semibold">{r.to_user_id ? who(r.to_user_id) : 'a fila'}</span>.
              {r.reason && <span className="block text-[11px] text-muted-foreground mt-0.5">Motivo: {r.reason}</span>}
            </p>
          ),
        });
      });

      // Ligações — formato pedido: "Ligação por WhatsApp · 00:40"
      (calls.data || []).forEach((c: any) => {
        const dur = formatDuration(c.duration_seconds || 0);
        const ch = ptChannel(c.channel) || 'Telefone';
        const dir = ptDirection(c.direction) || '—';
        const st = ptCallStatus(c.status);
        arr.push({
          key: `call-${c.id}`,
          when: c.started_at,
          icon: <Phone className="w-3.5 h-3.5 text-amber-500" />,
          text: (
            <div className="text-xs leading-relaxed">
              <p className="font-semibold">Ligação por {ch} · {dur}</p>
              <p className="text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground/90">{who(c.user_id)}</span> · {dir}
                {st && ` · ${st}`}
                {c.connection_label && ` · ${c.connection_label}`}
              </p>
            </div>
          ),
        });
      });

      // ordenar cronologicamente (mais recentes primeiro)
      arr.sort((a, b) => +new Date(b.when) - +new Date(a.when));

      if (!cancelled) {
        setEntries(arr);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [customerId]);

  if (loading) {
    return <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;
  }
  if (!entries.length) {
    return (
      <div className="text-center py-8 px-3">
        <Layers className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-xs text-muted-foreground italic">Nenhum registro de atendimento ainda.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="space-y-2">
        {entries.map((e) => (
          <div key={e.key} className="rounded-lg border border-border bg-secondary/40 p-2.5">
            <div className="flex items-start gap-2">
              <div className="mt-0.5 shrink-0">{e.icon}</div>
              <div className="flex-1 min-w-0">
                {e.text}
                <p className="text-[10px] text-muted-foreground mt-1">{fmtDT(e.when)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
