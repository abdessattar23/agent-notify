import { ArrowLeft, ExternalLink, LayoutDashboard, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  fetchPersonalOsDashboard,
  seedPersonalOsSample,
  type PersonalOsBotView,
  type PersonalOsDashboard,
  type PersonalOsEventView,
  type PersonalOsKpis,
} from "@/lib/api";
import { loadSecret, saveSecret } from "@/lib/secret";

const VIEWS = ["today", "outcomes", "bots", "routines", "decisions", "approvals", "failures"] as const;
type View = (typeof VIEWS)[number];

const KPI_LABELS: Array<[keyof PersonalOsKpis, string]> = [
  ["otelOpportunities", "Qualified OTel opportunities"],
  ["otelContributions", "OTel contributions"],
  ["cfpsFound", "CFPs found"],
  ["cfpsDrafted", "CFPs drafted"],
  ["cfpsSubmitted", "CFPs submitted"],
  ["cfpsAccepted", "CFPs accepted"],
  ["jobFits", "Strong job fits"],
  ["jobApplications", "Applications"],
  ["jobInterviews", "Interviews"],
  ["talkPractices", "Talk practices"],
  ["talkFullRuns", "Full talk runs"],
  ["talkWeakSections", "Weak sections"],
  ["engineeringMissions", "Engineering missions"],
  ["personalOpsResolved", "Personal ops resolved"],
];

