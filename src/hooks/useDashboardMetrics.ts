import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type DashboardScope = 'self' | 'company';

export interface DashboardTotals {
  activeConversations: number;
  callsToday: number;
  leadsInFunnel: number;
  conversionRate: number; // 0..1
}

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface ChannelSlice {
  channel: string;
  value: number;
}

export interface StageSlice {
  stage: string;
  value: number;
  color?: string;
}

export interface DashboardMetrics {
  totals: DashboardTotals;
  messagesByDay: DailyPoint[];
  leadsByStage: StageSlice[];
  conversationsByChannel: ChannelSlice[];
  loading: boolean;
}

const empty: DashboardMetrics = {
  totals: { activeConversations: 0, callsToday: 0, leadsInFunnel: 0, conversionRate: 0 },
  messagesByDay: [],
  leadsByStage: [],
  conversationsByChannel: [],
  loading: true,
};

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function useDashboardMetrics(scope: DashboardScope): DashboardMetrics {
  const { user, access } = useAuth();
  const [state, setState] = useState<DashboardMetrics>(empty);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      const ownerId = access?.owner_id || user.id;
      const startToday = new Date();
      startToday.setHours(0, 0, 0, 0);
      const start14 = new Date();
      start14.setDate(start14.getDate() - 13);
      start14.setHours(0, 0, 0, 0);
      const start30 = new Date();
      start30.setDate(start30.getDate() - 30);

      const scopedUser = scope === 'self' ? user.id : null;

      // Active conversations
      let customersQ = supabase
        .from('customers')
        .select('id, channel, assigned_to, ticket_status', { count: 'exact' })
        .in('ticket_status', ['open', 'pending', 'in_progress']);
      if (scopedUser) customersQ = customersQ.eq('assigned_to', scopedUser);
      else customersQ = customersQ.eq('owner_id', ownerId);
      const { data: convRows, count: activeConv } = await customersQ.limit(500);

      // Conversations by channel
      const channelMap: Record<string, number> = {};
      (convRows || []).forEach((r: any) => {
        const c = r.channel || 'outros';
        channelMap[c] = (channelMap[c] || 0) + 1;
      });

      // Calls today - via chat_messages voice/audio channel today
      let callsQ = supabase
        .from('chat_messages')
        .select('id, customer_id, channel', { count: 'exact', head: true })
        .in('channel', ['voice', 'wavoip', 'call'])
        .gte('created_at', startToday.toISOString());
      const { count: callsCount } = await callsQ;

      // Leads in funnel
      let leadsQ = supabase
        .from('leads')
        .select('id, status, stage_id, created_at', { count: 'exact' })
        .not('status', 'in', '("won","lost","canceled")');
      if (scopedUser) leadsQ = leadsQ.eq('assigned_to', scopedUser);
      else leadsQ = leadsQ.eq('owner_id', ownerId);
      const { data: leadsRows, count: leadsCount } = await leadsQ.limit(1000);

      // Leads by stage (join stage names)
      const stageIds = Array.from(new Set((leadsRows || []).map((l: any) => l.stage_id).filter(Boolean)));
      const stageMap: Record<string, { name: string; color: string }> = {};
      if (stageIds.length > 0) {
        const { data: stages } = await supabase
          .from('pipeline_stages')
          .select('id, name, color')
          .in('id', stageIds);
        (stages || []).forEach((s: any) => { stageMap[s.id] = { name: s.name, color: s.color }; });
      }
      const stageAgg: Record<string, StageSlice> = {};
      (leadsRows || []).forEach((l: any) => {
        const key = l.stage_id || 'sem-estagio';
        const info = stageMap[l.stage_id] || { name: 'Sem estágio', color: 'hsl(var(--muted-foreground))' };
        if (!stageAgg[key]) stageAgg[key] = { stage: info.name, value: 0, color: info.color };
        stageAgg[key].value += 1;
      });

      // Conversion rate (30d)
      let closedQ = supabase
        .from('leads')
        .select('id, status, updated_at')
        .in('status', ['won', 'lost'])
        .gte('updated_at', start30.toISOString());
      if (scopedUser) closedQ = closedQ.eq('assigned_to', scopedUser);
      else closedQ = closedQ.eq('owner_id', ownerId);
      const { data: closedRows } = await closedQ.limit(2000);
      const won = (closedRows || []).filter((r: any) => r.status === 'won').length;
      const total = (closedRows || []).length;
      const rate = total > 0 ? won / total : 0;

      // Messages by day (14d)
      let msgsQ = supabase
        .from('chat_messages')
        .select('created_at, sender_type, channel, customer_id')
        .gte('created_at', start14.toISOString())
        .eq('sender_type', 'agent');
      const { data: msgs } = await msgsQ.limit(5000);
      const days: DailyPoint[] = [];
      for (let i = 0; i < 14; i++) {
        const d = new Date(start14);
        d.setDate(start14.getDate() + i);
        days.push({ date: isoDay(d), value: 0 });
      }
      const dayIdx: Record<string, number> = Object.fromEntries(days.map((d, i) => [d.date, i]));
      (msgs || []).forEach((m: any) => {
        const key = m.created_at.slice(0, 10);
        if (dayIdx[key] !== undefined) days[dayIdx[key]].value += 1;
      });

      if (cancelled) return;
      setState({
        totals: {
          activeConversations: activeConv || 0,
          callsToday: callsCount || 0,
          leadsInFunnel: leadsCount || 0,
          conversionRate: rate,
        },
        messagesByDay: days,
        leadsByStage: Object.values(stageAgg).sort((a, b) => b.value - a.value).slice(0, 8),
        conversationsByChannel: Object.entries(channelMap).map(([channel, value]) => ({ channel, value })),
        loading: false,
      });
    };

    setState((s) => ({ ...s, loading: true }));
    load().catch(() => !cancelled && setState((s) => ({ ...s, loading: false })));
    return () => { cancelled = true; };
  }, [user?.id, access?.owner_id, scope]);

  return state;
}
