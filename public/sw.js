/* Keep push/click behavior aligned with shared/sw-push.ts */
const CACHE = "agent-notify-v3";
const PRECACHE = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/v1/")) {
    return;
  }
  if (event.request.method !== "GET") {
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        void caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached ?? caches.match("/"))),
  );
});

self.addEventListener("push", (event) => {
  const shown = buildShowNotification(readPushRaw(event));
  const tasks = [self.registration.showNotification(shown.title, shown.options)];
  if (shown.appBadge != null && self.navigator && self.navigator.setAppBadge) {
    tasks.push(self.navigator.setAppBadge(shown.appBadge));
  }
  event.waitUntil(Promise.all(tasks));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = resolveClickTarget(event.action, data);
  event.waitUntil(openTarget(target));
});

function readPushRaw(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch {
    try {
      return event.data.text();
    } catch {
      return {};
    }
  }
}

function coercePushPayload(raw) {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
      return {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  return {};
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function buildShowNotification(raw) {
  const payload = coercePushPayload(raw);
  const notification = asRecord(payload.notification) ?? payload;
  const title = typeof notification.title === "string" && notification.title ? notification.title : "Agent Notify";
  const navigate =
    (typeof notification.navigate === "string" && notification.navigate) ||
    (typeof notification.url === "string" && notification.url) ||
    "/";
  const actions = [];
  if (Array.isArray(notification.actions)) {
    for (const entry of notification.actions) {
      const record = asRecord(entry);
      if (!record || typeof record.action !== "string") continue;
      actions.push({
        action: record.action,
        title: typeof record.title === "string" ? record.title : record.action,
        navigate: typeof record.navigate === "string" ? record.navigate : undefined,
        icon: typeof record.icon === "string" ? record.icon : undefined,
      });
    }
  }

  const actionMap = {};
  for (const entry of actions) {
    if (typeof entry.navigate === "string") actionMap[entry.action] = entry.navigate;
  }

  const data = asRecord(notification.data);
  const options = {
    body: typeof notification.body === "string" ? notification.body : "",
    icon: typeof notification.icon === "string" && notification.icon ? notification.icon : "/icons/icon-192.png",
    badge: typeof notification.badge === "string" && notification.badge ? notification.badge : "/icons/icon-192.png",
    lang: typeof notification.lang === "string" && notification.lang ? notification.lang : "en-US",
    dir: typeof notification.dir === "string" && notification.dir ? notification.dir : "ltr",
    silent: false,
    data: {
      url: navigate,
      actions: actionMap,
      inboxId: data?.inboxId,
    },
    actions: actions.map((entry) => ({
      action: entry.action,
      title: entry.title,
      ...(entry.icon ? { icon: entry.icon } : {}),
    })),
  };

  if (typeof notification.tag === "string" && notification.tag) options.tag = notification.tag;
  if (typeof notification.image === "string" && notification.image) options.image = notification.image;

  let appBadge;
  if (notification.app_badge != null) {
    const count = Number.parseInt(String(notification.app_badge), 10);
    if (Number.isFinite(count) && count >= 0) appBadge = count;
  }

  return { title, options, appBadge };
}

function resolveClickTarget(actionId, data) {
  if (actionId && data.actions && data.actions[actionId]) return data.actions[actionId];
  return data.url || "/";
}

function sameClientUrl(clientUrl, targetUrl) {
  try {
    const left = new URL(clientUrl);
    const right = new URL(targetUrl);
    const normalize = (url) =>
      `${url.origin}${url.pathname.replace(/\/$/, "") || "/"}${url.search}${url.hash}`;
    return normalize(left) === normalize(right);
  } catch {
    return clientUrl === targetUrl;
  }
}

async function openTarget(target) {
  const url = new URL(target, self.location.origin).href;
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const exact = windows.find((client) => sameClientUrl(client.url, url));
  if (exact && "focus" in exact) {
    await exact.focus();
    return;
  }

  for (const client of windows) {
    if (!("navigate" in client)) continue;
    try {
      await client.navigate(url);
      if ("focus" in client) await client.focus();
      return;
    } catch {
      // Chromium (especially Android Chrome) can reject WindowClient.navigate.
    }
  }

  await self.clients.openWindow(url);
}
