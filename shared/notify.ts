import { normalizeTopicName } from "./topics.ts";

export type ActionType = "open_app" | "link" | "inbox" | "show_box" | "copy";

export type NotifyAction = {
  type: ActionType;
  title: string;
  url?: string;
  text?: string;
  id?: string;
  agent?: string;
  hint?: string;
  message?: string;
  emoji?: string;
  subtitle?: string;
  bg?: string;
  color?: string;
};

export type NotifyInput = {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  topic?: string;
  image?: string;
  badge_count?: number;
  default_action?: NotifyAction;
  actions?: NotifyAction[];
  data?: Record<string, unknown>;
};

export type DeclarativeNotificationAction = {
  action: string;
  title: string;
  navigate: string;
  icon?: string;
};

export type DeclarativePushMessage = {
  web_push: 8030;
  mutable: boolean;
  notification: {
    title: string;
    body: string;
    navigate: string;
    lang: "en-US";
    dir: "ltr";
    silent: false;
    icon: string;
    badge: string;
    tag?: string;
    image?: string;
    app_badge?: string;
    data?: Record<string, unknown>;
    actions?: DeclarativeNotificationAction[];
  };
};

export type InboxItem = {
  id: string;
  createdAt: string;
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  topic?: string;
  image?: string;
  badge_count?: number;
  default_action?: NotifyAction;
  actions?: NotifyAction[];
  data?: Record<string, unknown>;
};

const TITLE_MAX = 120;
const BODY_MAX = 2000;
const URL_MAX = 2000;
const TAG_MAX = 64;
const IMAGE_MAX = 2000;
const ACTION_TITLE_MAX = 40;
const ACTION_TEXT_MAX = 2000;
const ACTION_HINT_MAX = 500;
const ACTION_MESSAGE_MAX = 500;
const ACTION_AGENT_MAX = 120;
const ACTION_EMOJI_MAX = 32;
const ACTION_SUBTITLE_MAX = 200;
const ACTION_BG_MAX = 280;
const ACTION_COLOR_MAX = 64;
const MAX_ACTIONS = 3;
const DATA_JSON_MAX = 8000;
const COPY_QUERY_MAX = 500;

const ACTION_TYPES = new Set<ActionType>(["open_app", "link", "inbox", "show_box", "copy"]);

const NAMED_COLORS = new Set([
  "white",
  "black",
  "red",
  "green",
  "blue",
  "yellow",
  "orange",
  "purple",
  "pink",
  "cyan",
  "magenta",
  "gray",
  "grey",
  "silver",
  "gold",
  "navy",
  "teal",
  "maroon",
  "olive",
  "lime",
  "aqua",
  "fuchsia",
  "transparent",
  "currentcolor",
  "inherit",
]);

