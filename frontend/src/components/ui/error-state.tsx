import { TriangleAlert } from "lucide-react";

import { Card } from "@/components/ui/card";

export function ErrorState() {
  return (
    <Card className="flex min-h-56 flex-col items-center justify-center text-center">
      <div className="rounded-2xl bg-rose-500/12 p-4 text-rose-500">
        <TriangleAlert className="h-6 w-6" />
      </div>
      <h3 className="mt-5 text-lg font-semibold">Status feed temporarily unavailable</h3>
      <p className="mt-2 max-w-sm text-sm text-[color:var(--muted-foreground)]">
        Important notices can be surfaced here when a hospital status source needs attention or retry handling.
      </p>
    </Card>
  );
}
