export type PushAction = {
  action: string;
  title: string;
  navigate?: string;
  icon?: string;
};

export type NotificationData = {
  url: string;
  actions: Record<string, string>;
  inboxId?: unknown;
};

export type ShowNotification = {
  title: string;
  options: {
    body: string;
    icon: string;
    badge: string;
    lang: string;
    dir: string;
    silent: false;
    tag?: string;
    image?: string;
    data: NotificationData;
    actions: Array<{ action: string; title: string; icon?: string }>;
    appBadge?: number;
  };
};

export type FocusableClient = {
  url: string;
  focus: () => Promise<unknown>;
  navigate?: (url: string) => Promise<unknown>;
};

export type WindowClientBag = {
  matchAll: () => Promise<FocusableClient[]>;
  openWindow: (url: string) => Promise<unknown>;
};

export function coercePushPayload(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function readNotificationRecord(payload: Record<string, unknown>): Record<string, unknown> {
  const nested = asRecord(payload.notification);
  return nested ?? payload;
}

function readActions(notification: Record<string, unknown>): PushAction[] {
  if (!Array.isArray(notification.actions)) return [];
  const actions: PushAction[] = [];
  for (const entry of notification.actions) {
    const record = asRecord(entry);
    if (!record || typeof record.action !== "string") continue;
    actions.push({
      action: record.action,
      title: typeof record.title === "string" ? record.title : record.action,
      ...(typeof record.navigate === "string" ? { navigate: record.navigate } : {}),
      ...(typeof record.icon === "string" ? { icon: record.icon } : {}),
    });
  }
  return actions;
}

function actionMapFrom(actions: PushAction[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of actions) {
    if (typeof entry.navigate === "string") {
      map[entry.action] = entry.navigate;
    }
  }
  return map;
}

function inboxIdFrom(notification: Record<string, unknown>): unknown {
  const data = asRecord(notification.data);
  return data?.inboxId;
}

export function buildShowNotification(raw: unknown): ShowNotification {
  const payload = coercePushPayload(raw);
  const notification = readNotificationRecord(payload);
  const title = typeof notification.title === "string" && notification.title ? notification.title : "Agent Notify";
  const navigate =
    (typeof notification.navigate === "string" && notification.navigate) ||
    (typeof notification.url === "string" && notification.url) ||
    "/";
  const actions = readActions(notification);
  const inboxId = inboxIdFrom(notification);
  const data: NotificationData = {
    url: navigate,
    actions: actionMapFrom(actions),
    ...(inboxId !== undefined ? { inboxId } : {}),
  };

  const options: ShowNotification["options"] = {
    body: typeof notification.body === "string" ? notification.body : "",
    icon: typeof notification.icon === "string" && notification.icon ? notification.icon : "/icons/icon-192.png",
    badge: typeof notification.badge === "string" && notification.badge ? notification.badge : "/icons/icon-192.png",
    lang: typeof notification.lang === "string" && notification.lang ? notification.lang : "en-US",
    dir: typeof notification.dir === "string" && notification.dir ? notification.dir : "ltr",
    silent: false,
    data,
    actions: actions.map((entry) => ({
      action: entry.action,
      title: entry.title,
      ...(entry.icon ? { icon: entry.icon } : {}),
    })),
  };

  if (typeof notification.tag === "string" && notification.tag) {
    options.tag = notification.tag;
  }
  if (typeof notification.image === "string" && notification.image) {
    options.image = notification.image;
  }

  const badgeRaw = notification.app_badge;
  if (badgeRaw != null) {
    const count = Number.parseInt(String(badgeRaw), 10);
    if (Number.isFinite(count) && count >= 0) {
      options.appBadge = count;
    }
  }

  return { title, options };
}

export function resolveClickTarget(
  actionId: string | undefined,
  data: { url?: string; actions?: Record<string, string> },
): string {
  if (actionId && data.actions && data.actions[actionId]) {
    return data.actions[actionId];
  }
  return data.url || "/";
}

export function sameClientUrl(clientUrl: string, targetUrl: string): boolean {
  try {
    const left = new URL(clientUrl);
    const right = new URL(targetUrl);
    const normalize = (url: URL) =>
      `${url.origin}${url.pathname.replace(/\/$/, "") || "/"}${url.search}${url.hash}`;
    return normalize(left) === normalize(right);
  } catch {
    return clientUrl === targetUrl;
  }
}

export async function openTargetWithClients(
  target: string,
  origin: string,
  clients: WindowClientBag,
): Promise<void> {
  const url = new URL(target, origin).href;
  const windows = await clients.matchAll();
  const exact = windows.find((client) => sameClientUrl(client.url, url));
  if (exact) {
    await exact.focus();
    return;
  }

  for (const client of windows) {
    if (typeof client.navigate !== "function") continue;
    try {
      await client.navigate(url);
      await client.focus();
      return;
    } catch {
      // Chromium — especially Android Chrome — can reject WindowClient.navigate.
    }
  }

  await clients.openWindow(url);
}
