import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";

type EmptyStateProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({
  title = "No records to show",
  description = "Relevant records will appear here when matching data becomes available.",
  action,
}: EmptyStateProps) {
  return (
    <Card className="flex min-h-56 flex-col items-center justify-center text-center">
      <div className="rounded-2xl bg-[color:var(--surface-muted)] p-4 text-[color:var(--accent)]">
        <Inbox className="h-6 w-6" />
      </div>
      <h3 className="mt-5 text-lg font-semibold">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-[color:var(--muted-foreground)]">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </Card>
  );
}
