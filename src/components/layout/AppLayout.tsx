import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { Sheet, SheetContent } from '@/components/ui/sheet';

interface AppLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

const PIN_STORAGE_KEY = 'ls:sidebar:pinned';

function readPinned(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PIN_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function AppLayout({ children, title, subtitle }: AppLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pinned, setPinned] = useState<boolean>(readPinned);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [focusExpanded, setFocusExpanded] = useState(false);
  const sidebarWrapRef = useRef<HTMLDivElement | null>(null);

  const expanded = pinned || hoverExpanded || focusExpanded;

  // Persist pin preference
  useEffect(() => {
    try {
      window.localStorage.setItem(PIN_STORAGE_KEY, pinned ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [pinned]);

  // Close (collapse) when clicking outside — only when unpinned + currently expanded
  useEffect(() => {
    if (pinned || !expanded) return;
    const onPointerDown = (e: MouseEvent) => {
      const el = sidebarWrapRef.current;
      if (el && !el.contains(e.target as Node)) {
        setHoverExpanded(false);
        setFocusExpanded(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [pinned, expanded]);

  // Escape collapses when not pinned
  useEffect(() => {
    if (pinned) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && expanded) {
        setHoverExpanded(false);
        setFocusExpanded(false);
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pinned, expanded]);

  const handleNavigate = () => {
    if (!pinned) {
      setHoverExpanded(false);
      setFocusExpanded(false);
    }
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Desktop sidebar (lg+). Tablets & mobile use the Sheet to avoid overlaying content. */}
      <div
        ref={sidebarWrapRef}
        className="hidden lg:block relative shrink-0"
        onMouseEnter={() => !pinned && setHoverExpanded(true)}
        onMouseLeave={() => !pinned && setHoverExpanded(false)}
        onFocusCapture={() => !pinned && setFocusExpanded(true)}
        onBlurCapture={(e) => {
          if (pinned) return;
          const next = e.relatedTarget as Node | null;
          if (!next || !sidebarWrapRef.current?.contains(next)) {
            setFocusExpanded(false);
          }
        }}
      >
        {/* Rail placeholder keeps main content stable when unpinned */}
        <div className={pinned ? 'w-64 h-full' : 'w-16 h-full'} aria-hidden />
        <div
          className={`absolute inset-y-0 left-0 z-40 transition-shadow duration-300 ${
            expanded && !pinned ? 'shadow-2xl' : ''
          }`}
        >
          <Sidebar
            collapsible={!pinned}
            expanded={expanded}
            pinned={pinned}
            onTogglePin={() => setPinned((p) => !p)}
            onNavigate={handleNavigate}
          />
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
