"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api";

type SearchGroup = {
  title: string;
  items: Array<{
    id: string;
    type: string;
    heading: string;
    details: string;
    actionHref?: string;
    actionLabel?: string;
    detail: {
      title?: string;
      fields: Array<{
        label: string;
        value: string;
      }>;
      notes?: string[];
    };
  }>;
};

function DashboardSearchResults() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<SearchGroup["items"][number] | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!query.trim()) {
        setGroups([]);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      setSelectedItem(null);
      try {
        const response = await apiRequest<{ groups: SearchGroup[] }>(
          `/api/hospital/search?q=${encodeURIComponent(query)}`,
        );
        if (mounted) {
          setGroups(response.groups ?? []);
        }
      } catch (loadError) {
        if (mounted) {
          setGroups([]);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Search is not available right now.",
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [query]);

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Search"
        title={query ? `Results for "${query}"` : "Search hospital records"}
        description="Search patients, doctors, appointments, records, medicines, laboratory requests, and invoices from one scoped workspace search."
      />

      {!query ? (
        <EmptyState
          title="Enter a search term"
          description="Use the dashboard search field to look up patients, doctors, appointments, records, medicines, and invoices."
        />
      ) : loading ? (
        <EmptyState
          title="Searching..."
          description="Finding matching results for your current role and hospital scope."
        />
      ) : error ? (
        <EmptyState title="Search unavailable" description={error} />
      ) : groups.length === 0 ? (
        <EmptyState
          title="No records found"
          description="Try a different patient name, doctor, appointment identifier, medicine, or invoice number."
        />
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <Card key={group.title} className="space-y-4">
              <h2 className="text-lg font-semibold">{group.title}</h2>
              <div className="space-y-3">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedItem(item)}
                    className="block w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4 text-left transition hover:border-[color:var(--accent)]"
                  >
                    <p className="break-words font-semibold">{item.heading}</p>
                    <p className="mt-2 break-words text-sm leading-6 text-[color:var(--muted-foreground)]">
                      {item.details}
                    </p>
                    <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--accent)]">
                      View details
                    </p>
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        title={selectedItem?.detail.title ?? selectedItem?.heading ?? "Search result"}
        description="Review the matched result and continue in the appropriate workspace if needed."
      >
        {selectedItem ? (
          <div className="space-y-4">
            <Card className="space-y-3 p-4">
              {selectedItem.detail.fields.map((field) => (
                <div key={`${selectedItem.id}-${field.label}`} className="space-y-1">
                  <p className="text-sm font-semibold">{field.label}</p>
                  <p className="break-words text-sm text-[color:var(--muted-foreground)]">
                    {field.value}
                  </p>
                </div>
              ))}
            </Card>
            {selectedItem.detail.notes?.length ? (
              <Card className="space-y-3 p-4">
                <p className="text-sm font-semibold">Related details</p>
                <div className="space-y-2">
                  {selectedItem.detail.notes.map((note, index) => (
                    <p
                      key={`${selectedItem.id}-note-${index}`}
                      className="break-words text-sm text-[color:var(--muted-foreground)]"
                    >
                      {note}
                    </p>
                  ))}
                </div>
              </Card>
            ) : null}
            {selectedItem.actionHref ? (
              <div className="flex justify-end">
                <Link href={selectedItem.actionHref}>
                  <Button type="button">
                    {selectedItem.actionLabel ?? "Open workspace"}
                  </Button>
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
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
