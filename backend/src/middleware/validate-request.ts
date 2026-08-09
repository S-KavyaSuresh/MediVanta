import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";

export function validateRequest(schema: ZodSchema) {
  return (request: Request, _response: Response, next: NextFunction) => {
    const result = schema.safeParse({
      body: request.body,
      query: request.query,
      params: request.params,
    });

    if (!result.success) {
      return next(
        Object.assign(new Error("Request validation failed"), {
          status: 400,
          details: result.error.flatten(),
        }),
      );
    }

    return next();
  };
}
