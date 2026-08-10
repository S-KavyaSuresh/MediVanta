import { importLegacyJsonData } from "../services/seed-service.js";

async function runImport() {
  await importLegacyJsonData();
  console.log("Legacy MediVanta JSON data has been imported into PostgreSQL.");
}

void runImport();
