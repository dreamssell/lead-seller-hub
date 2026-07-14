import { useState } from 'react';
import { Sparkles, Languages, FileText, Wand2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  messages: Array<{ sender_type: string; content: string }>;
  currentText: string;
  onSuggest: (text: string) => void;
  onSummary: (text: string) => void;
}

type Mode = 'suggest' | 'summarize' | 'translate' | 'improve';

export function AIAssistMenu({ messages, currentText, onSuggest, onSummary }: Props) {
  const [loading, setLoading] = useState<Mode | null>(null);

  const run = async (mode: Mode, target_lang?: string) => {
    setLoading(mode);
    try {
      const recent = messages.slice(-30).map(m => ({
        role: m.sender_type === 'client' ? 'user' : 'assistant',
        content: String(m.content || '').slice(0, 2000),
      }));
      const { data, error } = await supabase.functions.invoke('chat-ai-assist', {
        body: { mode, target_lang, messages: recent, draft: currentText },
      });
      if (error) throw error;
      const text = (data as any)?.text || '';
      if (!text) throw new Error('Resposta vazia');
      if (mode === 'summarize') onSummary(text);
      else onSuggest(text);
      toast.success(
        mode === 'summarize' ? 'Resumo gerado' :
        mode === 'translate' ? 'Tradução pronta' :
        mode === 'improve' ? 'Texto reescrito' : 'Sugestão pronta',
      );
    } catch (e: any) {
      const msg = e?.message || 'Falha';
      if (msg.includes('429')) toast.error('IA: muitas requisições. Tente em instantes.');
      else if (msg.includes('402')) toast.error('IA: créditos esgotados no workspace.');
      else toast.error(`IA indisponível: ${msg}`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-10 w-10 rounded-xl" title="Assistente de IA (Agente AI)">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-primary" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">Agente AI</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => run('suggest')} disabled={!!loading}>
          <Sparkles className="w-3.5 h-3.5 mr-2" /> Sugerir resposta
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run('improve')} disabled={!!loading || !currentText}>
          <Wand2 className="w-3.5 h-3.5 mr-2" /> Melhorar redação do rascunho
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run('summarize')} disabled={!!loading || messages.length === 0}>
          <FileText className="w-3.5 h-3.5 mr-2" /> Resumir conversa
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Languages className="w-3.5 h-3.5 mr-2" /> Traduzir rascunho
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => run('translate', 'pt-BR')} disabled={!currentText}>🇧🇷 Português</DropdownMenuItem>
            <DropdownMenuItem onClick={() => run('translate', 'en')} disabled={!currentText}>🇺🇸 English</DropdownMenuItem>
            <DropdownMenuItem onClick={() => run('translate', 'es')} disabled={!currentText}>🇪🇸 Español</DropdownMenuItem>
            <DropdownMenuItem onClick={() => run('translate', 'fr')} disabled={!currentText}>🇫🇷 Français</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
