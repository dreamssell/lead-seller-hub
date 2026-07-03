import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles } from 'lucide-react';

/**
 * Tabs bar for the Calls page. Extracted so the SIP-tab visibility
 * regression can be tested in isolation without mounting the entire
 * 1600-line CallsPage (which loads jssip, recharts, framer-motion, etc.).
 */
export function CallsPageTabsList({ isOwner }: { isOwner: boolean }) {
  return (
    <TabsList className="flex-wrap h-auto">
      <TabsTrigger value="history">Histórico</TabsTrigger>
      <TabsTrigger value="recordings">Gravações</TabsTrigger>
      <TabsTrigger value="reports">Relatórios</TabsTrigger>
      <TabsTrigger value="insights" className="gap-1.5">
        <Sparkles className="w-3.5 h-3.5" />
        Análises
      </TabsTrigger>
      <TabsTrigger value="stats">Estatísticas</TabsTrigger>
      <TabsTrigger value="queues">Filas & IVR</TabsTrigger>
      <TabsTrigger value="blocked">Bloqueados</TabsTrigger>
      {isOwner && <TabsTrigger value="settings">Configurações SIP</TabsTrigger>}
    </TabsList>
  );
}
