import { app } from "./app.js";
import { env } from "./config/env.js";
import { initializeDataStore } from "./services/seed-service.js";

async function startServer() {
  await initializeDataStore();

  app.listen(env.PORT, () => {
    console.log(`MediVanta API listening on http://localhost:${env.PORT}`);
  });
}

void startServer();
