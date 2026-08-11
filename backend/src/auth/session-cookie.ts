import type { Response } from "express";

import { env } from "../config/env.js";

export const ACCESS_COOKIE_NAME = "medivanta_access";
export const REFRESH_COOKIE_NAME = "medivanta_refresh";
export const LEGACY_SESSION_COOKIE_NAME = "medivanta_session";

function getCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds * 1000,
  };
}

export function setAuthCookies(
  response: Response,
  tokens: {
    accessToken: string;
    refreshToken: string;
    accessMaxAgeSeconds: number;
    refreshMaxAgeSeconds: number;
  },
) {
  response.cookie(
    ACCESS_COOKIE_NAME,
    tokens.accessToken,
    getCookieOptions(tokens.accessMaxAgeSeconds),
  );
  response.cookie(
    REFRESH_COOKIE_NAME,
    tokens.refreshToken,
    getCookieOptions(tokens.refreshMaxAgeSeconds),
  );
}

export function clearAuthCookies(response: Response) {
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production",
    path: "/",
  };

  response.clearCookie(ACCESS_COOKIE_NAME, options);
  response.clearCookie(REFRESH_COOKIE_NAME, options);
  response.clearCookie(LEGACY_SESSION_COOKIE_NAME, options);
}
