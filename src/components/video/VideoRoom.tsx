import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mic, MicOff, Video, VideoOff, PhoneOff, 
  Settings, Users, MessageSquare, Monitor, 
  Hand, Grid, MoreVertical, Maximize2, Shield,
  Check, X, UserMinus, VolumeX, Crown
} from 'lucide-react';
import { useVideoCall } from '@/contexts/VideoCallContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useEffect, useRef, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

export function VideoRoom({ isGroup = false }) {
  const { 
    localStream, remoteStream, status, endCall, 
    toggleMute, toggleVideo, isMuted, isVideoOff,
    participants, isAdmin, approveParticipant, rejectParticipant, 
    kickParticipant, muteParticipant
  } = useVideoCall();
  
  const [showParticipants, setShowParticipants] = useState(false);
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

  if (status === 'idle') return null;

  if (status === 'waiting_approval') {
    return (
      <div className="fixed inset-0 z-[300] bg-zinc-950 flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-6 max-w-sm"
        >
          <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto relative">
             <Shield className="w-10 h-10 text-primary" />
             <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white">Aguardando Aprovação</h2>
            <p className="text-zinc-400">O anfitrião foi notificado da sua solicitação. Você entrará assim que for aprovado.</p>
          </div>
          <Button variant="outline" onClick={endCall} className="w-full">Cancelar e Sair</Button>
        </motion.div>
      </div>
    );
  }

  const approvedParticipants = participants.filter(p => p.status === 'approved');
  const pendingParticipants = participants.filter(p => p.status === 'pending');

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="fixed inset-0 z-[200] bg-zinc-950 flex flex-col lg:flex-row overflow-hidden"
    >
      <div className="flex-1 flex flex-col relative">
        {/* Top Bar */}
        <div className="absolute top-6 left-6 right-6 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="bg-white/5 backdrop-blur-md border-white/10 text-white gap-2 h-8">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              LIVE: {isGroup ? 'Conferência Geral' : 'Chamada Privada'}
            </Badge>
            <Badge variant="outline" className="bg-white/5 backdrop-blur-md border-white/10 text-white gap-2 h-8">
              <Users className="w-3 h-3" /> {approvedParticipants.length} Participantes
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 rounded-full h-10 w-10">
              <Shield className="w-5 h-5" />
            </Button>
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
                <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center">
                  <Users className="w-10 h-10" />
                </div>
                <p className="text-sm font-medium">Aguardando outros participantes...</p>
              </div>
            )}
            <video 
              ref={remoteVideoRef} 
              autoPlay 
              playsInline 
              className="w-full h-full object-cover"
            />
            
            {isGroup && (
              <div className="absolute inset-0 grid grid-cols-2 md:grid-cols-4 gap-2 p-2 pointer-events-none">
                 {/* This would be real participants in a production SFU environment */}
                 {[1,2,3].map(i => (
                   <div key={i} className="rounded-xl bg-zinc-800/80 border border-white/5 flex flex-col items-center justify-center gap-2">
                     <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center">
                        <Users className="w-5 h-5 text-white/20" />
                     </div>
                     <span className="text-[10px] text-white/40 font-medium">Participante {i}</span>
                   </div>
                 ))}
              </div>
            )}
          </div>

          {/* Local Video (Floating) */}
          <motion.div 
            drag
            dragConstraints={{ left: -400, right: 400, top: -200, bottom: 200 }}
            className="absolute bottom-32 right-10 w-48 md:w-64 aspect-video rounded-2xl overflow-hidden bg-zinc-800 border-2 border-primary/50 shadow-2xl z-20"
          >
            {isVideoOff && (
              <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center">
                <VideoOff className="w-8 h-8 text-zinc-600" />
              </div>
            )}
            <video 
              ref={localVideoRef} 
              autoPlay 
              muted 
              playsInline 
              className="w-full h-full object-cover mirror"
            />
            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-md text-[10px] text-white flex items-center gap-2">
              Você {isAdmin && <Crown className="w-2 h-2 text-amber-400" />} {isMuted && '(Mutado)'}
            </div>
          </motion.div>
        </div>

        {/* Control Bar */}
        <div className="h-28 w-full flex items-center justify-center gap-4 bg-gradient-to-t from-black to-transparent absolute bottom-0 pb-6 px-4">
          <div className="bg-zinc-900/90 backdrop-blur-2xl border border-white/10 p-2 rounded-2xl flex items-center gap-2 md:gap-3">
            <Button 
              variant={isMuted ? 'destructive' : 'ghost'} 
              size="icon" 
              onClick={toggleMute}
              className="rounded-xl h-12 w-12"
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </Button>
            <Button 
              variant={isVideoOff ? 'destructive' : 'ghost'} 
              size="icon" 
              onClick={toggleVideo}
              className="rounded-xl h-12 w-12"
            >
              {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            </Button>
            
            <Separator orientation="vertical" className="h-8 bg-white/10 mx-1" />
            
            <Button variant="ghost" size="icon" className="rounded-xl h-12 w-12 hidden md:flex">
              <Monitor className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" className="rounded-xl h-12 w-12">
              <Hand className="w-5 h-5" />
            </Button>
            {isGroup && (
               <Button variant="ghost" size="icon" className="rounded-xl h-12 w-12 hidden md:flex">
                  <Grid className="w-5 h-5" />
               </Button>
            )}

            <Separator orientation="vertical" className="h-8 bg-white/10 mx-1" />

            <Button 
              variant="destructive" 
              size="icon" 
              onClick={endCall}
              className="rounded-xl h-12 w-12 bg-red-600 hover:bg-red-700 shadow-lg shadow-red-900/20"
            >
              <PhoneOff className="w-6 h-6" />
            </Button>
          </div>

          <div className="bg-zinc-900/90 backdrop-blur-2xl border border-white/10 p-2 rounded-2xl flex items-center gap-2">
            <Button variant="ghost" size="icon" className="rounded-xl h-10 w-10">
              <MessageSquare className="w-5 h-5" />
            </Button>
            <Button 
              variant={showParticipants ? 'secondary' : 'ghost'} 
              size="icon" 
              onClick={() => setShowParticipants(!showParticipants)}
              className="rounded-xl h-10 w-10 relative"
            >
              <Users className="w-5 h-5" />
              {pendingParticipants.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-[10px] font-bold rounded-full flex items-center justify-center text-white">
                  {pendingParticipants.length}
                </span>
              )}
            </Button>
            <Button variant="ghost" size="icon" className="rounded-xl h-10 w-10">
              <Settings className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Participants Sidebar */}
      <AnimatePresence>
        {showParticipants && (
          <motion.div
            initial={{ x: 400 }}
            animate={{ x: 0 }}
            exit={{ x: 400 }}
            className="w-full lg:w-80 bg-zinc-900 border-l border-white/10 flex flex-col h-full z-[210]"
          >
            <div className="p-4 flex items-center justify-between border-b border-white/5">
               <h3 className="font-bold text-white flex items-center gap-2">
                 <Users className="w-4 h-4 text-primary" /> Participantes
               </h3>
               <Button variant="ghost" size="icon" onClick={() => setShowParticipants(false)}>
                 <X className="w-4 h-4" />
               </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-4 space-y-6">
                {/* Pending Requests */}
                {isAdmin && pendingParticipants.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary">Solicitações de Entrada</h4>
                    {pendingParticipants.map(p => (
                      <div key={p.id} className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-primary">
                            {p.name.charAt(0)}
                          </div>
                          <span className="text-sm font-medium text-white">{p.name}</span>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            className="flex-1 h-8 bg-primary hover:bg-primary/90 text-xs gap-2"
                            onClick={() => approveParticipant(p.id)}
                          >
                            <Check className="w-3 h-3" /> Permitir
                          </Button>
                          <Button 
                            variant="outline" 
                            className="flex-1 h-8 border-white/10 text-xs gap-2"
                            onClick={() => rejectParticipant(p.id)}
                          >
                            <X className="w-3 h-3" /> Recusar
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Participant List */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Na Chamada</h4>
                  {approvedParticipants.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors group">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-zinc-400">
                            {p.name.charAt(0)}
                          </div>
                          <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-zinc-900 ${p.status === 'approved' ? 'bg-green-500' : 'bg-zinc-500'}`} />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-white flex items-center gap-1">
                            {p.name}
                            {isAdmin && p.id === participants.find(part => part.name === p.name)?.id && <Crown className="w-3 h-3 text-amber-500" />}
                          </span>
                          <div className="flex items-center gap-2">
                             {p.media_status.audio ? <Mic className="w-3 h-3 text-zinc-500" /> : <MicOff className="w-3 h-3 text-red-500" />}
                             {p.media_status.video ? <Video className="w-3 h-3 text-zinc-500" /> : <VideoOff className="w-3 h-3 text-red-500" />}
                          </div>
                        </div>
                      </div>
                      
                      {isAdmin && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-zinc-500 hover:text-white"
                            onClick={() => muteParticipant(p.id)}
                          >
                            <VolumeX className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                            onClick={() => kickParticipant(p.id)}
                          >
                            <UserMinus className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}