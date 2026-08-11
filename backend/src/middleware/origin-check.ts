import type { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";

import { env } from "../config/env.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function normalizeOrigin(origin: string) {
  return origin.replace(/\/+$/, "").toLowerCase();
}

export function requireTrustedOrigin(
  request: Request,
  _response: Response,
  next: NextFunction,
) {
  if (SAFE_METHODS.has(request.method.toUpperCase())) {
    next();
    return;
  }

  const origin = request.headers.origin;
  if (!origin) {
    next();
    return;
  }

  const allowedOrigins = new Set(
    [env.CLIENT_ORIGIN, "http://localhost:3000", "http://127.0.0.1:3000"]
      .filter(Boolean)
      .map(normalizeOrigin),
  );

  if (!allowedOrigins.has(normalizeOrigin(origin))) {
    next(createHttpError(403, "This request could not be verified."));
    return;
  }

  next();
}
