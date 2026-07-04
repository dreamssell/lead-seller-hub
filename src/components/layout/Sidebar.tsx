import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { usePlatformOwner } from '@/hooks/usePlatformOwner';
import logo from '@/assets/logo.png';
import { LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { navSections } from '@/lib/navigation';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface SidebarProps {
  onNavigate?: () => void;
  /** When true, sidebar renders as a narrow icon rail that expands on hover/focus. */
  collapsible?: boolean;
  /** Controlled expanded state (mobile sheet forces true). */
  expanded?: boolean;
  /** Whether the user has pinned the sidebar open. */
  pinned?: boolean;
  /** Toggle the pinned state (shows the pin control when provided). */
  onTogglePin?: () => void;
}

export function Sidebar({
  onNavigate,
  collapsible = false,
  expanded = true,
  pinned = false,
  onTogglePin,
}: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, canAccessPage } = useAuth();
  const { isOwner } = usePlatformOwner();

  const go = (path: string) => {
    navigate(path);
    onNavigate?.();
  };

  const showLabels = !collapsible || expanded;

  return (
    <aside
      aria-label="Menu de navegação principal"
      className={`h-full flex flex-col border-r border-border bg-sidebar shrink-0 overflow-hidden transition-[width] duration-300 ease-out ${
        collapsible ? (expanded ? 'w-64' : 'w-16') : 'w-64'
      }`}
    >
      {/* Brand */}
      <div className="px-3 py-5 border-b border-border">
        <div className={`flex items-center gap-2.5 ${showLabels ? '' : 'justify-center'}`}>
          <img src={logo} alt="Lead Seller" className="w-9 h-9 object-contain shrink-0" />
          {showLabels && (
            <div className="min-w-0 flex-1">
              <div className="text-base font-bold text-foreground leading-tight truncate">Lead Seller</div>
              <p className="text-[10px] text-muted-foreground font-medium tracking-wide uppercase truncate">
                Omnichannel Platform
              </p>
            </div>
          )}
          {showLabels && onTogglePin && (
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onTogglePin}
                  aria-label={pinned ? 'Recolher sidebar' : 'Fixar sidebar aberta'}
                  aria-pressed={pinned}
                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
                >
                  {pinned ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {pinned ? 'Recolher sidebar' : 'Fixar sidebar aberta'}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-5 overflow-y-auto overflow-x-hidden">
        {navSections.map((section) => {
          const items = section.items.filter((item) => {
            if (item.ownerOnly && !isOwner) return false;
            return canAccessPage(item.key);
          });
          if (items.length === 0) return null;

          return (
            <div key={section.label}>
              {showLabels ? (
                <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.label}
                </p>
              ) : (
                <div className="mx-3 mb-1.5 h-px bg-border/60" aria-hidden />
              )}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const isActive = location.pathname === item.path;
                  const button = (
                    <motion.button
                      type="button"
                      key={item.path}
                      onClick={() => go(item.path)}
                      className={`sidebar-item w-full ${isActive ? 'active' : ''} ${
                        showLabels ? '' : 'justify-center px-0'
                      }`}
                      whileTap={{ scale: 0.98 }}
                      aria-label={item.label}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      {showLabels && <span className="truncate">{item.label}</span>}
                    </motion.button>
                  );

                  if (showLabels) return button;
                  return (
                    <Tooltip key={item.path} delayDuration={0}>
                      <TooltipTrigger asChild>{button}</TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-2 py-3 border-t border-border space-y-2">
        {(() => {
          const btn = (
            <motion.button
              type="button"
              onClick={signOut}
              className={`sidebar-item w-full text-destructive hover:bg-destructive/10 ${
                showLabels ? '' : 'justify-center px-0'
              }`}
              whileTap={{ scale: 0.98 }}
              aria-label="Sair"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              {showLabels && <span>Sair</span>}
            </motion.button>
          );
          if (showLabels) return btn;
          return (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>{btn}</TooltipTrigger>
              <TooltipContent side="right">Sair</TooltipContent>
            </Tooltip>
          );
        })()}
        {showLabels && (
          <p className="text-[10px] text-muted-foreground text-center">© 2026 Lead Seller v1.0</p>
        )}
      </div>
    </aside>
  );
}
