import { useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { usePagePerfTelemetry } from '@/hooks/usePagePerfTelemetry';

interface AppLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export function AppLayout({ children, title, subtitle }: AppLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  usePagePerfTelemetry();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar — icon rail, expands overlay on hover */}
      <div
        className="hidden md:block relative shrink-0"
        onMouseEnter={() => setHoverExpanded(true)}
        onMouseLeave={() => setHoverExpanded(false)}
      >
        {/* Reserved rail width so main content doesn't shift */}
        <div className="w-16 h-full" aria-hidden />
        {/* Actual sidebar overlays on top; expands on hover */}
        <div
          className={`absolute inset-y-0 left-0 z-40 transition-shadow duration-300 ${
            hoverExpanded ? 'shadow-2xl' : ''
          }`}
        >
          <Sidebar collapsible expanded={hoverExpanded} />
        </div>
      </div>

      {/* Mobile sidebar (sheet) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-72 max-w-[85vw]">
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar title={title} subtitle={subtitle} onOpenMenu={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
