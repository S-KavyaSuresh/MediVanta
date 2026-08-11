import type { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const bucket = new Map<string, RateLimitEntry>();

export function rateLimit(options: { key: string; limit: number; windowMs: number }) {
  return (request: Request, _response: Response, next: NextFunction) => {
    const ip = request.ip || request.headers["x-forwarded-for"] || "unknown";
    const token = `${options.key}:${Array.isArray(ip) ? ip[0] : ip}`;
    const now = Date.now();
    const current = bucket.get(token);

    if (!current || current.resetAt <= now) {
      bucket.set(token, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (current.count >= options.limit) {
      next(createHttpError(429, "Too many requests. Please wait a moment and try again."));
      return;
    }

    current.count += 1;
    bucket.set(token, current);
    next();
  };
}