export default function PersonalOsPage() {
  const [secret, setSecret] = useState(loadSecret);
  const [view, setView] = useState<View>("today");
  const [dashboard, setDashboard] = useState<PersonalOsDashboard | null>(null);
  const [busy, setBusy] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        saveSecret(secret);
        const next = await fetchPersonalOsDashboard(secret);
        if (!cancelled) setDashboard(next);
      } catch (err) {
        if (!cancelled) {
          setDashboard(null);
          setError(err instanceof Error ? err.message : "Could not load Personal OS");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [secret]);

  async function seed() {
    setSeeding(true);
    setError(null);
    try {
      await seedPersonalOsSample(secret);
      saveSecret(secret);
      setDashboard(await fetchPersonalOsDashboard(secret));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not seed sample data");
    } finally {
      setSeeding(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 px-4 py-6 pb-16 sm:py-10">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-signal">Personal OS</p>
          <h1 className="mt-2 font-serif text-3xl text-foam">Outcomes, not activity</h1>
          <p className="mt-2 max-w-md text-sm leading-6 text-mist/85">
            Sanitized bot events only. Times are Africa/Casablanca. No Grok scraping.
          </p>
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
        <CardHint>Required when OWNER_SETUP_SECRET is set. Draft preview only — do not paste production secrets.</CardHint>
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

      {error ? <Alert role="alert">{humanError(error)}</Alert> : null}

      {dashboard?.sampleDataPresent ? (
        <Alert>Showing DEV-ONLY synthetic sample data. This is not a live ledger.</Alert>
      ) : null}

      {dashboard?.seedAllowed ? (
        <Card>
          <CardTitle>DEV-ONLY sample</CardTitle>
          <CardHint>
            Seed is env-gated and blocked in production. It never mixes into production defaults.
          </CardHint>
          <div className="mt-4">
            <Button variant="secondary" onClick={() => void seed()} disabled={seeding || busy}>
              {seeding ? <LoaderCircle className="size-4 animate-spin" /> : <LayoutDashboard className="size-4" />}
              Load DEV-ONLY sample
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {VIEWS.map((item) => (
          <Button
            key={item}
            size="sm"
            variant={view === item ? "default" : "secondary"}
            onClick={() => setView(item)}
          >
            {labelView(item)}
          </Button>
        ))}
      </div>

      {busy && !dashboard ? (
        <Card className="flex items-center gap-3 text-mist">
          <LoaderCircle className="size-4 animate-spin" /> Loading dashboard…
        </Card>
      ) : null}

      {dashboard ? <DashboardView view={view} dashboard={dashboard} /> : null}
    </main>
  );
}

function DashboardView({ view, dashboard }: { view: View; dashboard: PersonalOsDashboard }) {
  switch (view) {
    case "today":
      return (
        <EventList
          title="Today"
          hint={`Casablanca date for ${dashboard.generatedAtLocal || "now"}.`}
          empty="No events for today’s Casablanca date. Bots publish sanitized ledger events here."
          events={dashboard.today}
        />
      );
    case "outcomes":
      return <OutcomesCard outcomes={dashboard.outcomes} />;
    case "bots":
      return <BotsCard bots={dashboard.bots} />;
    case "routines":
      return (
        <EventList
          title="Routines"
          hint="Habit and planning events from the routines bot."
          empty="No routine events stored."
          events={dashboard.routines}
        />
      );
    case "decisions":
      return (
        <EventList
          title="Decisions"
          hint="Items that need a human choice."
          empty="No open decisions."
          events={dashboard.decisions}
        />
      );
    case "approvals":
      return (
        <EventList
          title="Approvals"
          hint="High-value actions waiting on you."
          empty="No pending approvals."
          events={dashboard.approvals}
        />
      );
    case "failures":
      return (
        <EventList
          title="Failures"
          hint="Errors, failed runs, and stale publishers."
          empty="No failures or stale bots right now."
          events={dashboard.failures}
        />
      );
    default: {
      const unseen: never = view;
      return unseen;
    }
  }
}

function OutcomesCard({ outcomes }: { outcomes: PersonalOsKpis }) {
  const total = KPI_LABELS.reduce((sum, [key]) => sum + outcomes[key], 0);
  return (
    <Card>
      <CardTitle>Outcomes</CardTitle>
      <CardHint>KPI totals from retained metric deltas. Activity/event counts are omitted on purpose.</CardHint>
      {total === 0 ? (
        <CardHint className="mt-4">No outcome deltas yet. Ingest ledger events or load DEV-ONLY sample data.</CardHint>
      ) : (
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {KPI_LABELS.map(([key, label]) => (
            <div key={key} className="rounded-2xl bg-ink/70 px-3 py-3">
              <dt className="text-xs uppercase tracking-wide text-mist/60">{label}</dt>
              <dd className="mt-1 font-serif text-2xl text-foam">{outcomes[key]}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}

function BotsCard({ bots }: { bots: PersonalOsBotView[] }) {
  return (
    <Card>
      <CardTitle>Bots</CardTitle>
      <CardHint>Last/next run in Africa/Casablanca. Stale means no recent sanitized event.</CardHint>
      <ul className="mt-4 space-y-3">
        {bots.map((bot) => (
          <li key={bot.sourceBot} className="rounded-2xl border border-line/60 bg-ink/60 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-foam">{bot.sourceBot}</p>
              <div className="flex flex-wrap gap-2">
                <Badge tone={bot.error ? "bad" : bot.stale ? "warn" : "good"}>
                  {bot.error ? "error" : bot.stale ? "stale" : "ok"}
                </Badge>
                {bot.pendingApprovals > 0 ? (
                  <Badge tone="warn">{bot.pendingApprovals} approval(s)</Badge>
                ) : null}
                {bot.blockers > 0 ? <Badge tone="bad">{bot.blockers} blocker(s)</Badge> : null}
              </div>
            </div>
            <p className="mt-2 text-sm text-mist/80">
              Last {bot.lastRunLocal ?? "never"} · Next {bot.nextRunLocal ?? "unknown"}
            </p>
            {bot.sourceLinks.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {bot.sourceLinks.map((url) => (
                  <li key={url}>
                    <SafeSourceLink href={url} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-mist/50">No source links.</p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function EventList({
  title,
  hint,
  empty,
  events,
}: {
  title: string;
  hint: string;
  empty: string;
  events: PersonalOsEventView[];
}) {
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <CardHint>{hint}</CardHint>
      {events.length === 0 ? (
        <CardHint className="mt-4">{empty}</CardHint>
      ) : (
        <ul className="mt-4 space-y-3">
          {events.map((event) => (
            <li key={event.eventId} className="rounded-2xl border border-line/60 bg-ink/60 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-foam">{event.title}</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-mist/50">
                    {event.sourceBot} · {event.area} · {event.status}
                  </p>
                </div>
                <time className="shrink-0 text-xs text-mist/50">{event.timestampLocal}</time>
              </div>
              {event.impact ? <p className="mt-2 text-sm text-mist/85">{event.impact}</p> : null}
              {event.nextAction ? (
                <p className="mt-2 text-sm text-signal/90">Next: {event.nextAction}</p>
              ) : null}
              {event.deadlineLocal ? (
                <p className="mt-1 text-xs text-warn">Deadline {event.deadlineLocal}</p>
              ) : null}
              {event.sourceUrl ? (
                <div className="mt-2">
                  <SafeSourceLink href={event.sourceUrl} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SafeSourceLink({ href }: { href: string }) {
  if (!href.startsWith("https://")) {
    return <span className="text-xs text-mist/50">Source withheld (not https)</span>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-sm text-signal underline-offset-2 hover:underline"
    >
      <ExternalLink className="size-3.5" />
      Open source
    </a>
  );
}

function labelView(view: View): string {
  switch (view) {
    case "today":
      return "Today";
    case "outcomes":
      return "Outcomes";
    case "bots":
      return "Bots";
    case "routines":
      return "Routines";
    case "decisions":
      return "Decisions";
    case "approvals":
      return "Approvals";
    case "failures":
      return "Failures";
    default: {
      const unseen: never = view;
      return unseen;
    }
  }
}

function humanError(error: string): string {
  switch (error) {
    case "owner_secret_required":
      return "Owner secret is required for this deploy. Enter OWNER_SETUP_SECRET and try again.";
    case "seed_disabled":
      return "DEV-ONLY seed is disabled on this deploy (missing flag or production context).";
    case "unauthorized":
      return "The owner secret was rejected.";
    default:
      return error;
  }
}
