import cors from "cors";
import express from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";

import { env } from "./config/env.js";
import { isAllowedClientOrigin } from "./config/origins.js";
import { openApiDocument } from "./docs/openapi.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { requireTrustedOrigin } from "./middleware/origin-check.js";
import { apiRouter } from "./routes/index.js";
import { flushPerfTrace, runWithPerfTrace } from "./utils/perf-trace.js";

export const app = express();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || isAllowedClientOrigin(origin)) {
        callback(null, origin ?? env.CLIENT_ORIGIN);
        return;
      }

      callback(null, false);
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
  }),
);
app.use(helmet());
app.use(express.json({ limit: "3mb" }));
app.use(requireTrustedOrigin);
app.use((request, response, next) => {
  void runWithPerfTrace(`${request.method} ${request.path}`, async () => {
    response.on("finish", () => {
      flushPerfTrace(response.statusCode);
    });
    next();
  });
});

app.get("/", (_request, response) => {
  response.json({
    success: true,
    message: "Welcome to the MediVanta API foundation.",
  });
});

app.get("/api/openapi.json", (_request, response) => {
  response.json(openApiDocument);
});

app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
app.use("/api", apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);
