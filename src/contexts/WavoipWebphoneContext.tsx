import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

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
  callWhatsApp: (phone: string, deviceId?: string) => Promise<boolean>;
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
  const owner_id = (user?.id as string | undefined) || null;

  const [config, setConfig] = useState<WavoipWebphoneConfig>(defaultConfig);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [lastValidation, setLastValidation] = useState<ValidationResult | null>(null);
  const webphoneRef = useRef<any>(null);
  const registeredTokens = useRef<Set<string>>(new Set());

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
      for (const d of config.devices) {
        const found = registered.find(r => r.token === d.token);
        const isOk = !!found && (found.enabled !== false);
        await supabase.from('wavoip_devices').update({
          last_validated_at: now,
          last_validation_status: isOk ? 'ok' : 'fail',
          last_validation_error: isOk ? null : (found ? 'Device desabilitado pela Wavoip' : 'Device não registrado no SDK'),
        }).eq('id', d.id);
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

  const callWhatsApp = useCallback(async (phone: string, deviceId?: string): Promise<boolean> => {
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
    try {
      const api = (window as any).wavoip;
      const { call, err } = await api.call.start(normalized, {
        fromTokens: [device.token],
        displayName: 'Lead Seller Hub',
      });
      if (err) {
        const detail = err.devices?.map((d: any) => `${d.token.slice(0,8)}…: ${d.reason}`).join(' | ') || err.message;
        toast.error(`Wavoip recusou a chamada: ${detail}`);
        return false;
      }
      openDialer();
      toast.success(`Discando ${normalized} via ${device.label} (call ${call?.id?.slice(0,8) || ''})`);
      return true;
    } catch (e: any) {
      console.error('[Wavoip] callWhatsApp error', e);
      toast.error(`Falha ao ligar via Wavoip: ${e?.message || 'erro desconhecido'}`);
      return false;
    }
  }, [config, status, bootSdk, openDialer]);

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
