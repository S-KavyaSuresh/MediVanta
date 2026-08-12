"use client";

import { EmptyState } from "@/components/ui/empty-state";

export default function DashboardSearchLoading() {
  return (
    <div className="space-y-6 md:space-y-8">
      <EmptyState
        title="Searching..."
        description="Finding matching results for your current role and hospital scope."
      />
    </div>
  );
}
