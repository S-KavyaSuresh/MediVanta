import { Inbox } from "lucide-react";

import { Card } from "@/components/ui/card";

export function EmptyState() {
  return (
    <Card className="flex min-h-56 flex-col items-center justify-center text-center">
      <div className="rounded-2xl bg-[color:var(--surface-muted)] p-4 text-[color:var(--accent)]">
        <Inbox className="h-6 w-6" />
      </div>
      <h3 className="mt-5 text-lg font-semibold">No patients are waiting in this view</h3>
      <p className="mt-2 max-w-sm text-sm text-[color:var(--muted-foreground)]">
        Queue activity will appear here when hospital operations data is connected to this dashboard experience.
      </p>
    </Card>
  );
}
