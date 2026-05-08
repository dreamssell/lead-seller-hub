import { Sun, Moon, Bell, Search, Menu, Globe, LogIn, CalendarPlus } from 'lucide-react';
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

interface TopBarProps {
  title: string;
  subtitle?: string;
  onOpenMenu?: () => void;
}

export function TopBar({ title, subtitle, onOpenMenu }: TopBarProps) {
  const { theme, toggleTheme } = useThemeContext();

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

        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center ml-1 shrink-0">
          <span className="text-xs font-bold text-primary">LS</span>
        </div>
      </div>
    </header>
  );
}
