import { Router } from "express";

import { healthRouter } from "./health.route.js";

const apiRouter = Router();

apiRouter.use("/health", healthRouter);

export { apiRouter };
