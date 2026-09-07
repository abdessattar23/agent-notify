import { ArrowLeft, Inbox, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchInbox, type InboxItem } from "@/lib/api";
import { loadSecret, saveSecret } from "@/lib/secret";

export default function InboxPage() {
  const [secret, setSecret] = useState(loadSecret);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        saveSecret(secret);
        const next = await fetchInbox(secret);
        if (!cancelled) setItems(next);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load inbox");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [secret]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 px-4 py-6 pb-16 sm:py-10">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-signal">Inbox</p>
          <h1 className="mt-2 font-serif text-3xl text-foam">Recent agent pings</h1>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link to="/">
            <ArrowLeft className="size-4" />
            Home
          </Link>
        </Button>
      </header>

      <Card>
        <CardTitle>Owner secret</CardTitle>
        <CardHint>Required when OWNER_SETUP_SECRET is set on the deploy.</CardHint>
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

      {error ? <Alert role="alert">{error}</Alert> : null}

      <Card>
        <CardTitle className="flex items-center gap-2">
          <Inbox className="size-5 text-signal" />
          Notifications
        </CardTitle>
        {busy ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-mist">
            <LoaderCircle className="size-4 animate-spin" /> Loading…
          </p>
        ) : items.length === 0 ? (
          <CardHint>No stored notifications yet. Send a /v1/notify and they will appear here.</CardHint>
        ) : (
          <ul className="mt-4 space-y-3">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  to={`/inbox/${encodeURIComponent(item.id)}`}
                  className="block rounded-2xl border border-line/60 bg-ink/60 px-4 py-3 transition hover:border-signal/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foam">{item.title}</p>
                      {item.body ? <p className="mt-1 text-sm text-mist/80 line-clamp-2">{item.body}</p> : null}
                    </div>
                    <time className="shrink-0 text-xs text-mist/50">
                      {new Date(item.createdAt).toLocaleString()}
                    </time>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
