import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

type AppError = Error & {
  status?: number;
};

export function errorHandler(
  error: AppError,
  request: Request,
  response: Response,
  _next: NextFunction,
) {
  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    response.status(400).json({
      success: false,
      message: firstIssue?.message ?? "Please review the request details provided.",
    });
    return;
  }

  const statusCode = error.status ?? 500;

  if (statusCode >= 500) {
    console.error(
      `[api-error] ${request.method} ${request.originalUrl}: ${error.message}`,
    );

    if (error.stack) {
      console.error(error.stack);
    }
  }

  response.status(statusCode).json({
    success: false,
    message:
      statusCode >= 500 ? "An unexpected MediVanta API error occurred." : error.message,
  });
}
