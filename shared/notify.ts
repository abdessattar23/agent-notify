export type NotifyInput = {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
};

export type DeclarativePushMessage = {
  web_push: 8030;
  mutable: boolean;
  notification: {
    title: string;
    body: string;
    navigate: string;
    lang: "en-US";
    dir: "ltr";
    silent: false;
    icon: string;
    badge: string;
    tag?: string;
  };
};

const TITLE_MAX = 120;
const BODY_MAX = 2000;
const URL_MAX = 2000;
const TAG_MAX = 64;

export function parseNotifyBody(raw: unknown): NotifyInput | { error: string } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "JSON object required" };
  }

  const record = raw as Record<string, unknown>;
  const title = record.title;
  if (typeof title !== "string" || title.trim().length === 0) {
    return { error: "title is required" };
  }
  if (title.length > TITLE_MAX) {
    return { error: `title must be ${TITLE_MAX} characters or fewer` };
  }

  const body = optionalString(record.body, "body", BODY_MAX);
  if (typeof body === "object") return body;

  const url = optionalString(record.url, "url", URL_MAX);
  if (typeof url === "object") return url;

  const tag = optionalString(record.tag, "tag", TAG_MAX);
  if (typeof tag === "object") return tag;

  return {
    title: title.trim(),
    ...(body ? { body } : {}),
    ...(url ? { url } : {}),
    ...(tag ? { tag } : {}),
  };
}

export function resolveNavigateUrl(inputUrl: string | undefined, origin: string): string {
  const base = origin.endsWith("/") ? origin : `${origin}/`;
  if (!inputUrl) {
    return base;
  }
  try {
    return new URL(inputUrl, base).href;
  } catch {
    return base;
  }
}

export function buildDeclarativePayload(
  input: NotifyInput,
  origin: string,
): DeclarativePushMessage {
  const navigate = resolveNavigateUrl(input.url, origin);
  const icon = new URL("/icons/icon-192.png", origin).href;
  const payload: DeclarativePushMessage = {
    web_push: 8030,
    mutable: true,
    notification: {
      title: input.title,
      body: input.body ?? "",
      navigate,
      lang: "en-US",
      dir: "ltr",
      silent: false,
      icon,
      badge: icon,
    },
  };
  if (input.tag) {
    payload.notification.tag = input.tag;
  }
  return payload;
}

export function isGonePushStatus(statusCode: number): boolean {
  return statusCode === 404 || statusCode === 410;
}

function optionalString(
  value: unknown,
  field: string,
  max: number,
): string | undefined | { error: string } {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    return { error: `${field} must be a string` };
  }
  if (value.length > max) {
    return { error: `${field} must be ${max} characters or fewer` };
  }
  return value.trim();
}
