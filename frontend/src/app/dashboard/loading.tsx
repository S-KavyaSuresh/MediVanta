export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-[color:var(--background)] px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-5xl items-center justify-center">
        <div className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] px-6 py-5 text-center shadow-[0_24px_60px_-42px_rgba(15,23,42,0.35)]">
          <p className="text-sm font-medium text-[color:var(--muted-foreground)]">
            Loading dashboard...
          </p>
        </div>
      </div>
    </div>
  );
}
