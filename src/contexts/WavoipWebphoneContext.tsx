import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';

/**
 * WavoipWebphoneContext
 *
 * Carrega dinamicamente o SDK oficial @wavoip/wavoip-webphone (CDN), registra
 * os device tokens do admin e expõe uma API programática para realizar
 * ligações de WhatsApp pelo tronco Wavoip (pareamento não-oficial).
 *
 * Diferente do exemplo da Wavoip, NÃO abrimos o widget automaticamente — o
 * widget é renderizado em um container oculto e só é exibido quando o
 * atendente dispara uma ligação (ou abre manualmente o discador).
 */

const STORAGE_KEY = 'wavoipWebphoneConfig.v1';
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@wavoip/wavoip-webphone/dist/index.umd.min.js';
const CONTAINER_ID = 'wavoip-webphone-root';

export interface WavoipDevice {
  id: string;          // local id
  token: string;       // device token (UUID Wavoip)
  label: string;       // nome amigável
  phone?: string;      // número do WhatsApp emparelhado (informativo)
  added_at: string;
}

export interface WavoipWebphoneConfig {
  enabled: boolean;
  defaultDeviceId?: string;
  devices: WavoipDevice[];
}

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface Ctx {
  status: Status;
  error: string | null;
  config: WavoipWebphoneConfig;
  saveConfig: (cfg: WavoipWebphoneConfig) => void;
  addDevice: (token: string, label: string, phone?: string) => WavoipDevice | null;
  removeDevice: (id: string) => void;
  setDefaultDevice: (id: string) => void;
  reload: () => Promise<void>;
  openDialer: () => void;
  callWhatsApp: (phone: string, deviceId?: string) => Promise<boolean>;
}

const WavoipWebphoneCtx = createContext<Ctx | null>(null);

const defaultConfig: WavoipWebphoneConfig = { enabled: false, devices: [] };

function loadConfig(): WavoipWebphoneConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultConfig;
    const parsed = JSON.parse(raw);
    return { ...defaultConfig, ...parsed };
  } catch {
    return defaultConfig;
  }
}

function persist(cfg: WavoipWebphoneConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

function ensureContainer(): HTMLDivElement {
  let el = document.getElementById(CONTAINER_ID) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = CONTAINER_ID;
    // Hidden by default — Wavoip widget só aparece quando openDialer() é chamado
    el.style.position = 'fixed';
    el.style.bottom = '0';
    el.style.right = '0';
    el.style.zIndex = '9998';
    el.style.display = 'none';
    document.body.appendChild(el);

    const inner = document.createElement('div');
    inner.id = 'webphone';
    el.appendChild(inner);
  }
  return el;
}

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).WavoipWebphone || (window as any).wavoipWebphone) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[data-wavoip-sdk="1"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Falha ao carregar SDK Wavoip')), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = `${src}?t=${Date.now()}`;
    s.async = true;
    s.dataset.wavoipSdk = '1';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Falha ao carregar SDK Wavoip'));
    document.head.appendChild(s);
  });
}

