"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

function DashboardSearchResults() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const { search } = useHospitalData();

  const groups = search(query);

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Search"
        title={query ? `Results for "${query}"` : "Search hospital records"}
        description="Search patients, doctors, departments, appointments, and queue activity from one hospital workspace search."
      />

      {!query ? (
        <EmptyState
          title="Enter a search term"
          description="Use the dashboard search field to look up patients, doctors, departments, appointments, or queue records."
        />
      ) : groups.length === 0 ? (
        <EmptyState
          title="No records found"
          description="Try a different patient name, department, doctor, or appointment identifier."
        />
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <Card key={group.title} className="space-y-4">
              <h2 className="text-lg font-semibold">{group.title}</h2>
              <div className="space-y-3">
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4"
                  >
                    <p className="break-words font-semibold">{item.heading}</p>
                    <p className="mt-2 break-words text-sm leading-6 text-[color:var(--muted-foreground)]">
                      {item.details}
                    </p>
                    <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--accent)]">
                      Open in {item.href.replace("/dashboard/", "").replace("/", "overview")}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardSearchPage() {
  return (
    <Suspense fallback={null}>
      <DashboardSearchResults />
    </Suspense>
  );
}
