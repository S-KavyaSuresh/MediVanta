import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-[color:var(--accent)] px-4 py-2.5 text-white shadow-[0_12px_28px_-18px_rgba(18,99,143,0.85)] hover:bg-[color:var(--accent-strong)]",
        secondary:
          "border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2.5 text-[color:var(--foreground)] hover:bg-[color:var(--surface-muted)]",
        ghost:
          "px-3 py-2 text-[color:var(--foreground)] hover:bg-[color:var(--surface-muted)]",
        danger:
          "bg-[color:var(--danger)] px-4 py-2.5 text-white hover:brightness-95",
      },
      size: {
        default: "",
        sm: "px-3 py-2 text-xs",
        lg: "px-5 py-3 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
