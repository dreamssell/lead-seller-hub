// Guarded service worker registration + auto-update strategy for Lovable production.
// Also purges stale LGPD/legacy caches so deactivated banners can't reappear
// from previously-cached HTML shells.
const SW_PATH = "/sw.js";
const APP_VERSION_KEY = "app:version";
const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) || `${Date.now()}`;

// LocalStorage keys that should be dropped when they no longer control any UI
// (e.g. LGPD consent while the banner is disabled). Add future stale keys here.
const STALE_LOCAL_STORAGE_KEYS = ["lgpd:consent:v1"];

function shouldSkip(): boolean {
  if (!import.meta.env.PROD) return true;
  if (typeof window === "undefined") return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const host = window.location.hostname;
  if (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev")
  ) {
    return true;
  }
  if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  return false;
}

async function unregisterApp() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    regs
      .filter((r) => {
        const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
        return url.endsWith(SW_PATH);
      })
      .map((r) => r.unregister()),
  );
}

function purgeStaleLocalStorage() {
  try {
    for (const k of STALE_LOCAL_STORAGE_KEYS) {
      if (localStorage.getItem(k) !== null) localStorage.removeItem(k);
    }
  } catch {}
}

async function purgeAppCaches() {
  if (typeof caches === "undefined") return;
  try {
    const keys = await caches.keys();
    // Elimina apenas nossos buckets do Workbox (não toca em Firebase/OneSignal).
    await Promise.all(
      keys
        .filter((n) => /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)html-cache/.test(n))
        .map((n) => caches.delete(n)),
    );
  } catch {}
}

/**
 * Detecta troca de versão do bundle e força limpeza de caches locais + reload.
 * A versão é injetada em build (VITE_APP_VERSION) ou cai no timestamp atual,
 * garantindo que qualquer alteração pós-deploy seja percebida na próxima carga.
 */
function checkVersionAndReload() {
  try {
    const stored = localStorage.getItem(APP_VERSION_KEY);
    if (!stored) {
      localStorage.setItem(APP_VERSION_KEY, APP_VERSION);
      return;
    }
    if (stored !== APP_VERSION) {
      localStorage.setItem(APP_VERSION_KEY, APP_VERSION);
      void purgeAppCaches();
      purgeStaleLocalStorage();
    }
  } catch {}
}

export function registerPWA() {
  // Sempre roda: limpeza de chaves obsoletas independe do SW.
  purgeStaleLocalStorage();

  if (shouldSkip()) {
    void unregisterApp();
    return;
  }
  if (!("serviceWorker" in navigator)) return;

  checkVersionAndReload();

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(SW_PATH)
      .then((registration) => {
        // Verifica atualização assim que registra e a cada volta ao foco.
        void registration.update();
        const triggerUpdate = () => {
          if (document.visibilityState === "visible") {
            void registration.update();
          }
        };
        document.addEventListener("visibilitychange", triggerUpdate);

        // Quando uma nova versão fica pronta (waiting), ativa imediatamente e
        // limpa caches para evitar mistura de UI antiga (ex.: banner LGPD).
        const promote = (worker: ServiceWorker | null) => {
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              void purgeAppCaches();
              worker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        };
        promote(registration.waiting);
        registration.addEventListener("updatefound", () => promote(registration.installing));

        // Um único reload por sessão quando o novo SW assume o controle.
        let reloaded = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (reloaded) return;
          reloaded = true;
          window.location.reload();
        });
      })
      .catch(() => {});
  });
}
