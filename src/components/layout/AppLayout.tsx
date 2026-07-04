import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';

interface AppLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

// Separate storage per breakpoint so each device type keeps its own layout memory.
const PIN_STORAGE_KEY_DESKTOP = 'ls:sidebar:pinned:desktop';
const MOBILE_OPEN_STORAGE_KEY = 'ls:sidebar:open:mobile';
const DESKTOP_MQ = '(min-width: 1024px)';

function readBool(key: string, fallback = false): boolean {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = window.localStorage.getItem(key);
    if (v === null) return fallback;
    return v === '1';
  } catch {
    return fallback;
  }
}

function writeBool(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function AppLayout({ children, title, subtitle }: AppLayoutProps) {
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia(DESKTOP_MQ).matches : true,
  );
  const [mobileOpen, setMobileOpen] = useState<boolean>(() => readBool(MOBILE_OPEN_STORAGE_KEY, false));
  const [pinned, setPinned] = useState<boolean>(() => readBool(PIN_STORAGE_KEY_DESKTOP, false));
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [focusExpanded, setFocusExpanded] = useState(false);
  const sidebarWrapRef = useRef<HTMLDivElement | null>(null);

  const expanded = pinned || hoverExpanded || focusExpanded;

  // Track viewport so we don't render the mobile sheet on desktop and vice-versa.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(DESKTOP_MQ);
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => setIsDesktop(e.matches);
    onChange(mql);
    mql.addEventListener('change', onChange as (e: MediaQueryListEvent) => void);
    return () =>
      mql.removeEventListener('change', onChange as (e: MediaQueryListEvent) => void);
  }, []);

  // Persist desktop pin preference
  useEffect(() => {
    writeBool(PIN_STORAGE_KEY_DESKTOP, pinned);
  }, [pinned]);

  // Persist mobile open/closed preference so it comes back on the next visit.
  useEffect(() => {
    writeBool(MOBILE_OPEN_STORAGE_KEY, mobileOpen);
  }, [mobileOpen]);

  // Close (collapse) desktop sidebar when clicking outside — only when unpinned + currently expanded
  useEffect(() => {
    if (!isDesktop || pinned || !expanded) return;
    const onPointerDown = (e: MouseEvent) => {
      const el = sidebarWrapRef.current;
      if (el && !el.contains(e.target as Node)) {
        setHoverExpanded(false);
        setFocusExpanded(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isDesktop, pinned, expanded]);

  // Escape collapses when not pinned
  useEffect(() => {
    if (!isDesktop || pinned) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && expanded) {
        setHoverExpanded(false);
        setFocusExpanded(false);
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isDesktop, pinned, expanded]);

  const handleNavigate = () => {
    if (!pinned) {
      setHoverExpanded(false);
      setFocusExpanded(false);
    }
  };

  return (
    <div
      className="flex h-dvh overflow-hidden bg-background"
      style={{
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {/* Desktop sidebar (lg+). Tablets & mobile use the Sheet to avoid overlaying content. */}
      {isDesktop && (
        <div
          ref={sidebarWrapRef}
          className="relative shrink-0"
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
      )}

      {/* Mobile / tablet sidebar (sheet). Persists open/closed preference. */}
      {!isDesktop && (
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="p-0 w-72 max-w-[85vw] z-50 overflow-y-auto focus:outline-none"
          >
            <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
            <SheetDescription className="sr-only">
              Use Tab e Shift+Tab para navegar entre os itens, Enter para abrir e Esc para fechar.
            </SheetDescription>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
      )}

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar title={title} subtitle={subtitle} onOpenMenu={() => setMobileOpen(true)} />
        <main
          className="flex-1 overflow-y-auto p-4 md:p-6"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
