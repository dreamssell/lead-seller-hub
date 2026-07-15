/**
 * ContactsDialog — agenda unificada de contatos (clientes) por owner/sub-empresa.
 *
 * Fonte de dados: tabela `customers`. RLS garante isolamento multi-tenant, então
 * qualquer empresa/sub-empresa criada futuramente enxerga apenas seus próprios
 * contatos (adicionados via Cadastros → Clientes ou ao iniciar uma nova conversa).
 *
 * Uso:
 *  - `onSelect(customerId)` abre a conversa (ou cria estado inicial no chat).
 *  - `onCreateNew()` abre o fluxo de nova conversa (contato ainda não cadastrado).
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Search, Users, Phone, Mail, MessageCircle, UserPlus, Loader2, Contact2,
} from 'lucide-react';

export interface ContactRow {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  channel: string | null;
  avatar_url: string | null;
  updated_at?: string | null;
  tags?: string[] | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerId: string | null;
  /** Canal ativo do chat (para pré-filtrar). Se ausente, mostra todos. */
  channel?: string | null;
  onSelect: (customerId: string) => void;
  onCreateNew?: () => void;
}

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  widget: 'Widget',
  email: 'E-mail',
};

function initials(name?: string | null, phone?: string | null) {
  const src = (name || phone || '?').trim();
  const parts = src.split(/\s+/).slice(0, 2);
  return parts.map(p => p[0] || '').join('').toUpperCase() || '?';
}

function formatPhone(p?: string | null) {
  if (!p) return '';
  const digits = p.replace(/\D/g, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    const first = rest.length === 9 ? rest.slice(0, 5) : rest.slice(0, 4);
    const last = rest.slice(-4);
    return `+55 (${ddd}) ${first}-${last}`;
  }
  return p.startsWith('+') ? p : `+${digits}`;
}

export function ContactsDialog({ open, onOpenChange, ownerId, channel, onSelect, onCreateNew }: Props) {
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState<string>('all');

  useEffect(() => {
    if (!open || !ownerId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, phone, email, channel, avatar_url, updated_at, tags')
        .eq('owner_id', ownerId)
        .order('name', { ascending: true, nullsFirst: false })
        .limit(2000);
      if (cancelled) return;
      if (error) {
        console.error('[ContactsDialog] load failed', error);
        toast({ title: 'Falha ao carregar contatos', description: error.message, variant: 'destructive' });
        setRows([]);
      } else {
        setRows((data || []) as ContactRow[]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, ownerId]);

  // Default channel filter to the currently active channel (when provided).
  useEffect(() => {
    if (open) setChannelFilter(channel || 'all');
  }, [open, channel]);

  const channels = useMemo(() => {
    const set = new Set<string>();
    rows.forEach(r => { if (r.channel) set.add(r.channel); });
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(r => {
      if (channelFilter !== 'all' && (r.channel || 'whatsapp') !== channelFilter) return false;
      if (!q) return true;
      const hay = [r.name, r.phone, r.email, ...(r.tags || [])].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, channelFilter]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Contact2 className="w-5 h-5 text-emerald-500" />
            Contatos
          </DialogTitle>
          <DialogDescription>
            Agenda unificada de clientes desta empresa. Selecione um contato para abrir a conversa.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-3 space-y-3">
          <div className="flex items-center gap-2 rounded-md border border-input px-3">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome, telefone, e-mail ou tag..."
              className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
            />
          </div>

          {channels.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setChannelFilter('all')}
                className={cn(
                  'text-[11px] px-2.5 py-1 rounded-full border transition-colors',
                  channelFilter === 'all'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-secondary hover:bg-secondary/80 border-transparent text-muted-foreground',
                )}
              >
                Todos ({rows.length})
              </button>
              {channels.map(ch => {
                const count = rows.filter(r => (r.channel || 'whatsapp') === ch).length;
                return (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => setChannelFilter(ch)}
                    className={cn(
                      'text-[11px] px-2.5 py-1 rounded-full border transition-colors',
                      channelFilter === ch
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-secondary hover:bg-secondary/80 border-transparent text-muted-foreground',
                    )}
                  >
                    {CHANNEL_LABEL[ch] || ch} ({count})
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <ScrollArea className="h-[420px] px-2">
          {loading ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando contatos...
            </div>
          ) : filtered.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-center gap-2 px-6">
              <Users className="w-8 h-8 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">
                {query ? 'Nenhum contato encontrado com esse filtro.' : 'Nenhum contato cadastrado ainda.'}
              </p>
              {onCreateNew && (
                <Button size="sm" variant="outline" onClick={() => { onOpenChange(false); onCreateNew(); }}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Adicionar contato
                </Button>
              )}
            </div>
          ) : (
            <ul className="py-1">
              {filtered.map(c => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => { onSelect(c.id); onOpenChange(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-secondary/70 transition-colors text-left"
                  >
                    <Avatar className="w-10 h-10">
                      {c.avatar_url && <AvatarImage src={c.avatar_url} alt={c.name || ''} />}
                      <AvatarFallback className="bg-emerald-500/15 text-emerald-600 text-xs font-medium">
                        {initials(c.name, c.phone)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">
                          {c.name || formatPhone(c.phone) || 'Sem nome'}
                        </p>
                        {c.channel && (
                          <Badge variant="outline" className="text-[9px] uppercase tracking-wider px-1.5 py-0">
                            {CHANNEL_LABEL[c.channel] || c.channel}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                        {c.phone && (
                          <span className="flex items-center gap-1 truncate">
                            <Phone className="w-3 h-3" />
                            {formatPhone(c.phone)}
                          </span>
                        )}
                        {c.email && (
                          <span className="flex items-center gap-1 truncate">
                            <Mail className="w-3 h-3" />
                            {c.email}
                          </span>
                        )}
                      </div>
                    </div>
                    <MessageCircle className="w-4 h-4 text-muted-foreground shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        <DialogFooter className="px-6 py-3 border-t border-border bg-secondary/30">
          <div className="flex items-center justify-between w-full">
            <span className="text-[11px] text-muted-foreground">
              {loading ? '—' : `${filtered.length} de ${rows.length} contato(s)`}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Fechar</Button>
              {onCreateNew && (
                <Button size="sm" onClick={() => { onOpenChange(false); onCreateNew(); }}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Novo contato
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
