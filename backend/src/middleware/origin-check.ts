import type { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";

import { isAllowedClientOrigin } from "../config/origins.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

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

  if (!isAllowedClientOrigin(origin)) {
    next(createHttpError(403, "This request could not be verified."));
    return;
  }

  next();
}
