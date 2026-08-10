import { Router } from "express";
import { z } from "zod";

import { validateRequest } from "../middleware/validate-request.js";
import { getDatabaseHealth } from "../db/client.js";

const healthQuerySchema = z.object({
  body: z.object({}).optional(),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const healthRouter = Router();

healthRouter.get("/", validateRequest(healthQuerySchema), async (_request, response) => {
  const database = await getDatabaseHealth();

  response.json({
    success: true,
    name: "MediVanta API",
    message: "MediVanta API is running.",
    timestamp: new Date().toISOString(),
    database: database.status,
  });
});

export { healthRouter };
