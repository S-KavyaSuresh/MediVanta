"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

type ModalProps = {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  children?: ReactNode;
};

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
}: ModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div className="w-full max-w-lg rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id="dialog-title" className="text-xl font-semibold">
              {title}
            </h3>
            <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 transition hover:bg-[color:var(--surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children ? <div className="mt-5">{children}</div> : null}
        <div className="mt-6 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
