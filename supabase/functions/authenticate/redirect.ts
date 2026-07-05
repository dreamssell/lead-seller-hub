// Thin wrapper around the shared redirect validator so the authenticate
// function keeps its stable API (`buildAuthRedirectUrl`, `resolvePlatformUrl`).
import { HUB_ORIGIN, resolveHubOrigin, buildHubUrl } from "../_shared/redirect.ts";

export const PLATFORM_URL_DEFAULT = HUB_ORIGIN;

export function resolvePlatformUrl(envValue: string | undefined | null): string {
  return resolveHubOrigin(envValue);
}

export function buildAuthRedirectUrl(
  platformUrl: string | undefined | null,
  tokens: { access_token: string; refresh_token: string },
): string {
  return buildHubUrl(
    "/auth/callback",
    {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    },
    platformUrl,
  );
}
