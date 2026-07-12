import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  startCallLog,
  markCallAnswered,
  endCallLog,
  uploadCallRecording,
} from '@/lib/callHistory';

export interface WavoipCallMeta {
  customerId?: string | null;
  leadId?: string | null;
  contactName?: string | null;
  ownerId?: string | null;
  subCompanyId?: string | null;
  userId?: string | null;
}

/**
 * WavoipWebphoneContext
 *
 * Carrega dinamicamente o SDK oficial @wavoip/wavoip-webphone (ESM via CDN),
 * registra os device tokens da sub-empresa ativa e expõe uma API programática
 * para realizar chamadas WhatsApp pelo tronco Wavoip.
 *
 * Persistência: os devices são armazenados na tabela `wavoip_devices` escopados
 * por (owner_id, sub_company_id). Cada sub-empresa tem suas próprias credenciais.
 *
 * Fix de "No device available": após `render()`, fazemos `device.add(token, true)`
 * E em seguida `device.enable(token)` — sem o `enable`, o widget reporta que não
 * há dispositivos disponíveis mesmo com o token cadastrado.
 */

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@wavoip/wavoip-webphone@latest/dist/index.es.js';
const LEGACY_STORAGE_KEY = 'wavoipWebphoneConfig.v1';

export interface WavoipDevice {
  id: string;
  token: string;
  label: string;
  phone?: string;
  added_at: string;
  last_validated_at?: string | null;
  last_validation_status?: string | null;
  last_validation_error?: string | null;
}

export interface WavoipWebphoneConfig {
  enabled: boolean;
  defaultDeviceId?: string;
  devices: WavoipDevice[];
}

type Status = 'idle' | 'loading' | 'ready' | 'error';

type WavoipEventSource = 'call' | 'global';

export interface WavoipDeviceSnapshot {
  token?: string;
  enabled?: boolean;
  status?: string | null;
}

export function isWavoipDeviceUnavailable(device: WavoipDeviceSnapshot | null | undefined): boolean {
  const status = String(device?.status ?? '').toLowerCase();
  return device?.enabled === false || /failed|failure|disconnect|connection_lost|offline|disabled|unregistered|stopped/.test(status);
}

export function needsWavoipDeviceRecovery(configuredTokens: string[], registeredDevices: WavoipDeviceSnapshot[]): boolean {
  const byToken = new Map(registeredDevices.map((device) => [device.token, device]));
  return configuredTokens.some((token) => {
    const registered = byToken.get(token);
    return !registered || isWavoipDeviceUnavailable(registered);
  });
}

export function shouldAcceptWavoipEventForCurrentCall(
  payloadCallId: string | null,
  currentCallId: string | null,
  source: WavoipEventSource,
): boolean {
  if (source === 'call') return !payloadCallId || !currentCallId || payloadCallId === currentCallId;
  if (!payloadCallId) return false;
  return !currentCallId || payloadCallId === currentCallId;
}

export interface ValidationResult {
  ok: boolean;
  message: string;
  registered: string[];
  missing: string[];
  raw?: any;
}

interface Ctx {
  status: Status;
  error: string | null;
  config: WavoipWebphoneConfig;
  scope: { sub_company_id: string | null; owner_id: string | null };
  addDevice: (token: string, label: string, phone?: string) => Promise<WavoipDevice | null>;
  removeDevice: (id: string) => Promise<void>;
  setDefaultDevice: (id: string) => Promise<void>;
  setEnabled: (enabled: boolean) => void;
  reload: () => Promise<void>;
  openDialer: () => void;
  callWhatsApp: (phone: string, deviceId?: string, meta?: WavoipCallMeta) => Promise<boolean>;
  validateConnection: () => Promise<ValidationResult>;
  isValidating: boolean;
  lastValidation: ValidationResult | null;
}

const WavoipWebphoneCtx = createContext<Ctx | null>(null);

const defaultConfig: WavoipWebphoneConfig = { enabled: false, devices: [] };

function loadScriptOnce(src: string): Promise<any> {
  // ESM dynamic import — vite-ignore para evitar bundling
  return import(/* @vite-ignore */ src);
}

