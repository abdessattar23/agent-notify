import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-2xl border border-line bg-ink px-4 text-sm text-foam placeholder:text-mist/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/60",
        className,
      )}
      {...props}
    />
  );
}
