import { Home, Monitor, Smartphone, Wifi } from "lucide-react";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { installSteps, installTitle, type ClientPlatform } from "../../shared/platform.ts";

const ICONS = [Home, Smartphone, Wifi] as const;

export function InstallHint({
  platform,
  standalone,
}: {
  platform: ClientPlatform;
  standalone: boolean;
}) {
  if (standalone) return null;

  const title = installTitle(platform);
  const steps = installSteps(platform);

  return (
    <Card>
      <CardTitle className="flex items-center gap-2">
        {platformIcon(platform)}
        {title}
      </CardTitle>
      <CardHint>{installHint(platform)}</CardHint>
      <ol className="mt-4 space-y-3 text-sm leading-6 text-mist">
        {steps.map((step, index) => {
          const Icon = ICONS[index] ?? Home;
          return (
            <li key={step} className="flex gap-3">
              <Icon className="mt-0.5 size-4 shrink-0 text-signal" />
              {step}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function platformIcon(platform: ClientPlatform) {
  switch (platform) {
    case "desktop":
      return <Monitor className="size-5 text-signal" />;
    case "ios":
    case "android":
      return <Smartphone className="size-5 text-signal" />;
    default: {
      const _never: never = platform;
      return _never;
    }
  }
}

function installHint(platform: ClientPlatform): string {
  switch (platform) {
    case "ios":
      return "Required on iPhone. Push is not available from a Safari tab.";
    case "android":
      return "Recommended on Android Chrome. Push also works in this tab after you enable notifications.";
    case "desktop":
      return "Optional on desktop Chrome / Edge. Push works in this tab after you enable notifications.";
    default: {
      const _never: never = platform;
      return _never;
    }
  }
}
