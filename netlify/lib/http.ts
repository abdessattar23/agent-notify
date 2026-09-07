export function json(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...corsHeaders(),
      ...headerRecord(extraHeaders),
    },
  });
}

export function noContent(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "cache-control": "no-store",
      ...corsHeaders(),
    },
  });
}

export function optionsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(),
      "access-control-max-age": "86400",
    },
  });
}

export function methodNotAllowed(allowed: string[]): Response {
  return json({ ok: false, error: "method_not_allowed" }, 405, {
    allow: allowed.join(", "),
  });
}

export type JsonRead = { ok: true; value: unknown } | { ok: false; error: string };

export async function readJson(req: Request): Promise<JsonRead> {
  const text = await req.text();
  if (!text.trim()) {
    return { ok: false, error: "JSON body required" };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, error: "invalid JSON" };
  }
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "Authorization, Content-Type, X-Owner-Secret",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  };
}

function headerRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const record: Record<string, string> = {};
    headers.forEach((value, key) => {
      record[key] = value;
    });
    return record;
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return headers;
}
