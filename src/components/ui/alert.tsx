import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Alert({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm leading-6 text-warn", className)}
      {...props}
    />
  );
}
