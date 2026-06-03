import { describe, it, expect, vi, beforeEach } from 'vitest';

// Simulador de lógica de histórico para testes E2E/Integração
describe('Wavoip History E2E Logic', () => {
  let history: any[] = [];
  const dedupWindow = 5; // 5 minutos

  beforeEach(() => {
    history = [
      { id: 1, date: '2024-05-20 14:30:00', message: 'Event 1' },
      { id: 2, date: '2024-05-20 14:35:00', message: 'Event 2' },
      { id: 3, date: '2024-05-20 14:25:00', message: 'Event 3' },
    ];
  });

  it('should verify sorting (most recent first)', () => {
    const sorted = [...history].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    
    expect(sorted[0].id).toBe(2);
    expect(sorted[sorted.length - 1].id).toBe(3);
  });

  it('should verify pagination logic', () => {
    const itemsPerPage = 2;
    const page1 = history.slice(0, itemsPerPage);
    const page2 = history.slice(itemsPerPage, itemsPerPage * 2);
    
    expect(page1.length).toBe(2);
    expect(page2.length).toBe(1);
    expect(page2[0].id).toBe(3);
  });

  it('should verify dynamic deduplication in Live mode', () => {
    const now = new Date('2024-05-20 14:40:00').getTime();
    const isLive = true;
    
    const newEvent = { id: 4, date: '2024-05-20 14:38:00', message: 'Event 2' }; // Mesma mensagem do id 2
    
    const shouldAdd = (event: any, currentHistory: any[]) => {
      if (!isLive) return false;
      
      const dedupMs = dedupWindow * 60 * 1000;
      const isDuplicate = currentHistory.some(h => {
        const isSameContent = h.message === event.message;
        const isWithinWindow = (now - new Date(h.date).getTime()) < dedupMs;
        return isSameContent && isWithinWindow;
      });
      
      return !isDuplicate;
    };

    // "Event 2" (id: 2) foi há 5 minutos da data 'now' (14:40 vs 14:35)
    // Se a janela é 5 min, deve ser considerado duplicado ou no limite
    expect(shouldAdd(newEvent, history)).toBe(false);

    // Se o evento for novo e único
    const uniqueEvent = { id: 5, date: '2024-05-20 14:39:00', message: 'Event 4' };
    expect(shouldAdd(uniqueEvent, history)).toBe(true);
  });

  it('should prevent updates when Live mode is toggled off', () => {
    const isLive = false;
    const newEvent = { id: 6, date: '2024-05-20 14:41:00', message: 'Event 5' };
    
    const handleIncomingEvent = (event: any, currentHistory: any[]) => {
      if (!isLive) return currentHistory;
      return [event, ...currentHistory];
    };

    const updatedHistory = handleIncomingEvent(newEvent, history);
    expect(updatedHistory.length).toBe(history.length);
    expect(updatedHistory).not.toContain(newEvent);
  });
});
