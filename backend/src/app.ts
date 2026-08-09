import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { apiRouter } from "./routes/index.js";

export const app = express();

app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true,
  }),
);
app.use(helmet());
app.use(express.json());

app.get("/", (_request, response) => {
  response.json({
    success: true,
    message: "Welcome to the MediVanta API foundation.",
  });
});

app.use("/api", apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);
