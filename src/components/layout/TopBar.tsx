import { Sun, Moon, Bell, Search } from 'lucide-react';
import { useThemeContext } from '@/contexts/ThemeContext';
import { motion } from 'framer-motion';

interface TopBarProps {
  title: string;
  subtitle?: string;
}

export function TopBar({ title, subtitle }: TopBarProps) {
  const { theme, toggleTheme } = useThemeContext();

  return (
    <header className="h-16 border-b border-border bg-card/60 backdrop-blur-md flex items-center justify-between px-6 shrink-0">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-2">
        {/* Search */}
        <button className="p-2.5 rounded-xl hover:bg-secondary transition-colors">
          <Search className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* Notifications */}
        <button className="p-2.5 rounded-xl hover:bg-secondary transition-colors relative">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full" />
        </button>

        {/* Theme toggle */}
        <motion.button
          onClick={toggleTheme}
          className="p-2.5 rounded-xl hover:bg-secondary transition-colors"
          whileTap={{ scale: 0.9, rotate: 180 }}
          transition={{ duration: 0.3 }}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-muted-foreground" />
          ) : (
            <Moon className="w-4 h-4 text-muted-foreground" />
          )}
        </motion.button>

        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center ml-1">
          <span className="text-xs font-bold text-primary">LS</span>
        </div>
      </div>
    </header>
  );
}
