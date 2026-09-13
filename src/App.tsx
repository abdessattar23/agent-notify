import { BellRing, Home, LoaderCircle, Smartphone, Wifi } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";
import {
  deleteSubscription,
  fetchHealth,
  fetchVapidPublicKey,
  postSubscription,
  postTestPing,
  type HealthResponse,
} from "@/lib/api";
import { loadSecret, saveSecret } from "@/lib/secret";
import {
  displayMode,
  isIosDevice,
  isStandalone,
  notificationPermission,
  pushSupported,
} from "@/lib/device";
import {
  currentSubscription,
  registerServiceWorker,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push-client";

type Activity = {
  at: string;
  text: string;
  tone: "good" | "bad" | "muted";
};

type UiState = {
  ready: boolean;
  busy: boolean;
  error: string | null;
  health: HealthResponse | null;
  permission: NotificationPermission | "unsupported";
  standalone: boolean;
  ios: boolean;
  subscribed: boolean;
  endpointTail: string | null;
};

export default function App() {
  const [state, setState] = useState<UiState>({
    ready: false,
    busy: false,
    error: null,
    health: null,
    permission: "default",
    standalone: false,
    ios: false,
    subscribed: false,
    endpointTail: null,
  });
  const [secret, setSecret] = useState(loadSecret);
  const [activity, setActivity] = useState<Activity[]>([]);

  const log = useCallback((text: string, tone: Activity["tone"] = "muted") => {
    setActivity((current) => [{ at: new Date().toISOString(), text, tone }, ...current].slice(0, 8));
  }, []);

  const refresh = useCallback(async () => {
    const [health, subscription] = await Promise.all([
      fetchHealth(),
      currentSubscription().catch(() => null),
    ]);
    setState((current) => ({
      ...current,
      ready: true,
      health,
      permission: notificationPermission(),
      standalone: isStandalone(),
      ios: isIosDevice(),
      subscribed: Boolean(subscription),
      endpointTail: subscription ? subscription.endpoint.slice(-18) : null,
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await registerServiceWorker();
        if (!cancelled) await refresh();
      } catch (error) {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            ready: true,
            error: error instanceof Error ? error.message : "Failed to start",
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const iosNeedsInstall = state.ios && !state.standalone;
  const canEnable = useMemo(() => {
    if (!pushSupported()) return false;
    if (iosNeedsInstall) return false;
    return true;
  }, [iosNeedsInstall]);

  async function enableNotifications() {
    setState((current) => ({ ...current, busy: true, error: null }));
    saveSecret(secret);
    try {
      if (!pushSupported()) {
        throw new Error("This browser does not support Web Push.");
      }
      if (iosNeedsInstall) {
        throw new Error("Add Agent Notify to your Home Screen first, then open it from there.");
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Notification permission was not granted.");
      }
      const publicKey = await fetchVapidPublicKey();
      const subscription = await subscribeToPush(publicKey);
      await postSubscription(subscription.toJSON(), secret);
      log("This device is subscribed for agent push.", "good");
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not enable notifications";
      setState((current) => ({ ...current, error: message }));
      log(message, "bad");
    } finally {
      setState((current) => ({ ...current, busy: false }));
    }
  }

  async function disableNotifications() {
    setState((current) => ({ ...current, busy: true, error: null }));
    try {
      const endpoint = await unsubscribeFromPush();
      if (endpoint) {
        await deleteSubscription(endpoint, secret);
      }
      log("Subscription removed.", "muted");
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not disable notifications";
      setState((current) => ({ ...current, error: message }));
      log(message, "bad");
    } finally {
      setState((current) => ({ ...current, busy: false }));
    }
  }

  async function sendPing() {
    setState((current) => ({ ...current, busy: true, error: null }));
    saveSecret(secret);
    try {
      const result = await postTestPing(secret);
      log(`Test ping delivered to ${result.delivered ?? 0} device(s).`, "good");
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ping failed";
      setState((current) => ({ ...current, error: message }));
      log(message, "bad");
    } finally {
      setState((current) => ({ ...current, busy: false }));
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 px-4 py-6 pb-16 sm:py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-signal">Agent Notify</p>
          <h1 className="mt-2 font-serif text-4xl leading-none text-foam">Your iPhone, pinged by agents.</h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-mist/85">
            Add this site to the Home Screen, enable notifications, then let a single agent token send Web Push to you.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link to="/inbox">Open inbox</Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link to="/os">Personal OS</Link>
            </Button>
          </div>
        </div>
        <div className="rounded-full bg-signal/15 p-3 text-signal">
          <BellRing className="size-6" />
        </div>
      </header>

      {!state.ready ? (
        <Card className="flex items-center gap-3 text-mist">
          <LoaderCircle className="size-4 animate-spin" />
          Checking this device and the API…
        </Card>
      ) : null}

      {state.error ? <Alert role="alert">{humanError(state.error)}</Alert> : null}

      <Card>
        <CardTitle>Status</CardTitle>
        <CardHint>iOS 16.4+ / 26 Home Screen web apps only. Safari in a tab cannot receive push.</CardHint>
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatusRow
            label="Display"
            value={displayMode() === "standalone" ? "Standalone" : "Browser tab"}
            tone={state.standalone ? "good" : state.ios ? "warn" : "muted"}
          />
          <StatusRow
            label="Permission"
            value={state.permission}
            tone={state.permission === "granted" ? "good" : state.permission === "denied" ? "bad" : "warn"}
          />
          <StatusRow
            label="Subscription"
            value={state.subscribed ? "Enabled" : "Off"}
            tone={state.subscribed ? "good" : "muted"}
          />
          <StatusRow
            label="API"
            value={state.health?.vapidConfigured ? "VAPID ready" : "Needs VAPID env"}
            tone={state.health?.vapidConfigured ? "good" : "bad"}
          />
        </dl>
        {state.endpointTail ? (
          <p className="mt-3 font-mono text-xs text-mist/60">…{state.endpointTail}</p>
        ) : null}
      </Card>

      {iosNeedsInstall ? <InstallCard /> : null}

      {state.health?.ownerSetupRequired ? (
        <Card>
          <CardTitle>Owner secret</CardTitle>
          <CardHint>
            This deploy set OWNER_SETUP_SECRET. Enter it before enabling notifications or sending a test ping.
          </CardHint>
          <div className="mt-4">
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="OWNER_SETUP_SECRET"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
            />
          </div>
        </Card>
      ) : null}

      <Card>
        <CardTitle>Notifications</CardTitle>
        <CardHint>
          Permission is requested only from this button. iOS will not show the prompt unless you opened the Home Screen
          app.
        </CardHint>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Button onClick={() => void enableNotifications()} disabled={state.busy || !canEnable}>
            {state.busy ? <LoaderCircle className="size-4 animate-spin" /> : <BellRing className="size-4" />}
            Enable notifications
          </Button>
          <Button variant="secondary" onClick={() => void sendPing()} disabled={state.busy || !state.subscribed}>
            Test ping
          </Button>
        </div>
        {state.subscribed ? (
          <div className="mt-3">
            <Button variant="ghost" size="sm" onClick={() => void disableNotifications()} disabled={state.busy}>
              Disable on this device
            </Button>
          </div>
        ) : null}
        {!pushSupported() ? (
          <p className="mt-4 text-sm text-danger">This browser cannot register for Web Push.</p>
        ) : null}
      </Card>

      <Card>
        <CardTitle>For agents</CardTitle>
        <CardHint>
          Authenticated agents POST to <code className="text-signal">/v1/notify</code> with the bearer token from
          Netlify env. See AGENT.md.
        </CardHint>
        <pre className="mt-4 overflow-x-auto rounded-2xl bg-ink px-4 py-3 text-xs leading-6 text-mist">
{`curl -X POST "$SITE/v1/notify" \\
  -H "Authorization: Bearer $AGENT_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Build failed","body":"CI on main","url":"/"}'`}
        </pre>
      </Card>

      <Card>
        <CardTitle>Activity</CardTitle>
        {activity.length === 0 ? (
          <CardHint>Nothing yet. Enable notifications, then send a test ping.</CardHint>
        ) : (
          <ul className="mt-3 space-y-2">
            {activity.map((item) => (
              <li key={item.at + item.text} className="flex items-start justify-between gap-3 text-sm">
                <span className={item.tone === "good" ? "text-signal" : item.tone === "bad" ? "text-danger" : "text-mist"}>
                  {item.text}
                </span>
                <time className="shrink-0 text-xs text-mist/50">
                  {new Date(item.at).toLocaleTimeString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}

function StatusRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "warn" | "bad" | "muted";
}) {
  return (
    <div className="rounded-2xl bg-ink/70 px-3 py-3">
      <dt className="text-xs uppercase tracking-wide text-mist/60">{label}</dt>
      <dd className="mt-1">
        <Badge tone={tone}>{value}</Badge>
      </dd>
    </div>
  );
}

function InstallCard() {
  return (
    <Card>
      <CardTitle>Add to Home Screen</CardTitle>
      <CardHint>Required on iPhone. Push is not available from a Safari tab.</CardHint>
      <ol className="mt-4 space-y-3 text-sm leading-6 text-mist">
        <li className="flex gap-3">
          <Home className="mt-0.5 size-4 shrink-0 text-signal" />
          Open this URL in Safari — not Chrome or in-app browsers.
        </li>
        <li className="flex gap-3">
          <Smartphone className="mt-0.5 size-4 shrink-0 text-signal" />
          Tap Share, then Add to Home Screen. Keep the name Agent Notify.
        </li>
        <li className="flex gap-3">
          <Wifi className="mt-0.5 size-4 shrink-0 text-signal" />
          Launch the icon, then tap Enable notifications. iOS 16.4 or later (including 26) is required.
        </li>
      </ol>
    </Card>
  );
}

function humanError(error: string): string {
  switch (error) {
    case "owner_secret_required":
      return "Owner secret is required for this deploy. Enter OWNER_SETUP_SECRET and try again.";
    case "vapid_unconfigured":
      return "VAPID keys are missing on the server. Set them in the Netlify environment.";
    case "no_subscriptions":
      return "No push subscription is stored yet. Enable notifications first.";
    case "unauthorized":
      return "The owner secret or agent token was rejected.";
    default:
      return error;
  }
}
