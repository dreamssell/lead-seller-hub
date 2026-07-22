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

export function getPublicLinkUrl(slug: string) {
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '');
  if (!base) return `${getPublicAppOrigin()}/l/${slug}`;
  return `${base}/functions/v1/landing-capture?slug=${encodeURIComponent(slug)}`;
}