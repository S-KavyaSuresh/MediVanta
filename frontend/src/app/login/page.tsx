import { redirect } from "next/navigation";

import { LoginForm } from "@/components/dashboard/login-form";
import { PublicShell } from "@/components/marketing/public-shell";
import { getOptionalServerSession } from "@/lib/server-auth";

export default async function LoginPage() {
  const session = await getOptionalServerSession();

  if (session) {
    redirect(session.landingPath);
  }

  return (
    <PublicShell>
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-center">
          <div className="space-y-6">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[color:var(--accent)]">
              MediVanta
            </p>
            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
              Sign in
            </h1>
          </div>
          <LoginForm />
        </div>
      </section>
    </PublicShell>
  );
}
