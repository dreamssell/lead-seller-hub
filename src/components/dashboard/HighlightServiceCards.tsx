import { motion } from 'framer-motion';
import { Video, MessagesSquare, ArrowRight, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';
import { usePlatformOwner } from '@/hooks/usePlatformOwner';
import { useInternalCommsUnread } from '@/hooks/useInternalCommsUnread';

/**
 * Cards em destaque exibidos em todos os dashboards (Agente / Gestor / Executivo).
 *
 * - "Meeting": aparece para toda Empresa/Sub-empresa e todos os níveis de usuário,
 *   porém o acesso real é liberado APENAS ao dono da plataforma. Demais usuários
 *   veem uma mensagem de upsell ao clicar.
 * - "Comunicação Interna": liberado para todos, independente do plano — abre a
 *   sala de comunicação interna da própria empresa/sub-empresa.
 */
export function HighlightServiceCards() {
  const navigate = useNavigate();
  const { isOwner, loading } = usePlatformOwner();
  const { total: unreadTotal } = useInternalCommsUnread();

  const handleMeeting = () => {
    if (loading) return;
    if (isOwner) {
      navigate('/video');
      return;
    }
    toast({
      title: 'Meeting — recurso premium',
      description: 'Contrate esse serviço agora! Fale com o seu consultor para liberar videochamadas e videoconferências.',
    });
  };

  return (
    <div className="mb-8">
      <h3 className="text-sm font-semibold text-foreground mb-4">Colaboração & Comunicação</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Meeting */}
        <motion.button
          type="button"
          onClick={handleMeeting}
          className="service-card group text-left w-full relative"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.99 }}
          aria-label="Meeting — videochamadas e videoconferência"
        >
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 bg-primary/10 text-primary">
            <Video className="w-6 h-6" />
          </div>
          <div className="flex items-center gap-2 mb-1.5">
            <h3 className="text-sm font-semibold text-foreground">Meeting</h3>
            {!isOwner && !loading && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-warning bg-warning/10 px-2 py-0.5 rounded-full">
                <Lock className="w-3 h-3" /> Premium
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mb-4">
            Videochamadas e videoconferência integradas à plataforma.
          </p>
          <div className="flex items-center gap-1 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
            <span>{isOwner ? 'Abrir Meeting' : 'Contratar serviço'}</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </motion.button>

        {/* Comunicação Interna */}
        <motion.button
          type="button"
          onClick={() => navigate('/internal-comms')}
          className="service-card group text-left w-full relative"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.99 }}
          aria-label="Comunicação Interna — chat entre usuários da empresa"
        >
          {unreadTotal > 0 && (
            <span
              aria-label={`${unreadTotal} mensagens não lidas`}
              className="absolute top-3 right-3 min-w-[22px] h-[22px] px-1.5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold flex items-center justify-center shadow-sm animate-in fade-in zoom-in"
            >
              {unreadTotal > 99 ? '99+' : unreadTotal}
            </span>
          )}
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 bg-accent/10 text-accent">
            <MessagesSquare className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-foreground mb-1.5">Comunicação Interna</h3>
          <p className="text-xs text-muted-foreground leading-relaxed mb-4">
            {unreadTotal > 0
              ? `Você tem ${unreadTotal} ${unreadTotal === 1 ? 'nova mensagem' : 'novas mensagens'} de colegas.`
              : 'Converse em tempo real com colegas da sua empresa ou sub-empresa. Disponível para todos os planos.'}
          </p>
          <div className="flex items-center gap-1 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
            <span>Abrir sala</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </motion.button>
      </div>
    </div>
  );
}
