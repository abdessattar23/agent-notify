type WindowPush = {
  pushManager?: PushManager;
};

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function getPushManager(): Promise<PushManager> {
  const windowPush = (window as Window & WindowPush).pushManager;
  if (windowPush) {
    return windowPush;
  }
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const manager = await getPushManager();
  return manager.getSubscription();
}

export async function subscribeToPush(publicKey: string): Promise<PushSubscription> {
  const manager = await getPushManager();
  const existing = await manager.getSubscription();
  if (existing) return existing;
  return manager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
}

export async function unsubscribeFromPush(): Promise<string | null> {
  const subscription = await currentSubscription();
  if (!subscription) return null;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  return endpoint;
}

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}
