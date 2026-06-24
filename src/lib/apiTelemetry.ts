import { logRouteTelemetry } from './routeTelemetry';
import { getPageKeyByPath } from './navigation';

let installed = false;

function safeUrl(input: RequestInfo | URL): string {
  try {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.toString();
    if (input instanceof Request) return input.url;
  } catch {
    /* noop */
  }
  return String(input);
}

function shouldIgnore(url: string): boolean {
  // Avoid logging the telemetry insert itself (and storage/auth refresh noise can stay — those are real failures we want to see).
  return url.includes('/rest/v1/telemetry_logs');
}

export function installApiTelemetry() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();
    const url = safeUrl(input);
    let response: Response;
    try {
      response = await originalFetch(input as RequestInfo, init);
    } catch (err) {
      throw err;
    }

    if ((response.status === 401 || response.status === 403) && !shouldIgnore(url)) {
      const path = window.location.pathname;
      const pageKey = getPageKeyByPath(path);
      void logRouteTelemetry({
        type: response.status === 401 ? 'api_unauthorized' : 'api_forbidden',
        message: `${response.status} ${method} ${url}`,
        metadata: {
          path,
          pageKey,
          endpoint: url,
          method,
          status: response.status,
          status_text: response.statusText,
        },
      });
    }

    return response;
  };
}
