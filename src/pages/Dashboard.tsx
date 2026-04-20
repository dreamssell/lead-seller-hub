import { AppLayout } from '@/components/layout/AppLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { ServiceCard } from '@/components/dashboard/ServiceCard';
import {
  MessageSquare,
  Phone,
  Users,
  TrendingUp,
  Headphones,
  Bot,
  Video,
  FileText,
  BarChart3,
  ShieldCheck,
  Zap,
  Globe,
} from 'lucide-react';

const stats = [
  { icon: MessageSquare, label: 'Conversas Ativas', value: 128, change: '+12%', positive: true },
  { icon: Phone, label: 'Chamadas Hoje', value: 47, change: '+8%', positive: true },
  { icon: Users, label: 'Leads no Funil', value: '1.2k', change: '+23%', positive: true },
  { icon: TrendingUp, label: 'Taxa de Conversão', value: '34%', change: '+5%', positive: true },
];

const services = [
  {
    icon: Headphones,
    title: 'Central de Atendimento',
    description: 'Gerencie todos os atendimentos em tempo real via chat, voz e vídeo.',
    color: 'bg-primary/10 text-primary',
    path: '/tickets',
  },
  {
    icon: Bot,
    title: 'Agentes de I.A. (SDR)',
    description: 'Configure e treine agentes inteligentes para qualificação automática de leads.',
    color: 'bg-success/10 text-success',
    path: '/ai-agents',
  },
  {
    icon: Phone,
    title: 'VoIP & Gravação',
    description: 'Realize chamadas VoIP com gravação automática e transcrição inteligente.',
    color: 'bg-warning/10 text-warning',
    path: '/calls',
  },
  {
    icon: Globe,
    title: 'WhatsApp Business',
    description: 'Integração completa com WhatsApp para mensagens e chamadas de áudio.',
    color: 'bg-success/10 text-success',
    path: '/whatsapp',
  },
  {
    icon: Video,
    title: 'Videochamadas',
    description: 'Agende e realize videochamadas diretamente pela plataforma.',
    color: 'bg-primary/10 text-primary',
    path: '/video',
  },
  {
    icon: BarChart3,
    title: 'Relatórios & Analytics',
    description: 'Dashboards completos com métricas de performance e exportação em PDF.',
    color: 'bg-accent/10 text-accent',
    path: '/reports',
  },
  {
    icon: Zap,
    title: 'Automações & Integrações',
    description: 'Fluxos automatizados com triggers, webhooks e integrações externas.',
    color: 'bg-warning/10 text-warning',
    path: '/automations',
  },
  {
    icon: ShieldCheck,
    title: 'Gestão de Acessos & API',
    description: 'Controle de permissões, chaves API e integração com sistemas externos.',
    color: 'bg-destructive/10 text-destructive',
    path: '/api-keys',
  },
  {
    icon: FileText,
    title: 'Pipeline & Kanban',
    description: 'Visualize e gerencie seu funil de vendas com quadros Kanban personalizáveis.',
    color: 'bg-primary/10 text-primary',
    path: '/pipeline',
  },
];

export default function Dashboard() {
  return (
    <AppLayout title="Dashboard" subtitle="Visão geral da sua central de atendimento">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {/* Services */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Serviços & Módulos</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((s, i) => (
            <ServiceCard key={s.title} {...s} delay={i * 0.05} />
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
