import { Router } from "express";

import { authRouter } from "./auth.route.js";
import { healthRouter } from "./health.route.js";
import { hospitalRouter } from "./hospital.route.js";
import { publicRouter } from "./public.route.js";

const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/health", healthRouter);
apiRouter.use("/hospital", hospitalRouter);
apiRouter.use("/public", publicRouter);

export { apiRouter };
