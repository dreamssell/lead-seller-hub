import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

export type ParticipantRole = 'host' | 'moderator' | 'participant';

export interface Participant {
  id: string;
  name: string;
  is_guest: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'left';
  role: ParticipantRole;
  media_status: {
    audio: boolean;
    video: boolean;
  };
}

interface VideoCallContextType {
  status: 'idle' | 'calling' | 'connected' | 'ended' | 'waiting_approval' | 'rejected';
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  participants: Participant[];
  userRole: ParticipantRole;
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
  promoteParticipant: (participantId: string) => Promise<void>;
  regenerateToken: () => Promise<string | null>;
  lockRoom: (locked: boolean) => Promise<void>;
  blacklistParticipant: (name: string) => Promise<void>;
}

const VideoCallContext = createContext<VideoCallContextType | null>(null);

export function VideoCallProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<VideoCallContextType['status']>('idle');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [userRole, setUserRole] = useState<ParticipantRole>('participant');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [currentParticipantId, setCurrentParticipantId] = useState<string | null>(null);
  
  const logVideoError = async (message: string, context: string, error?: any) => {
    console.error(`[VideoCall Error] ${context}:`, message, error);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('video_error_logs').insert({
        room_id: roomId || null,
        user_id: user?.id || null,
        user_name: localStorage.getItem('video_user_name') || 'Desconhecido',
        error_message: message,
        error_stack: error?.stack || JSON.stringify(error),
        context: context,
        browser_info: {
          userAgent: navigator.userAgent,
          language: navigator.language,
          platform: (navigator as any).platform,
          url: window.location.href
        }
      });
    } catch (logErr) {
      console.error('Falha ao registrar log de erro no banco:', logErr);
    }
  };

  
  const channelRef = useRef<RealtimeChannel | null>(null);

  const isAdmin = userRole === 'host' || userRole === 'moderator';

  const cleanup = useCallback(() => {
    localStream?.getTracks().forEach(track => track.stop());
    setLocalStream(null);
    setRemoteStream(null);
    setParticipants([]);
    setUserRole('participant');
    setRoomId(null);
    setCurrentParticipantId(null);
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, [localStream]);

  const startCall = async (isGroup: boolean, roomId: string, userName: string) => {
    try {
      cleanup();
      setRoomId(roomId);
      setStatus('calling');
      
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) {
        await logVideoError('Erro ao obter usuário auth', 'start_call', authError);
      }
      
      const isGuest = !user;

      const { data: room, error: roomError } = await supabase
        .from('video_rooms')
        .select('*')
        .eq('id', roomId)
        .single();

      if (roomError || !room) {
        const msg = roomError?.message || 'Sala não encontrada ou inválida.';
        await logVideoError(msg, 'start_call_room_fetch', roomError);
        toast.error('Sala não encontrada ou inválida.');
        setStatus('idle');
        return;
      }

      if (room.is_locked && user?.id !== room.host_id) {
        toast.error('Esta sala está trancada pelo anfitrião.');
        setStatus('idle');
        return;
      }

      if (room.blacklist?.includes(userName) && user?.id !== room.host_id) {
        toast.error('Seu acesso a esta sala foi bloqueado.');
        setStatus('idle');
        return;
      }

      const isHost = user?.id === room.host_id;
      const role: ParticipantRole = isHost ? 'host' : 'participant';
      setUserRole(role);


      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
      } catch (mediaErr: any) {
        await logVideoError(`Erro de mídia: ${mediaErr.name} - ${mediaErr.message}`, 'media_access', mediaErr);
        toast.error('Erro ao acessar câmera ou microfone.');
        setStatus('idle');
        return;
      }

      const settings = room.settings as any;
      const initialStatus = (isGuest && settings?.guest_approval_required && !isHost) ? 'pending' : 'approved';

      const { data: participant, error: pError } = await supabase
        .from('video_participants')
        .insert({
          room_id: roomId,
          user_id: user?.id || null,
          name: userName,
          is_guest: isGuest,
          status: initialStatus,
          role: role,
          media_status: { audio: true, video: true }
        })
        .select()
        .single();

      if (pError) {
        await logVideoError(`Erro ao inserir participante: ${pError.message}`, 'participant_insert', pError);
        throw pError;
      }

      setCurrentParticipantId(participant.id);

      if (participant.status === 'pending') {
        setStatus('waiting_approval');
      } else {
        setStatus('calling');
      }

      const channel = supabase.channel(`room:${roomId}`)
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'video_participants',
          filter: `room_id=eq.${roomId}`
        }, (payload) => {
          if (payload.eventType === 'INSERT') {
            const newP = payload.new as any;
            setParticipants(prev => [...prev, newP as Participant]);
            if (isAdmin && newP.status === 'pending') {
              toast.info(`${newP.name} solicitou entrada na reunião.`, {
                action: {
                  label: 'Ver',
                  onClick: () => {
                    // Aqui poderia abrir a aba de participantes
                  }
                }
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedP = payload.new as any;
            setParticipants(prev => prev.map(p => p.id === updatedP.id ? updatedP as Participant : p));
            
            if (updatedP.id === participant.id) {
              if (updatedP.status === 'approved') {
                setStatus('connected');
                toast.success('Sua entrada foi aprovada!');
              } else if (updatedP.status === 'rejected') {
                setStatus('rejected');
                toast.error(updatedP.is_banned ? 'Você foi banido da reunião.' : 'Sua entrada foi recusada.');
                cleanup();
              }
              if (updatedP.role !== userRole) {
                setUserRole(updatedP.role as ParticipantRole);
                toast.info(`Sua permissão foi alterada para: ${updatedP.role}`);
              }
            }
          }
        })

        .on('broadcast', { event: 'mute_request' }, (payload) => {
          if (payload.payload.participantId === participant.id) {
            localStream?.getAudioTracks().forEach(track => track.enabled = false);
            setIsMuted(true);
            toast.info('Você foi silenciado por um moderador.');
            updateMediaStatus({ audio: false });
          }
        })
        .subscribe();

      channelRef.current = channel;

      const { data: initialParticipants } = await supabase
        .from('video_participants')
        .select('*')
        .eq('room_id', roomId)
        .neq('status', 'left');
      
      if (initialParticipants) {
        setParticipants(initialParticipants.map(p => ({
          ...p,
          role: (p.role as ParticipantRole) || 'participant',
          status: p.status as Participant['status'],
          media_status: (p.media_status as any) || { audio: true, video: true }
        })));
      }

      if (participant.status === 'approved') {
        setStatus('connected');
      }

    } catch (err: any) {
      await logVideoError(err.message || 'Erro desconhecido ao iniciar chamada', 'start_call_catch', err);
      toast.error('Erro ao conectar.');
      setStatus('idle');
    }

  };

  const endCall = async () => {
    if (currentParticipantId) {
      await supabase.from('video_participants').update({ status: 'left' }).eq('id', currentParticipantId);
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
        .update({ media_status: { ...current?.media_status, ...update } })
        .eq('id', currentParticipantId);
    }
  };

  const approveParticipant = async (id: string) => {
    const target = participants.find(p => p.id === id);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('video_participants').update({ status: 'approved' }).eq('id', id);
    await supabase.rpc('log_video_action', {
      p_room_id: roomId,
      p_target_name: target?.name || 'Desconhecido',
      p_target_user_id: null,
      p_action: 'approved',
      p_performed_by: user?.id
    });
    toast.success('Participante aprovado.');
  };

  const rejectParticipant = async (id: string) => {
    const target = participants.find(p => p.id === id);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('video_participants').update({ status: 'rejected' }).eq('id', id);
    await supabase.rpc('log_video_action', {
      p_room_id: roomId,
      p_target_name: target?.name || 'Desconhecido',
      p_target_user_id: null,
      p_action: 'rejected',
      p_performed_by: user?.id
    });
    toast.info('Participante recusado.');
  };

  const blacklistParticipant = async (name: string) => {
    if (!roomId) return;
    const { data: room } = await supabase.from('video_rooms').select('blacklist').eq('id', roomId).single();
    const newList = Array.from(new Set([...(room?.blacklist || []), name]));
    await supabase.from('video_rooms').update({ blacklist: newList }).eq('id', roomId);
  };

  const kickParticipant = async (id: string) => {
    const target = participants.find(p => p.id === id);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('video_participants').update({ status: 'rejected', is_banned: true }).eq('id', id);
    
    if (target?.name) {
      await blacklistParticipant(target.name);
    }

    await supabase.rpc('log_video_action', {
      p_room_id: roomId,
      p_target_name: target?.name || 'Desconhecido',
      p_target_user_id: null,
      p_action: 'kicked',
      p_performed_by: user?.id
    });
    toast.error(`${target?.name} foi expulso e banido.`);
  };

  const lockRoom = async (locked: boolean) => {
    if (!roomId) return;
    const { error } = await supabase.from('video_rooms').update({ is_locked: locked }).eq('id', roomId);
    if (!error) {
      toast.success(locked ? 'Sala bloqueada para novas entradas.' : 'Sala desbloqueada.');
    }
  };


  const muteParticipant = async (id: string) => {
    const target = participants.find(p => p.id === id);
    const { data: { user } } = await supabase.auth.getUser();
    if (channelRef.current) {
      channelRef.current.send({ type: 'broadcast', event: 'mute_request', payload: { participantId: id } });
      await supabase.rpc('log_video_action', {
        p_room_id: roomId,
        p_target_name: target?.name || 'Desconhecido',
        p_target_user_id: null,
        p_action: 'muted',
        p_performed_by: user?.id
      });
      toast.info('Solicitação de silenciamento enviada.');
    }
  };

  const promoteParticipant = async (id: string) => {
    await supabase.from('video_participants').update({ role: 'moderator' }).eq('id', id);
    toast.success('Participante promovido a moderador.');
  };

  const regenerateToken = async () => {
    if (!roomId) return null;
    const newToken = Math.random().toString(36).substring(2, 15);
    const { error } = await supabase.from('video_rooms').update({ invite_token: newToken }).eq('id', roomId);
    if (error) {
      toast.error('Erro ao regenerar token.');
      return null;
    }
    toast.success('Token regenerado com sucesso!');
    return newToken;
  };

  return (
    <VideoCallContext.Provider value={{ 
      status, localStream, remoteStream, isMuted, isVideoOff, 
      participants, userRole, isAdmin, roomId,
      startCall, endCall, toggleMute, toggleVideo,
      approveParticipant, rejectParticipant, kickParticipant, muteParticipant, promoteParticipant,
      regenerateToken, lockRoom, blacklistParticipant
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