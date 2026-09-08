import { LoaderCircle } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchHealth, login, signup, type HealthResponse } from "@/lib/api";

export default function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const isSignup = location.pathname === "/signup";
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchHealth()
      .then(setHealth)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not load site status");
      });
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        email: email.trim() || undefined,
        password,
        inviteCode: inviteCode.trim() || undefined,
      };
      if (isSignup) await signup(body);
      else await login(body);
      navigate("/");
    } catch (err) {
      setError(humanAuthError(err instanceof Error ? err.message : "Authentication failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 px-4 py-6 pb-16 sm:py-10">
      <header>
        <p className="text-xs uppercase tracking-[0.22em] text-signal">Agent Notify</p>
        <h1 className="mt-2 font-serif text-4xl leading-none text-foam">
          {isSignup ? "Create an account" : "Sign in"}
        </h1>
        <p className="mt-3 max-w-sm text-sm leading-6 text-mist/85">
          {isSignup
            ? "One account can have multiple devices and optional topics."
            : "Use the email and password for this site."}
        </p>
      </header>

      {error ? <Alert role="alert">{error}</Alert> : null}

      <Card>
        <CardTitle>{isSignup ? "Sign up" : "Log in"}</CardTitle>
        <CardHint>
          {health?.inviteRequired
            ? "This deploy requires an invite code."
            : "Password is stored as a scrypt hash. Sessions use an HTTP-only cookie."}
        </CardHint>
        <form className="mt-4 flex flex-col gap-3" onSubmit={(event) => void onSubmit(event)}>
          <Input
            type="email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required={!health?.inviteRequired}
          />
          <Input
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            placeholder="Password (min 8)"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
          />
          {health?.inviteRequired || (!isSignup && !email) ? (
            <Input
              type="text"
              autoComplete="one-time-code"
              placeholder="Invite code"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              required={Boolean(health?.inviteRequired && isSignup)}
            />
          ) : null}
          <Button type="submit" disabled={busy}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {isSignup ? "Create account" : "Sign in"}
          </Button>
        </form>
      </Card>

      <p className="text-sm text-mist/80">
        {isSignup ? (
          <>
            Already have an account?{" "}
            <Link className="text-signal" to="/login">
              Sign in
            </Link>
          </>
        ) : (
          <>
            Need an account?{" "}
            <Link className="text-signal" to="/signup">
              Sign up
            </Link>
          </>
        )}
      </p>
    </main>
  );
}

function humanAuthError(error: string): string {
  switch (error) {
    case "invite_required":
      return "An invite code is required for this site.";
    case "email_taken":
      return "That email already has an account.";
    case "invalid_credentials":
      return "Email or password is incorrect.";
    case "multi_account_disabled":
      return "Multi-account signup is off on this deploy. Set MULTI_ACCOUNT=1.";
    case "session_secret_unconfigured":
      return "SESSION_SECRET is missing on the server.";
    case "rate_limited":
      return "Too many signups from this network. Try again later.";
    default:
      return error;
  }
}
