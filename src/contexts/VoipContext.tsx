import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { usePlatformOwner } from '@/hooks/usePlatformOwner';
import { getActiveOwnerId } from '@/lib/chatTenantScope';
import { fetchYeastarWebrtcRegisterInfo, getSipHostname, normalizeSipServer, normalizeSipWsUri } from '@/lib/sipConfig';

// Usando require dinâmico/importação para evitar problemas de SSR caso exista
import * as JsSIP from 'jssip';

type VoipStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type VoipTestResult = { status: VoipStatus; error: string | null; wsUri?: string };

interface VoipContextType {
  status: VoipStatus;
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
  testConnection: (config?: any) => Promise<VoipTestResult>;
  makeCall: (target: string, isVideo?: boolean) => void;
  answerCall: () => void;
  rejectCall: () => void;
  hangup: () => void;
  toggleMute: () => void;
  toggleHold: () => void;
}

const VoipContext = createContext<VoipContextType | null>(null);

export function VoipProvider({ children }: { children: React.ReactNode }) {
  const { user, access, accessLoading, tenantResolved } = useAuth();
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
  const lastErrorRef = useRef<string | null>(null);
  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const sipScope = React.useMemo(() => {
    const ownerId = getActiveOwnerId(access?.owner_id, user?.id);
    return ownerId
      ? { owner_id: ownerId, sub_company_id: access?.sub_company_id ?? null }
      : null;
  }, [access?.owner_id, access?.sub_company_id, user?.id]);
  const sipScopeKey = sipScope ? `${sipScope.owner_id}:${sipScope.sub_company_id ?? 'root'}` : '';

  // Inicializa as tags de áudio invisíveis na DOM
  useEffect(() => {
    localAudioRef.current = new Audio();
    localAudioRef.current.muted = true; // Não queremos ouvir nosso próprio eco
    remoteAudioRef.current = new Audio();
    remoteAudioRef.current.autoplay = true;
  },[]);

  const updateLastError = (message: string | null) => {
    lastErrorRef.current = message;
    setLastError(message);
  };

  const describeSipFailure = (event: any, wsUri: string) => {
    const cause = String(event?.cause || event?.reason || event?.message || '').trim();
    const statusCode = event?.response?.status_code || event?.response?.statusCode;
    if (statusCode === 401) {
      return 'PBX Yeastar recusou a autenticação WebRTC (SIP 401). Para navegador, use o usuário Linkus e a assinatura/secret do Linkus SDK; a senha SIP que funciona no MicroSIP pode não registrar via WSS.';
    }
    if (statusCode === 403) {
      return 'PBX Yeastar bloqueou o registro (SIP 403). Confira Register Name/Auth ID, permissão WebRTC/Linkus da extensão e se o login Linkus pertence ao mesmo ramal.';
    }
    if (statusCode) return `Registro SIP recusado pelo PBX (SIP ${statusCode}${cause ? ` · ${cause}` : ''}).`;
    if (/connection|socket|network|timeout|closed/i.test(cause)) {
      return `Falha no WebSocket SIP (${wsUri}). Confirme se o WSS está liberado e acessível pelo navegador.`;
    }
    return cause ? `Falha no registro SIP: ${cause}` : `Falha no registro SIP usando ${wsUri}.`;
  };

  const connect = (config: any, opts: { silent?: boolean; onRegistered?: () => void; onFailed?: (message: string) => void } = {}) => {
    const server = normalizeSipServer(config.server);
    if (!server || !config.username || !config.password) {
      updateLastError('Configurações SIP incompletas (servidor, usuário ou senha ausentes).');
      setStatus('error');
      if (!opts.silent) toast.error('Configurações SIP incompletas.');
      opts.onFailed?.('Configurações SIP incompletas (servidor, usuário ou senha ausentes).');
      return;
    }

    updateLastError(null);
    setStatus('connecting');
    setLastCheckedAt(Date.now());
    if (uaRef.current) {
      try { uaRef.current.stop(); } catch {}
      uaRef.current = null;
    }

    // Yeastar Cloud/P-Series expõe o webphone em HTTPS/443 no caminho /ws.
    // A porta :8089 é comum em instalações locais, mas falha na Mult Seguros.
    const authUser = String(config.webrtc?.registername || config.authUser || config.auth_username || config.authUsername || config.username).trim();
    const isYeastar = server.toLowerCase().includes('yeastar');
    const wsUri = normalizeSipWsUri(server, config.wsUri, isYeastar ? config.username : undefined);
    const socket = new JsSIP.WebSocketInterface(wsUri);
    let registeredOnce = false;
    const sipHost = getSipHostname(server) || server;
    // Domínio SIP (MicroSIP: campo "Domínio", ex.: 187.60.60.75). Quando informado,
    // é usado no AOR/Contact e como realm de autenticação — o WSS continua no host do PBX.
    const sipDomain = getSipHostname(config.sipDomain || config.sip_domain || config.domain) || sipHost;
    const contactUri = isYeastar ? `sip:${config.username}@${sipDomain};nat;webclient` : undefined;
    const passwordOrHa1 = config.webrtc?.registerpassword || config.password;
    const realm = config.webrtc?.realm || sipDomain;

    const ua = new JsSIP.UA({
      sockets: [socket],
      uri: `sip:${config.username}@${sipDomain}`,
      authorization_user: authUser || config.username,
      ...(config.webrtc?.registerpassword ? { ha1: passwordOrHa1, realm } : { password: passwordOrHa1 }),
      ...(contactUri ? { contact_uri: contactUri, user_agent: 'WebClient', register_expires: 1800 } : {}),
      display_name: config.displayName || 'Lead Seller Agent',
      register: true,
      session_timers: false,
    });

    ua.on('connected', () => console.log('VoIP WebSocket Conectado'));
    ua.on('disconnected', (e) => {
      console.warn('VoIP WebSocket Desconectado', e);
      const message = registeredOnce ? 'Conexão WebSocket SIP encerrada.' : describeSipFailure(e, wsUri);
      setStatus(registeredOnce ? 'disconnected' : 'error');
      updateLastError(message);
      setLastCheckedAt(Date.now());
      if (!registeredOnce) opts.onFailed?.(message);
    });

    ua.on('registered', () => {
      registeredOnce = true;
      setStatus('connected');
      updateLastError(null);
      setLastCheckedAt(Date.now());
      if (!opts.silent) toast.success('VoIP Conectado com sucesso');
      opts.onRegistered?.();
    });

    ua.on('registrationFailed', (e) => {
      setStatus('error');
      const message = describeSipFailure(e, wsUri);
      updateLastError(message);
      setLastCheckedAt(Date.now());
      if (!opts.silent) toast.error(message);
      opts.onFailed?.(message);
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
      if (!user?.id) return;
      if (!tenantResolved || accessLoading) {
        setLastCheckedAt(Date.now());
        return;
      }
      const { fetchSipConfig } = await import('@/lib/sipConfig');
      let cfg: any = null;
      try {
        cfg = await fetchSipConfig(sipScope ?? { owner_id: user.id, sub_company_id: null });
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
        setLastError('Nenhum ramal SIP configurado para esta Empresa/Sub-empresa.');
        lastCfgSigRef.current = '';
        return;
      }
      setHasConfig(true);
      const normalizedServer = normalizeSipServer(cfg.server);
      const normalizedWsUri = normalizeSipWsUri(normalizedServer, cfg.ws_uri, cfg.username);
      let webrtc = cfg.webrtc ?? null;
      if (!webrtc && (cfg.webrtc_secret_configured || cfg.webrtc_secret)) {
        try { webrtc = await fetchYeastarWebrtcRegisterInfo(sipScope ?? { owner_id: user.id, sub_company_id: null }, cfg); } catch (e) { console.warn('Yeastar WebRTC register info unavailable', e); }
      }
      const authUser = webrtc?.registername || cfg.auth_username || cfg.authUsername || cfg.authUser || cfg.username;
      const sipDomain = (cfg as any).sip_domain ?? null;
      const sig = `${normalizedServer}|${sipDomain ?? ''}|${cfg.username}|${authUser}|${cfg.password}|${normalizedWsUri}|${webrtc?.registerpassword ?? ''}|${webrtc?.realm ?? ''}`;
      const changed = sig !== lastCfgSigRef.current;
      const needsConnect = !uaRef.current || status === 'disconnected' || status === 'error' || changed;
      if (needsConnect) {
        lastCfgSigRef.current = sig;
        if (uaRef.current) { try { uaRef.current.stop(); } catch {} uaRef.current = null; }
        connect({
          server: normalizedServer,
          port: cfg.port,
          wsUri: normalizedWsUri,
          username: cfg.username,
          authUser,
          sipDomain,
          password: cfg.password,
          webrtc,
          displayName: cfg.display_name,
        });
      }
    } catch (e: any) {
      console.error('SIP reloadConfig failed', e);
      setLastError(e?.message || 'Erro inesperado ao recarregar SIP.');
      setLastCheckedAt(Date.now());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, user?.id, tenantResolved, accessLoading, sipScope?.owner_id, sipScope?.sub_company_id]);
  const reloadConfigRef = useRef(reloadConfig);

  useEffect(() => {
    reloadConfigRef.current = reloadConfig;
  }, [reloadConfig]);

  // Toast on status transitions (skip initial mount) so operators see
  // realtime feedback across all pages that mount the provider.
  const prevStatusRef = useRef<VoipContextType['status'] | null>(null);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (prev === null || prev === status) return;
    if (status === 'connected') toast.success('VoIP conectado');
    else if (status === 'connecting') toast.message('VoIP conectando…');
    else if (status === 'error') toast.error(`VoIP falhou${lastError ? `: ${lastError}` : ''}`);
    else if (status === 'disconnected') toast.message('VoIP desconectado');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const testConnection = React.useCallback(async (config?: any) => {
    lastCfgSigRef.current = '';
    if (uaRef.current) { try { uaRef.current.stop(); } catch {} uaRef.current = null; }
    setStatus('connecting');
    if (config?.server && config?.username && config?.password) {
      setHasConfig(true);
      const normalizedServer = normalizeSipServer(config.server);
      const wsUri = normalizeSipWsUri(normalizedServer, config.wsUri, config.username);
      let registerConfig = { ...config, server: normalizedServer, wsUri };
      if (!registerConfig.webrtc && (config.webrtc_username || config.webrtc_secret || config.webrtc_secret_configured)) {
        try {
          registerConfig = {
            ...registerConfig,
            webrtc: await fetchYeastarWebrtcRegisterInfo(sipScope ?? {}, registerConfig),
          };
        } catch (e: any) {
          const message = e?.message || 'Falha ao obter credenciais WebRTC Yeastar.';
          setStatus('error');
          updateLastError(message);
          return { status: 'error' as VoipStatus, error: message, wsUri };
        }
      }
      return new Promise<VoipTestResult>((resolve) => {
        let done = false;
        const finish = (result: VoipTestResult) => {
          if (done) return;
          done = true;
          window.clearTimeout(timer);
          resolve(result);
        };
        const timer = window.setTimeout(() => {
          const message = `Tempo esgotado aguardando registro SIP em ${wsUri}.`;
          setStatus('error');
          updateLastError(message);
          finish({ status: 'error', error: message, wsUri });
        }, 15_000);
        connect(registerConfig, {
          silent: true,
          onRegistered: () => finish({ status: 'connected', error: null, wsUri }),
          onFailed: (message) => finish({ status: 'error', error: message, wsUri }),
        });
      });
    } else {
      await reloadConfig();
    }
    const deadline = Date.now() + 15_000;
    return new Promise<VoipTestResult>((resolve) => {
      const tick = () => {
        const s = (uaRef.current && (uaRef.current.isRegistered?.() ? 'connected' : null)) as any;
        if (s === 'connected') return resolve({ status: 'connected', error: null });
        if (Date.now() > deadline) return resolve({ status: (uaRef.current ? 'error' : 'disconnected'), error: lastErrorRef.current });
        setTimeout(tick, 400);
      };
      tick();
    });
  }, [reloadConfig]);

  useEffect(() => {
    if (!tenantResolved || accessLoading || !sipScopeKey) return;
    lastCfgSigRef.current = '';
    if (uaRef.current) { try { uaRef.current.stop(); } catch {} uaRef.current = null; }
    setStatus('disconnected');
    void reloadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantResolved, accessLoading, sipScopeKey]);

  useEffect(() => {
    try { localStorage.removeItem('sipConfig'); } catch {}
    reloadConfigRef.current();

    const onReload = () => {
      lastCfgSigRef.current = '';
      if (uaRef.current) { try { uaRef.current.stop(); } catch {} uaRef.current = null; }
      setStatus('disconnected');
      setTimeout(() => { reloadConfigRef.current(); }, 300);
    };
    window.addEventListener('sip:reload', onReload);

    // Polling com backoff: 60s base; dobra a cada falha consecutiva
    // (max 300s) para reduzir carga quando SIP está offline. Reseta assim
    // que voltarmos a 'connected'.
    let failStreak = 0;
    let timer: number | null = null;
    const schedule = () => {
      const delay = Math.min(300_000, 60_000 * Math.pow(2, failStreak));
      timer = window.setTimeout(async () => {
        await reloadConfigRef.current();
        // status é lido via ref implícita — usamos snapshot atual do UA.
        const registered = !!(uaRef.current && uaRef.current.isRegistered?.());
        failStreak = registered ? 0 : Math.min(failStreak + 1, 3);
        schedule();
      }, delay);
    };
    schedule();

    // Reconecta ao voltar a foco e força reset do backoff.
    const onFocus = () => { failStreak = 0; reloadConfigRef.current(); };
    window.addEventListener('focus', onFocus);

    return () => {
      window.removeEventListener('sip:reload', onReload);
      window.removeEventListener('focus', onFocus);
      if (timer) window.clearTimeout(timer);
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
        testConnection,
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
