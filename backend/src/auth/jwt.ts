import { createHmac } from "node:crypto";

import { env } from "../config/env.js";

type JwtPayload = Record<string, unknown> & {
  exp: number;
  iat: number;
};

type AccessTokenPayload = {
  userId: string;
  role: string;
  organizationId: string;
};

type RefreshTokenPayload = {
  userId: string;
  sessionId: string;
  type: "refresh";
};

function base64UrlEncode(value: string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

function parseDurationToSeconds(value: string) {
  const match = value.trim().match(/^(\d+)([smhd])$/i);

  if (!match) {
    return 0;
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 60 * 60 * 24,
  };

  return amount * multipliers[unit];
}

function sign(payload: Record<string, unknown>, secret: string, expiresIn: string) {
  const now = Math.floor(Date.now() / 1000);
  const encodedHeader = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const encodedPayload = base64UrlEncode(
    JSON.stringify({
      ...payload,
      iat: now,
      exp: now + parseDurationToSeconds(expiresIn),
    }),
  );
  const signature = createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verify<T extends JwtPayload>(token: string, secret: string): T | null {
  const [header, payload, signature] = token.split(".");

  if (!header || !payload || !signature) {
    return null;
  }

  const expectedSignature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  if (signature !== expectedSignature) {
    return null;
  }

  try {
    const decodedPayload = JSON.parse(base64UrlDecode(payload)) as T;

    if (typeof decodedPayload.exp !== "number" || decodedPayload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return decodedPayload;
  } catch {
    return null;
  }
}

export function createAccessToken(payload: AccessTokenPayload) {
  return sign(payload, env.JWT_ACCESS_SECRET, env.JWT_ACCESS_EXPIRES_IN);
}

export function createRefreshToken(payload: RefreshTokenPayload) {
  return sign(payload, env.JWT_REFRESH_SECRET, env.JWT_REFRESH_EXPIRES_IN);
}

export function verifyAccessToken(token: string) {
  return verify<AccessTokenPayload & JwtPayload>(token, env.JWT_ACCESS_SECRET);
}

export function verifyRefreshToken(token: string) {
  return verify<RefreshTokenPayload & JwtPayload>(token, env.JWT_REFRESH_SECRET);
}

export function getAccessTokenLifetimeSeconds() {
  return parseDurationToSeconds(env.JWT_ACCESS_EXPIRES_IN);
}

export function getRefreshTokenLifetimeSeconds() {
  return parseDurationToSeconds(env.JWT_REFRESH_EXPIRES_IN);
}
