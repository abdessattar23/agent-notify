const SECRET_KEY = "agent-notify.owner-secret";

export function loadSecret(): string {
  try {
    return localStorage.getItem(SECRET_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveSecret(secret: string): void {
  try {
    if (secret) localStorage.setItem(SECRET_KEY, secret);
    else localStorage.removeItem(SECRET_KEY);
  } catch {
    // Ignore quota / private mode.
  }
}
