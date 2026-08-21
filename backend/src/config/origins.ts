import { env } from "./env.js";

const BUILT_IN_CLIENT_ORIGINS = [
  "https://medi-vanta-frontend.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

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
      ...BUILT_IN_CLIENT_ORIGINS,
    ].map(normalizeOrigin),
  );
}

export function isAllowedClientOrigin(origin: string) {
  return getAllowedClientOrigins().has(normalizeOrigin(origin));
}
