import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

interface Participant {
  id: string;
  name: string;
  is_guest: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'left';
  media_status: {
    audio: boolean;
    video: boolean;
  };
}

interface VideoCallContextType {
  status: 'idle' | 'calling' | 'connected' | 'ended' | 'waiting_approval';
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  participants: Participant[];
  isAdmin: boolean;
  roomId: string | null;
  startCall: (isGroup: boolean, roomId: string, userName: string) => Promise<void>;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  approveParticipant: (participantId: string) => Promise<void>;
  rejectParticipant: (participantId: string) => Promise<void>;
  kickParticipant: (participantId: string) => Promise<void>;
  muteParticipant: (participantId: string) => Promise<void>;
}

const VideoCallContext = createContext<VideoCallContextType | null>(null);

export function VideoCallProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<VideoCallContextType['status']>('idle');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [currentParticipantId, setCurrentParticipantId] = useState<string | null>(null);
  
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  const cleanup = useCallback(() => {
    localStream?.getTracks().forEach(track => track.stop());
    setLocalStream(null);
    setRemoteStream(null);
    setParticipants([]);
    setIsAdmin(false);
    setRoomId(null);
    setCurrentParticipantId(null);
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, [localStream]);

  const startCall = async (isGroup: boolean, roomId: string, userName: string) => {
    try {
      setRoomId(roomId);
      const { data: { user } } = await supabase.auth.getUser();
      const isGuest = !user;

      // 1. Get Room Info
      const { data: room, error: roomError } = await supabase
        .from('video_rooms')
        .select('*')
        .eq('id', roomId)
        .single();

      if (roomError || !room) {
        toast.error('Sala não encontrada ou inválida.');
        return;
      }

      const hostId = room.host_id;
      setIsAdmin(user?.id === hostId);

      // 2. Request Media Permissions
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      setLocalStream(stream);

      // 3. Register Participant
      const { data: participant, error: pError } = await supabase
        .from('video_participants')
        .insert({
          room_id: roomId,
          user_id: user?.id || null,
          name: userName,
          is_guest: isGuest,
          status: (isGuest && room.settings.guest_approval_required && user?.id !== hostId) ? 'pending' : 'approved',
          media_status: { audio: true, video: true }
        })
        .select()
        .single();

      if (pError) throw pError;
      setCurrentParticipantId(participant.id);

      if (participant.status === 'pending') {
        setStatus('waiting_approval');
        toast.info('Aguardando aprovação do anfitrião...');
      } else {
        setStatus('calling');
      }

      // 4. Setup Realtime Channel
      const channel = supabase.channel(`room:${roomId}`)
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'video_participants',
          filter: `room_id=eq.${roomId}`
        }, (payload) => {
          if (payload.eventType === 'INSERT') {
            const newP = payload.new as Participant;
            setParticipants(prev => [...prev, newP]);
            if (isAdmin && newP.status === 'pending') {
              toast.info(`${newP.name} solicitou entrada na reunião.`);
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedP = payload.new as Participant;
            setParticipants(prev => prev.map(p => p.id === updatedP.id ? updatedP : p));
            
            // Check if current user was approved
            if (updatedP.id === participant.id) {
              if (updatedP.status === 'approved') {
                setStatus('connected');
                toast.success('Entrada aprovada!');
              } else if (updatedP.status === 'rejected') {
                toast.error('Sua entrada foi recusada pelo anfitrião.');
                cleanup();
                setStatus('idle');
              }
            }
          }
        })
        .subscribe();

      channelRef.current = channel;

      // 5. Initial participants load
      const { data: initialParticipants } = await supabase
        .from('video_participants')
        .select('*')
        .eq('room_id', roomId)
        .neq('status', 'left');
      
      if (initialParticipants) setParticipants(initialParticipants);

      if (participant.status === 'approved') {
        setStatus('connected');
      }

    } catch (err: any) {
      console.error('Erro ao iniciar chamada:', err);
      toast.error('Erro ao conectar à sala.');
      setStatus('idle');
    }
  };

  const endCall = async () => {
    if (currentParticipantId) {
      await supabase
        .from('video_participants')
        .update({ status: 'left' })
        .eq('id', currentParticipantId);
    }
    cleanup();
    setStatus('ended');
    setTimeout(() => setStatus('idle'), 1000);
  };

  const toggleMute = () => {
    if (localStream) {
      const newState = !isMuted;
      localStream.getAudioTracks().forEach(track => track.enabled = !newState);
      setIsMuted(newState);
      updateMediaStatus({ audio: !newState });
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const newState = !isVideoOff;
      localStream.getVideoTracks().forEach(track => track.enabled = !newState);
      setIsVideoOff(newState);
      updateMediaStatus({ video: !newState });
    }
  };

  const updateMediaStatus = async (update: Partial<{ audio: boolean, video: boolean }>) => {
    if (currentParticipantId) {
      const current = participants.find(p => p.id === currentParticipantId);
      await supabase
        .from('video_participants')
        .update({ 
          media_status: { ...current?.media_status, ...update } 
        })
        .eq('id', currentParticipantId);
    }
  };

  const approveParticipant = async (id: string) => {
    await supabase.from('video_participants').update({ status: 'approved' }).eq('id', id);
    toast.success('Participante aprovado.');
  };

  const rejectParticipant = async (id: string) => {
    await supabase.from('video_participants').update({ status: 'rejected' }).eq('id', id);
    toast.info('Participante recusado.');
  };

  const kickParticipant = async (id: string) => {
    await supabase.from('video_participants').update({ status: 'rejected' }).eq('id', id);
    toast.info('Participante removido da sala.');
  };

  const muteParticipant = async (id: string) => {
    // This would require a signaling message via Realtime to tell the user to mute
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'mute_request',
        payload: { participantId: id }
      });
      toast.info('Solicitação de silenciamento enviada.');
    }
  };

  return (
    <VideoCallContext.Provider value={{ 
      status, localStream, remoteStream, isMuted, isVideoOff, 
      participants, isAdmin, roomId,
      startCall, endCall, toggleMute, toggleVideo,
      approveParticipant, rejectParticipant, kickParticipant, muteParticipant
    }}>
      {children}
    </VideoCallContext.Provider>
  );
}

export const useVideoCall = () => {
  const ctx = useContext(VideoCallContext);
  if (!ctx) throw new Error('useVideoCall must be used within VideoCallProvider');
  return ctx;
};