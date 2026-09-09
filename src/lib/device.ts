import {
  detectClientPlatform,
  type ClientPlatform,
} from "../../shared/platform.ts";

export type DisplayMode = "standalone" | "browser";
export type { ClientPlatform };

export function currentClientPlatform(): ClientPlatform {
  if (typeof navigator === "undefined") return "desktop";
  return detectClientPlatform({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  });
}

export function isIosDevice(): boolean {
  return currentClientPlatform() === "ios";
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const media = window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = "standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return media || iosStandalone;
}

export function displayMode(): DisplayMode {
  return isStandalone() ? "standalone" : "browser";
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}
