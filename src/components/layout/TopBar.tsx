import { useNavigate } from 'react-router-dom';
import { Sun, Moon, Bell, Search, Menu, Globe, LogIn, CalendarPlus, Settings } from 'lucide-react';
import { useThemeContext } from '@/contexts/ThemeContext';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface TopBarProps {
  title: string;
  subtitle?: string;
  onOpenMenu?: () => void;
}

export function TopBar({ title, subtitle, onOpenMenu }: TopBarProps) {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useThemeContext();
  const { user } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>('');

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('avatar_url, display_name')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!cancelled && data) {
        setAvatarUrl(data.avatar_url);
        setDisplayName(data.display_name || user.email || '');
      }
    };
    load();
    // refresh when profile updates elsewhere
    const handler = () => load();
    window.addEventListener('profile:updated', handler);
    return () => {
      cancelled = true;
      window.removeEventListener('profile:updated', handler);
    };
  }, [user]);

  const initials = (displayName || user?.email || 'LS')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="h-14 md:h-16 border-b border-border bg-card/60 backdrop-blur-md flex items-center justify-between px-3 md:px-6 shrink-0 sticky top-0 z-30">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onOpenMenu}
          className="md:hidden p-2 rounded-xl hover:bg-secondary transition-colors"
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5 text-foreground" />
        </button>
        <div className="min-w-0">
          <h2 className="text-base md:text-lg font-semibold text-foreground truncate">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground truncate hidden sm:block">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-1 md:gap-2">
        {/* Desktop actions */}
        <button className="hidden md:inline-flex p-2.5 rounded-xl hover:bg-secondary transition-colors">
          <Search className="w-4 h-4 text-muted-foreground" />
        </button>
        <button className="hidden md:inline-flex p-2.5 rounded-xl hover:bg-secondary transition-colors relative">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full" />
        </button>
        <motion.button
          onClick={toggleTheme}
          className="hidden md:inline-flex p-2.5 rounded-xl hover:bg-secondary transition-colors"
          whileTap={{ scale: 0.9, rotate: 180 }}
          transition={{ duration: 0.3 }}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-muted-foreground" />
          ) : (
            <Moon className="w-4 h-4 text-muted-foreground" />
          )}
        </motion.button>

        {/* Mobile combined menu */}
        <DropdownMenu>
          <DropdownMenuTrigger className="md:hidden p-2 rounded-xl hover:bg-secondary transition-colors">
            <Globe className="w-5 h-5 text-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Idioma</DropdownMenuLabel>
            <DropdownMenuItem>🇧🇷 Português</DropdownMenuItem>
            <DropdownMenuItem>🇺🇸 English</DropdownMenuItem>
            <DropdownMenuItem>🇪🇸 Español</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Tema</DropdownMenuLabel>
            <DropdownMenuItem onClick={toggleTheme}>
              {theme === 'dark' ? <Sun className="w-4 h-4 mr-2" /> : <Moon className="w-4 h-4 mr-2" />}
              {theme === 'dark' ? 'Claro' : 'Escuro'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Ações</DropdownMenuLabel>
            <DropdownMenuItem>
              <LogIn className="w-4 h-4 mr-2" /> Fazer Login
            </DropdownMenuItem>
            <DropdownMenuItem>
              <CalendarPlus className="w-4 h-4 mr-2" /> Agendar Demo
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <Avatar
              className="w-8 h-8 ml-1 shrink-0 ring-2 ring-primary/20 cursor-pointer hover:ring-primary/50 transition-all"
              onClick={() => navigate('/settings')}
            >
              <AvatarImage src={avatarUrl || undefined} alt={displayName} />
              <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">{initials}</AvatarFallback>
            </Avatar>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="end">
            <div className="flex items-center gap-2">
              <Settings className="w-3.5 h-3.5" />
              <span>Configurações do Perfil</span>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
