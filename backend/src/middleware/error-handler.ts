import type { NextFunction, Request, Response } from "express";

type AppError = Error & {
  status?: number;
};

export function errorHandler(
  error: AppError,
  _request: Request,
  response: Response,
  _next: NextFunction,
) {
  const statusCode = error.status ?? 500;

  response.status(statusCode).json({
    success: false,
    message:
      statusCode >= 500 ? "An unexpected MediVanta API error occurred." : error.message,
  });
}