const CSS_UNSAFE =
  /url\s*\(|expression\s*\(|javascript\s*:|@import|<script|;/i;

export function hasBalancedQuotes(value: string): boolean {
  let single = 0;
  let double = 0;
  for (const ch of value) {
    if (ch === "'") single += 1;
    if (ch === '"') double += 1;
  }
  return single % 2 === 0 && double % 2 === 0;
}

export function isCssValueSafe(value: string): boolean {
  if (!value || CSS_UNSAFE.test(value) || !hasBalancedQuotes(value)) {
    return false;
  }
  return true;
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC_COLOR = /^(?:rgba?|hsla?)\([\d\s.,%\/deg+-]+\)$/i;
const GRADIENT =
  /^(?:linear-gradient|radial-gradient|repeating-linear-gradient)\([\s\S]+\)$/i;

function isFunctionColor(value: string): boolean {
  return FUNC_COLOR.test(value);
}

function isAllowedGradient(value: string): boolean {
  return GRADIENT.test(value);
}

export function sanitizeCssColor(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > ACTION_COLOR_MAX) return undefined;
  if (!isCssValueSafe(trimmed)) return undefined;
  const lower = trimmed.toLowerCase();
  if (NAMED_COLORS.has(lower)) return lower;
  if (HEX_COLOR.test(trimmed)) return trimmed;
  if (isFunctionColor(trimmed)) return trimmed;
  return undefined;
}

export function sanitizeCssBackground(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > ACTION_BG_MAX) return undefined;
  if (!isCssValueSafe(trimmed)) return undefined;
  const lower = trimmed.toLowerCase();
  if (NAMED_COLORS.has(lower)) return lower;
  if (HEX_COLOR.test(trimmed)) return trimmed;
  if (isFunctionColor(trimmed)) return trimmed;
  if (isAllowedGradient(trimmed)) return trimmed;
  return undefined;
}

export function parseNotifyBody(raw: unknown): NotifyInput | { error: string } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "JSON object required" };
  }

  const record = raw as Record<string, unknown>;
  const title = record.title;
  if (typeof title !== "string" || title.trim().length === 0) {
    return { error: "title is required" };
  }
  if (title.length > TITLE_MAX) {
    return { error: `title must be ${TITLE_MAX} characters or fewer` };
  }

  const body = optionalString(record.body, "body", BODY_MAX);
  if (typeof body === "object") return body;

  const url = optionalString(record.url, "url", URL_MAX);
  if (typeof url === "object") return url;

  const tag = optionalString(record.tag, "tag", TAG_MAX);
  if (typeof tag === "object") return tag;

  let topic: string | undefined;
  if (record.topic !== undefined && record.topic !== null && record.topic !== "") {
    if (typeof record.topic !== "string") {
      return { error: "topic must be a string" };
    }
    const normalized = normalizeTopicName(record.topic);
    if (typeof normalized === "object") return normalized;
    topic = normalized;
  }

  const image = optionalString(record.image, "image", IMAGE_MAX);
  if (typeof image === "object") return image;

  const badge_count = optionalBadgeCount(record.badge_count);
  if (typeof badge_count === "object") return badge_count;

  const dataResult = optionalData(record.data);
  if (!dataResult.ok) return { error: dataResult.error };
  const data = dataResult.value;

  const default_action = optionalAction(record.default_action, "default_action", true);
  if (default_action && "error" in default_action) return default_action;

  const actions = optionalActions(record.actions);
  if (actions && "error" in actions) return actions;

  return {
    title: title.trim(),
    ...(body ? { body } : {}),
    ...(url ? { url } : {}),
    ...(tag ? { tag } : {}),
    ...(topic ? { topic } : {}),
    ...(image ? { image } : {}),
    ...(badge_count !== undefined ? { badge_count } : {}),
    ...(default_action ? { default_action } : {}),
    ...(actions ? { actions } : {}),
    ...(data ? { data } : {}),
  };
}

export function resolveNavigateUrl(inputUrl: string | undefined, origin: string): string {
  const base = origin.endsWith("/") ? origin : `${origin}/`;
  if (!inputUrl) {
    return base;
  }
  try {
    return new URL(inputUrl, base).href;
  } catch {
    return base;
  }
}

export function createInboxId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function toInboxItem(input: NotifyInput, id: string, createdAt = new Date().toISOString()): InboxItem {
  return {
    id,
    createdAt,
    title: input.title,
    ...(input.body ? { body: input.body } : {}),
    ...(input.url ? { url: input.url } : {}),
    ...(input.tag ? { tag: input.tag } : {}),
    ...(input.topic ? { topic: input.topic } : {}),
    ...(input.image ? { image: input.image } : {}),
    ...(input.badge_count !== undefined ? { badge_count: input.badge_count } : {}),
    ...(input.default_action ? { default_action: input.default_action } : {}),
    ...(input.actions ? { actions: input.actions } : {}),
    ...(input.data ? { data: input.data } : {}),
  };
}

export function actionNavigatePath(
  action: NotifyAction,
  inboxId: string,
  actionIndex?: number,
): string {
  switch (action.type) {
    case "open_app":
      return "/go/app";
    case "link": {
      const target = action.url ?? "/";
      return `/go/link?url=${encodeURIComponent(target)}`;
    }
    case "inbox": {
      const id = action.id ?? inboxId;
      return `/inbox/${encodeURIComponent(id)}`;
    }
    case "show_box": {
      const params = new URLSearchParams();
      if (action.agent) params.set("agent", action.agent);
      if (action.hint) params.set("hint", action.hint);
      if (action.message) params.set("message", action.message);
      if (action.title) params.set("title", action.title);
      if (action.emoji) params.set("emoji", action.emoji);
      if (action.subtitle) params.set("subtitle", action.subtitle);
      if (action.bg) params.set("bg", action.bg);
      if (action.color) params.set("color", action.color);
      if (action.id) params.set("id", action.id);
      else if (inboxId) params.set("id", inboxId);
      const query = params.toString();
      return query ? `/go/box?${query}` : "/go/box";
    }
    case "copy": {
      if (action.text && action.text.length <= COPY_QUERY_MAX) {
        return `/go/copy?text=${encodeURIComponent(action.text)}`;
      }
      const params = new URLSearchParams({ id: inboxId });
      if (actionIndex !== undefined) params.set("a", String(actionIndex));
      return `/go/copy?${params.toString()}`;
    }
    default:
      return `/inbox/${encodeURIComponent(inboxId)}`;
  }
}

