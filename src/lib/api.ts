import type { InboxItem } from "../../shared/notify.ts";

export type HealthResponse = {
  ok: boolean;
  service: string;
  vapidConfigured: boolean;
  agentTokenConfigured: boolean;
  ownerSetupRequired: boolean;
  subscriptionCount: number;
  personalOsBotsConfigured?: boolean;
  personalOsNotifyEnabled?: boolean;
  personalOsSeedAllowed?: boolean;
};

export type NotifySummary = {
  ok: boolean;
  delivered?: number;
  failed?: number;
  pruned?: number;
  errors?: string[];
  error?: string;
  id?: string;
};

export type { InboxItem };

function ownerHeaders(secret: string): HeadersInit {
  return secret ? { "X-Owner-Secret": secret } : {};
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch("/api/health");
  if (!res.ok) {
    throw new Error(`Health check failed (${res.status})`);
  }
  return (await res.json()) as HealthResponse;
}

export async function fetchVapidPublicKey(): Promise<string> {
  const res = await fetch("/api/vapid-public-key");
  const data = (await res.json()) as { ok?: boolean; publicKey?: string; error?: string };
  if (!res.ok || !data.publicKey) {
    throw new Error(data.error ?? "VAPID public key unavailable");
  }
  return data.publicKey;
}

export async function postSubscription(
  subscription: PushSubscriptionJSON,
  secret: string,
): Promise<void> {
  const res = await fetch("/api/subscribe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...ownerHeaders(secret),
    },
    body: JSON.stringify(subscription),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Subscribe failed (${res.status})`);
  }
}

export async function deleteSubscription(endpoint: string, secret: string): Promise<void> {
  const res = await fetch("/api/subscribe", {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      ...ownerHeaders(secret),
    },
    body: JSON.stringify({ endpoint }),
  });
  if (!res.ok && res.status !== 404) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Unsubscribe failed (${res.status})`);
  }
}

export async function postTestPing(secret: string): Promise<NotifySummary> {
  const res = await fetch("/api/ping", {
    method: "POST",
    headers: ownerHeaders(secret),
  });
  const data = (await res.json()) as NotifySummary;
  if (!res.ok) {
    throw new Error(data.error ?? `Ping failed (${res.status})`);
  }
  return data;
}

export async function fetchInbox(secret: string, limit = 50): Promise<InboxItem[]> {
  const res = await fetch(`/api/inbox?limit=${limit}`, {
    headers: ownerHeaders(secret),
  });
  const data = (await res.json()) as { ok?: boolean; items?: InboxItem[]; error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Inbox failed (${res.status})`);
  }
  return data.items ?? [];
}

export type PersonalOsKpis = {
  otelOpportunities: number;
  otelContributions: number;
  cfpsFound: number;
  cfpsDrafted: number;
  cfpsSubmitted: number;
  cfpsAccepted: number;
  jobFits: number;
  jobApplications: number;
  jobInterviews: number;
  talkPractices: number;
  talkFullRuns: number;
  talkWeakSections: number;
  engineeringMissions: number;
  personalOpsResolved: number;
};

export type PersonalOsEventView = {
  eventId: string;
  sourceBot: string;
  timestamp: string;
  timestampLocal: string;
  area: string;
  status: string;
  title: string;
  impact?: string;
  sourceUrl?: string;
  nextAction?: string;
  decisionNeeded?: boolean;
  approvalNeeded?: boolean;
  deadlineLocal?: string;
  nextRunLocal?: string;
  sample?: boolean;
};

export type PersonalOsBotView = {
  sourceBot: string;
  lastRun: string | null;
  nextRun: string | null;
  lastRunLocal: string | null;
  nextRunLocal: string | null;
  stale: boolean;
  error: boolean;
  blockers: number;
  pendingApprovals: number;
  sourceLinks: string[];
};

export type PersonalOsDashboard = {
  ok: boolean;
  timezone: string;
  generatedAt: string;
  generatedAtLocal: string;
  sampleDataPresent: boolean;
  seedAllowed: boolean;
  notifyEnabled: boolean;
  today: PersonalOsEventView[];
  outcomes: PersonalOsKpis;
  bots: PersonalOsBotView[];
  routines: PersonalOsEventView[];
  decisions: PersonalOsEventView[];
  approvals: PersonalOsEventView[];
  failures: PersonalOsEventView[];
  error?: string;
};

export async function fetchPersonalOsDashboard(secret: string): Promise<PersonalOsDashboard> {
  const res = await fetch("/api/personal-os/dashboard", {
    headers: ownerHeaders(secret),
  });
  const data = (await res.json()) as PersonalOsDashboard;
  if (!res.ok) {
    throw new Error(data.error ?? `Personal OS dashboard failed (${res.status})`);
  }
  return data;
}

export async function seedPersonalOsSample(secret: string): Promise<{ stored: number }> {
  const res = await fetch("/api/personal-os/seed", {
    method: "POST",
    headers: ownerHeaders(secret),
  });
  const data = (await res.json()) as { ok?: boolean; stored?: number; error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Personal OS seed failed (${res.status})`);
  }
  return { stored: data.stored ?? 0 };
}

export async function fetchInboxItem(id: string, secret: string): Promise<InboxItem> {
  const res = await fetch(`/api/inbox?id=${encodeURIComponent(id)}`, {
    headers: ownerHeaders(secret),
  });
  const data = (await res.json()) as { ok?: boolean; item?: InboxItem; error?: string };
  if (!res.ok || !data.item) {
    throw new Error(data.error ?? `Inbox item failed (${res.status})`);
  }
  return data.item;
}
