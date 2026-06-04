import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';

interface GlobalState {
  highlightedCardId: string | null;
  highlightedTime: number | null;
  setHighlightedCard: (cardId: string | null) => void;
}

const GlobalStateContext = createContext<GlobalState | null>(null);

const HIGHLIGHT_TTL = 30 * 60 * 1000; // 30 minutes

export function GlobalStateProvider({ children }: { children: ReactNode }) {
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    
    const savedCard = localStorage.getItem('kanban_highlighted_card');
    const savedTime = localStorage.getItem('kanban_highlighted_time');
    
    if (savedCard && savedTime) {
      const isExpired = Date.now() - parseInt(savedTime) > HIGHLIGHT_TTL;
      if (!isExpired) {
        return savedCard;
      } else {
        localStorage.removeItem('kanban_highlighted_card');
        localStorage.removeItem('kanban_highlighted_time');
      }
    }
    return null;
  });

  const [highlightedTime, setHighlightedTime] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const savedTime = localStorage.getItem('kanban_highlighted_time');
    return savedTime ? parseInt(savedTime) : null;
  });

  const setHighlightedCard = useCallback((cardId: string | null) => {
    setHighlightedCardId(cardId);
    if (cardId) {
      const now = Date.now();
      setHighlightedTime(now);
      localStorage.setItem('kanban_highlighted_card', cardId);
      localStorage.setItem('kanban_highlighted_time', now.toString());
    } else {
      setHighlightedTime(null);
      localStorage.removeItem('kanban_highlighted_card');
      localStorage.removeItem('kanban_highlighted_time');
    }
  }, []);

  // Sync between tabs
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'kanban_highlighted_card') {
        setHighlightedCardId(e.newValue);
      }
      if (e.key === 'kanban_highlighted_time') {
        setHighlightedTime(e.newValue ? parseInt(e.newValue) : null);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Auto-cleanup timer
  useEffect(() => {
    if (!highlightedTime) return;

    const checkCleanup = () => {
      if (Date.now() - highlightedTime > HIGHLIGHT_TTL) {
        setHighlightedCard(null);
      }
    };

    const interval = setInterval(checkCleanup, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [highlightedTime, setHighlightedCard]);

  return (
    <GlobalStateContext.Provider value={{ highlightedCardId, highlightedTime, setHighlightedCard }}>
      {children}
    </GlobalStateContext.Provider>
  );
}

export function useGlobalState() {
  const context = useContext(GlobalStateContext);
  if (!context) {
    throw new Error('useGlobalState must be used within a GlobalStateProvider');
  }
  return context;
}