export function resolveDefaultAction(input: NotifyInput, inboxId: string): NotifyAction {
  if (input.default_action) {
    return input.default_action;
  }
  if (input.url) {
    return { type: "link", title: "Open", url: input.url };
  }
  return { type: "inbox", title: "Inbox", id: inboxId };
}

export function buildDeclarativePayload(
  input: NotifyInput,
  origin: string,
  inboxId: string,
): DeclarativePushMessage {
  const icon = new URL("/icons/icon-192.png", ensureOrigin(origin)).href;
  const defaultAction = resolveDefaultAction(input, inboxId);
  const navigate = new URL(actionNavigatePath(defaultAction, inboxId), ensureOrigin(origin)).href;

  const buttonActions = (input.actions ?? []).slice(0, MAX_ACTIONS);
  const declarativeActions: DeclarativeNotificationAction[] = buttonActions.map((action, index) => ({
    action: `a${index}`,
    title: action.title,
    navigate: new URL(actionNavigatePath(action, inboxId, index), ensureOrigin(origin)).href,
  }));

  const image = input.image
    ? resolveNavigateUrl(input.image, origin)
    : undefined;

  const payload: DeclarativePushMessage = {
    web_push: 8030,
    mutable: true,
    notification: {
      title: input.title,
      body: input.body ?? "",
      navigate,
      lang: "en-US",
      dir: "ltr",
      silent: false,
      icon,
      badge: icon,
      data: {
        inboxId,
        ...(input.data ?? {}),
      },
    },
  };

  if (input.tag) {
    payload.notification.tag = input.tag;
  }
  if (image) {
    payload.notification.image = image;
  }
  if (input.badge_count !== undefined) {
    payload.notification.app_badge = String(input.badge_count);
  }
  if (declarativeActions.length > 0) {
    payload.notification.actions = declarativeActions;
  }

  return payload;
}

export function isGonePushStatus(statusCode: number): boolean {
  return statusCode === 404 || statusCode === 410;
}

export function copyTextFromInboxItem(item: InboxItem, actionIndex?: number): string | null {
  if (actionIndex !== undefined && item.actions?.[actionIndex]?.type === "copy") {
    return item.actions[actionIndex].text ?? null;
  }
  if (item.default_action?.type === "copy" && item.default_action.text) {
    return item.default_action.text;
  }
  const copyAction = item.actions?.find((action) => action.type === "copy");
  if (copyAction?.text) return copyAction.text;
  if (typeof item.data?.copy_text === "string") return item.data.copy_text;
  return item.body ?? item.title ?? null;
}

function ensureOrigin(origin: string): string {
  return origin.endsWith("/") ? origin : `${origin}/`;
}

function optionalString(
  value: unknown,
  field: string,
  max: number,
): string | undefined | { error: string } {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    return { error: `${field} must be a string` };
  }
  if (value.length > max) {
    return { error: `${field} must be ${max} characters or fewer` };
  }
  return value.trim();
}

function optionalBadgeCount(value: unknown): number | undefined | { error: string } {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    return { error: "badge_count must be an integer" };
  }
  if (value < 0 || value > 9999) {
    return { error: "badge_count must be between 0 and 9999" };
  }
  return value;
}

function optionalData(
  value: unknown,
): { ok: true; value?: Record<string, unknown> } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return { ok: true, value: undefined };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "data must be an object" };
  }
  try {
    const encoded = JSON.stringify(value);
    if (encoded.length > DATA_JSON_MAX) {
      return {
        ok: false,
        error: `data must be ${DATA_JSON_MAX} characters or fewer when serialized`,
      };
    }
  } catch {
    return { ok: false, error: "data must be JSON-serializable" };
  }
  return { ok: true, value: value as Record<string, unknown> };
}