export function WavoipWebphoneProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<WavoipWebphoneConfig>(() => loadConfig());
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const renderedRef = useRef(false);
  const registeredTokens = useRef<Set<string>>(new Set());

  const saveConfig = useCallback((cfg: WavoipWebphoneConfig) => {
    setConfig(cfg);
    persist(cfg);
  }, []);

  const addDevice = useCallback((token: string, label: string, phone?: string): WavoipDevice | null => {
    const cleanToken = token.trim();
    if (!cleanToken) {
      toast.error('Informe o Device Token da Wavoip.');
      return null;
    }
    const exists = config.devices.find(d => d.token === cleanToken);
    if (exists) {
      toast.warning('Esse device token já está cadastrado.');
      return exists;
    }
    const device: WavoipDevice = {
      id: crypto.randomUUID(),
      token: cleanToken,
      label: label.trim() || `WhatsApp ${config.devices.length + 1}`,
      phone: phone?.trim() || undefined,
      added_at: new Date().toISOString(),
    };
    const next: WavoipWebphoneConfig = {
      ...config,
      enabled: true,
      defaultDeviceId: config.defaultDeviceId || device.id,
      devices: [...config.devices, device],
    };
    saveConfig(next);
    // registra no SDK se já carregado
    try {
      (window as any).wavoip?.device?.add?.(device.token);
      registeredTokens.current.add(device.token);
    } catch (e) {
      console.warn('[Wavoip] device.add falhou', e);
    }
    toast.success(`Device ${device.label} adicionado ao tronco Wavoip.`);
    return device;
  }, [config, saveConfig]);

  const removeDevice = useCallback((id: string) => {
    const next: WavoipWebphoneConfig = {
      ...config,
      devices: config.devices.filter(d => d.id !== id),
    };
    if (next.defaultDeviceId === id) next.defaultDeviceId = next.devices[0]?.id;
    if (next.devices.length === 0) next.enabled = false;
    saveConfig(next);
    toast.success('Device removido.');
  }, [config, saveConfig]);

  const setDefaultDevice = useCallback((id: string) => {
    saveConfig({ ...config, defaultDeviceId: id });
  }, [config, saveConfig]);

  const bootSdk = useCallback(async () => {
    if (!config.enabled || config.devices.length === 0) {
      setStatus('idle');
      return;
    }
    setStatus('loading');
    setError(null);
    try {
      ensureContainer();
      await loadScriptOnce(SDK_URL);

      // Render do webphone — fica oculto até openDialer()
      const w = window as any;
      if (!renderedRef.current && w.wavoipWebphone?.render) {
        await w.wavoipWebphone.render();
        renderedRef.current = true;
      }

      // Registra todos os devices do admin
      config.devices.forEach(d => {
        if (!registeredTokens.current.has(d.token)) {
          try {
            w.wavoip?.device?.add?.(d.token);
            registeredTokens.current.add(d.token);
          } catch (e) {
            console.warn('[Wavoip] device.add error', e);
          }
        }
      });

      setStatus('ready');
    } catch (e: any) {
      console.error('[Wavoip] boot error', e);
      setError(e?.message || 'Erro ao iniciar SDK Wavoip');
      setStatus('error');
    }
  }, [config]);

  useEffect(() => {
    bootSdk();
  }, [bootSdk]);

  const openDialer = useCallback(() => {
    const el = document.getElementById(CONTAINER_ID);
    if (el) el.style.display = 'block';
    try {
      (window as any).wavoip?.widget?.open?.();
    } catch (e) {
      console.warn('[Wavoip] widget.open falhou', e);
    }
  }, []);

  const callWhatsApp = useCallback(async (phone: string, deviceId?: string): Promise<boolean> => {
    if (!config.enabled || config.devices.length === 0) {
      toast.error('Tronco Wavoip não configurado. Adicione um Device Token em Configurações > Wavoip.');
      return false;
    }
    const device = config.devices.find(d => d.id === (deviceId || config.defaultDeviceId)) || config.devices[0];
    if (!device) {
      toast.error('Nenhum device Wavoip disponível.');
      return false;
    }
    if (status !== 'ready') {
      toast.message('Carregando SDK Wavoip...', { description: 'Tente novamente em alguns segundos.' });
      await bootSdk();
    }
    const normalized = phone.replace(/\D/g, '');
    if (!normalized) {
      toast.error('Número de telefone inválido.');
      return false;
    }
    try {
      const w = window as any;
      // Algumas builds expõem .call() programático; caso não exista, abrimos o widget pré-preenchido
      const api = w.wavoip;
      if (api?.call && typeof api.call === 'function') {
        await api.call({ number: normalized, token: device.token });
      } else if (api?.device?.call) {
        await api.device.call(device.token, normalized);
      } else {
        // Fallback: copia número e abre o widget para o atendente confirmar
        try { await navigator.clipboard.writeText(normalized); } catch {}
        openDialer();
        toast.info('Número copiado — confirme a chamada no widget Wavoip.');
        return true;
      }
      openDialer();
      toast.success(`Discando ${normalized} via ${device.label}.`);
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
        status,
        error,
        config,
        saveConfig,
        addDevice,
        removeDevice,
        setDefaultDevice,
        reload: bootSdk,
        openDialer,
        callWhatsApp,
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
