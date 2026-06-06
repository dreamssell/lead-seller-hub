import { createContext, useContext, useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';

interface VideoCallContextType {
  status: 'idle' | 'calling' | 'connected' | 'ended';
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  startCall: (isGroup: boolean, roomId?: string) => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
}

const VideoCallContext = createContext<VideoCallContextType | null>(null);

export function VideoCallProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<VideoCallContextType['status']>('idle');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);

  const startCall = async (isGroup: boolean, roomId?: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      setStatus('calling');
      
      // Aqui integraria com um servidor de sinalização (WebRTC via Supabase ou MediaSoup)
      toast.info(isGroup ? `Iniciando conferência em grupo: ${roomId || 'Sala'}...` : 'Iniciando chamada individual...');
      
      // Simulação de conexão bem-sucedida
      setTimeout(() => {
        setStatus('connected');
        toast.success('Chamada conectada!');
      }, 2000);
    } catch (err) {
      toast.error('Não foi possível acessar câmera/microfone');
    }
  };

  const endCall = () => {
    localStream?.getTracks().forEach(track => track.stop());
    setLocalStream(null);
    setRemoteStream(null);
    setStatus('ended');
    setTimeout(() => setStatus('idle'), 1000);
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => track.enabled = isMuted);
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => track.enabled = isVideoOff);
      setIsVideoOff(!isVideoOff);
    }
  };

  return (
    <VideoCallContext.Provider value={{ status, localStream, remoteStream, isMuted, isVideoOff, startCall, endCall, toggleMute, toggleVideo }}>
      {children}
    </VideoCallContext.Provider>
  );
}

export const useVideoCall = () => {
  const ctx = useContext(VideoCallContext);
  if (!ctx) throw new Error('useVideoCall must be used within VideoCallProvider');
  return ctx;
};
