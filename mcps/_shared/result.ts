/** Small helpers so every tool returns MCP results the same way. */
export function ok(data: unknown) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text" as const, text }] };
}

export function fail(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

/**
 * Calls a REST API whose base URL comes from an env var. Errors come back as
 * readable tool errors instead of exceptions, so the model can explain them.
 */
export async function callApi(
  baseUrl: string | undefined,
  path: string,
  init: { method?: string; body?: unknown; token?: string } = {},
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  if (!baseUrl) return { ok: false, error: "API base URL is not configured (see this MCP's env vars)." };
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : baseUrl + "/");
  try {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    let data: unknown = text;
    try { data = text ? JSON.parse(text) : null; } catch { /* keep text */ }
    if (!res.ok) return { ok: false, error: `${res.status} from ${url.pathname}: ${typeof data === "string" ? data : JSON.stringify(data)}` };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: `Could not reach ${url.origin}: ${(err as Error).message}` };
  }
}
