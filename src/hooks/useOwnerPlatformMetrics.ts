import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CompanyRow {
  id: string;
  name: string;
  plan_slug: string | null;
  status: string | null;
  auth_user_id: string | null;
  created_at: string;
  segment?: string | null;
  login_email?: string | null;
  // aggregated
  sub_companies: number;
  users: number;
  leads: number;
  customers: number;
  messages_30d: number;
  won_leads: number;
  revenue: number;
}

export interface SubCompanyRow {
  id: string;
  name: string;
  owner_id: string;
  parent_company_name?: string;
  plan_slug: string | null;
  status: string | null;
  created_at: string;
  users: number;
  leads: number;
  customers: number;
  messages_30d: number;
  won_leads: number;
  revenue: number;
  credit_limit?: number | null;
  credit_balance?: number | null;
}

export interface PlatformTotals {
  companies: number;
  subCompanies: number;
  users: number;
  leads: number;
  customers: number;
  messages30d: number;
  wonLeads: number;
  revenue: number;
  activeCompanies: number;
  blockedCompanies: number;
  conversionRate: number;
}

export interface DailyPoint { date: string; value: number }
export interface Slice { name: string; value: number }

export interface OwnerPlatformMetrics {
  loading: boolean;
  totals: PlatformTotals;
  companies: CompanyRow[];
  subCompanies: SubCompanyRow[];
  companiesByPlan: Slice[];
  leadsByCompany: Slice[];
  messagesByDay: DailyPoint[];
  refresh: () => void;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

async function countBy(
  table: string,
  ownerField: string,
  ids: string[],
  extra?: (q: any) => any,
): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  if (ids.length === 0) return map;
  // Batch fetch ids only
  let q: any = (supabase as any).from(table).select(`${ownerField}`).in(ownerField, ids).limit(50000);
  if (extra) q = extra(q);
  const { data } = await q;
  (data || []).forEach((r: any) => {
    const k = r[ownerField];
    if (!k) return;
    map[k] = (map[k] || 0) + 1;
  });
  return map;
}

async function sumRevenue(ids: string[], ownerField: string): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  if (ids.length === 0) return map;
  const { data } = await (supabase as any)
    .from('leads')
    .select(`${ownerField},estimated_value,status`)
    .in(ownerField, ids)
    .eq('status', 'ganho')
    .limit(50000);
  (data || []).forEach((r: any) => {
    const k = r[ownerField];
    if (!k) return;
    map[k] = (map[k] || 0) + Number(r.estimated_value || 0);
  });
  return map;
}

