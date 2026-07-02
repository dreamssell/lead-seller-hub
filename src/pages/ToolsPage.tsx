import { AppLayout } from '@/components/layout/AppLayout';
import { ServiceCard } from '@/components/dashboard/ServiceCard';
import {
  Headphones, Bot, Phone, Globe, Video, BarChart3, Zap, ShieldCheck, FileText, PenLine, Crown,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfileLevel } from '@/hooks/useUserProfileLevel';

const allServices = [
  { key: 'ceo', icon: Crown, title: 'Dashboard CEO', description: 'Indicadores executivos completos.', color: 'bg-warning/10 text-warning', path: '/ceo' },
  { key: 'tickets', icon: Headphones, title: 'Central de Atendimento', description: 'Todos os atendimentos em tempo real.', color: 'bg-primary/10 text-primary', path: '/tickets' },
  { key: 'ai-agents', icon: Bot, title: 'Agentes de I.A. (SDR)', description: 'Bots e qualificação automática.', color: 'bg-success/10 text-success', path: '/ai-agents' },
  { key: 'calls', icon: Phone, title: 'VoIP & Gravação', description: 'Chamadas VoIP com gravação.', color: 'bg-warning/10 text-warning', path: '/calls' },
  { key: 'chat', icon: Globe, title: 'WhatsApp Business', description: 'Integração WhatsApp completa.', color: 'bg-success/10 text-success', path: '/whatsapp' },
  { key: 'chat', icon: Video, title: 'Videochamadas', description: 'Vídeo pela plataforma.', color: 'bg-primary/10 text-primary', path: '/video' },
  { key: 'reports', icon: BarChart3, title: 'Relatórios & Analytics', description: 'Métricas e exportação em PDF.', color: 'bg-accent/10 text-accent', path: '/reports' },
  { key: 'settings', icon: Zap, title: 'Automações & Integrações', description: 'Fluxos, webhooks e integrações.', color: 'bg-warning/10 text-warning', path: '/automations' },
  { key: 'api-keys', icon: ShieldCheck, title: 'Gestão de Acessos & API', description: 'Permissões e chaves API.', color: 'bg-destructive/10 text-destructive', path: '/api-keys' },
  { key: 'pipeline', icon: FileText, title: 'Pipeline & Kanban', description: 'Funil de vendas Kanban.', color: 'bg-primary/10 text-primary', path: '/pipeline' },
  { key: 'signatures', icon: PenLine, title: 'Assinaturas Eletrônicas', description: 'Documentos assinados eletronicamente.', color: 'bg-accent/10 text-accent', path: '/signatures' },
] as const;

export default function ToolsPage() {
  const { canAccessPage } = useAuth();
  const { level } = useUserProfileLevel();

  const visible = allServices.filter((s) => {
    if (!canAccessPage(s.key as any)) return false;
    // Agent sees only frontline tools
    if (level === 'agent' && ['ceo', 'ai-agents', 'api-keys', 'settings'].includes(s.key)) return false;
    return true;
  });

  return (
    <AppLayout title="Ferramentas" subtitle="Todos os módulos e serviços disponíveis">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visible.map((s, i) => <ServiceCard key={s.title} {...s} delay={i * 0.04} />)}
      </div>
    </AppLayout>
  );
}
