import type { Response } from "express";

import { env } from "../config/env.js";

export const SESSION_COOKIE_NAME = "medivanta_session";

export function setSessionCookie(response: Response, sessionId: string, maxAgeSeconds: number) {
  response.cookie(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds * 1000,
  });
}

export function clearSessionCookie(response: Response) {
  response.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
  });
}
