import Link from "next/link";

import { publicNavItems } from "@/lib/sample-data";

export function PublicFooter() {
  return (
    <footer className="border-t border-[color:var(--border)] bg-[color:color-mix(in_oklab,var(--surface)_92%,transparent)]">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
        <div className="max-w-md">
          <p className="text-lg font-semibold">MediVanta</p>
          <p className="mt-3 text-sm leading-7 text-[color:var(--muted-foreground)]">
            MediVanta helps hospitals present services, doctors, contact pathways, and care guidance through a more connected digital experience.
          </p>
        </div>
        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--accent)]">
              Explore
            </p>
            <div className="mt-4 flex flex-col gap-3 text-sm text-[color:var(--muted-foreground)]">
              {publicNavItems.map((item) => (
                <Link key={item.label} href={item.href} className="hover:text-[color:var(--foreground)]">
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--accent)]">
              Important note
            </p>
            <p className="mt-4 text-sm leading-7 text-[color:var(--muted-foreground)]">
              MediVanta supports hospital communication and service coordination. It does not provide medical diagnosis or emergency treatment.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
