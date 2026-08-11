import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { landingPathByRole, normalizeAuthSession, type AuthSession, type Capability } from "@/lib/auth";
import type { HospitalState } from "@/lib/hospital-data";
import type { SafeUser, UserRole } from "@/lib/auth";

type HospitalMeta = {
  userCounts?: Record<UserRole, number>;
  users?: SafeUser[];
  patientProfiles?: SafeUser[];
  appointmentSlotLoads?: import("@/lib/hospital-data").AppointmentSlotLoadRecord[];
  labSlotLoads?: import("@/lib/hospital-data").LabSlotLoadRecord[];
};

function getAppOrigin(headerList: Awaited<ReturnType<typeof headers>>) {
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  return `${protocol}://${host}`;
}

const fetchSession = cache(async () => {
  try {
    const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
    const response = await fetch(`${getAppOrigin(headerList)}/api/auth/me`, {
      headers: {
        cookie: cookieStore.toString(),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      session: AuthSession;
    };

    return normalizeAuthSession(payload.session);
  } catch {
    return null;
  }
});

export async function getOptionalServerSession() {
  return fetchSession();
}

export async function requireServerSession() {
  const session = await fetchSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

export async function requireServerRole(role: AuthSession["user"]["role"]) {
  const session = await requireServerSession();

  if (session.user.role !== role) {
    redirect(landingPathByRole[session.user.role]);
  }

  return session;
}

export async function requireServerPermission(permission: Capability) {
  const session = await requireServerSession();

  if (!session.permissions.includes(permission)) {
    redirect(landingPathByRole[session.user.role]);
  }

  return session;
}

export async function fetchServerHospitalState() {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const response = await fetch(`${getAppOrigin(headerList)}/api/hospital/state`, {
    headers: {
      cookie: cookieStore.toString(),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    redirect("/login");
  }

  const payload = (await response.json()) as {
    state: HospitalState;
    meta?: HospitalMeta;
    session?: AuthSession;
  };

  return {
    ...payload,
    session:
      payload.session?.user
        ? normalizeAuthSession(payload.session)
        : await requireServerSession(),
  };
}
