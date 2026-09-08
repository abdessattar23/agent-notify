import { LoaderCircle, Smartphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AccountNav } from "@/components/Nav";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  deleteDevice,
  fetchDevices,
  fetchMe,
  patchDeviceTopics,
  type MeResponse,
  type PublicDevice,
} from "@/lib/api";
import { ALL_TOPICS, type TopicFilter } from "../../shared/topics.ts";

export default function DevicesPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [devices, setDevices] = useState<PublicDevice[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const refresh = useCallback(async () => {
    const [nextMe, nextDevices] = await Promise.all([fetchMe(), fetchDevices()]);
    setMe(nextMe);
    setDevices(nextDevices);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const nextMe = await fetchMe();
        if (!nextMe?.account) {
          if (!cancelled) setDenied(true);
          return;
        }
        await refresh();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load devices");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  if (denied) return <Navigate to="/login" replace />;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 px-4 py-6 pb-16 sm:py-10">
      <AccountNav email={me?.account?.email} />
      <header>
        <p className="text-xs uppercase tracking-[0.22em] text-signal">Devices</p>
        <h1 className="mt-2 font-serif text-3xl text-foam">Push subscriptions</h1>
      </header>
      {error ? <Alert role="alert">{error}</Alert> : null}
      <Card>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="size-5 text-signal" />
          This account
        </CardTitle>
        <CardHint>
          New devices default to all topics (<code className="text-signal">*</code>). A named topic
          notify reaches <code className="text-signal">*</code> devices and devices that list that
          topic. Enable push from the home page.
        </CardHint>
        <div className="mt-4">
          <Button asChild variant="secondary" size="sm">
            <Link to="/">Enable on this device</Link>
          </Button>
        </div>
      </Card>
      {busy ? (
        <Card className="flex items-center gap-3 text-mist">
          <LoaderCircle className="size-4 animate-spin" /> Loading devices…
        </Card>
      ) : devices.length === 0 ? (
        <Card>
          <CardHint>No devices yet. Open Home and tap Enable notifications.</CardHint>
        </Card>
      ) : (
        devices.map((device) => (
          <DeviceCard
            key={device.id}
            device={device}
            onChange={async (topics) => {
              setError(null);
              try {
                const next = await patchDeviceTopics(device.id, topics);
                setDevices((current) => current.map((row) => (row.id === next.id ? next : row)));
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not update topics");
              }
            }}
            onDelete={async () => {
              setError(null);
              try {
                await deleteDevice(device.id);
                setDevices((current) => current.filter((row) => row.id !== device.id));
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not remove device");
              }
            }}
          />
        ))
      )}
    </main>
  );
}

function DeviceCard({
  device,
  onChange,
  onDelete,
}: {
  device: PublicDevice;
  onChange: (topics: TopicFilter) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const allTopics = device.topics === ALL_TOPICS;
  const selected: string[] = Array.isArray(device.topics) ? device.topics : [];

  return (
    <Card>
      <CardTitle>…{device.endpointTail}</CardTitle>
      <CardHint>
        {new Date(device.createdAt).toLocaleString()}
        {device.userAgent ? ` · ${device.userAgent.slice(0, 80)}` : ""}
      </CardHint>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={allTopics ? "default" : "secondary"}
          onClick={() => void onChange(ALL_TOPICS)}
        >
          All topics
        </Button>
        <Button
          size="sm"
          variant={!allTopics && selected.length === 0 ? "default" : "secondary"}
          onClick={() => void onChange([])}
        >
          Mute topics
        </Button>
      </div>
      {!allTopics ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {selected.map((topic) => (
            <li key={topic}>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void onChange(selected.filter((name) => name !== topic))}
              >
                {topic} ×
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const name = draft.trim().toLowerCase();
          if (!name) return;
          const next = allTopics ? [name] : selected.includes(name) ? selected : [...selected, name];
          setDraft("");
          void onChange(next);
        }}
      >
        <Input
          placeholder="Add topic, e.g. deploys"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="submit" variant="secondary">
          Add
        </Button>
      </form>
      <div className="mt-3">
        <Button variant="ghost" size="sm" onClick={() => void onDelete()}>
          Remove device
        </Button>
      </div>
    </Card>
  );
}
