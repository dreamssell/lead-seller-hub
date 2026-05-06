import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import logo from '@/assets/logo.png';
import {
  LayoutDashboard,
  MessageSquare,
  Phone,
  Users,
  Bot,
  Settings,
  Key,
  FileText,
  UserCircle,
  Headphones,
  BarChart3,
  LogOut,
} from 'lucide-react';

const navSections = [
  {
    label: 'Principal',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
      { icon: MessageSquare, label: 'Chat Omnichannel', path: '/chat' },
      { icon: Phone, label: 'VoIP & Chamadas', path: '/calls' },
      { icon: Headphones, label: 'Atendimentos', path: '/tickets' },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { icon: Users, label: 'Equipe (SDR/Closers)', path: '/team' },
      { icon: Bot, label: 'Agentes de I.A.', path: '/ai-agents' },
      { icon: BarChart3, label: 'Relatórios', path: '/reports' },
      { icon: FileText, label: 'Kanban / Pipeline', path: '/pipeline' },
    ],
  },
  {
    label: 'Configurações',
    items: [
      { icon: Settings, label: 'Configurações', path: '/settings' },
      { icon: Key, label: 'Chaves API', path: '/api-keys' },
      { icon: UserCircle, label: 'Meu Perfil', path: '/profile' },
    ],
  },
];

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const go = (path: string) => {
    navigate(path);
    onNavigate?.();
  };

  return (
    <aside className="w-64 h-full flex flex-col border-r border-border bg-sidebar shrink-0 overflow-y-auto">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <img src={logo} alt="Lead Seller" className="w-9 h-9 object-contain shrink-0" />
          <div>
            <h1 className="text-base font-bold text-foreground leading-tight">Lead Seller</h1>
            <p className="text-[10px] text-muted-foreground font-medium tracking-wide uppercase">Omnichannel Platform</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-5">
        {navSections.map((section) => (
          <div key={section.label}>
            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <motion.button
                    key={item.path}
                    onClick={() => go(item.path)}
                    className={`sidebar-item w-full ${isActive ? 'active' : ''}`}
                    whileTap={{ scale: 0.98 }}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-border space-y-2">
        <motion.button
          onClick={signOut}
          className="sidebar-item w-full text-destructive hover:bg-destructive/10"
          whileTap={{ scale: 0.98 }}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Sair</span>
        </motion.button>
        <p className="text-[10px] text-muted-foreground text-center">© 2026 Lead Seller v1.0</p>
      </div>
    </aside>
  );
}
