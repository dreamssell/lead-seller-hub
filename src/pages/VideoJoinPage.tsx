import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useVideoCall } from '@/contexts/VideoCallContext';
import { VideoRoom } from '@/components/video/VideoRoom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Video, Mic, Shield, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

export default function VideoJoinPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { startCall, status } = useVideoCall();
  const [userName, setUserName] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    // Se já estiver conectado ou em chamada, não faz nada
    if (status === 'connected' || status === 'calling') return;
  }, [status]);

  const handleJoin = async () => {
    if (!userName.trim()) return;
    setIsJoining(true);
    // Simula a entrada na sala
    await startCall(roomId?.includes('conferencia') || false, roomId);
    setIsJoining(false);
  };

  if (status === 'connected' || status === 'calling') {
    return <VideoRoom isGroup={roomId?.includes('conferencia') || false} />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <Card className="glass-card border-white/10 bg-zinc-900/50 backdrop-blur-xl text-white">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center text-primary">
              <Video className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-2xl font-bold">Entrar na Reunião</CardTitle>
              <CardDescription className="text-zinc-400">
                Sala ID: <span className="text-primary font-mono">{roomId}</span>
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
                className="bg-zinc-800/50 border-white/10 text-white focus:ring-primary/50"
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center gap-2">
                <Mic className="w-5 h-5 text-primary" />
                <span className="text-[10px] uppercase font-bold text-zinc-500">Microfone OK</span>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center gap-2">
                <Video className="w-5 h-5 text-primary" />
                <span className="text-[10px] uppercase font-bold text-zinc-500">Câmera OK</span>
              </div>
            </div>

            <Button 
              className="w-full h-12 text-lg font-bold bg-primary hover:bg-primary/90"
              onClick={handleJoin}
              disabled={!userName.trim() || isJoining}
            >
              {isJoining ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Conectando...
                </>
              ) : (
                'Participar Agora'
              )}
            </Button>

            <div className="flex items-center justify-center gap-2 text-[11px] text-zinc-500 uppercase tracking-widest font-bold">
              <Shield className="w-3 h-3" />
              Criptografia Ponta-a-Ponta Ativa
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