export function WavoipWebphoneProvider({ children }: { children: React.ReactNode }) {
  const { access, user } = useAuth();
  const sub_company_id = access?.sub_company_id || null;
  const owner_id = access?.owner_id || (user?.id as string | undefined) || null;

  const [config, setConfig] = useState<WavoipWebphoneConfig>(defaultConfig);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [lastValidation, setLastValidation] = useState<ValidationResult | null>(null);
  const webphoneRef = useRef<any>(null);
  const registeredTokens = useRef<Set<string>>(new Set());
  const lineHeartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearLineHeartbeat = useCallback(() => {
    if (lineHeartbeatRef.current) {
      clearInterval(lineHeartbeatRef.current);
      lineHeartbeatRef.current = null;
    }
  }, []);

  useEffect(() => () => clearLineHeartbeat(), [clearLineHeartbeat]);

  // ---------- Persistência por sub-empresa ----------
  const loadFromDb = useCallback(async () => {
    if (!owner_id) { setConfig(defaultConfig); return; }
    let query = supabase
      .from('wavoip_devices')
      .select('*')
      .eq('owner_id', owner_id);
    if (sub_company_id) query = query.eq('sub_company_id', sub_company_id);
    else query = query.is('sub_company_id', null);

    const { data, error: err } = await query.order('created_at', { ascending: true });
    if (err) {
      console.error('[Wavoip] load error', err);
      return;
    }
    const devices: WavoipDevice[] = (data || []).map((r: any) => ({
      id: r.id,
      token: r.token,
      label: r.label,
      phone: r.phone || undefined,
      added_at: r.created_at,
      last_validated_at: r.last_validated_at,
      last_validation_status: r.last_validation_status,
      last_validation_error: r.last_validation_error,
    }));
    const def = (data || []).find((r: any) => r.is_default);
    setConfig({
      enabled: devices.length > 0,
      defaultDeviceId: def?.id || devices[0]?.id,
      devices,
    });

    // Migração one-shot: importa devices legados do localStorage para o DB se vazio
    if (devices.length === 0) {
      try {
        const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (raw) {
          const legacy = JSON.parse(raw);
          if (Array.isArray(legacy?.devices) && legacy.devices.length > 0) {
            for (const d of legacy.devices) {
              await supabase.from('wavoip_devices').insert({
                owner_id, sub_company_id, token: d.token, label: d.label || 'WhatsApp',
                phone: d.phone || null, is_default: d.id === legacy.defaultDeviceId,
              });
            }
            localStorage.removeItem(LEGACY_STORAGE_KEY);
            await loadFromDb();
          }
        }
      } catch (e) { console.warn('[Wavoip] legacy migration skipped', e); }
    }
  }, [owner_id, sub_company_id]);

  useEffect(() => { loadFromDb(); }, [loadFromDb]);

  const addDevice = useCallback(async (token: string, label: string, phone?: string): Promise<WavoipDevice | null> => {
    if (!owner_id) { toast.error('Faça login para cadastrar devices Wavoip.'); return null; }
    const cleanToken = token.trim();
    if (!cleanToken) { toast.error('Informe o Device Token da Wavoip.'); return null; }

    const exists = config.devices.find(d => d.token === cleanToken);
    if (exists) { toast.warning('Esse device token já está cadastrado nesta sub-empresa.'); return exists; }

    const { data, error: err } = await supabase
      .from('wavoip_devices')
      .insert({
        owner_id,
        sub_company_id,
        token: cleanToken,
        label: label.trim() || `WhatsApp ${config.devices.length + 1}`,
        phone: phone?.trim() || null,
        is_default: config.devices.length === 0,
      })
      .select()
      .single();

    if (err) {
      toast.error(`Falha ao salvar device: ${err.message}`);
      return null;
    }

    await loadFromDb();

    // Registra no SDK já carregado (se houver)
    try {
      const api = (window as any).wavoip;
      if (api?.device?.add) {
        api.device.add(cleanToken, true);
        api.device.enable?.(cleanToken);
        registeredTokens.current.add(cleanToken);
      }
    } catch (e) { console.warn('[Wavoip] device.add falhou', e); }

    toast.success(`Device "${data.label}" adicionado.`);
    return {
      id: data.id, token: data.token, label: data.label, phone: data.phone || undefined,
      added_at: data.created_at,
    };
  }, [owner_id, sub_company_id, config.devices, loadFromDb]);

  const removeDevice = useCallback(async (id: string) => {
    const dev = config.devices.find(d => d.id === id);
    const { error: err } = await supabase.from('wavoip_devices').delete().eq('id', id);
    if (err) { toast.error(`Falha ao remover: ${err.message}`); return; }
    if (dev) {
      try { (window as any).wavoip?.device?.remove?.(dev.token); registeredTokens.current.delete(dev.token); } catch {}
    }
    await loadFromDb();
    toast.success('Device removido.');
  }, [config.devices, loadFromDb]);

  const setDefaultDevice = useCallback(async (id: string) => {
    if (!owner_id) return;
    let q1 = supabase.from('wavoip_devices').update({ is_default: false }).eq('owner_id', owner_id);
    if (sub_company_id) q1 = q1.eq('sub_company_id', sub_company_id); else q1 = q1.is('sub_company_id', null);
    await q1;
    await supabase.from('wavoip_devices').update({ is_default: true }).eq('id', id);
    await loadFromDb();
  }, [owner_id, sub_company_id, loadFromDb]);

  const setEnabled = useCallback((enabled: boolean) => {
    setConfig(c => ({ ...c, enabled }));
  }, []);

  // ---------- SDK ----------
  const bootSdk = useCallback(async () => {
    if (!config.enabled || config.devices.length === 0) {
      setStatus('idle');
      return;
    }
    setStatus('loading');
    setError(null);
    try {
      // Carrega ESM uma única vez
      if (!webphoneRef.current) {
        const mod: any = await loadScriptOnce(SDK_URL);
        const webphone = mod?.default || mod;
        if (!webphone?.render) throw new Error('SDK inválido: render() não encontrado');
        await webphone.render({
          theme: 'system',
          buttonPosition: 'bottom-right',
          position: 'bottom-right',
          widget: { startOpen: false, showWidgetButton: false },
          callSettings: { displayName: 'Lead Seller Hub' },
          platform: 'lead-seller-hub',
        });
        webphoneRef.current = webphone;
      }

      const api = (window as any).wavoip;
      if (!api?.device?.add) throw new Error('SDK Wavoip não expôs window.wavoip.device');

      // Registra + habilita todos os tokens da sub-empresa
      for (const d of config.devices) {
        if (!registeredTokens.current.has(d.token)) {
          try {
            api.device.add(d.token, true);
            api.device.enable?.(d.token);
            registeredTokens.current.add(d.token);
          } catch (e) { console.warn('[Wavoip] device.add falhou', d.label, e); }
        } else {
          // garante que está enabled
          try { api.device.enable?.(d.token); } catch {}
        }
      }

      setStatus('ready');
    } catch (e: any) {
      console.error('[Wavoip] boot error', e);
      setError(e?.message || 'Erro ao iniciar SDK Wavoip');
      setStatus('error');
    }
  }, [config.enabled, config.devices]);

  useEffect(() => { bootSdk(); }, [bootSdk]);

  const recoverSdkDevices = useCallback(async (reason: string = 'watchdog') => {
    if (!config.enabled || config.devices.length === 0) return false;
    const api = (window as any).wavoip;
    if (!api?.device?.add) {
      await bootSdk();
      return true;
    }

    const raw = api.device.get?.() || [];
    const registered = (Array.isArray(raw) ? raw : [raw]) as WavoipDeviceSnapshot[];
    const tokens = config.devices.map((device) => device.token);
    if (!needsWavoipDeviceRecovery(tokens, registered)) return false;

    console.info(`[Wavoip] recuperando devices do SDK (${reason}) sem encerrar chamadas ativas.`);
    for (const device of config.devices) {
      try {
        api.device.add(device.token, true);
        api.device.enable?.(device.token);
        registeredTokens.current.add(device.token);
      } catch (e) {
        console.warn('[Wavoip] recovery device.add falhou', device.label, e);
      }
    }
    setStatus('ready');
    setError(null);
    return true;
  }, [bootSdk, config.enabled, config.devices]);

  useEffect(() => {
    if (!config.enabled || config.devices.length === 0) return;
    const id = window.setInterval(() => {
      recoverSdkDevices('device-watchdog').catch((e) => console.warn('[Wavoip] recovery watchdog falhou', e));
    }, 20000);
    return () => window.clearInterval(id);
  }, [config.enabled, config.devices, recoverSdkDevices]);

  // ---------- Validar conexão real com a Wavoip ----------
  const validateConnection = useCallback(async (): Promise<ValidationResult> => {
    setIsValidating(true);
    const result: ValidationResult = { ok: false, message: '', registered: [], missing: [] };
    try {
      if (config.devices.length === 0) {
        result.message = 'Nenhum device cadastrado nesta sub-empresa.';
        setLastValidation(result); return result;
      }

      // Garante SDK carregado
      if (!webphoneRef.current) {
        const mod: any = await loadScriptOnce(SDK_URL);
        const webphone = mod?.default || mod;
        await webphone.render({ widget: { startOpen: false, showWidgetButton: false }, platform: 'lead-seller-hub' });
        webphoneRef.current = webphone;
      }

      const api = (window as any).wavoip;
      if (!api?.device) {
        result.message = 'SDK Wavoip indisponível. Verifique sua rede.';
        setLastValidation(result); return result;
      }

      // Registra + enable cada token, depois consulta device.get()
      for (const d of config.devices) {
        try { api.device.add(d.token, true); api.device.enable?.(d.token); } catch {}
      }
      // Pequena espera para o SDK reconciliar via socket
      await new Promise(r => setTimeout(r, 800));

      const registered = (api.device.get?.() || []) as Array<{ token: string; enabled?: boolean; status?: string }>;
      const registeredTokensList = registered.map(r => r.token);
      result.raw = registered;
      result.registered = registeredTokensList;
      result.missing = config.devices.filter(d => !registeredTokensList.includes(d.token)).map(d => d.token);

      const now = new Date().toISOString();
      const logRows: any[] = [];
      for (const d of config.devices) {
        const found = registered.find(r => r.token === d.token);
        const isOk = !!found && (found.enabled !== false);
        const errMsg = isOk ? null : (found ? 'Device desabilitado pela Wavoip' : 'Device não registrado no SDK');
        await supabase.from('wavoip_devices').update({
          last_validated_at: now,
          last_validation_status: isOk ? 'ok' : 'fail',
          last_validation_error: errMsg,
        }).eq('id', d.id);

        logRows.push({
          owner_id,
          sub_company_id,
          device_id: d.id,
          device_label: d.label,
          device_token: d.token,
          status: isOk ? 'ok' : 'fail',
          message: isOk ? 'Device ativo no tronco Wavoip' : errMsg,
          raw: found || null,
          validated_at: now,
        });
      }
      if (logRows.length > 0) {
        await supabase.from('wavoip_validation_logs').insert(logRows);
      }
      await loadFromDb();


      if (result.missing.length === 0) {
        result.ok = true;
        result.message = `Conexão validada: ${result.registered.length} device(s) ativo(s) no tronco Wavoip.`;
        toast.success(result.message);
      } else {
        result.message = `Falha: ${result.missing.length} device(s) não responderam. Verifique se o QR foi escaneado e o WhatsApp está conectado no painel Wavoip.`;
        toast.error(result.message);
      }
      setLastValidation(result);
      return result;
    } catch (e: any) {
      result.message = e?.message || 'Erro ao validar';
      toast.error(result.message);
      setLastValidation(result);
      return result;
    } finally {
      setIsValidating(false);
    }
  }, [config.devices, loadFromDb]);

  const openDialer = useCallback(() => {
    try { (window as any).wavoip?.widget?.open?.(); } catch (e) { console.warn('[Wavoip] widget.open falhou', e); }
  }, []);

  const callWhatsApp = useCallback(async (phone: string, deviceId?: string, meta?: WavoipCallMeta): Promise<boolean> => {
    if (!config.enabled || config.devices.length === 0) {
      toast.error('Tronco Wavoip não configurado. Cadastre um Device Token em Configurações > Wavoip.');
      return false;
    }
    if (status !== 'ready') {
      toast.message('Carregando SDK Wavoip...');
      await bootSdk();
    }
    const device = config.devices.find(d => d.id === (deviceId || config.defaultDeviceId)) || config.devices[0];
    if (!device) { toast.error('Nenhum device Wavoip disponível.'); return false; }
    const normalized = phone.replace(/\D/g, '');
    if (!normalized) { toast.error('Número de telefone inválido.'); return false; }

    // ---- Registro no histórico de chamadas ------------------------------
    const effectiveOwner = meta?.ownerId ?? owner_id;
    const effectiveSub = meta?.subCompanyId ?? sub_company_id;
    const effectiveUserId = meta?.userId ?? user?.id ?? null;
    let callLogId: string | null = null;
    let recorder: MediaRecorder | null = null;
    let chunks: Blob[] = [];
    let recordingEnabled = false;
    if (effectiveOwner) {
      try {
        const { data: rec } = await (supabase as any).rpc('get_recording_enabled', {
          p_owner_id: effectiveOwner,
          p_sub_company_id: effectiveSub,
        });
        recordingEnabled = !!rec;
      } catch (e) { console.warn('[Wavoip] get_recording_enabled falhou', e); }

      callLogId = await startCallLog({
        phone: normalized,
        contactName: meta?.contactName ?? null,
        customerId: meta?.customerId ?? null,
        leadId: meta?.leadId ?? null,
        ownerId: effectiveOwner,
        subCompanyId: effectiveSub,
        userId: effectiveUserId,
        channel: 'wavoip',
        direction: 'outbound',
        connectionLabel: device.label,
        metadata: { device_id: device.id, recording_enabled: recordingEnabled, initiated_by_user_id: effectiveUserId },
      });
    }

    const startedAt = Date.now();
    let answeredAt: number | null = null;
    let wavoipCallId: string | null = null;
    let officialDurationSeconds: number | null = null;
    let finished = false;
    let watchdog: ReturnType<typeof setInterval> | null = null;
    let hardTimeout: ReturnType<typeof setTimeout> | null = null;
    const clearWatchers = () => {
      if (watchdog) { clearInterval(watchdog); watchdog = null; }
      if (hardTimeout) { clearTimeout(hardTimeout); hardTimeout = null; }
    };

    const audit = async (action: string, auditStatus: 'success' | 'error' | 'started', payload: Record<string, any> = {}) => {
      if (!effectiveOwner || !effectiveUserId) return;
      try {
        await (supabase as any).from('omnichannel_audit_logs').insert({
          owner_id: effectiveOwner,
          sub_company_id: effectiveSub,
          user_id: effectiveUserId,
          provider: 'wavoip',
          action,
          status: auditStatus,
          customer_id: meta?.customerId ?? null,
          call_history_id: callLogId,
          call_id: wavoipCallId,
          wavoip_call_id: wavoipCallId,
          phone: normalized,
          payload: {
            device_id: device.id,
            device_label: device.label,
            ...payload,
          },
        });
      } catch (e) { console.warn('[Wavoip] audit log falhou', e); }
    };

    const updateLineState = async (extra: Record<string, any> = {}) => {
      if (!effectiveOwner || !effectiveUserId) return;
      try {
        await (supabase as any)
          .from('wavoip_line_state')
          .update({
            last_heartbeat_at: new Date().toISOString(),
            call_history_id: callLogId,
            wavoip_call_id: wavoipCallId,
            metadata: { device_id: device.id, device_label: device.label, contact_name: meta?.contactName ?? null, ...extra },
          })
          .eq('owner_id', effectiveOwner)
          .eq('user_id', effectiveUserId)
          .eq('status', 'in_call');
      } catch (e) { console.warn('[Wavoip] line heartbeat falhou', e); }
    };

    const startLineState = async () => {
      if (!effectiveOwner || !effectiveUserId) return;
      clearLineHeartbeat();
      try {
        await (supabase as any)
          .from('wavoip_line_state')
          .delete()
          .eq('owner_id', effectiveOwner)
          .eq('user_id', effectiveUserId)
          .eq('status', 'in_call');
        await (supabase as any).from('wavoip_line_state').insert({
          owner_id: effectiveOwner,
          sub_company_id: effectiveSub,
          user_id: effectiveUserId,
          phone: normalized,
          status: 'in_call',
          since: new Date(startedAt).toISOString(),
          last_heartbeat_at: new Date().toISOString(),
          call_history_id: callLogId,
          wavoip_call_id: wavoipCallId,
          metadata: { device_id: device.id, device_label: device.label, contact_name: meta?.contactName ?? null },
        });
        lineHeartbeatRef.current = setInterval(() => updateLineState(), 15000);
      } catch (e) { console.warn('[Wavoip] line state start falhou', e); }
    };

    const clearLineState = async () => {
      clearLineHeartbeat();
      if (!effectiveOwner || !effectiveUserId) return;
      try {
        await (supabase as any)
          .from('wavoip_line_state')
          .delete()
          .eq('owner_id', effectiveOwner)
          .eq('user_id', effectiveUserId)
          .eq('status', 'in_call');
      } catch (e) { console.warn('[Wavoip] line state cleanup falhou', e); }
    };

    const finish = async (finalStatus: 'ended' | 'failed' | 'missed' | 'rejected' = 'ended') => {
      if (finished) return;
      finished = true;
      clearWatchers();
      await clearLineState();
      if (!callLogId || !effectiveOwner) {
        await audit('call_end', finalStatus === 'ended' ? 'success' : 'error', { final_status: finalStatus, no_call_log: true });
        return;
      }
      let recordingPath: string | null = null;
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop();
          await new Promise((r) => setTimeout(r, 200));
          if (chunks.length) {
            const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
            recordingPath = await uploadCallRecording(callLogId, effectiveOwner, blob);
          }
        } catch (e) { console.warn('[Wavoip] recorder stop/upload falhou', e); }
      }
      // Se não houve atendimento e o status é 'ended', ajusta para 'missed'/'failed'.
      let effectiveStatus = finalStatus;
      if (finalStatus === 'ended' && !answeredAt) effectiveStatus = 'missed';
      // Preferência: gravação oficial da Wavoip (storage.wavoip.com/{callId}).
      const recordingUrl = wavoipCallId && answeredAt
        ? `https://storage.wavoip.com/${wavoipCallId}`
        : null;
      await endCallLog(callLogId, {
        status: effectiveStatus,
        startedAt,
        answeredAt,
        durationSeconds: officialDurationSeconds ?? undefined,
        recordingPath,
        recordingUrl,
        wavoipCallId,
        metadata: { device_id: device.id, recording_enabled: recordingEnabled, initiated_by_user_id: effectiveUserId },
      });
      await audit('call_end', effectiveStatus === 'ended' ? 'success' : 'error', {
        final_status: effectiveStatus,
        answered_at: answeredAt ? new Date(answeredAt).toISOString() : null,
        ended_at: new Date().toISOString(),
        official_duration_seconds: officialDurationSeconds,
      });
    };

    try {
      const api = (window as any).wavoip;
      const { call, err } = await api.call.start(normalized, {
        fromTokens: [device.token],
        displayName: 'Lead Seller Hub',
      });
      if (err) {
        const detail = err.devices?.map((d: any) => `${d.token.slice(0,8)}…: ${d.reason}`).join(' | ') || err.message;
        toast.error(`Wavoip recusou a chamada: ${detail}`);
        await finish('rejected');
        return false;
      }

      const payloadCallId = (payload: any) => String(
        payload?.whatsapp_call_id
        ?? payload?.whatsappCallId
        ?? payload?.call?.whatsapp_call_id
        ?? payload?.call?.id
        ?? payload?.id
        ?? payload?.callId
        ?? payload?.call_id
        ?? '',
      ) || null;
      const persistWavoipIdOnRow = async (id: string) => {
        if (!callLogId || !id) return;
        try {
          // Grava o wavoip_call_id na metadata da linha ORIGINAL para que
          // eventos do webhook (answered/ended) atualizem a linha correta
          // preservando user_id, contact_name etc. — em vez de criar um stub.
          await (supabase as any)
            .from('call_history')
            .update({
              user_id: effectiveUserId,
              metadata: {
                device_id: device.id,
                recording_enabled: recordingEnabled,
                wavoip_call_id: id,
                call_id: id,
                initiated_by_user_id: effectiveUserId,
              },
            })
            .eq('id', callLogId);
          await updateLineState({ wavoip_call_id: id });
        } catch (e) { console.warn('[Wavoip] persist wavoip_call_id falhou', e); }
      };
      const capturePayload = (payload: any, opts?: { isFinal?: boolean }) => {
        const id = payloadCallId(payload);
        if (id && (!wavoipCallId || id === wavoipCallId)) {
          const wasEmpty = !wavoipCallId;
          wavoipCallId = id;
          if (wasEmpty) persistWavoipIdOnRow(id);
        }
        // IMPORTANTE: só aceitamos duration em eventos FINAIS (end/hangup).
        // Eventos intermediários (ringing/answered) trazem duração parcial
        // e antes sobrescreviam o valor real, gerando registros como 00:13
        // para uma ligação de 2min.
        if (opts?.isFinal) {
          const duration = Number(payload?.duration ?? payload?.call?.duration ?? payload?.metadata?.duration);
          if (Number.isFinite(duration) && duration > 0) officialDurationSeconds = Math.round(duration);
        }
      };

      // Captura o ID Wavoip da chamada (necessário para acessar a gravação).
      wavoipCallId = String(call?.whatsapp_call_id ?? call?.whatsappCallId ?? call?.id ?? call?.callId ?? call?.call_id ?? '') || null;
      if (wavoipCallId) persistWavoipIdOnRow(wavoipCallId);


      // Bindings redundantes — o SDK varia os nomes dos eventos entre versões.
      const onAnswered = async () => {
        if (answeredAt) return;
        answeredAt = Date.now();
        if (callLogId) await markCallAnswered(callLogId);
        await updateLineState({ answered_at: new Date(answeredAt).toISOString() });
        await audit('call_answered', 'success', { answered_at: new Date(answeredAt).toISOString() });
      };
      const bindOn = (target: any, event: string, handler: (...a: any[]) => void) => {
        try { target?.on?.(event, handler); } catch { /* noop */ }
        try { target?.addEventListener?.(event, handler); } catch { /* noop */ }
      };
      ['accept', 'answered', 'answer', 'accepted', 'call.accept', 'call:accept'].forEach((ev) => {
        bindOn(call, ev, onAnswered);
        bindOn(api?.call, ev, (payload: any) => {
          capturePayload(payload);
          const id = payloadCallId(payload);
          if (!id || id === wavoipCallId) onAnswered();
        });
        bindOn(api, ev, (payload: any) => {
          capturePayload(payload);
          const id = payloadCallId(payload);
          if (!id || id === wavoipCallId) onAnswered();
        });
      });
      const mapWavoipFinalStatus = (status: unknown): 'ended' | 'failed' | 'missed' | 'rejected' | null => {
        const s = String(status || '').toUpperCase();
        if (!s) return null;
        if (s === 'ENDED' || s === 'HANDLED_REMOTELY') return 'ended';
        if (s === 'FAILED' || s === 'CONNECTION_LOST') return 'failed';
        if (s === 'REJECTED' || s === 'REMOTE_CALL_IN_PROGRESS') return 'rejected';
        if (s === 'NOT_ANSWERED') return 'missed';
        return null;
      };
      const handleWavoipLifecyclePayload = (payload: any, source: WavoipEventSource = 'call') => {
        const sdkStatus = payload?.status ?? payload?.call?.status;
        const finalStatus = mapWavoipFinalStatus(sdkStatus);
        capturePayload(payload, { isFinal: !!finalStatus });
        const id = payloadCallId(payload);
        if (!shouldAcceptWavoipEventForCurrentCall(id, wavoipCallId, source)) return;
        if (/ACTIVE/i.test(String(sdkStatus || ''))) onAnswered();
        if (finalStatus) finish(finalStatus);
      };
      const endHandler = (finalStatus: 'ended' | 'failed' | 'missed', source: WavoipEventSource = 'call') => (payload?: any) => {
        capturePayload(payload, { isFinal: true });
        const id = payloadCallId(payload);
        if (!shouldAcceptWavoipEventForCurrentCall(id, wavoipCallId, source)) return;
        finish(finalStatus);
      };

      [
        ['end', 'ended'], ['ended', 'ended'], ['terminate', 'ended'], ['terminated', 'ended'],
        ['hangup', 'ended'], ['bye', 'ended'], ['call.end', 'ended'], ['call:end', 'ended'],
        ['cancel', 'missed'], ['cancelled', 'missed'], ['no-answer', 'missed'],
        ['failed', 'failed'], ['error', 'failed'], ['reject', 'failed'], ['rejected', 'failed'],
      ].forEach(([ev, st]) => {
        bindOn(call, ev, endHandler(st as any));
        bindOn(api?.call, ev, endHandler(st as any, 'global'));
        bindOn(api, ev, endHandler(st as any, 'global'));
        bindOn(api?.event, ev, endHandler(st as any, 'global'));
      });
      [
        'call:update', 'call:updated', 'call:status', 'call:ended', 'call:answer', 'call:answered',
        'CALL', 'RECORD', 'UPDATE',
      ].forEach((ev) => {
        bindOn(call, ev, handleWavoipLifecyclePayload);
        bindOn(api?.call, ev, (payload: any) => handleWavoipLifecyclePayload(payload, 'global'));
        bindOn(api, ev, (payload: any) => handleWavoipLifecyclePayload(payload, 'global'));
        bindOn(api?.event, ev, (payload: any) => handleWavoipLifecyclePayload(payload, 'global'));
      });

      // Watchdog: consulta periodicamente se a call ainda existe no SDK.
      // Se sumir da lista ativa, marcamos como encerrada.
      const isCallActive = (): boolean => {
        try {
          const list = api?.call?.list?.() || api?.call?.get?.() || [];
          const arr = Array.isArray(list) ? list : [list];
          if (!wavoipCallId) return arr.length > 0;
          return arr.some((c: any) => (c?.id || c?.callId || c?.call_id) === wavoipCallId);
        } catch { return true; }
      };
      let gracePolls = 3; // evita falso-positivo antes da call aparecer no state
      watchdog = setInterval(() => {
        if (finished) { clearWatchers(); return; }
        if (isCallActive()) { gracePolls = 3; return; }
        if (--gracePolls <= 0) finish('ended');
      }, 3000);
      // Hard cap: 2h para não deixar registros pendurados
      hardTimeout = setTimeout(() => finish('ended'), 2 * 60 * 60 * 1000);
      // Ao fechar a aba, tenta encerrar
      window.addEventListener('beforeunload', () => { finish('ended'); }, { once: true });

      await startLineState();
      await audit('call_start', 'started', { started_at: new Date(startedAt).toISOString() });

      // Recording (opt-in) — tenta obter o stream remoto exposto pelo SDK.
      if (recordingEnabled) {
        try {
          const stream: MediaStream | undefined =
            call?.remoteStream || call?.stream || api?.getRemoteStream?.();
          if (stream && typeof MediaRecorder !== 'undefined') {
            recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            recorder.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
            recorder.start(1000);
          } else {
            console.info('[Wavoip] gravação local indisponível — usaremos storage.wavoip.com.');
          }
        } catch (e) { console.warn('[Wavoip] MediaRecorder init falhou', e); }
      }

      openDialer();
      toast.success(`Discando ${normalized} via ${device.label}${recordingEnabled ? ' · gravando' : ''}`);
      return true;
    } catch (e: any) {
      console.error('[Wavoip] callWhatsApp error', e);
      toast.error(`Falha ao ligar via Wavoip: ${e?.message || 'erro desconhecido'}`);
      await audit('call_error', 'error', { error: e?.message || String(e) });
      await finish('failed');
      return false;
    }
  }, [config, status, bootSdk, openDialer, owner_id, sub_company_id, user?.id, clearLineHeartbeat]);



  return (
    <WavoipWebphoneCtx.Provider
      value={{
        status, error, config,
        scope: { sub_company_id, owner_id },
        addDevice, removeDevice, setDefaultDevice, setEnabled,
        reload: bootSdk, openDialer, callWhatsApp,
        validateConnection, isValidating, lastValidation,
      }}
    >
      {children}
    </WavoipWebphoneCtx.Provider>
  );
}

export function useWavoipWebphone() {
  const ctx = useContext(WavoipWebphoneCtx);
  if (!ctx) throw new Error('useWavoipWebphone deve ser usado dentro de WavoipWebphoneProvider');
  return ctx;
}
