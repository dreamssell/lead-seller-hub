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
  Link2,
  MessageSquare,
  PenLine,
  Phone,
  Settings,
  Sparkles,
  UserCircle,
  Users,
} from 'lucide-react';

export type SidebarPageKey =
  | 'dashboard'
  | 'tools'
  | 'chat'
  | 'calls'
  | 'tickets'
  | 'team'
  | 'cadastros'
  | 'ai-agents'
  | 'reports'
  | 'pipeline'
  | 'ceo'
  | 'outros'
  | 'settings'
  | 'developer'
  | 'api-keys'
  | 'wavoip'
  | 'status'
  | 'profile'
  | 'documentation'
  | 'signatures'
  | 'white-label';

export type SidebarNavItem = {
  key: SidebarPageKey;
  icon: LucideIcon;
  label: string;
  path: string;
  desc: string;
  /** Visible only to the platform owner (global admin). Hidden for clients and sub-empresas. */
  ownerOnly?: boolean;
};


export const navSections: { label: string; items: SidebarNavItem[] }[] = [
  {
    label: 'Principal',
    items: [
      { key: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', path: '/', desc: 'Visão geral personalizada por perfil' },
      { key: 'tools', icon: Sparkles, label: 'Ferramentas', path: '/ferramentas', desc: 'Todos os módulos e serviços' },
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
      { key: 'signatures', icon: PenLine, label: 'Assinaturas', path: '/signatures', desc: 'Documentos, acompanhamento e equipe de assinatura' },
      { key: 'ceo', icon: Crown, label: 'Dashboard CEO', path: '/ceo', desc: 'Indicadores executivos' },
      { key: 'outros', icon: Link2, label: 'Captura de Leads', path: '/outros', desc: 'Páginas de captura, CTAs e QR Codes (DealerSpace e canais externos)' },
    ],
  },
  {
    label: 'Configurações',
    items: [
      { key: 'settings', icon: UserCircle, label: 'Configurações', path: '/settings', desc: 'Perfil e dados da empresa' },
      { key: 'api-keys', icon: Key, label: 'Chaves API', path: '/api-keys', desc: 'Credenciais e integrações externas' },
      { key: 'documentation', icon: FileText, label: 'Documentação', path: '/documentation', desc: 'Manuais técnicos e API' },
      // Itens abaixo são apenas do dono da plataforma — diagnósticos internos, status técnico e
      // ferramentas de desenvolvimento não devem ser expostos a clientes ou sub-empresas.
      { key: 'developer', icon: Settings, label: 'Desenvolvedor', path: '/developer', desc: 'Preferências e integrações técnicas', ownerOnly: true },
      { key: 'status', icon: Activity, label: 'Status do Backend', path: '/status', desc: 'Saúde técnica da plataforma', ownerOnly: true },
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
// Sub-features that can be blocked per user/sub-company but are not standalone routes.
export const EXTRA_PERMISSION_KEYS: { key: SidebarPageKey; icon: LucideIcon; label: string; desc: string }[] = [
  { key: 'white-label', icon: Sparkles, label: 'White Label', desc: 'Personalização de marca (aba em Cadastros)' },
];

// Used by the "blocked pages" selector — includes routes + extra permission keys.
export const BLOCKABLE_PAGES = [
  ...PAGE_OPTIONS.map(p => ({ key: p.key, icon: p.icon, label: p.label, desc: p.desc })),
  ...EXTRA_PERMISSION_KEYS,
];

export const ALL_PERMISSION_KEYS: SidebarPageKey[] = BLOCKABLE_PAGES.map(p => p.key);