function optionalActions(
  value: unknown,
): NotifyAction[] | undefined | { error: string } {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return { error: "actions must be an array" };
  }
  if (value.length > MAX_ACTIONS) {
    return { error: `actions supports at most ${MAX_ACTIONS} items` };
  }
  const actions: NotifyAction[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const parsed = optionalAction(value[index], `actions[${index}]`, false);
    if (!parsed) {
      return { error: `actions[${index}] is required` };
    }
    if ("error" in parsed) return parsed;
    actions.push(parsed);
  }
  return actions;
}

function optionalAction(
  value: unknown,
  field: string,
  allowMissingTitle: boolean,
): NotifyAction | undefined | { error: string } {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return { error: `${field} must be an object` };
  }
  const record = value as Record<string, unknown>;
  const type = record.type;
  if (typeof type !== "string" || !ACTION_TYPES.has(type as ActionType)) {
    return {
      error: `${field}.type must be one of open_app, link, inbox, show_box, copy`,
    };
  }

  let title = optionalString(record.title, `${field}.title`, ACTION_TITLE_MAX);
  if (typeof title === "object") return title;
  if (!title) {
    if (!allowMissingTitle) {
      return { error: `${field}.title is required` };
    }
    title = defaultTitleForType(type as ActionType);
  }

  const url = optionalString(record.url, `${field}.url`, URL_MAX);
  if (typeof url === "object") return url;
  const text = optionalString(record.text, `${field}.text`, ACTION_TEXT_MAX);
  if (typeof text === "object") return text;
  const id = optionalString(record.id, `${field}.id`, TAG_MAX);
  if (typeof id === "object") return id;
  const agent = optionalString(record.agent, `${field}.agent`, ACTION_AGENT_MAX);
  if (typeof agent === "object") return agent;
  const hint = optionalString(record.hint, `${field}.hint`, ACTION_HINT_MAX);
  if (typeof hint === "object") return hint;
  const message = optionalString(record.message, `${field}.message`, ACTION_MESSAGE_MAX);
  if (typeof message === "object") return message;
  const emoji = optionalString(record.emoji, `${field}.emoji`, ACTION_EMOJI_MAX);
  if (typeof emoji === "object") return emoji;
  const subtitle = optionalString(record.subtitle, `${field}.subtitle`, ACTION_SUBTITLE_MAX);
  if (typeof subtitle === "object") return subtitle;

  let bg: string | undefined;
  if (record.bg !== undefined && record.bg !== null && record.bg !== "") {
    if (typeof record.bg !== "string") {
      return { error: `${field}.bg must be a string` };
    }
    if (record.bg.length > ACTION_BG_MAX) {
      return { error: `${field}.bg must be ${ACTION_BG_MAX} characters or fewer` };
    }
    const sanitized = sanitizeCssBackground(record.bg);
    if (!sanitized) {
      return { error: `${field}.bg is not a safe CSS background value` };
    }
    bg = sanitized;
  }

  let color: string | undefined;
  if (record.color !== undefined && record.color !== null && record.color !== "") {
    if (typeof record.color !== "string") {
      return { error: `${field}.color must be a string` };
    }
    if (record.color.length > ACTION_COLOR_MAX) {
      return { error: `${field}.color must be ${ACTION_COLOR_MAX} characters or fewer` };
    }
    const sanitized = sanitizeCssColor(record.color);
    if (!sanitized) {
      return { error: `${field}.color is not a safe CSS color value` };
    }
    color = sanitized;
  }

  if (type === "link" && !url) {
    return { error: `${field}.url is required for link actions` };
  }
  if (type === "copy" && !text) {
    return { error: `${field}.text is required for copy actions` };
  }

  return {
    type: type as ActionType,
    title,
    ...(url ? { url } : {}),
    ...(text ? { text } : {}),
    ...(id ? { id } : {}),
    ...(agent ? { agent } : {}),
    ...(hint ? { hint } : {}),
    ...(message ? { message } : {}),
    ...(emoji ? { emoji } : {}),
    ...(subtitle ? { subtitle } : {}),
    ...(bg ? { bg } : {}),
    ...(color ? { color } : {}),
  };
}

function defaultTitleForType(type: ActionType): string {
  switch (type) {
    case "open_app":
      return "Open app";
    case "link":
      return "Open";
    case "inbox":
      return "Inbox";
    case "show_box":
      return "Show box";
    case "copy":
      return "Copy";
    default:
      return "Open";
  }
}
