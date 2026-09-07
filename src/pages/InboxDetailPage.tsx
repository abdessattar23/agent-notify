import { ArrowLeft, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { fetchInboxItem, type InboxItem } from "@/lib/api";
import { loadSecret } from "@/lib/secret";
import { actionNavigatePath } from "../../shared/notify.ts";

export default function InboxDetailPage() {
  const { id = "" } = useParams();
  const [item, setItem] = useState<InboxItem | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        const next = await fetchInboxItem(id, loadSecret());
        if (!cancelled) setItem(next);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load item");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 px-4 py-6 pb-16 sm:py-10">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-signal">Inbox item</p>
          <h1 className="mt-2 font-serif text-3xl text-foam">{item?.title ?? "Notification"}</h1>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link to="/inbox">
            <ArrowLeft className="size-4" />
            Inbox
          </Link>
        </Button>
      </header>

      {busy ? (
        <Card className="flex items-center gap-3 text-mist">
          <LoaderCircle className="size-4 animate-spin" /> Loading…
        </Card>
      ) : null}
      {error ? <Alert role="alert">{error}</Alert> : null}

      {item ? (
        <Card>
          <CardTitle>{item.title}</CardTitle>
          {item.body ? <p className="mt-3 text-sm leading-6 text-mist">{item.body}</p> : null}
          <CardHint className="mt-3">
            {new Date(item.createdAt).toLocaleString()}
            {item.tag ? ` · tag ${item.tag}` : ""}
          </CardHint>
          {item.image ? (
            <img src={item.image} alt="" className="mt-4 max-h-64 w-full rounded-2xl object-cover" />
          ) : null}
          <div className="mt-5 flex flex-col gap-2">
            {(item.actions ?? []).map((action, index) => (
              <Button key={`${action.type}-${index}`} asChild variant="secondary">
                <Link to={actionNavigatePath(action, item.id, index)}>{action.title}</Link>
              </Button>
            ))}
            {item.default_action ? (
              <Button asChild>
                <Link to={actionNavigatePath(item.default_action, item.id)}>
                  {item.default_action.title || "Open"}
                </Link>
              </Button>
            ) : null}
          </div>
          {item.data ? (
            <pre className="mt-4 overflow-x-auto rounded-2xl bg-ink px-4 py-3 text-xs text-mist">
              {JSON.stringify(item.data, null, 2)}
            </pre>
          ) : null}
        </Card>
      ) : null}
    </main>
  );
}
