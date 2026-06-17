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
  PenLine,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

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
  const { user } = useAuth();
  const [signatureRole, setSignatureRole] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('user_signature_roles')
      .select('role')
      .eq('user_id', user.id)
      .then(({ data }) => {
        const order: Record<string, number> = { diretor: 4, coordenador: 3, supervisor: 2, agente: 1 };
        const top = (data || []).reduce<string | null>((acc, r: any) => {
          return !acc || (order[r.role] || 0) > (order[acc] || 0) ? r.role : acc;
        }, null);
        setSignatureRole(top);
      });
  }, [user?.id]);

  const roleLabel: Record<string, string> = {
    diretor: 'Diretor — visão executiva, KPIs e auditoria completa.',
    coordenador: 'Coordenador — dashboard gerencial, equipe e relatórios.',
    supervisor: 'Supervisor — pipeline da equipe e métricas operacionais.',
    agente: 'Agente — seus documentos e acompanhamento individual.',
  };
  const signatureCard = {
    icon: PenLine,
    title: signatureRole ? `Assinaturas (${signatureRole.charAt(0).toUpperCase() + signatureRole.slice(1)})` : 'Assinaturas Eletrônicas',
    description: signatureRole
      ? roleLabel[signatureRole]
      : 'Envie, acompanhe e gerencie assinaturas eletrônicas com validação por e-mail e SMS.',
    color: 'bg-accent/10 text-accent',
    path: '/signatures',
  };

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
          {[signatureCard, ...services].map((s, i) => (
            <ServiceCard key={s.title} {...s} delay={i * 0.05} />
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
