const FALLBACK_PUBLIC_APP_ORIGIN = 'https://hub.leadseller.com.br';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export function getPublicAppOrigin() {
  const configured = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim();
  if (configured) return trimTrailingSlash(configured);

  if (typeof window === 'undefined') return FALLBACK_PUBLIC_APP_ORIGIN;

  const { hostname, origin } = window.location;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  // Sempre priorizar o domínio canônico (hub.leadseller.com.br) para links públicos,
  // exceto em ambiente local de desenvolvimento.
  return isLocal ? origin : FALLBACK_PUBLIC_APP_ORIGIN;
}

export function getPublicLandingUrl(slug: string) {
  return `${getPublicAppOrigin()}/p/${slug}`;
}