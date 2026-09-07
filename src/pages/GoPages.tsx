import { Check, Copy, ExternalLink, MonitorSmartphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { fetchInboxItem } from "@/lib/api";
import { loadSecret } from "@/lib/secret";
import { copyTextFromInboxItem } from "../../shared/notify.ts";

export function GoAppPage() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/", { replace: true });
  }, [navigate]);
  return (
    <main className="mx-auto max-w-xl px-4 py-10 text-mist">Opening Agent Notify…</main>
  );
}

export function GoLinkPage() {
  const [params] = useSearchParams();
  const raw = params.get("url") || "/";
  const href = useMemo(() => {
    try {
      return new URL(raw, window.location.origin).href;
    } catch {
      return "/";
    }
  }, [raw]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.location.assign(href);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [href]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 px-4 py-10">
      <Card>
        <CardTitle className="flex items-center gap-2">
          <ExternalLink className="size-5 text-signal" />
          Opening link
        </CardTitle>
        <CardHint className="break-all">{href}</CardHint>
        <div className="mt-4">
          <Button asChild>
            <a href={href}>Continue</a>
          </Button>
        </div>
      </Card>
    </main>
  );
}

export function GoCopyPage() {
  const [params] = useSearchParams();
  const [text, setText] = useState(params.get("text") ?? "");
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const direct = params.get("text");
      if (direct) {
        setText(direct);
        return;
      }
      const id = params.get("id");
      if (!id) {
        setError("Nothing to copy.");
        return;
      }
      try {
        const item = await fetchInboxItem(id, loadSecret());
        const actionIndexRaw = params.get("a");
        const actionIndex =
          actionIndexRaw === null ? undefined : Number.parseInt(actionIndexRaw, 10);
        const next = copyTextFromInboxItem(
          item,
          Number.isFinite(actionIndex) ? actionIndex : undefined,
        );
        if (!cancelled) {
          if (!next) setError("No copy text on this notification.");
          else setText(next);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load copy text");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params]);

  async function copyNow() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      setStatus("error");
      setError("Clipboard permission denied. Select the text and copy manually.");
    }
  }

  useEffect(() => {
    if (text) void copyNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 px-4 py-10">
      <Card>
        <CardTitle className="flex items-center gap-2">
          <Copy className="size-5 text-signal" />
          Copy to clipboard
        </CardTitle>
        <CardHint>Tap-actions land here so iOS can copy without inventing deep links.</CardHint>
        {error ? <Alert className="mt-4">{error}</Alert> : null}
        {text ? (
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-all rounded-2xl bg-ink px-4 py-3 text-sm text-foam">
            {text}
          </pre>
        ) : null}
        <div className="mt-4 flex gap-3">
          <Button onClick={() => void copyNow()} disabled={!text}>
            {status === "copied" ? <Check className="size-4" /> : <Copy className="size-4" />}
            {status === "copied" ? "Copied" : "Copy"}
          </Button>
          <Button asChild variant="secondary">
            <Link to="/inbox">Inbox</Link>
          </Button>
        </div>
      </Card>
    </main>
  );
}

export function GoBoxPage() {
  const [params] = useSearchParams();
  const agent = params.get("agent");
  const hint = params.get("hint");
  const id = params.get("id");
  const theme = (params.get("theme") || "").toLowerCase();
  const message = params.get("message") || hint;
  const headline = params.get("title") || (theme === "pride" ? "you're gay 🏳️‍🌈" : "Show computer preview");
  const agentLabel = agent || "your agent";
  const pride = theme === "pride" || theme === "gay" || theme === "rainbow";

  if (pride) {
    return (
      <main
        className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 px-4 py-10"
        style={{
          background:
            "linear-gradient(180deg,#e40303 0%,#ff8c00 16%,#ffed00 33%,#008026 50%,#24408e 66%,#732982 83%,#e40303 100%)",
        }}
      >
        <Card className="border-0 bg-black/55 text-foam shadow-2xl backdrop-blur-md">
          <p className="text-center text-5xl leading-none">🏳️‍🌈</p>
          <CardTitle className="mt-4 text-center text-3xl font-serif text-foam">{headline}</CardTitle>
          <p className="mt-4 text-center text-lg leading-7 text-foam/95">
            {message || "this is not a drill. pride briefing complete. you are gay. periodt."}
          </p>
          <p className="mt-6 text-center text-sm uppercase tracking-[0.2em] text-foam/70">
            official gay department · no notes · only vibes
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button asChild>
              <Link to={id ? `/inbox/${encodeURIComponent(id)}` : "/inbox"}>Inbox receipts</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/">Flee home</Link>
            </Button>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 px-4 py-10">
      <Card>
        <CardTitle className="flex items-center gap-2">
          <MonitorSmartphone className="size-5 text-signal" />
          {headline}
        </CardTitle>
        {message ? (
          <p className="mt-3 text-sm leading-6 text-foam">{message}</p>
        ) : (
          <CardHint>
            Agent Notify cannot open a Grok Bot deep link. Open the agent box from Cursor / Grok Bot
            yourself.
          </CardHint>
        )}
        {!message ? (
          <ol className="mt-4 space-y-3 text-sm leading-6 text-mist">
            <li>1. Open <strong className="text-foam">Grok Bot</strong> (or Cursor).</li>
            <li>
              2. Open the agent run
              {agent ? (
                <>
                  {" "}
                  named <code className="text-signal">{agentLabel}</code>
                </>
              ) : (
                " that sent this ping"
              )}
              .
            </li>
            <li>3. Open the agent’s <strong className="text-foam">computer preview</strong> / desktop.</li>
            {hint ? (
              <li>
                4. Hint: <span className="text-foam">{hint}</span>
              </li>
            ) : null}
          </ol>
        ) : null}
        {id ? <p className="mt-3 text-xs text-mist/70">Inbox id: {id}</p> : null}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link to={id ? `/inbox/${encodeURIComponent(id)}` : "/inbox"}>View inbox item</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/">Back home</Link>
          </Button>
        </div>
      </Card>
    </main>
  );
}
