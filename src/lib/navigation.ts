import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BarChart3,
  Bot,
  Crown,
  Database,
  FileText,
  Headphones,
  Key,
  LayoutDashboard,
  MessageSquare,
  Phone,
  Settings,
  Sparkles,
  UserCircle,
  Users,
} from 'lucide-react';

export type SidebarPageKey =
  | 'dashboard'
  | 'chat'
  | 'calls'
  | 'tickets'
  | 'team'
  | 'cadastros'
  | 'ai-agents'
  | 'reports'
  | 'pipeline'
  | 'ceo'
  | 'settings'
  | 'api-keys'
  | 'status'
  | 'profile'
  | 'white-label';

export type SidebarNavItem = {
  key: SidebarPageKey;
  icon: LucideIcon;
  label: string;
  path: string;
  desc: string;
};

export const navSections: { label: string; items: SidebarNavItem[] }[] = [
  {
    label: 'Principal',
    items: [
      { key: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', path: '/', desc: 'Visão geral da operação' },
      { key: 'chat', icon: MessageSquare, label: 'Chat Omnichannel', path: '/chat', desc: 'Conversas e atendimento por canais' },
      { key: 'calls', icon: Phone, label: 'VoIP & Chamadas', path: '/calls', desc: 'Ligações, filas e telefonia' },
      { key: 'tickets', icon: Headphones, label: 'Atendimentos', path: '/tickets', desc: 'Tickets e suporte ao cliente' },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { key: 'team', icon: Users, label: 'Equipe (SDR/Closers)', path: '/team', desc: 'Usuários, atendentes e times' },
      { key: 'cadastros', icon: Database, label: 'Cadastros', path: '/cadastros', desc: 'Leads, clientes, produtos e sub-empresas' },
      { key: 'ai-agents', icon: Bot, label: 'Agentes de I.A.', path: '/ai-agents', desc: 'Bots e agentes inteligentes' },
      { key: 'reports', icon: BarChart3, label: 'Relatórios', path: '/reports', desc: 'Métricas, analytics e relatórios' },
      { key: 'pipeline', icon: FileText, label: 'Kanban / Pipeline', path: '/pipeline', desc: 'Pipeline comercial e oportunidades' },
      { key: 'ceo', icon: Crown, label: 'Dashboard CEO', path: '/ceo', desc: 'Indicadores executivos' },
    ],
  },
  {
    label: 'Configurações',
    items: [
      { key: 'settings', icon: Settings, label: 'Configurações', path: '/settings', desc: 'Preferências e integrações' },
      { key: 'api-keys', icon: Key, label: 'Chaves API', path: '/api-keys', desc: 'Credenciais e integrações externas' },
      { key: 'status', icon: Activity, label: 'Status do Backend', path: '/status', desc: 'Saúde técnica da plataforma' },
      { key: 'profile', icon: UserCircle, label: 'Meu Perfil', path: '/profile', desc: 'Perfil do usuário logado' },
    ],
  },
];

export const PAGE_OPTIONS = navSections.flatMap((section) => section.items);

export function getPageKeyByPath(pathname: string): SidebarPageKey {
  const exact = PAGE_OPTIONS.find((item) => item.path === pathname);
  if (exact) return exact.key;
  const nested = PAGE_OPTIONS.find((item) => item.path !== '/' && pathname.startsWith(`${item.path}/`));
  return nested?.key || 'dashboard';
}