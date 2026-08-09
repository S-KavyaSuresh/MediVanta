import createHttpError from "http-errors";
import type { NextFunction, Request, Response } from "express";

export function notFoundHandler(
  request: Request,
  _response: Response,
  next: NextFunction,
) {
  next(createHttpError(404, `Route not found: ${request.method} ${request.originalUrl}`));
}
