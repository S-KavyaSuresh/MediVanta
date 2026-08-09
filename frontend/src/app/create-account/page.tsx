import { redirect } from "next/navigation";

import { RegisterForm } from "@/components/dashboard/register-form";
import { PublicShell } from "@/components/marketing/public-shell";
import { getOptionalServerSession } from "@/lib/server-auth";

export default async function CreateAccountPage() {
  const session = await getOptionalServerSession();

  if (session) {
    redirect(session.landingPath);
  }

  return (
    <PublicShell>
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <RegisterForm />
        </div>
      </section>
    </PublicShell>
  );
}
