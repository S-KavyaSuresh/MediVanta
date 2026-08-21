import { env } from "./env.js";

function normalizeOrigin(origin: string) {
  return origin.replace(/\/+$/, "").toLowerCase();
}

export function getAllowedClientOrigins() {
  return new Set(
    [
      env.CLIENT_ORIGIN,
      ...(env.CLIENT_ORIGINS ?? "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ].map(normalizeOrigin),
  );
}

export function isAllowedClientOrigin(origin: string) {
  return getAllowedClientOrigins().has(normalizeOrigin(origin));
}
