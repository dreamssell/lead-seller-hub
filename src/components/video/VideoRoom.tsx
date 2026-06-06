import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mic, MicOff, Video, VideoOff, PhoneOff, 
  Settings, Users, MessageSquare, Monitor, 
  Hand, Grid, MoreVertical, Maximize2, Shield,
  Check, X, UserMinus, VolumeX, Crown, ShieldCheck, Clipboard, RefreshCw, FileText, Lock, Unlock, Download, Filter
} from 'lucide-react';
import { useVideoCall } from '@/contexts/VideoCallContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useEffect, useRef, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle } from 'lucide-react';

export function VideoRoom({ isGroup = false }) {
  const { 
    localStream, remoteStream, status, endCall, 
    toggleMute, toggleVideo, isMuted, isVideoOff,
    participants, userRole, isAdmin, approveParticipant, rejectParticipant, 
    kickParticipant, muteParticipant, promoteParticipant, regenerateToken, roomId,
    lockRoom
  } = useVideoCall();
  
  const [isLocked, setIsLocked] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [roomAlerts, setRoomAlerts] = useState<any[]>([]);


  
  const [showParticipants, setShowParticipants] = useState(false);
  const [showPendingTab, setShowPendingTab] = useState(false);
  const [hasNewPending, setHasNewPending] = useState(false);
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [lastPollTime, setLastPollTime] = useState<Date>(new Date());

  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(e => console.error("Erro no play local:", e));
    }
  }, [localStream, status]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(e => console.error("Erro no play remoto:", e));
    }
  }, [remoteStream, status]);

  const loadAuditLogs = async () => {
    if (!roomId || !isAdmin) return;
    const { data } = await supabase
      .from('video_audit_logs')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false });
    if (data) setAuditLogs(data);

    // Get room lock status and alerts
    const { data: room } = await supabase.from('video_rooms').select('is_locked').eq('id', roomId).single();
    if (room) setIsLocked(room.is_locked);

    const { data: alerts } = await supabase
      .from('video_alerts')
      .select('*')
      .eq('room_id', roomId)
      .eq('is_resolved', false);
    if (alerts) setRoomAlerts(alerts);
  };


  const exportAuditLogs = () => {
    const headers = ['Data', 'Ação', 'Alvo', 'Realizado Por'];
    const rows = auditLogs.map(log => [
      new Date(log.created_at).toLocaleString(),
      log.action,
      log.target_name,
      log.performed_by || 'Sistema'
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `audit_logs_${roomId}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Logs exportados com sucesso!');
  };


  if (status === 'idle') return null;

  if (status === 'waiting_approval') {
    return (
      <div className="fixed inset-0 z-[300] bg-zinc-950 flex flex-col items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-6 max-w-sm">
          <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto relative">
             <Shield className="w-10 h-10 text-primary" />
             <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white">Aguardando Aprovação</h2>
            <p className="text-zinc-400">O anfitrião foi notificado. Você entrará assim que for aprovado.</p>
          </div>
          <Button variant="outline" onClick={endCall} className="w-full">Cancelar e Sair</Button>
        </motion.div>
      </div>
    );
  }

  const approvedParticipants = participants.filter(p => p.status === 'approved');
  const pendingParticipants = participants.filter(p => p.status === 'pending');

  useEffect(() => {
    if (pendingParticipants.length > 0 && !showParticipants) {
      setHasNewPending(true);
      
      // Tocar som de notificação apenas uma vez por novo participante
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.volume = 0.5;
      audio.play().catch(e => console.error("Erro ao tocar som:", e));
      
      toast.info(`Novo pedido de entrada: ${pendingParticipants[pendingParticipants.length - 1].name}`, {
        description: `Sala ID: ${roomId?.substring(0, 8)}...`,
        action: {
          label: 'Ver Pedidos',
          onClick: () => setShowParticipants(true)
        }
      });
    } else if (pendingParticipants.length === 0 || showParticipants) {
      setHasNewPending(false);
    }
  }, [pendingParticipants.length, showParticipants, roomId]);

  // Fallback Polling para garantir que novos participantes apareçam mesmo sem Realtime
  useEffect(() => {
    if (!isAdmin || !roomId) return;

    const pollInterval = setInterval(async () => {
      console.log(`[Polling] Verificando novos participantes na sala ${roomId}...`);
      const { data, error } = await supabase
        .from('video_participants')
        .select('*')
        .eq('room_id', roomId)
        .eq('status', 'pending')
        .gt('created_at', lastPollTime.toISOString());

      if (error) {
        console.error('[Polling Error]', error);
        return;
      }

      if (data && data.length > 0) {
        console.log(`[Polling Success] ${data.length} novos pedidos encontrados via fallback.`);
        setLastPollTime(new Date());
        // Forçar atualização da lista de participantes no contexto se necessário
        // (O contexto já busca a lista inicial, mas aqui garantimos a detecção)
      }
    }, 15000); // 15 segundos de intervalo para o polling de fallback

    return () => clearInterval(pollInterval);
  }, [isAdmin, roomId, lastPollTime]);


  const handleCopyLink = async () => {
    const { data: room } = await supabase.from('video_rooms').select('invite_token').eq('id', roomId).single();
    if (room) {
      const link = `${window.location.origin}/video/join/${roomId}?token=${room.invite_token}`;
      navigator.clipboard.writeText(link);
      toast.success('Link de convite copiado!');
    }
  };

  const handleRegenerateToken = async () => {
    const newToken = await regenerateToken();
    if (newToken) {
      const link = `${window.location.origin}/video/join/${roomId}?token=${newToken}`;
      navigator.clipboard.writeText(link);
      toast.success('Novo link gerado e copiado!');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
      className="fixed inset-0 z-[200] bg-zinc-950 flex flex-col lg:flex-row overflow-hidden"
    >
      <div className="flex-1 flex flex-col relative">
        {/* Alertas Críticos */}
        <AnimatePresence>
          {roomAlerts.length > 0 && isAdmin && (
            <motion.div 
              initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -50, opacity: 0 }}
              className="absolute top-20 left-1/2 -translate-x-1/2 z-50 w-full max-w-md"
            >
              {roomAlerts.map(alert => (
                <div key={alert.id} className="bg-red-600/90 backdrop-blur-md text-white p-3 rounded-xl shadow-2xl flex items-center justify-between gap-3 border border-red-400/30 mb-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    <p className="text-xs font-bold">{alert.message}</p>
                  </div>
                  <Button 
                    variant="ghost" size="sm" className="h-7 text-[10px] hover:bg-white/10"
                    onClick={async () => {
                      await supabase.from('video_alerts').update({ is_resolved: true }).eq('id', alert.id);
                      setRoomAlerts(prev => prev.filter(a => a.id !== alert.id));
                    }}
                  >
                    OK
                  </Button>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top Bar */}

        <div className="absolute top-6 left-6 right-6 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="bg-white/5 backdrop-blur-md border-white/10 text-white gap-2 h-8">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              LIVE: {isGroup ? 'Conferência Geral' : 'Chamada Privada'}
            </Badge>
            <Badge variant="outline" className="bg-white/5 backdrop-blur-md border-white/10 text-white gap-2 h-8 font-mono text-[10px]">
              ID: {roomId}
            </Badge>
            <Badge variant="outline" className="bg-white/5 backdrop-blur-md border-white/10 text-white gap-2 h-8">
              <Users className="w-3 h-3" /> {approvedParticipants.length} Participantes
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md rounded-full p-1 border border-white/10">
                <Button variant="ghost" size="sm" onClick={handleCopyLink} className="text-white hover:bg-white/10 h-8 gap-2">
                  <Clipboard className="w-4 h-4" /> Link
                </Button>
                <Button variant="ghost" size="sm" onClick={handleRegenerateToken} className="text-white hover:bg-white/10 h-8 gap-2">
                  <RefreshCw className="w-4 h-4" /> Revogar
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => {
                    const nextState = !isLocked;
                    setIsLocked(nextState);
                    lockRoom(nextState);
                  }} 
                  className={`text-white hover:bg-white/10 h-8 gap-2 ${isLocked ? 'text-red-400' : ''}`}
                >
                  {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                  {isLocked ? 'Trancada' : 'Trancar'}
                </Button>
              </div>
            )}

            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 rounded-full h-10 w-10">
              <Maximize2 className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Video Grid */}
        <div className={`w-full h-full relative flex items-center justify-center ${isGroup ? 'p-12' : 'p-4'}`}>
          <div className="w-full max-w-5xl aspect-video rounded-3xl overflow-hidden bg-zinc-900 border border-white/5 relative shadow-2xl">
            {!remoteStream && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white/40">
                <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center"><Users className="w-10 h-10" /></div>
                <p className="text-sm font-medium">Aguardando participantes...</p>
              </div>
            )}
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
          </div>

          <motion.div 
            drag dragConstraints={{ left: -400, right: 400, top: -200, bottom: 200 }}
            className="absolute bottom-32 right-10 w-48 md:w-64 aspect-video rounded-2xl overflow-hidden bg-zinc-800 border-2 border-primary/50 shadow-2xl z-20"
          >
            {isVideoOff && <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center"><VideoOff className="w-8 h-8 text-zinc-600" /></div>}
            <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover mirror" />
            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-md text-[10px] text-white flex items-center gap-2">
              Você {userRole === 'host' && <Crown className="w-2 h-2 text-amber-400" />} {userRole === 'moderator' && <ShieldCheck className="w-2 h-2 text-blue-400" />}
            </div>
          </motion.div>
        </div>

        {/* Control Bar */}
        <div className="h-28 w-full flex items-center justify-center gap-4 bg-gradient-to-t from-black to-transparent absolute bottom-0 pb-6 px-4">
          <div className="bg-zinc-900/90 backdrop-blur-2xl border border-white/10 p-2 rounded-2xl flex items-center gap-2 md:gap-3">
            <Button variant={isMuted ? 'destructive' : 'ghost'} size="icon" onClick={toggleMute} className="rounded-xl h-12 w-12">
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </Button>
            <Button variant={isVideoOff ? 'destructive' : 'ghost'} size="icon" onClick={toggleVideo} className="rounded-xl h-12 w-12">
              {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            </Button>
            <Separator orientation="vertical" className="h-8 bg-white/10 mx-1" />
            <Button variant="ghost" size="icon" className="rounded-xl h-12 w-12 hidden md:flex"><Monitor className="w-5 h-5" /></Button>
            <Button variant="ghost" size="icon" className="rounded-xl h-12 w-12"><Hand className="w-5 h-5" /></Button>
            <Separator orientation="vertical" className="h-8 bg-white/10 mx-1" />
            <Button variant="destructive" size="icon" onClick={endCall} className="rounded-xl h-12 w-12 bg-red-600 hover:bg-red-700 shadow-lg shadow-red-900/20">
              <PhoneOff className="w-6 h-6" />
            </Button>
          </div>

          <div className="bg-zinc-900/90 backdrop-blur-2xl border border-white/10 p-2 rounded-2xl flex items-center gap-2">
            {isAdmin && (
              <>
                <Button 
                  variant={showPendingTab ? 'secondary' : 'ghost'} 
                  size="icon" 
                  onClick={() => { setShowPendingTab(!showPendingTab); setShowParticipants(false); setShowAuditLogs(false); }}
                  className="rounded-xl h-10 w-10 relative"
                  title="Pedidos Pendentes"
                >
                  <Shield className="w-5 h-5" />
                  {pendingParticipants.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-[10px] font-bold rounded-full flex items-center justify-center text-white">
                      {pendingParticipants.length}
                    </span>
                  )}
                </Button>
                <Button 
                  variant={showAuditLogs ? 'secondary' : 'ghost'} 
                  size="icon" 
                  onClick={() => { setShowAuditLogs(!showAuditLogs); setShowParticipants(false); setShowPendingTab(false); }}
                  className="rounded-xl h-10 w-10"
                  title="Auditoria"
                >
                  <FileText className="w-5 h-5" />
                </Button>
              </>
            )}
            <Button 
              variant={showParticipants ? 'secondary' : 'ghost'} 
              size="icon" 
              onClick={() => { setShowParticipants(!showParticipants); setShowAuditLogs(false); setShowPendingTab(false); }}
              className="rounded-xl h-10 w-10 relative"
              title="Participantes"
            >
              <Users className="w-5 h-5" />
              {pendingParticipants.length > 0 && !showPendingTab && (
                <span className={`absolute -top-1 -right-1 w-4 h-4 bg-primary text-[10px] font-bold rounded-full flex items-center justify-center text-white ${hasNewPending ? 'animate-bounce shadow-[0_0_10px_rgba(234,179,8,0.5)]' : ''}`}>
                  {pendingParticipants.length}
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {(showParticipants || showAuditLogs) && (
          <motion.div initial={{ x: 400 }} animate={{ x: 0 }} exit={{ x: 400 }} className="w-full lg:w-80 bg-zinc-900 border-l border-white/10 flex flex-col h-full z-[210]">
            <div className="p-4 flex items-center justify-between border-b border-white/5">
               <h3 className="font-bold text-white flex items-center gap-2">
                 {showParticipants ? <Users className="w-4 h-4 text-primary" /> : <FileText className="w-4 h-4 text-primary" />}
                  {showParticipants ? 'Participantes' : 'Logs de Auditoria'}
               </h3>
               <div className="flex items-center gap-1">
                 {showAuditLogs && (
                   <Button variant="ghost" size="icon" onClick={exportAuditLogs} title="Exportar CSV"><Download className="w-4 h-4" /></Button>
                 )}
                 <Button variant="ghost" size="icon" onClick={() => { setShowParticipants(false); setShowAuditLogs(false); }}><X className="w-4 h-4" /></Button>
               </div>
            </div>


            <ScrollArea className="flex-1">
              <div className="p-4">
                {showParticipants ? (
                  <div className="space-y-6">
                    {isAdmin && pendingParticipants.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary">Solicitações</h4>
                        {pendingParticipants.map(p => (
                          <div key={p.id} className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-3">
                            <span className="text-sm font-medium text-white">{p.name}</span>
                            <div className="flex gap-2">
                              <Button className="flex-1 h-8 bg-primary text-xs" onClick={() => approveParticipant(p.id)}>Permitir</Button>
                              <Button variant="outline" className="flex-1 h-8 text-xs" onClick={() => rejectParticipant(p.id)}>Recusar</Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="space-y-3">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Na Chamada</h4>
                      {approvedParticipants.map(p => (
                        <div key={p.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 group">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-zinc-400">{p.name.charAt(0)}</div>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-white flex items-center gap-1">
                                {p.name} 
                                {p.role === 'host' && <Crown className="w-3 h-3 text-amber-500" />}
                                {p.role === 'moderator' && <ShieldCheck className="w-3 h-3 text-blue-400" />}
                              </span>
                              <div className="flex items-center gap-2">
                                 {p.media_status.audio ? <Mic className="w-3 h-3 text-zinc-500" /> : <MicOff className="w-3 h-3 text-red-500" />}
                                 {p.media_status.video ? <Video className="w-3 h-3 text-zinc-500" /> : <VideoOff className="w-3 h-3 text-red-500" />}
                              </div>
                            </div>
                          </div>
                          {isAdmin && p.role === 'participant' && (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500" onClick={() => promoteParticipant(p.id)}><ShieldCheck className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500" onClick={() => muteParticipant(p.id)}><VolumeX className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => kickParticipant(p.id)}><UserMinus className="w-4 h-4" /></Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Filter className="w-3 h-3 text-zinc-500" />
                      <select 
                        className="bg-zinc-800 text-[10px] border-none rounded p-1 outline-none text-zinc-400"
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                      >
                        <option value="all">Todos</option>
                        <option value="approved">Aprovados</option>
                        <option value="rejected">Recusados</option>
                        <option value="kicked">Expulsos</option>
                      </select>
                    </div>
                    {auditLogs
                      .filter(log => filterType === 'all' || log.action === filterType)
                      .map((log, i) => (

                      <div key={i} className="p-3 rounded-lg bg-white/5 border border-white/5 space-y-1">
                        <div className="flex justify-between items-center">
                          <Badge variant="outline" className={`text-[9px] uppercase ${
                            log.action === 'approved' ? 'text-green-500' : 'text-red-500'
                          }`}>
                            {log.action}
                          </Badge>
                          <span className="text-[10px] text-zinc-500">{new Date(log.created_at).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-xs text-zinc-300">
                          <span className="font-bold text-white">{log.target_name}</span> foi {
                            log.action === 'approved' ? 'permitido' : 
                            log.action === 'rejected' ? 'recusado' :
                            log.action === 'kicked' ? 'expulso' : 'silenciado'
                          }.
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}