import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Zap, Webhook, GitBranch, Plus } from 'lucide-react';

const flows = [
  { name: 'Boas-vindas WhatsApp', trigger: 'Nova conversa', status: 'Ativo' },
  { name: 'Distribuição de Leads', trigger: 'Lead qualificado', status: 'Ativo' },
  { name: 'Follow-up 24h', trigger: 'Sem resposta', status: 'Pausado' },
];

export default function AutomationsPage() {
  return (
    <AppLayout title="Automações & Integrações" subtitle="Fluxos automatizados, triggers e webhooks">
      <div className="flex justify-end mb-4">
        <Button><Plus className="w-4 h-4 mr-2" /> Nova Automação</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {flows.map((f) => (
          <Card key={f.name} className="glass-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Zap className="w-4 h-4 text-warning" /> {f.name}
                </CardTitle>
                <Badge variant={f.status === 'Ativo' ? 'default' : 'secondary'}>{f.status}</Badge>
              </div>
              <CardDescription className="text-xs">Trigger: {f.trigger}</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button size="sm" variant="outline">Editar</Button>
              <Button size="sm" variant="ghost">Logs</Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Webhook className="w-5 h-5" /> Webhooks & Integrações</CardTitle>
          <CardDescription>Conecte serviços externos via HTTP.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button variant="outline"><Webhook className="w-4 h-4 mr-2" /> Novo Webhook</Button>
          <Button variant="outline"><GitBranch className="w-4 h-4 mr-2" /> Ver Logs</Button>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
