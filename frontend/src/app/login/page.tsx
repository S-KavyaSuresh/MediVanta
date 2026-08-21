import { redirect } from "next/navigation";
import Image from "next/image";

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
      <section className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto grid min-h-[calc(100vh-13rem)] max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)] lg:items-center">
          <div className="hidden lg:block">
            <div className="overflow-hidden rounded-[2rem] border border-[color:var(--border)] bg-[color:var(--surface-muted)] shadow-2xl">
              <Image
                src="/medivanta-sign-in-consultation.png"
                alt="Doctor consulting with a patient"
                width={1100}
                height={720}
                priority
                className="h-[min(34rem,calc(100vh-14rem))] w-full object-cover"
              />
            </div>
          </div>
          <div className="flex justify-center lg:justify-end">
            <LoginForm />
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
