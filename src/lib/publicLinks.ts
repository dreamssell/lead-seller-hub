const FALLBACK_PUBLIC_APP_ORIGIN = 'https://connecto-center.lovable.app';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export function getPublicAppOrigin() {
  const configured = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim();
  if (configured) return trimTrailingSlash(configured);

  if (typeof window === 'undefined') return FALLBACK_PUBLIC_APP_ORIGIN;

  const { hostname, origin } = window.location;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  const isPublishedLovable = hostname.endsWith('.lovable.app') && !hostname.startsWith('id-preview--');

  return isLocal || isPublishedLovable ? origin : FALLBACK_PUBLIC_APP_ORIGIN;
}

export function getPublicLandingUrl(slug: string) {
  return `${getPublicAppOrigin()}/p/${slug}`;
}