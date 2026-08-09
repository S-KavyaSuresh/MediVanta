import { Router } from "express";
import { z } from "zod";

import { validateRequest } from "../middleware/validate-request.js";

const healthQuerySchema = z.object({
  body: z.object({}).optional(),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const healthRouter = Router();

healthRouter.get("/", validateRequest(healthQuerySchema), (_request, response) => {
  response.json({
    success: true,
    name: "MediVanta API",
    message: "MediVanta API is running.",
    timestamp: new Date().toISOString(),
  });
});

export { healthRouter };
