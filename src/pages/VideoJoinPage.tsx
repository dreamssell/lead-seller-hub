import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useVideoCall } from '@/contexts/VideoCallContext';
import { VideoRoom } from '@/components/video/VideoRoom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Video, Mic, Shield, Loader2, Camera, Volume2, Wifi, AlertCircle, CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export default function VideoJoinPage() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { startCall, status, endCall } = useVideoCall();
  const [userName, setUserName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [roomData, setRoomData] = useState<any>(null);
  
  const [mediaDevices, setMediaDevices] = useState<{
    cameras: MediaDeviceInfo[];
    microphones: MediaDeviceInfo[];
  }>({ cameras: [], microphones: [] });
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    validateRoom();
    loadDevices();
    simulateLatencyTest();
    
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserName(user.email?.split('@')[0] || '');
      }
    });

    return () => {
      if (videoPreviewRef.current?.srcObject) {
        const stream = videoPreviewRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [roomId, token]);

  const validateRoom = async () => {
    try {
      if (!roomId) return;
      setIsValidating(true);
      
      const { data, error } = await supabase
        .from('video_rooms')
        .select('*')
        .eq('id', roomId)
        .single();

      if (error || !data || !data.is_active) {
        setRoomData(null);
        return;
      }

      if (data.invite_token !== token) {
        setRoomData(null);
        return;
      }

      setRoomData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsValidating(false);
    }
  };

  const loadDevices = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      setMediaDevices({ 
        cameras: devices.filter(d => d.kind === 'videoinput'), 
        microphones: devices.filter(d => d.kind === 'audioinput') 
      });
      setMediaError(null);
    } catch (err: any) {
      console.error('Erro de mídia:', err);
      setMediaError(err.name === 'NotAllowedError' 
        ? 'Acesso negado. Por favor, habilite a câmera e microfone.' 
        : 'Não foi possível encontrar dispositivos de mídia.');
    }
  };

  const simulateLatencyTest = () => {
    const fakeLatency = Math.floor(Math.random() * 50) + 20;
    setTimeout(() => setLatency(fakeLatency), 1500);
  };

  const handleJoin = async () => {
    if (!userName.trim()) {
      toast.error('Por favor, digite seu nome.');
      return;
    }
    setIsJoining(true);
    const correlationId = `join_${Math.random().toString(36).substring(2, 9)}`;
    console.log(`[Join Start] ID: ${correlationId} | Room: ${roomId} | User: ${userName}`);
    
    localStorage.setItem('video_user_name', userName);

    if (videoPreviewRef.current?.srcObject) {
      const stream = videoPreviewRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
    
    try {
      await startCall(roomData?.is_group || false, roomId!, userName);
      console.log(`[Join Success] ID: ${correlationId}`);
    } catch (err: any) {
      console.error(`[Join Error] ID: ${correlationId} | Reason:`, err);
      toast.error(`Erro ao entrar: ${err.message}. ID: ${correlationId}`);
    } finally {
      setIsJoining(false);
    }
  };

  if (isValidating) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-zinc-400 font-medium">Validando sala...</p>
      </div>
    );
  }

  if (!roomData) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Acesso Negado</h1>
        <p className="text-zinc-400 mb-6 text-center max-w-sm">
          Este link de convite é inválido ou foi revogado pelo anfitrião.
        </p>
        <Button onClick={() => navigate('/')}>Voltar ao Início</Button>
      </div>
    );
  }

  if (status === 'rejected') {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
        <XCircle className="w-16 h-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Entrada Recusada</h1>
        <p className="text-zinc-400 mb-6 text-center max-w-sm">
          Sua solicitação foi recusada ou você está em período de espera (cooldown). 
          Por favor, verifique se digitou seu nome corretamente ou tente novamente em alguns minutos.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate('/')}>Sair</Button>
          <Button onClick={() => window.location.reload()} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Tentar Novamente
          </Button>
        </div>
      </div>
    );
  }


  if (status === 'connected' || status === 'calling' || status === 'waiting_approval') {
    return <VideoRoom isGroup={roomData?.is_group || false} />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-6"
      >
        <Card className="glass-card border-white/10 bg-zinc-900/50 backdrop-blur-xl overflow-hidden flex flex-col">
          <div className="relative aspect-video bg-zinc-800 flex items-center justify-center overflow-hidden">
            {mediaError ? (
              <div className="p-8 text-center space-y-4">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
                <p className="text-sm text-zinc-300">{mediaError}</p>
                <Button variant="outline" size="sm" onClick={loadDevices}>Tentar Novamente</Button>
              </div>
            ) : (
              <>
                <video ref={videoPreviewRef} autoPlay muted playsInline className="w-full h-full object-cover mirror" />
                <div className="absolute bottom-4 left-4 flex gap-2">
                   <Badge className="bg-black/60 backdrop-blur-md border-white/10 gap-2"><Camera className="w-3 h-3" /> Câmera OK</Badge>
                   <Badge className="bg-black/60 backdrop-blur-md border-white/10 gap-2"><Volume2 className="w-3 h-3" /> Áudio OK</Badge>
                </div>
              </>
            )}
          </div>
          <CardContent className="p-6 space-y-4 flex-1">
             <div className="space-y-4">
               <h3 className="font-bold text-white flex items-center gap-2">
                 <Wifi className="w-4 h-4 text-primary" /> Status da Rede
               </h3>
               <div className="space-y-3">
                 <div className="flex items-center justify-between text-sm">
                   <span className="text-zinc-400">Latência estimada</span>
                   <span className={latency && latency < 60 ? 'text-green-500 font-bold' : 'text-amber-500 font-bold'}>
                     {latency ? `${latency}ms` : 'Testando...'}
                   </span>
                 </div>
                 <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                   <motion.div initial={{ width: 0 }} animate={{ width: latency ? '100%' : '40%' }} className={`h-full ${latency && latency < 60 ? 'bg-green-500' : 'bg-amber-500'}`} />
                 </div>
               </div>
             </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-white/10 bg-zinc-900/50 backdrop-blur-xl text-white">
          <CardHeader className="space-y-4">
            <div className="space-y-2">
              <Badge variant="outline" className="text-primary border-primary/20">PREPARANDO</Badge>
              <CardTitle className="text-3xl font-bold">Pronto para entrar?</CardTitle>
              <CardDescription className="text-zinc-400">
                Sala: <span className="text-white font-medium">{roomData.title}</span>
                <br />
                <span className="text-[10px] font-mono text-zinc-500">ID: {roomId}</span>
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Como você deseja ser chamado?</label>
              <Input 
                placeholder="Seu nome" 
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="bg-zinc-800/50 border-white/10 text-white h-12 text-lg"
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              />
            </div>

            <div className="space-y-4 pt-4 border-t border-white/5">
               <div className="flex items-center gap-3 text-sm text-zinc-400">
                 <CheckCircle2 className="w-4 h-4 text-green-500" /> Dispositivos prontos.
               </div>
               <div className="flex items-center gap-3 text-sm text-zinc-400">
                 <Shield className="w-4 h-4 text-primary" /> Criptografia ativa.
               </div>
            </div>

            <Button 
              className="w-full h-14 text-xl font-bold bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20"
              onClick={handleJoin}
              disabled={!userName.trim() || isJoining || !!mediaError}
            >
              {isJoining ? <><Loader2 className="w-6 h-6 mr-3 animate-spin" /> Conectando...</> : 'Entrar na Reunião'}
            </Button>
            <p className="text-[11px] text-center text-zinc-500 uppercase tracking-widest font-bold">Lead Video Engine v2.0</p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}