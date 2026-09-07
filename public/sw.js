const CACHE = "agent-notify-v2";
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
  const payload = event.data ? event.data.json() : {};
  const notification = payload.notification ?? payload;
  const title = notification.title || "Agent Notify";
  const navigate = notification.navigate || "/";
  const actions = Array.isArray(notification.actions) ? notification.actions : [];
  const actionMap = {};
  for (const entry of actions) {
    if (entry && typeof entry.action === "string" && typeof entry.navigate === "string") {
      actionMap[entry.action] = entry.navigate;
    }
  }

  const options = {
    body: notification.body || "",
    icon: notification.icon || "/icons/icon-192.png",
    badge: notification.badge || "/icons/icon-192.png",
    lang: notification.lang || "en-US",
    dir: notification.dir || "ltr",
    silent: false,
    tag: notification.tag,
    data: {
      url: navigate,
      actions: actionMap,
      inboxId: notification.data?.inboxId,
    },
    actions: actions.map((entry) => ({
      action: entry.action,
      title: entry.title || entry.action,
      ...(entry.icon ? { icon: entry.icon } : {}),
    })),
  };

  if (notification.image) {
    options.image = notification.image;
  }

  const tasks = [self.registration.showNotification(title, options)];
  if (notification.app_badge != null && self.navigator && self.navigator.setAppBadge) {
    const count = Number.parseInt(String(notification.app_badge), 10);
    if (Number.isFinite(count) && count >= 0) {
      tasks.push(self.navigator.setAppBadge(count));
    }
  }

  event.waitUntil(Promise.all(tasks));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const actionId = event.action;
  const data = event.notification.data || {};
  let target = data.url || "/";
  if (actionId && data.actions && data.actions[actionId]) {
    target = data.actions[actionId];
  }
  event.waitUntil(openTarget(target));
});

async function openTarget(target) {
  const url = new URL(target, self.location.origin).href;
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) {
    if ("focus" in client) {
      await client.focus();
      if ("navigate" in client) {
        await client.navigate(url);
      }
      return;
    }
  }
  await self.clients.openWindow(url);
}