export function useOwnerPlatformMetrics(): OwnerPlatformMetrics {
  const [state, setState] = useState<OwnerPlatformMetrics>({
    loading: true,
    totals: {
      companies: 0, subCompanies: 0, users: 0, leads: 0, customers: 0,
      messages30d: 0, wonLeads: 0, revenue: 0, activeCompanies: 0,
      blockedCompanies: 0, conversionRate: 0,
    },
    companies: [],
    subCompanies: [],
    companiesByPlan: [],
    leadsByCompany: [],
    messagesByDay: [],
    refresh: () => {},
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState((s) => ({ ...s, loading: true }));

      const start30 = new Date();
      start30.setDate(start30.getDate() - 30);
      const start14 = new Date();
      start14.setDate(start14.getDate() - 13);
      start14.setHours(0, 0, 0, 0);

      const [{ data: companies }, { data: subCompanies }] = await Promise.all([
        (supabase as any).from('client_companies')
          .select('id, name, plan_slug, status, auth_user_id, created_at, segment, login_email')
          .order('created_at', { ascending: false }),
        (supabase as any).from('sub_companies')
          .select('id, name, owner_id, plan_slug, status, created_at, credit_limit, credit_balance')
          .order('created_at', { ascending: false }),
      ]);

      const compList = (companies || []) as any[];
      const subList = (subCompanies || []) as any[];

      const ownerIds = compList.map((c) => c.auth_user_id).filter(Boolean);
      const subIds = subList.map((s) => s.id);
      const subOwnerIds = subList.map((s) => s.owner_id).filter(Boolean);

      // Aggregations for companies (by owner_id / auth_user_id)
      const [
        leadsByOwner, customersByOwner, wonByOwner, messagesByOwner,
        usersByOwner, subCountByOwner,
      ] = await Promise.all([
        countBy('leads', 'owner_id', ownerIds),
        countBy('customers', 'owner_id', ownerIds),
        countBy('leads', 'owner_id', ownerIds, (q) => q.eq('status', 'ganho')),
        countBy('chat_messages', 'owner_id' as any, [], () => null).then(async () => {
          // chat_messages does not have owner_id — use sub_company_id path via customers is complex.
          // Fallback: count by joining via customers.owner_id → chat_messages.customer_id
          const map: Record<string, number> = {};
          if (ownerIds.length === 0) return map;
          const { data } = await (supabase as any)
            .from('customers')
            .select('id, owner_id')
            .in('owner_id', ownerIds)
            .limit(50000);
          const custToOwner: Record<string, string> = {};
          const custIds: string[] = [];
          (data || []).forEach((c: any) => { custToOwner[c.id] = c.owner_id; custIds.push(c.id); });
          if (custIds.length === 0) return map;
          // batch fetch in chunks of 500
          for (let i = 0; i < custIds.length; i += 500) {
            const slice = custIds.slice(i, i + 500);
            const { data: msgs } = await (supabase as any)
              .from('chat_messages')
              .select('customer_id')
              .in('customer_id', slice)
              .gte('created_at', start30.toISOString())
              .limit(50000);
            (msgs || []).forEach((m: any) => {
              const owner = custToOwner[m.customer_id];
              if (owner) map[owner] = (map[owner] || 0) + 1;
            });
          }
          return map;
        }),
        countBy('user_account_access', 'owner_id', ownerIds),
        (async () => {
          const map: Record<string, number> = {};
          subList.forEach((s) => { if (s.owner_id) map[s.owner_id] = (map[s.owner_id] || 0) + 1; });
          return map;
        })(),
      ]);
      const revenueByOwner = await sumRevenue(ownerIds, 'owner_id');

      // Aggregations for sub-companies (by sub_company_id)
      const [
        leadsBySub, customersBySub, wonBySub, usersBySub,
      ] = await Promise.all([
        countBy('leads', 'sub_company_id', subIds),
        countBy('customers', 'sub_company_id', subIds),
        countBy('leads', 'sub_company_id', subIds, (q) => q.eq('status', 'ganho')),
        countBy('user_account_access', 'sub_company_id', subIds),
      ]);
      const revenueBySub = await sumRevenue(subIds, 'sub_company_id');

      // Messages by day (last 14d) - platform total
      const { data: msgs14 } = await (supabase as any)
        .from('chat_messages')
        .select('created_at')
        .gte('created_at', start14.toISOString())
        .limit(50000);
      const days: DailyPoint[] = [];
      for (let i = 0; i < 14; i++) {
        const d = new Date(start14);
        d.setDate(start14.getDate() + i);
        days.push({ date: isoDay(d), value: 0 });
      }
      const dayIdx: Record<string, number> = Object.fromEntries(days.map((d, i) => [d.date, i]));
      (msgs14 || []).forEach((m: any) => {
        const key = String(m.created_at).slice(0, 10);
        if (dayIdx[key] !== undefined) days[dayIdx[key]].value += 1;
      });

      const parentByOwner: Record<string, string> = {};
      compList.forEach((c) => { if (c.auth_user_id) parentByOwner[c.auth_user_id] = c.name; });

      const companiesRows: CompanyRow[] = compList.map((c) => {
        const o = c.auth_user_id || '';
        return {
          id: c.id,
          name: c.name,
          plan_slug: c.plan_slug,
          status: c.status,
          auth_user_id: c.auth_user_id,
          created_at: c.created_at,
          segment: c.segment,
          login_email: c.login_email,
          sub_companies: subCountByOwner[o] || 0,
          users: usersByOwner[o] || 0,
          leads: leadsByOwner[o] || 0,
          customers: customersByOwner[o] || 0,
          messages_30d: messagesByOwner[o] || 0,
          won_leads: wonByOwner[o] || 0,
          revenue: revenueByOwner[o] || 0,
        };
      });

      const subRows: SubCompanyRow[] = subList.map((s) => ({
        id: s.id,
        name: s.name,
        owner_id: s.owner_id,
        parent_company_name: parentByOwner[s.owner_id] || '—',
        plan_slug: s.plan_slug,
        status: s.status,
        created_at: s.created_at,
        users: usersBySub[s.id] || 0,
        leads: leadsBySub[s.id] || 0,
        customers: customersBySub[s.id] || 0,
        messages_30d: 0,
        won_leads: wonBySub[s.id] || 0,
        revenue: revenueBySub[s.id] || 0,
        credit_limit: s.credit_limit,
        credit_balance: s.credit_balance,
      }));

      const totals: PlatformTotals = {
        companies: companiesRows.length,
        subCompanies: subRows.length,
        users: companiesRows.reduce((a, c) => a + c.users, 0),
        leads: companiesRows.reduce((a, c) => a + c.leads, 0),
        customers: companiesRows.reduce((a, c) => a + c.customers, 0),
        messages30d: companiesRows.reduce((a, c) => a + c.messages_30d, 0),
        wonLeads: companiesRows.reduce((a, c) => a + c.won_leads, 0),
        revenue: companiesRows.reduce((a, c) => a + c.revenue, 0),
        activeCompanies: companiesRows.filter((c) => c.status === 'active').length,
        blockedCompanies: companiesRows.filter((c) => c.status === 'blocked').length,
        conversionRate: 0,
      };
      totals.conversionRate = totals.leads > 0 ? totals.wonLeads / totals.leads : 0;

      const planAgg: Record<string, number> = {};
      companiesRows.forEach((c) => {
        const k = c.plan_slug || 'sem_plano';
        planAgg[k] = (planAgg[k] || 0) + 1;
      });

      const leadsByCompany: Slice[] = companiesRows
        .map((c) => ({ name: c.name, value: c.leads }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);

      if (cancelled) return;
      setState({
        loading: false,
        totals,
        companies: companiesRows,
        subCompanies: subRows,
        companiesByPlan: Object.entries(planAgg).map(([name, value]) => ({ name, value })),
        leadsByCompany,
        messagesByDay: days,
        refresh: () => setTick((t) => t + 1),
      });
    })().catch((err) => {
      console.error('[useOwnerPlatformMetrics] error', err);
      if (!cancelled) setState((s) => ({ ...s, loading: false }));
    });

    return () => { cancelled = true; };
  }, [tick]);

  return useMemo(() => ({ ...state, refresh: () => setTick((t) => t + 1) }), [state]);
}
