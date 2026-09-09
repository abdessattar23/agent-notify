export type ClientPlatform = "ios" | "android" | "desktop";

export type PlatformHints = {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
};

export function detectClientPlatform(input: PlatformHints): ClientPlatform {
  const ua = input.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const iPadOs = input.platform === "MacIntel" && (input.maxTouchPoints ?? 0) > 1;
  if (iOS || iPadOs) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export function installRequired(platform: ClientPlatform): boolean {
  switch (platform) {
    case "ios":
      return true;
    case "android":
    case "desktop":
      return false;
    default: {
      const _never: never = platform;
      return _never;
    }
  }
}

export function statusHint(platform: ClientPlatform, standalone: boolean): string {
  switch (platform) {
    case "ios":
      return standalone
        ? "iOS Home Screen app. Focus / Low Power can delay delivery."
        : "iOS 16.4+ / 26: Add to Home Screen is required. Safari tabs cannot receive Web Push.";
    case "android":
      return standalone
        ? "Installed Android Chrome app. Some OEM battery savers can still pause Web Push."
        : "Android Chrome can receive Web Push in this tab. Install app is recommended so OEM battery savers are less likely to kill the worker.";
    case "desktop":
      return standalone
        ? "Installed Chrome or Edge app. Focus / Do Not Disturb can hide notifications."
        : "Desktop Chrome or Edge can receive Web Push in this tab. Install app is optional. Desktop Safari is not a verified client.";
    default: {
      const _never: never = platform;
      return _never;
    }
  }
}

export function notificationsHint(platform: ClientPlatform): string {
  switch (platform) {
    case "ios":
      return "Permission is requested only from this button. iOS will not show the prompt unless you opened the Home Screen app.";
    case "android":
      return "Permission is requested only from this button. If Chrome says blocked, reset Site settings → Notifications. Some OEM battery modes pause Web Push.";
    case "desktop":
      return "Permission is requested only from this button. Use Chrome or Edge. If the icon is blocked, click the padlock → Notifications → Allow.";
    default: {
      const _never: never = platform;
      return _never;
    }
  }
}

export function installTitle(platform: ClientPlatform): string {
  switch (platform) {
    case "ios":
      return "Add to Home Screen";
    case "android":
      return "Install app (recommended)";
    case "desktop":
      return "Install app (optional)";
    default: {
      const _never: never = platform;
      return _never;
    }
  }
}

export function installSteps(platform: ClientPlatform): string[] {
  switch (platform) {
    case "ios":
      return [
        "Open this URL in Safari — not Chrome or in-app browsers.",
        "Tap Share, then Add to Home Screen. Keep the name Agent Notify.",
        "Launch the icon, then tap Enable notifications. iOS 16.4 or later (including 26) is required.",
      ];
    case "android":
      return [
        "Open this URL in Chrome (not an in-app browser).",
        "Tap the menu (⋮) → Install app or Add to Home screen. Keep the name Agent Notify.",
        "You can also Enable notifications in this tab. Installing is recommended so the service worker stays alive.",
      ];
    case "desktop":
      return [
        "Use Chrome or Edge on HTTPS (or localhost).",
        "Install from the address-bar install icon if you want a standalone window.",
        "Enable notifications in this tab either way. Desktop Safari is not a verified client.",
      ];
    default: {
      const _never: never = platform;
      return _never;
    }
  }
}
