// Centralized redirect / return URL validation for edge functions.
//
// Rule: any user-facing URL emitted from the backend (redirect_to, return_to,
// portal links, callback URLs, etc.) MUST be anchored to the hub domain.
// The only allowed fallback is a local development origin (localhost or
// 127.0.0.1) so `deno test` and local `supabase functions serve` sessions
// keep working without pointing users at the wrong host.

export const HUB_ORIGIN = "https://hub.leadseller.com.br";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

function isLocalOrigin(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return LOCAL_HOSTNAMES.has(url.hostname);
}

/**
 * Resolve a safe origin for the given candidate.
 *
 * - Empty / invalid / non-https values → HUB_ORIGIN.
 * - http(s)://localhost or 127.0.0.1 → returned as-is (dev fallback only).
 * - Any other origin → HUB_ORIGIN (never trust arbitrary hosts, even
 *   `req.headers.get("origin")`).
 *
 * The `PLATFORM_URL` environment variable, when set to a valid https URL,
 * overrides everything (used by staging deployments).
 */
export function resolveHubOrigin(candidate?: string | null): string {
  const envOverride = (Deno.env.get("PLATFORM_URL") ?? "").trim();
  if (envOverride) {
    try {
      const url = new URL(envOverride);
      if (url.protocol === "https:") return trimTrailingSlash(url.origin);
    } catch {
      /* fall through to candidate handling */
    }
  }

  const raw = (candidate ?? "").trim();
  if (!raw) return HUB_ORIGIN;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return HUB_ORIGIN;
  }

  if (isLocalOrigin(url)) return trimTrailingSlash(url.origin);
  if (url.protocol !== "https:") return HUB_ORIGIN;

  // Only the canonical hub host is accepted. Preview / lovable.app /
  // arbitrary domains are downgraded to the hub so we never leak users
  // to a broken or spoofed origin.
  if (url.hostname !== "hub.leadseller.com.br") return HUB_ORIGIN;
  return trimTrailingSlash(url.origin);
}

/**
 * Build a URL on the resolved hub origin. `path` should start with '/'.
 * `params` are URL-encoded via URLSearchParams.
 */
export function buildHubUrl(
  path: string,
  params?: Record<string, string> | URLSearchParams,
  candidate?: string | null,
): string {
  const origin = resolveHubOrigin(candidate);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const search = params
    ? params instanceof URLSearchParams
      ? params
      : new URLSearchParams(params)
    : null;
  const qs = search && Array.from(search.keys()).length > 0
    ? `?${search.toString()}`
    : "";
  return `${origin}${normalizedPath}${qs}`;
}

/**
 * Validate a caller-supplied redirect_to / return_to URL.
 * Returns the safe URL to use — either the caller's URL (if it belongs to the
 * hub or a local dev origin) or the hub fallback.
 */
export function safeRedirectTo(
  candidate?: string | null,
  fallbackPath: string = "/",
): string {
  const raw = (candidate ?? "").trim();
  if (!raw) return buildHubUrl(fallbackPath);

  let url: URL;
  try {
    url = new URL(raw, HUB_ORIGIN);
  } catch {
    return buildHubUrl(fallbackPath);
  }

  const origin = resolveHubOrigin(url.origin);
  return `${origin}${url.pathname}${url.search}${url.hash}`;
}
