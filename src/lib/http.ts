// Every outbound call in this app goes through here. Without a timeout, a host
// that accepts the connection and then stalls (a flaky CDN, an overloaded LLM
// proxy) hangs the request — or, worse, a background job — forever.

export const DEFAULT_TIMEOUT_MS = 30_000;
export const LLM_TIMEOUT_MS = 120_000; // shot-splitting a long script is slow
export const DOWNLOAD_TIMEOUT_MS = 120_000;

export class HttpTimeoutError extends Error {}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    // AbortSignal.timeout surfaces as a TimeoutError DOMException; translate it
    // into something the UI can show verbatim.
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new HttpTimeoutError(
        `请求超时（${Math.round(timeoutMs / 1000)} 秒）: ${safeHost(url)}`,
      );
    }
    throw err;
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "未知地址";
  }
}
