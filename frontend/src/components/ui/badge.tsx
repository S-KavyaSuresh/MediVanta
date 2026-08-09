import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
  {
    variants: {
      variant: {
        neutral:
          "bg-[color:var(--surface-muted)] text-[color:var(--muted-foreground)]",
        success: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
        warning: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
        info: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

type BadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
