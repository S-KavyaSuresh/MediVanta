import { redirect } from "next/navigation";

import { requireServerSession } from "@/lib/server-auth";

export default async function DashboardPage() {
  const session = await requireServerSession();
  redirect(session.landingPath);
}
