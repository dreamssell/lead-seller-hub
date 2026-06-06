import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mic, MicOff, Video, VideoOff, PhoneOff, 
  Settings, Users, MessageSquare, Monitor, 
  Hand, Grid, MoreVertical, Maximize2, Shield
} from 'lucide-react';
import { useVideoCall } from '@/contexts/VideoCallContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useEffect, useRef } from 'react';

export function VideoRoom({ isGroup = false }) {
  const { localStream, remoteStream, status, endCall, toggleMute, toggleVideo, isMuted, isVideoOff } = useVideoCall();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  if (status === 'idle') return null;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="fixed inset-0 z-[200] bg-zinc-950 flex flex-col items-center justify-center p-4"
    >
      {/* Top Bar */}
      <div className="absolute top-6 left-6 right-6 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="bg-white/5 backdrop-blur-md border-white/10 text-white gap-2 h-8">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            LIVE: {isGroup ? 'Conferência Geral' : 'Chamada Privada'}
          </Badge>
          {isGroup && (
            <Badge variant="outline" className="bg-white/5 backdrop-blur-md border-white/10 text-white gap-2 h-8">
              <Users className="w-3 h-3" /> 42/100
            </Badge>
          )}
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
      <div className={`w-full max-w-7xl flex-1 relative flex items-center justify-center ${isGroup ? 'p-12' : 'p-4'}`}>
        {/* Remote Video (Full Screen in 1:1, Grid in Group) */}
        <div className="w-full h-full rounded-3xl overflow-hidden bg-zinc-900 border border-white/5 relative shadow-2xl">
          {!remoteStream && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white/40">
              <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center">
                <Users className="w-10 h-10" />
              </div>
              <p className="text-sm font-medium">Aguardando participantes...</p>
            </div>
          )}
          <video 
            ref={remoteVideoRef} 
            autoPlay 
            playsInline 
            className="w-full h-full object-cover"
          />
          
          {/* Mock Sub-videos for Group Call */}
          {isGroup && (
            <div className="absolute inset-0 grid grid-cols-2 md:grid-cols-4 gap-2 p-2">
               {[1,2,3,4,5,6,7].map(i => (
                 <div key={i} className="rounded-xl bg-zinc-800/80 border border-white/5 flex items-center justify-center">
                   <Users className="w-6 h-6 text-white/20" />
                 </div>
               ))}
            </div>
          )}
        </div>

        {/* Local Video (Floating) */}
        <motion.div 
          drag
          dragConstraints={{ left: -400, right: 400, top: -200, bottom: 200 }}
          className="absolute bottom-10 right-10 w-48 md:w-64 aspect-video rounded-2xl overflow-hidden bg-zinc-800 border-2 border-primary/50 shadow-2xl z-20"
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
          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-md text-[10px] text-white">
            Você {isMuted && '(Mutado)'}
          </div>
        </motion.div>
      </div>

      {/* Control Bar */}
      <div className="h-24 w-full flex items-center justify-center gap-4 bg-gradient-to-t from-black/80 to-transparent absolute bottom-0 pb-6">
        <div className="bg-zinc-900/80 backdrop-blur-xl border border-white/10 p-2 rounded-2xl flex items-center gap-3">
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
          
          <div className="w-px h-8 bg-white/10 mx-2" />
          
          <Button variant="ghost" size="icon" className="rounded-xl h-12 w-12">
            <Monitor className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="rounded-xl h-12 w-12">
            <Hand className="w-5 h-5" />
          </Button>
          {isGroup && (
             <Button variant="ghost" size="icon" className="rounded-xl h-12 w-12">
                <Grid className="w-5 h-5" />
             </Button>
          )}

          <div className="w-px h-8 bg-white/10 mx-2" />

          <Button 
            variant="destructive" 
            size="icon" 
            onClick={endCall}
            className="rounded-xl h-12 w-12 bg-red-600 hover:bg-red-700 shadow-lg shadow-red-900/20"
          >
            <PhoneOff className="w-6 h-6" />
          </Button>
        </div>

        <div className="bg-zinc-900/80 backdrop-blur-xl border border-white/10 p-2 rounded-2xl flex items-center gap-2">
          <Button variant="ghost" size="icon" className="rounded-xl h-10 w-10">
            <MessageSquare className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="rounded-xl h-10 w-10">
            <Users className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="rounded-xl h-10 w-10">
            <MoreVertical className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
