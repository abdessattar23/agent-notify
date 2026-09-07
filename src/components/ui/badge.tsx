import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", {
  variants: {
    tone: {
      good: "bg-signal/15 text-signal",
      warn: "bg-warn/15 text-warn",
      bad: "bg-danger/15 text-danger",
      muted: "bg-panel text-mist",
    },
  },
  defaultVariants: {
    tone: "muted",
  },
});

type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, className }))} {...props} />;
}
