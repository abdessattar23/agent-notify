import { KeyRound, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { AccountNav } from "@/components/Nav";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createToken,
  deleteToken,
  fetchMe,
  fetchTokens,
  type MeResponse,
  type PublicToken,
} from "@/lib/api";

export default function TokensPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [tokens, setTokens] = useState<PublicToken[]>([]);
  const [name, setName] = useState("Cursor agent");
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const refresh = useCallback(async () => {
    const [nextMe, nextTokens] = await Promise.all([fetchMe(), fetchTokens()]);
    setMe(nextMe);
    setTokens(nextTokens);
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
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load tokens");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      const next = await createToken(name);
      setCreated(next.token);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create token");
    } finally {
      setBusy(false);
    }
  }

  const site = typeof window !== "undefined" ? window.location.origin : "$SITE";

  if (denied) return <Navigate to="/login" replace />;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 px-4 py-6 pb-16 sm:py-10">
      <AccountNav email={me?.account?.email} />
      <header>
        <p className="text-xs uppercase tracking-[0.22em] text-signal">Agent tokens</p>
        <h1 className="mt-2 font-serif text-3xl text-foam">Per-account API access</h1>
      </header>
      {error ? <Alert role="alert">{error}</Alert> : null}

      <Card>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-5 text-signal" />
          Create token
        </CardTitle>
        <CardHint>Shown once. Agents send it as Bearer on POST /v1/notify. Optional topic field.</CardHint>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Token name" />
          <Button onClick={() => void onCreate()} disabled={busy}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
            Create
          </Button>
        </div>
      </Card>

      {created ? (
        <Card>
          <CardTitle>Copy this token now</CardTitle>
          <pre className="mt-4 overflow-x-auto rounded-2xl bg-ink px-4 py-3 text-xs leading-6 text-mist">
            {created}
          </pre>
          <pre className="mt-3 overflow-x-auto rounded-2xl bg-ink px-4 py-3 text-xs leading-6 text-mist">
{`curl -X POST "${site}/v1/notify" \\
  -H "Authorization: Bearer ${created}" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Build failed","body":"CI on main","topic":"deploys"}'

# alias
curl -X POST "${site}/v1/t/deploys" \\
  -H "Authorization: Bearer ${created}" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Build failed"}'`}
          </pre>
        </Card>
      ) : (
        <Card>
          <CardTitle>curl</CardTitle>
          <pre className="mt-4 overflow-x-auto rounded-2xl bg-ink px-4 py-3 text-xs leading-6 text-mist">
{`curl -X POST "$SITE/v1/notify" \\
  -H "Authorization: Bearer $ACCOUNT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Build failed","topic":"deploys"}'`}
          </pre>
        </Card>
      )}

      <Card>
        <CardTitle>Issued tokens</CardTitle>
        {busy && tokens.length === 0 ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-mist">
            <LoaderCircle className="size-4 animate-spin" /> Loading…
          </p>
        ) : tokens.length === 0 ? (
          <CardHint>No tokens yet. Create one for your agent.</CardHint>
        ) : (
          <ul className="mt-4 space-y-3">
            {tokens.map((token) => (
              <li
                key={token.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-line/60 bg-ink/60 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-foam">{token.name}</p>
                  <p className="text-xs text-mist/70">
                    {token.prefix}… {token.legacy ? " · legacy" : ""} ·{" "}
                    {new Date(token.createdAt).toLocaleString()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void (async () => {
                      try {
                        await deleteToken(token.id);
                        setTokens((current) => current.filter((row) => row.id !== token.id));
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Could not revoke token");
                      }
                    })();
                  }}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
