export const ALL_TOPICS = "*";
export const TOPIC_NAME_MAX = 64;

export type TopicFilter = typeof ALL_TOPICS | string[];

export function normalizeTopicName(raw: string): string | { error: string } {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) {
    return { error: "topic is required" };
  }
  if (trimmed === ALL_TOPICS) {
    return { error: "topic name '*' is reserved" };
  }
  if (trimmed.length > TOPIC_NAME_MAX) {
    return { error: `topic must be ${TOPIC_NAME_MAX} characters or fewer` };
  }
  if (!/^[a-z0-9._-]+$/.test(trimmed)) {
    return { error: "topic must be letters, numbers, '.', '_' or '-'" };
  }
  return trimmed;
}

export function parseTopicFilter(raw: unknown): TopicFilter | { error: string } {
  if (raw === undefined || raw === null || raw === ALL_TOPICS) {
    return ALL_TOPICS;
  }
  if (!Array.isArray(raw)) {
    return { error: "topics must be '*' or an array of topic names" };
  }
  const names: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      return { error: "topics must be strings" };
    }
    const name = normalizeTopicName(item);
    if (typeof name === "object") return name;
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

/** No topic fans out to every device. Named topics hit `*` or an explicit match. */
export function deviceMatchesTopic(topics: TopicFilter | undefined, topic?: string | null): boolean {
  if (!topic) return true;
  if (!topics || topics === ALL_TOPICS) return true;
  return topics.includes(topic);
}
