import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { landingPathByRole, normalizeAuthSession, type AuthSession, type Capability } from "@/lib/auth";

function getAppOrigin(headerList: Awaited<ReturnType<typeof headers>>) {
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  return `${protocol}://${host}`;
}

async function fetchSession() {
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
}

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

  return response.json();
}
