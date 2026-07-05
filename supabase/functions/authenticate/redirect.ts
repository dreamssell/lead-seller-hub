// Pure helpers for building the platform redirect URL returned by the
// `authenticate` edge function. Kept in a separate module so it can be
// unit-tested without spinning up the whole function runtime.

const DEFAULT_PLATFORM_URL = "https://hub.leadseller.com.br";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export function resolvePlatformUrl(envValue: string | undefined | null): string {
  const raw = (envValue ?? "").trim();
  if (!raw) return DEFAULT_PLATFORM_URL;
  // Only allow https URLs; reject anything malformed so we never leak
  // a broken redirect back to the external login page.
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return DEFAULT_PLATFORM_URL;
    return trimTrailingSlash(url.origin);
  } catch {
    return DEFAULT_PLATFORM_URL;
  }
}

export function buildAuthRedirectUrl(
  platformUrl: string,
  tokens: { access_token: string; refresh_token: string },
): string {
  const origin = resolvePlatformUrl(platformUrl);
  const params = new URLSearchParams({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });
  return `${origin}/auth/callback?${params.toString()}`;
}

export const PLATFORM_URL_DEFAULT = DEFAULT_PLATFORM_URL;
