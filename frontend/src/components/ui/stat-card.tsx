import type { LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";

type StatCardProps = {
  label: string;
  value: string;
  delta: string;
  icon: LucideIcon;
};

export function StatCard({ label, value, delta, icon: Icon }: StatCardProps) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[color:var(--muted-foreground)]">{label}</p>
          <p className="mt-4 text-3xl font-semibold tracking-tight">{value}</p>
          <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">{delta}</p>
        </div>
        <div className="rounded-2xl bg-[color:var(--surface-muted)] p-3 text-[color:var(--accent)]">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}
