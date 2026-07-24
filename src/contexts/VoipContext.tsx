import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

// Usando require dinâmico/importação para evitar problemas de SSR caso exista
import * as JsSIP from 'jssip';

interface VoipContextType {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastError: string | null;
  lastCheckedAt: number | null;
  hasConfig: boolean;
  session: any | null; // JsSIP.RTCSession
  incomingSession: any | null;
  isMuted: boolean;
  isOnHold: boolean;
  dialerOpen: boolean;
  setDialerOpen: (val: boolean) => void;
  connect: (config: any) => void;
  disconnect: () => void;
  reloadConfig: () => Promise<void>;
  makeCall: (target: string, isVideo?: boolean) => void;
  answerCall: () => void;
  rejectCall: () => void;
  hangup: () => void;
  toggleMute: () => void;
  toggleHold: () => void;
}

const VoipContext = createContext<VoipContextType | null>(null);

export function VoipProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<VoipContextType['status']>('disconnected');
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [hasConfig, setHasConfig] = useState(false);
  const[session, setSession] = useState<any | null>(null);
  const [incomingSession, setIncomingSession] = useState<any | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const[dialerOpen, setDialerOpen] = useState(false);

  const uaRef = useRef<any>(null);
  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  // Inicializa as tags de áudio invisíveis na DOM
  useEffect(() => {
    localAudioRef.current = new Audio();
    localAudioRef.current.muted = true; // Não queremos ouvir nosso próprio eco
    remoteAudioRef.current = new Audio();
    remoteAudioRef.current.autoplay = true;
  },[]);

  const connect = (config: any) => {
    if (!config.server || !config.username || !config.password) {
      setLastError('Configurações SIP incompletas (servidor, usuário ou senha ausentes).');
      setStatus('error');
      toast.error('Configurações SIP incompletas.');
      return;
    }

    setLastError(null);
    setStatus('connecting');
    setLastCheckedAt(Date.now());

    const wsUri = config.wsUri || `wss://${config.server}:7443`;
    const socket = new JsSIP.WebSocketInterface(wsUri);
    
    const ua = new JsSIP.UA({
      sockets: [socket],
      uri: `sip:${config.username}@${config.server}`,
      password: config.password,
      display_name: config.displayName || 'Lead Seller Agent',
      register: true,
      session_timers: false,
    });

    ua.on('connected', () => console.log('VoIP WebSocket Conectado'));
    ua.on('disconnected', (e) => {
      console.warn('VoIP WebSocket Desconectado', e);
      setStatus('disconnected');
      setLastError('Conexão WebSocket SIP encerrada.');
      setLastCheckedAt(Date.now());
    });

    ua.on('registered', () => {
      setStatus('connected');
      setLastError(null);
      setLastCheckedAt(Date.now());
      toast.success('VoIP Conectado com sucesso');
    });

    ua.on('registrationFailed', (e) => {
      setStatus('error');
      const reason = e?.cause || 'Erro desconhecido';
      setLastError(`Falha no registro SIP: ${reason}`);
      setLastCheckedAt(Date.now());
      toast.error(`Falha no registro SIP: ${reason}`);
    });

    // Lidando com chamadas (Recebidas e Feitas)
    ua.on('newRTCSession', (data) => {
      const { session: newSession, originator } = data;

      if (originator === 'remote') {
        // Recebendo chamada
        setIncomingSession(newSession);
        setDialerOpen(true); // Abre o discador para mostrar quem liga
        
        newSession.on('ended', () => setIncomingSession(null));
        newSession.on('failed', () => setIncomingSession(null));
      }

      newSession.on('accepted', () => {
        setSession(newSession);
        setIncomingSession(null);
      });

      newSession.on('ended', () => handleSessionEnd());
      newSession.on('failed', () => handleSessionEnd());
      
      // Conectando o stream de áudio quando estabelecido
      newSession.on('peerconnection', (e: any) => {
        e.peerconnection.addEventListener('track', (event: any) => {
          if (remoteAudioRef.current && event.streams[0]) {
            remoteAudioRef.current.srcObject = event.streams[0];
          }
        });
      });
    });

    ua.start();
    uaRef.current = ua;
  };

  const disconnect = () => {
    if (uaRef.current) {
      uaRef.current.stop();
      uaRef.current = null;
    }
    setStatus('disconnected');
  };

  const handleSessionEnd = () => {
    setSession(null);
    setIncomingSession(null);
    setIsMuted(false);
    setIsOnHold(false);
  };

  const makeCall = (target: string, isVideo = false) => {
    if (!uaRef.current || status !== 'connected') {
      toast.error('VoIP não está conectado.');
      return;
    }

    const options = {
      mediaConstraints: { audio: true, video: isVideo },
      pcConfig: { rtcpMuxPolicy: 'require' }
    };

    uaRef.current.call(`sip:${target}`, options);
    setDialerOpen(true);
  };

  const answerCall = () => {
    if (incomingSession) {
      incomingSession.answer({
        mediaConstraints: { audio: true, video: false }
      });
    }
  };

  const rejectCall = () => {
    if (incomingSession) {
      incomingSession.terminate();
      setIncomingSession(null);
    }
  };

  const hangup = () => {
    if (session) {
      session.terminate();
    } else if (incomingSession) {
      incomingSession.terminate();
    }
    handleSessionEnd();
  };

  const toggleMute = () => {
    if (session) {
      if (isMuted) {
        session.unmute();
      } else {
        session.mute();
      }
      setIsMuted(!isMuted);
    }
  };

  const toggleHold = () => {
    if (session) {
      if (isOnHold) {
        session.unhold();
      } else {
        session.hold();
      }
      setIsOnHold(!isOnHold);
    }
  };

  // Carrega configurações SIP salvas ao iniciar o app.
  // Qualquer usuário autenticado do tenant pode conectar (backend resolve
  // owner_id via user_account_access). Polling revalida periodicamente para
  // capturar mudanças feitas em outro dispositivo/sessão.
  const lastCfgSigRef = useRef<string>('');

  const reloadConfig = React.useCallback(async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;
      const { fetchSipConfig } = await import('@/lib/sipConfig');
      let cfg: any = null;
      try {
        cfg = await fetchSipConfig();
      } catch (e: any) {
        setLastError(e?.message || 'Falha ao consultar credenciais SIP.');
        setLastCheckedAt(Date.now());
        // Só marca error se ainda não estamos conectados (não derrubar UA ativo).
        setStatus((s) => (s === 'connected' ? s : 'error'));
        return;
      }
      setLastCheckedAt(Date.now());
      if (!cfg || !cfg.server || !cfg.username) {
        setHasConfig(false);
        if (uaRef.current) { try { uaRef.current.stop(); } catch {} uaRef.current = null; }
        setStatus('disconnected');
        setLastError('Nenhum ramal SIP configurado para este tenant.');
        lastCfgSigRef.current = '';
        return;
      }
      setHasConfig(true);
      const sig = `${cfg.server}|${cfg.username}|${cfg.password}|${cfg.ws_uri || ''}`;
      const changed = sig !== lastCfgSigRef.current;
      const needsConnect = !uaRef.current || status === 'disconnected' || status === 'error' || changed;
      if (needsConnect) {
        lastCfgSigRef.current = sig;
        if (uaRef.current) { try { uaRef.current.stop(); } catch {} uaRef.current = null; }
        connect({
          server: cfg.server,
          port: cfg.port,
          wsUri: cfg.ws_uri,
          username: cfg.username,
          password: cfg.password,
          displayName: cfg.display_name,
        });
      }
    } catch (e: any) {
      console.error('SIP reloadConfig failed', e);
      setLastError(e?.message || 'Erro inesperado ao recarregar SIP.');
      setLastCheckedAt(Date.now());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    try { localStorage.removeItem('sipConfig'); } catch {}
    reloadConfig();

    const onReload = () => {
      lastCfgSigRef.current = '';
      if (uaRef.current) { try { uaRef.current.stop(); } catch {} uaRef.current = null; }
      setStatus('disconnected');
      setTimeout(() => { reloadConfig(); }, 300);
    };
    window.addEventListener('sip:reload', onReload);

    // Polling: revalida credenciais e estado a cada 60s.
    const interval = window.setInterval(() => { reloadConfig(); }, 60_000);

    // Reconecta ao voltar a foco (mudança de aba/mobile).
    const onFocus = () => { reloadConfig(); };
    window.addEventListener('focus', onFocus);

    return () => {
      window.removeEventListener('sip:reload', onReload);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(interval);
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  return (
    <VoipContext.Provider
      value={{
        status,
        lastError,
        lastCheckedAt,
        hasConfig,
        session,
        incomingSession,
        isMuted,
        isOnHold,
        dialerOpen,
        setDialerOpen,
        connect,
        disconnect,
        reloadConfig,
        makeCall,
        answerCall,
        rejectCall,
        hangup,
        toggleMute,
        toggleHold
      }}
    >
      {children}
    </VoipContext.Provider>
  );
}

export const useVoip = () => {
  const ctx = useContext(VoipContext);
  if (!ctx) throw new Error('useVoip deve ser usado dentro de VoipProvider');
  return ctx;
};
