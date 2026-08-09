"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { CheckCircle2, X } from "lucide-react";

import { cn } from "@/lib/utils";

type Toast = {
  id: number;
  title: string;
  description: string;
};

type ToastContextValue = {
  pushToast: (title: string, description: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const removeToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (title: string, description: string) => {
      toastId.current += 1;
      const id = toastId.current;

      setToasts((current) => [...current, { id, title, description }]);

      window.setTimeout(() => removeToast(id), 4000);
    },
    [removeToast],
  );

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 mx-auto flex max-w-sm flex-col gap-3 px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto rounded-2xl border px-4 py-3 shadow-lg backdrop-blur",
              "border-[color:var(--border)] bg-[color:color-mix(in_oklab,var(--surface)_94%,transparent)]",
            )}
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-[color:var(--accent)]" />
              <div className="flex-1">
                <p className="text-sm font-semibold">{toast.title}</p>
                <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                  {toast.description}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="rounded-full p-1 text-[color:var(--muted-foreground)] transition hover:bg-black/5 hover:text-[color:var(--foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }

  return context;
}
