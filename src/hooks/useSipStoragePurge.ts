import { useEffect } from 'react';

/**
 * Purges every legacy SIP credential key from browser storage on mount and
 * whenever another tab writes one. Keeps storage clean across page reloads so
 * SIP credentials never survive outside of the encrypted backend store.
 */
const LEGACY_KEYS = ['sipConfig', 'sip_config', 'sip-credentials', 'voipConfig'];

export function purgeSipStorage() {
  try {
    for (const k of LEGACY_KEYS) {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    }
  } catch {}
}

export function useSipStoragePurge() {
  useEffect(() => {
    purgeSipStorage();
    window.addEventListener('storage', purgeSipStorage);
    return () => window.removeEventListener('storage', purgeSipStorage);
  }, []);
}
