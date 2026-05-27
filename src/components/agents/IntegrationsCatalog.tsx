import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { INTEGRATION_PROVIDERS, PROVIDER_BY_ID, IntegrationProvider } from '@/lib/integrations';
import { Settings, CheckCircle2, AlertCircle, Loader2, Trash2, Plug, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';

type Row = {
  id: string;
  agent_id: string;
  provider: string;
  label: string | null;
  status: 'connected' | 'error' | 'disconnected';
  credentials: Record<string, string>;
  config: Record<string, unknown>;
  last_tested_at: string | null;
  last_error: string | null;
};

interface Props {
  agentId: string;
}

export default function IntegrationsCatalog({ agentId }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [openProvider, setOpenProvider] = useState<IntegrationProvider | null>(null);

  const byProvider = useMemo(() => {
    const m: Record<string, Row> = {};
    rows.forEach((r) => (m[r.provider] = r));
    return m;
  }, [rows]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('manage-agent-integration', {
      body: { action: 'list', agent_id: agentId },
    });
    setLoading(false);
    if (error) return toast({ title: 'Erro ao carregar integrações', description: error.message, variant: 'destructive' });
    setRows((data?.items as Row[]) || []);
  };

  useEffect(() => {
    if (agentId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const handleDelete = async (row: Row) => {
    if (!confirm(`Remover integração ${PROVIDER_BY_ID[row.provider]?.name || row.provider}?`)) return;
    const { error } = await supabase.functions.invoke('manage-agent-integration', {
      body: { action: 'delete', id: row.id, agent_id: agentId },
    });
    if (error) return toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    toast({ title: 'Integração removida' });
    load();
  };

  const grouped = useMemo(() => {
    const g: Record<string, IntegrationProvider[]> = {};
    INTEGRATION_PROVIDERS.forEach((p) => {
      (g[p.category] ||= []).push(p);
    });
    return g;
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Plug className="w-5 h-5 text-primary" /> Integrações
          </h3>
          <p className="text-sm text-muted-foreground">
            Conecte serviços externos reais. Credenciais ficam protegidas no backend e são testadas automaticamente.
          </p>
        </div>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>

      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="space-y-3">
          <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{cat}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((p) => {
              const row = byProvider[p.id];
              const Icon = p.icon;
              return (
                <motion.div
                  key={p.id}
                  whileHover={{ y: -2 }}
                  className="p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors flex flex-col"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${p.color} flex items-center justify-center shrink-0`}>
                      <Icon className="w-5 h-5 text-foreground/80" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{p.name}</span>
                        {row?.status === 'connected' && (
                          <Badge variant="secondary" className="bg-success/15 text-success border-success/30 gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Conectado
                          </Badge>
                        )}
                        {row?.status === 'error' && (
                          <Badge variant="destructive" className="gap-1">
                            <AlertCircle className="w-3 h-3" /> Erro
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</p>
                      {row?.last_error && (
                        <p className="text-[11px] text-destructive mt-1 line-clamp-2">{row.last_error}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-4">
                    <Button size="sm" variant={row ? 'outline' : 'default'} className="flex-1" onClick={() => setOpenProvider(p)}>
                      <Settings className="w-3.5 h-3.5 mr-1.5" />
                      {row ? 'Editar' : 'Configurar'}
                    </Button>
                    {row && (
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(row)} className="text-destructive hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      ))}

      {openProvider && (
        <IntegrationDialog
          agentId={agentId}
          provider={openProvider}
          existing={byProvider[openProvider.id]}
          onClose={() => setOpenProvider(null)}
          onSaved={() => {
            setOpenProvider(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function IntegrationDialog({
  agentId,
  provider,
  existing,
  onClose,
  onSaved,
}: {
  agentId: string;
  provider: IntegrationProvider;
  existing?: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [label, setLabel] = useState(existing?.label || provider.name);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    const { data, error } = await supabase.functions.invoke('manage-agent-integration', {
      body: { action: 'test', agent_id: agentId, provider: provider.id, credentials: values },
    });
    setTesting(false);
    if (error) return setTestResult({ ok: false, message: error.message });
    setTestResult(data as { ok: boolean; message: string });
  };

  const save = async () => {
    setSaving(true);
    const { data, error } = await supabase.functions.invoke('manage-agent-integration', {
      body: { action: 'save', agent_id: agentId, provider: provider.id, label, credentials: values },
    });
    setSaving(false);
    if (error) return toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    const test = (data as any)?.test;
    toast({
      title: test?.ok ? 'Integração conectada' : 'Salvo com aviso',
      description: test?.message,
      variant: test?.ok ? 'default' : 'destructive',
    });
    onSaved();
  };

  const Icon = provider.icon;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${provider.color} flex items-center justify-center`}>
              <Icon className="w-4 h-4" />
            </div>
            {provider.name}
          </DialogTitle>
          <DialogDescription>{provider.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs">Apelido</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={provider.name} />
          </div>
          {provider.fields.map((f) => (
            <div key={f.key}>
              <Label className="text-xs">{f.label}</Label>
              <Input
                type={f.type || 'text'}
                placeholder={f.placeholder}
                value={values[f.key] || ''}
                onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
              />
              {f.helper && <p className="text-[11px] text-muted-foreground mt-1">{f.helper}</p>}
            </div>
          ))}

          {provider.docsUrl && (
            <a href={provider.docsUrl} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
              <ExternalLink className="w-3 h-3" /> Como obter as credenciais
            </a>
          )}

          {testResult && (
            <div
              className={`text-xs px-3 py-2 rounded-md flex items-center gap-2 ${
                testResult.ok ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
              }`}
            >
              {testResult.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              {testResult.message}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={testConnection} disabled={testing}>
            {testing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Testar conexão
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
