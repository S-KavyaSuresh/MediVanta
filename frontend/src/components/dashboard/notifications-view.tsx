"use client";

import { useMemo } from "react";

import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/providers/toast-provider";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function NotificationsView({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  const { markAllNotificationsRead, markNotificationRead, state } = useHospitalData();
  const { pushToast } = useToast();
  const notifications = useMemo(
    () =>
      [...state.notifications].sort(
        (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      ),
    [state.notifications],
  );
  const unreadCount = notifications.filter((notification) => !notification.read).length;

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        action={
          unreadCount > 0 ? (
            <Button
              variant="secondary"
              onClick={async () => {
                const result = await markAllNotificationsRead();
                if (!result.ok) {
                  pushToast("Unable to update notifications", result.message ?? "Please try again.");
                  return;
                }

                pushToast("Notifications updated", "All notifications were marked as read.");
              }}
            >
              Mark all as read
            </Button>
          ) : undefined
        }
      />

      {notifications.length > 0 ? (
        <div className="space-y-4">
          {notifications.map((notification) => (
            <Card
              key={notification.id}
              className={`space-y-3 ${notification.read ? "" : "border-[color:var(--accent)]/45"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-lg font-semibold">{notification.title}</p>
                  <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                    {formatDateTime(notification.createdAt)}
                  </p>
                </div>
                {!notification.read ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const result = await markNotificationRead(notification.id);
                      if (!result.ok) {
                        pushToast("Unable to update notification", result.message ?? "Please try again.");
                        return;
                      }
                    }}
                  >
                    Mark read
                  </Button>
                ) : (
                  <span className="text-xs font-medium text-[color:var(--muted-foreground)]">
                    Read
                  </span>
                )}
              </div>
              <p className="text-sm leading-6 text-[color:var(--muted-foreground)]">
                {notification.message}
              </p>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No notifications yet"
          description="Updates connected to appointments, laboratory requests, prescriptions, billing, and stock events will appear here."
        />
      )}
    </div>
  );
}
